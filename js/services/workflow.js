// Brief → Proposal → Contract → Change orders.
import { db } from '../core/store.js';
import { mailer, appLink } from '../core/mailer.js';
import { t, tl } from '../core/i18n.js';
import { UserError, req, opt, money, int, dateStr, nowISO, todayISO, addDays, clock, fmtMoney, fmtDate, sum, daysBetween } from '../core/util.js';
import { myBusiness, requireProject, requireOwned, logActivity, freelancerActor, clientActor, systemActor, notifyOwner, notifyClientSide, portalProject, portalGuard, assertCanActivateProject, touchClient, clientLang, can } from './context.js';
import { listDeliverables, proposalTotal, acceptedProposal, financials, saveScope, contractTemplateFor } from './core.js';
import { createDepositInvoice } from './billing.js';
import { CONTRACT_DISCLAIMER, PROJECT_TYPES } from './constants.js';

const clientOf = (p) => db.get('clients', p.clientId);
const portalLink = (p, section = '') => appLink(`/client/${p.id}${section ? '/' + section : ''}?t=${p.portalToken}`);
// Emails to the client are written in the client's language.
function mailClient(p, { subject, subjectVars, body, bodyVars, section, linkLabel, kind }) {
  // Signed-in members of the client organization see it in the app too.
  notifyClientSide(p, { type: 'action', title: subject, body, vars: { ...(subjectVars || {}), ...(bodyVars || {}) }, section: section === 'invoice' ? 'invoice' : section });
  const c = clientOf(p);
  if (!c?.email) return;
  const L = clientLang(p);
  const b = db.get('businesses', p.businessId);
  mailer.send({
    to: c.email, kind, subject: `${tl(L, subject, subjectVars)} — ${b.name}`,
    body: `${tl(L, 'Hi {name},', { name: c.name })}\n\n${tl(L, body, bodyVars)}`, link: portalLink(p, section), linkLabel: tl(L, linkLabel),
  });
}
// Use a stock default in the client's language when the freelancer hasn't customised it.
function stock(value, en, L) {
  if (!value || value === en || value === tl('ar', en)) return tl(L, en);
  return value;
}

// ---------- Brief ----------
const BRIEF_FIELDS = ['objective', 'audience', 'platforms', 'tone', 'deliverablesText', 'references', 'notes', 'productionNeeds'];
export const getBrief = (projectId) => db.find('briefs', (b) => b.projectId === projectId);

function cleanBrief(data) {
  const out = {};
  BRIEF_FIELDS.forEach((f) => { if (f in data) out[f] = opt(data[f], 5000); });
  if ('budget' in data) out.budget = data.budget === '' ? '' : money(data.budget, 'Budget', 'budget');
  return out;
}

export function saveBrief(projectId, data) {
  const p = requireProject(projectId, 'brief.edit');
  const brief = getBrief(projectId);
  const patch = cleanBrief(data);
  const pPatch = {};
  if ('type' in data && PROJECT_TYPES.includes(data.type)) pPatch.type = data.type;
  if ('deadline' in data) pPatch.deadline = dateStr(data.deadline, 'Deadline', 'deadline');
  if (patch.budget !== undefined && p.status === 'draft') pPatch.budget = patch.budget || 0;
  if (Object.keys(pPatch).length) db.update('projects', p.id, pPatch);
  if (brief.status === 'submitted' || brief.status === 'sent') patch.status = brief.status;
  db.update('briefs', brief.id, patch);
  logActivity(p, freelancerActor(), 'brief.updated', 'Brief updated');
}

export function sendBrief(projectId) {
  const p = requireProject(projectId, 'brief.edit');
  const brief = getBrief(projectId);
  if (!clientOf(p)?.email) throw new UserError(t('Add an email address to this client first, or share the client link yourself.'));
  db.update('briefs', brief.id, { status: 'sent', sentAt: nowISO() });
  mailClient(p, { kind: 'brief', subject: 'Project brief: {project}', subjectVars: { project: p.name }, body: 'Please fill in the project brief so we can prepare an accurate proposal.', section: 'brief', linkLabel: 'Complete the brief' });
  logActivity(p, freelancerActor(), 'brief.sent', 'Brief sent to client');
  touchClient(p.clientId);
}
export function markBriefReviewed(projectId) {
  const p = requireProject(projectId, 'brief.edit');
  db.update('briefs', getBrief(projectId).id, { status: 'reviewed' });
  logActivity(p, freelancerActor(), 'brief.reviewed', 'Brief reviewed');
}

export function portalSubmitBrief(projectId, token, data) {
  const p = portalProject(projectId, token);
  portalGuard(p, 'brief.submit');
  const brief = getBrief(projectId);
  if (brief.status !== 'sent') throw new UserError(t('This brief is not open for editing right now.'));
  const patch = cleanBrief(data);
  if (!patch.objective) throw new UserError(t('Please describe what you want to achieve.'), 'objective');
  db.update('briefs', brief.id, { ...patch, status: 'submitted', submittedAt: nowISO() });
  logActivity(p, clientActor(p), 'brief.submitted', 'Client submitted the brief');
  notifyOwner(p, { type: 'client_action', title: 'Brief submitted', body: '{client} completed the brief for {project}.', vars: { client: clientOf(p)?.name, project: p.name }, link: `/projects/${p.id}/brief` });
}

// ---------- Proposals ----------
export function listProposals() {
  const b = myBusiness();
  return db.all('proposals', (x) => x.businessId === b.id && can(db.get('projects', x.projectId), 'proposal.view')).map(expireIfNeeded).sort((a, z) => z.createdAt.localeCompare(a.createdAt));
}
export const proposalItems = (id) => db.all('proposalItems', (i) => i.proposalId === id).sort((a, z) => (a.position || 0) - (z.position || 0));
export function getProposal(id) { return expireIfNeeded(requireOwned('proposals', id, 'proposal', 'proposal.view')); }
const editableProposal = (id) => { const prop = getProposal(id); requireProject(prop.projectId, 'proposal.edit'); return prop; };

function expireIfNeeded(prop) {
  if (['sent', 'viewed'].includes(prop.status) && prop.validUntil && prop.validUntil < todayISO()) {
    return db.update('proposals', prop.id, { status: 'expired' });
  }
  return prop;
}

export function createProposal(projectId) {
  const p = requireProject(projectId, 'proposal.edit');
  if (acceptedProposal(p.id)) throw new UserError(t('This project already has an accepted proposal. Use a change order to add work.'));
  const open = db.find('proposals', (x) => x.projectId === p.id && ['draft', 'sent', 'viewed'].includes(x.status));
  if (open) throw new UserError(t('This project already has an open proposal.'));
  const b = myBusiness();
  const L = clientLang(p);
  const brief = getBrief(p.id);
  const n = b.nextProposalNumber || 101;
  db.update('businesses', b.id, { nextProposalNumber: n + 1 });
  const days = p.deadline ? Math.max(1, daysBetween(todayISO(), p.deadline)) : 14;
  const prop = db.insert('proposals', {
    businessId: b.id, projectId: p.id, clientId: p.clientId, number: `${b.proposalPrefix || 'P-'}${n}`,
    title: p.name, introduction: stock(b.proposalIntro, 'Thank you for the opportunity. Below is the scope, timeline and investment for this project.', L),
    objective: brief?.objective || '',
    timeline: tl(L, '{n} days', { n: days }), revisions: p.revisionsIncluded, depositPercent: p.depositPercent,
    paymentTerms: stock(b.defaultPaymentTerms, '50% deposit before work begins, 50% on final approval before delivery of final files.', L),
    validUntil: addDays(clock.now(), b.proposalValidityDays || 14).toISOString().slice(0, 10),
    notes: '', currency: p.currency, lang: L, status: 'draft', sentAt: null, viewedAt: null, respondedAt: null, responseNote: '', acceptedByName: '',
  });
  db.insert('proposalItems', { proposalId: prop.id, description: `${tl(L, p.type)} — ${p.name}`, quantity: 1, unitPrice: Number(p.budget) || 0, position: 0 });
  logActivity(p, freelancerActor(), 'proposal.created', 'Proposal {number} drafted', { number: prop.number });
  return prop;
}

export function updateProposal(id, data) {
  const prop = editableProposal(id);
  if (prop.status !== 'draft') throw new UserError(t('Only draft proposals can be edited.'));
  const p = db.get('projects', prop.projectId);
  const clean = {
    title: req(data.title, 'Project name', 'title', 140),
    introduction: opt(data.introduction, 3000), objective: opt(data.objective, 3000), timeline: opt(data.timeline, 200),
    revisions: int(data.revisions, 'Revision rounds', 'revisions', 0, 20),
    depositPercent: int(data.depositPercent, 'Deposit', 'depositPercent', 0, 100),
    paymentTerms: opt(data.paymentTerms, 2000), validUntil: dateStr(data.validUntil, 'Valid until', 'validUntil', true), notes: opt(data.notes, 3000),
  };
  const items = (data.items || []).filter((i) => String(i.description || '').trim());
  if (!items.length) throw new UserError(t('Add at least one price line.'));
  db.all('proposalItems', (i) => i.proposalId === id).forEach((i) => db.remove('proposalItems', i.id));
  items.forEach((i, n) => db.insert('proposalItems', {
    proposalId: id, description: req(i.description, 'Price line', null, 300),
    quantity: money(i.quantity || 1, 'Quantity', null, { allowZero: false }), unitPrice: money(i.unitPrice || 0, 'Price'), position: n,
  }));
  if (data.deliverables) saveScope(p.id, { deliverables: data.deliverables, exclusions: data.exclusions ?? (p.exclusions || []).join('\n') });
  db.update('projects', p.id, { revisionsIncluded: clean.revisions, depositPercent: clean.depositPercent, budget: proposalTotal(id) });
  return db.update('proposals', id, clean);
}

export function sendProposal(id) {
  const prop = editableProposal(id);
  if (prop.status !== 'draft') throw new UserError(t('This proposal has already been sent.'));
  const p = db.get('projects', prop.projectId);
  if (proposalTotal(id) <= 0) throw new UserError(t('Add a price before sending the proposal.'));
  if (!listDeliverables(p.id).length) throw new UserError(t('List at least one deliverable so the scope is clear.'));
  if (prop.validUntil < todayISO()) throw new UserError(t('The "valid until" date is in the past.'));
  assertCanActivateProject(p.businessId);
  db.update('proposals', id, { status: 'sent', sentAt: nowISO() });
  mailClient(p, { kind: 'proposal', subject: 'Proposal: {title}', subjectVars: { title: prop.title }, body: 'Your proposal is ready to review.', section: 'proposal', linkLabel: 'View proposal' });
  logActivity(p, freelancerActor(), 'proposal.sent', 'Proposal {number} sent', { number: prop.number });
  touchClient(p.clientId);
}

export function reviseProposal(id) {
  const prop = editableProposal(id);
  if (!['rejected', 'expired', 'sent', 'viewed'].includes(prop.status)) throw new UserError(t('This proposal cannot be revised.'));
  const p = db.get('projects', prop.projectId);
  db.update('proposals', id, { status: 'draft', validUntil: addDays(clock.now(), myBusiness().proposalValidityDays || 14).toISOString().slice(0, 10), sentAt: null, viewedAt: null, respondedAt: null });
  logActivity(p, freelancerActor(), 'proposal.revised', 'Proposal {number} reopened for revision', { number: prop.number });
}

export function portalProposal(projectId, token) {
  const p = portalProject(projectId, token);
  const prop = db.all('proposals', (x) => x.projectId === p.id && x.status !== 'draft').sort((a, z) => z.createdAt.localeCompare(a.createdAt))[0];
  return prop ? expireIfNeeded(prop) : null;
}
export function portalViewProposal(projectId, token) {
  const p = portalProject(projectId, token);
  const prop = portalProposal(projectId, token);
  if (prop && prop.status === 'sent') {
    db.update('proposals', prop.id, { status: 'viewed', viewedAt: nowISO() });
    logActivity(p, clientActor(p), 'proposal.viewed', 'Client viewed the proposal');
  }
}
export function portalRespondProposal(projectId, token, { decision, name, note }) {
  const p = portalProject(projectId, token);
  portalGuard(p, 'proposal.respond');
  const prop = portalProposal(projectId, token);
  if (!prop || !['sent', 'viewed'].includes(prop.status)) throw new UserError(t('This proposal is no longer open for a response.'));
  const actor = clientActor(p, name);
  if (decision === 'accept') {
    const signer = req(name, 'Your name', 'name', 120);
    db.update('proposals', prop.id, { status: 'accepted', respondedAt: nowISO(), acceptedByName: signer });
    db.update('projects', p.id, { budget: proposalTotal(prop.id), revisionsIncluded: prop.revisions, depositPercent: prop.depositPercent });
    logActivity(p, actor, 'proposal.accepted', 'Proposal {number} accepted by {name}', { number: prop.number, name: signer });
    generateContract(db.get('projects', p.id), prop, actor);
    notifyOwner(p, { type: 'client_action', title: 'Proposal accepted', body: '{client} accepted the proposal for {project}. The contract has been issued.', vars: { client: clientOf(p)?.name, project: p.name }, link: `/projects/${p.id}/contract` });
  } else if (decision === 'decline') {
    const reason = opt(note, 1000);
    db.update('proposals', prop.id, { status: 'rejected', respondedAt: nowISO(), responseNote: reason });
    if (reason) logActivity(p, actor, 'proposal.declined', 'Proposal {number} declined: "{reason}"', { number: prop.number, reason: reason.slice(0, 200) });
    else logActivity(p, actor, 'proposal.declined', 'Proposal {number} declined', { number: prop.number });
    notifyOwner(p, { type: 'client_action', title: 'Proposal declined', body: '{client} declined the proposal for {project}.', vars: { client: clientOf(p)?.name, project: p.name }, link: `/proposals/${prop.id}` });
  } else throw new UserError(t('Unknown response.'));
}

// ---------- Contracts ----------
function fill(text, vars) { return String(text || '').replace(/\{\{(\w+)\}\}/g, (_, k) => (k in vars ? vars[k] : '')); }

function contractVars(p, prop, L) {
  const c = clientOf(p);
  const f = financials(p);
  const delivs = listDeliverables(p.id).map((d) => `• ${d.quantity} × ${d.title}`).join('\n') || `• ${tl(L, 'As listed in the proposal')}`;
  const excl = (p.exclusions || []).map((x) => `• ${x}`).join('\n');
  return {
    project: p.name, client: c?.company || c?.name || tl(L, 'the Client'), freelancer: db.get('businesses', p.businessId).name,
    deliverables: delivs + (excl ? `\n\n${tl(L, 'Not included:')}\n${excl}` : ''),
    deadline: p.deadline ? fmtDate(p.deadline, undefined, L) : tl(L, 'the date agreed in the proposal'), total: fmtMoney(f.base, p.currency, L),
    paymentTerms: prop?.paymentTerms || '', depositPercent: p.depositPercent, depositAmount: fmtMoney(f.depositAmount, p.currency, L), revisions: p.revisionsIncluded,
  };
}

export function generateContract(p, prop, actor) {
  const b = db.get('businesses', p.businessId);
  const L = clientLang(p);
  const vars = contractVars(p, prop, L);
  const sections = contractTemplateFor(b, L).map((s) => ({ title: s.title, body: fill(s.body, vars) }));
  const c = db.insert('contracts', {
    businessId: b.id, projectId: p.id, clientId: p.clientId, proposalId: prop?.id || null, lang: L,
    title: tl(L, 'Service Agreement — {project}', { project: p.name }), parties: { freelancer: b.name, client: vars.client },
    sections, disclaimer: tl(L, CONTRACT_DISCLAIMER), status: 'sent', sentAt: nowISO(), acceptedAt: null, acceptedByName: '', fingerprint: '',
  });
  logActivity(p, actor, 'contract.issued', 'Contract generated and issued for acceptance');
  mailClient(p, { kind: 'contract', subject: 'Contract ready: {project}', subjectVars: { project: p.name }, body: 'The service agreement is ready for your review and acceptance.', section: 'contract', linkLabel: 'Review contract' });
  return c;
}

export function listContracts() {
  const b = myBusiness();
  return db.all('contracts', (c) => c.businessId === b.id && c.status !== 'void' && can(db.get('projects', c.projectId), 'contract.view')).sort((a, z) => z.createdAt.localeCompare(a.createdAt));
}
export const projectContract = (projectId) => db.all('contracts', (c) => c.projectId === projectId && c.status !== 'void').sort((a, z) => z.createdAt.localeCompare(a.createdAt))[0] || null;
export const getContract = (id) => requireOwned('contracts', id, 'contract', 'contract.view');

export function updateContract(id, sections) {
  const c = getContract(id);
  requireProject(c.projectId, 'contract.edit');
  if (c.status === 'accepted') throw new UserError(t('An accepted contract cannot be changed.'));
  const clean = sections.map((s) => ({ title: req(s.title, 'Section title', null, 120), body: opt(s.body, 6000) }));
  db.update('contracts', id, { sections: clean });
  logActivity(db.get('projects', c.projectId), freelancerActor(), 'contract.updated', 'Contract terms edited before acceptance');
}

export function regenerateContract(projectId) {
  const p = requireProject(projectId, 'contract.edit');
  const prop = acceptedProposal(p.id);
  if (!prop) throw new UserError(t('A contract is generated once the client accepts a proposal.'));
  const cur = projectContract(p.id);
  if (cur?.status === 'accepted') throw new UserError(t('The contract is already accepted.'));
  if (cur) db.update('contracts', cur.id, { status: 'void' });
  return generateContract(p, prop, freelancerActor());
}

function fingerprint(obj) {
  // FNV-1a over the accepted text: lets anyone check the stored terms were not altered.
  let h = 0x811c9dc5;
  const s = JSON.stringify(obj);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

export function portalContract(projectId, token) { portalProject(projectId, token); return projectContract(projectId); }
export function portalAcceptContract(projectId, token, { name, agree }) {
  const p = portalProject(projectId, token);
  portalGuard(p, 'contract.accept');
  const c = projectContract(projectId);
  if (!c || c.status !== 'sent') throw new UserError(t('There is no contract waiting for acceptance.'));
  if (!agree) throw new UserError(t('Please confirm you have read and agree to the terms.'), 'agree');
  const signer = req(name, 'Your full name', 'name', 120);
  const acceptedAt = nowISO();
  db.update('contracts', c.id, { status: 'accepted', acceptedAt, acceptedByName: signer, fingerprint: fingerprint({ sections: c.sections, acceptedAt, signer }) });
  const actor = clientActor(p, signer);
  logActivity(p, actor, 'contract.accepted', 'Contract accepted by {name}', { name: signer });
  const fresh = db.get('projects', p.id);
  const inv = createDepositInvoice(fresh, actor);
  if (inv) {
    db.update('invoices', inv.id, { status: 'sent', sentAt: nowISO() });
    db.update('projects', p.id, { status: 'awaiting_deposit' });
    logActivity(p, systemActor(), 'deposit.requested', 'Deposit requested ({number})', { number: inv.number });
  } else {
    db.update('projects', p.id, { status: 'active', startedAt: nowISO() });
    logActivity(p, systemActor(), 'project.active', 'No deposit required — project is now active');
  }
  notifyOwner(p, { type: 'client_action', title: 'Contract accepted', body: inv ? '{name} accepted the contract for {project}. The deposit invoice was sent.' : '{name} accepted the contract for {project}.', vars: { name: signer, project: p.name }, link: `/projects/${p.id}` });
}

// ---------- Change orders (scope protection) ----------
export const listChangeOrders = (projectId) => db.all('changeOrders', (c) => c.projectId === projectId).sort((a, z) => z.createdAt.localeCompare(a.createdAt));

export function createChangeOrder(projectId, data) {
  const p = requireProject(projectId, 'scope.edit');
  if (!acceptedProposal(p.id)) throw new UserError(t('Change orders apply once a proposal has been accepted. Edit the proposal instead.'));
  if (['completed', 'cancelled'].includes(p.status)) throw new UserError(t('This project is closed.'));
  const roundId = data.revisionRoundId || null;
  if (roundId) {
    const r = db.get('revisionRounds', roundId);
    if (!r || r.projectId !== p.id) throw new UserError(t('That revision round was not found.'));
  }
  const co = db.insert('changeOrders', {
    projectId: p.id, businessId: p.businessId, title: req(data.title, 'Title', 'title', 160), description: opt(data.description, 2000),
    amount: money(data.amount, 'Price', 'amount'), extraDays: data.extraDays ? int(data.extraDays, 'Extra days', 'extraDays', 0, 365) : 0,
    revisionRoundId: roundId, status: 'pending', respondedAt: null, respondedByName: '',
  });
  logActivity(p, freelancerActor(), 'change_order.created', 'Change order "{title}" (+{amount} {currency}) sent for approval', { title: co.title, amount: co.amount, currency: p.currency });
  mailClient(p, { kind: 'change_order', subject: 'Change order: {title}', subjectVars: { title: co.title }, body: 'A change to the project scope needs your approval: {title} (+{amount}).', bodyVars: { title: co.title, amount: fmtMoney(co.amount, p.currency, clientLang(p)) }, section: 'scope', linkLabel: 'Review change' });
  return co;
}
export function withdrawChangeOrder(id) {
  const co = requireOwned('changeOrders', id, 'change order', 'scope.edit');
  if (co.status !== 'pending') throw new UserError(t('Only pending change orders can be withdrawn.'));
  db.remove('changeOrders', id);
  logActivity(db.get('projects', co.projectId), freelancerActor(), 'change_order.withdrawn', 'Change order "{title}" withdrawn', { title: co.title });
}
export function portalRespondChangeOrder(projectId, token, id, { decision, name }) {
  const p = portalProject(projectId, token);
  portalGuard(p, 'changes.respond');
  const co = db.get('changeOrders', id);
  if (!co || co.projectId !== p.id || co.status !== 'pending') throw new UserError(t('This change order is no longer open.'));
  const signer = req(name, 'Your name', 'name', 120);
  const actor = clientActor(p, signer);
  if (decision === 'approve') {
    db.update('changeOrders', id, { status: 'approved', respondedAt: nowISO(), respondedByName: signer });
    db.insert('deliverables', { projectId: p.id, title: co.title, quantity: 1, description: co.description, position: 999, source: 'change_order', changeOrderId: co.id });
    if (co.revisionRoundId) db.update('revisionRounds', co.revisionRoundId, { changeOrderId: co.id });
    if (co.extraDays && p.deadline) db.update('projects', p.id, { deadline: addDays(p.deadline, co.extraDays).toISOString().slice(0, 10) });
    logActivity(p, actor, 'change_order.approved', 'Change order "{title}" approved by {name} (+{amount} {currency})', { title: co.title, name: signer, amount: co.amount, currency: p.currency });
    notifyOwner(p, { type: 'client_action', title: 'Change order approved', body: '{name} approved "{title}".', vars: { name: signer, title: co.title }, link: `/projects/${p.id}/scope` });
  } else {
    db.update('changeOrders', id, { status: 'declined', respondedAt: nowISO(), respondedByName: signer });
    logActivity(p, actor, 'change_order.declined', 'Change order "{title}" declined by {name}', { title: co.title, name: signer });
    notifyOwner(p, { type: 'client_action', title: 'Change order declined', body: '{name} declined "{title}".', vars: { name: signer, title: co.title }, link: `/projects/${p.id}/scope` });
  }
}

export const changeOrderTotal = (projectId) => sum(db.all('changeOrders', (c) => c.projectId === projectId && c.status === 'approved'), (c) => c.amount);
