// Businesses, onboarding, clients and projects.
import { db } from '../core/store.js';
import { auth } from '../core/auth.js';
import { UserError, req, opt, email as vEmail, int, money, dateStr, lines, randomToken, nowISO, todayISO, addDays, sum, round2, clock } from '../core/util.js';
import { me, myBusiness, requireProject, requireOwned, logActivity, freelancerActor, assertCanActivateProject } from './context.js';
import { CURRENCIES, TEMPLATES, PROJECT_TYPES, DEFAULT_CONTRACT_SECTIONS, OPEN_STATUSES } from './constants.js';

// ---------- Business & onboarding ----------
export function completeOnboarding({ disciplines, services, currency, businessName, logo }) {
  const u = me();
  if (db.find('businesses', (b) => b.ownerId === u.id)) throw new UserError('Your business is already set up.');
  const d = (disciplines || []).filter(Boolean).slice(0, 12);
  if (!d.length) throw new UserError('Choose at least one type of work you do.', 'disciplines');
  if (!CURRENCIES.includes(currency)) throw new UserError('Choose a currency.', 'currency');
  const name = req(businessName, 'Business name', 'businessName', 120);
  db.insert('profiles', { userId: u.id, disciplines: d, services: lines(services).slice(0, 30), title: d[0], bio: '', phone: '' });
  const b = db.insert('businesses', {
    ownerId: u.id, name, currency, logo: logo || '', brandColor: '#17150F', address: '', taxRate: 0, taxLabel: 'VAT',
    invoicePrefix: 'INV-', nextInvoiceNumber: 1001, proposalPrefix: 'P-', nextProposalNumber: 101,
    paymentInstructions: 'Bank transfer to the account details provided on request. Please include the invoice number as the reference.',
    defaultPaymentTerms: '50% deposit before work begins, 50% on final approval before delivery of final files.',
    defaultDueDays: 7, defaultRevisions: 2, defaultDepositPercent: 50, proposalValidityDays: 14,
    proposalIntro: 'Thank you for the opportunity. Below is the scope, timeline and investment for this project.',
    contractSections: DEFAULT_CONTRACT_SECTIONS.map(([title, body]) => ({ title, body })),
    notificationSettings: {}, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  });
  db.insert('subscriptions', { businessId: b.id, plan: 'free', status: 'active', provider: 'none' });
  auth.updateUser({ onboarded: true });
  return b;
}

export function updateBusiness(patch) {
  const b = myBusiness();
  const clean = {};
  const s = (k, label, max = 500, required = false) => { if (k in patch) clean[k] = required ? req(patch[k], label, k, max) : opt(patch[k], max); };
  s('name', 'Business name', 120, true); s('address', 'Address', 500); s('paymentInstructions', 'Payment instructions', 2000);
  s('defaultPaymentTerms', 'Payment terms', 1000); s('proposalIntro', 'Proposal introduction', 2000); s('invoicePrefix', 'Invoice prefix', 12);
  s('taxLabel', 'Tax label', 20); s('brandColor', 'Brand color', 9);
  if ('currency' in patch) { if (!CURRENCIES.includes(patch.currency)) throw new UserError('Choose a supported currency.'); clean.currency = patch.currency; }
  if ('taxRate' in patch) clean.taxRate = money(patch.taxRate, 'Tax rate', 'taxRate');
  if ('defaultDueDays' in patch) clean.defaultDueDays = int(patch.defaultDueDays, 'Due days', 'defaultDueDays', 0, 120);
  if ('defaultRevisions' in patch) clean.defaultRevisions = int(patch.defaultRevisions, 'Revisions', 'defaultRevisions', 0, 20);
  if ('defaultDepositPercent' in patch) clean.defaultDepositPercent = int(patch.defaultDepositPercent, 'Deposit %', 'defaultDepositPercent', 0, 100);
  if ('proposalValidityDays' in patch) clean.proposalValidityDays = int(patch.proposalValidityDays, 'Validity', 'proposalValidityDays', 1, 365);
  if ('nextInvoiceNumber' in patch) clean.nextInvoiceNumber = int(patch.nextInvoiceNumber, 'Next invoice number', 'nextInvoiceNumber', 1, 99999999);
  if ('logo' in patch) clean.logo = patch.logo || '';
  if ('notificationSettings' in patch) clean.notificationSettings = patch.notificationSettings;
  if ('contractSections' in patch) {
    clean.contractSections = patch.contractSections.map((x) => ({ title: req(x.title, 'Section title', null, 120), body: opt(x.body, 5000) })).filter((x) => x.title);
  }
  if (clean.brandColor && !/^#[0-9a-fA-F]{6}$/.test(clean.brandColor)) throw new UserError('Brand color must be a hex color like #17150F.');
  return db.update('businesses', b.id, clean);
}

export function myProfile() { const u = me(); return db.find('profiles', (p) => p.userId === u.id); }
export function updateProfile(patch) {
  const p = myProfile();
  const clean = {};
  if ('title' in patch) clean.title = opt(patch.title, 120);
  if ('bio' in patch) clean.bio = opt(patch.bio, 2000);
  if ('phone' in patch) clean.phone = opt(patch.phone, 40);
  if ('disciplines' in patch) clean.disciplines = patch.disciplines.filter(Boolean);
  if ('services' in patch) clean.services = lines(patch.services).slice(0, 30);
  return db.update('profiles', p.id, clean);
}

// ---------- Clients ----------
function cleanClient(data) {
  return {
    name: req(data.name, 'Client name', 'name', 120),
    company: opt(data.company, 120),
    email: vEmail(data.email, 'email', false),
    phone: opt(data.phone, 40),
    country: opt(data.country, 80),
    notes: opt(data.notes, 5000),
  };
}
export function listClients() {
  const b = myBusiness();
  return db.all('clients', (c) => c.businessId === b.id).sort((a, z) => a.name.localeCompare(z.name));
}
export const getClient = (id) => requireOwned('clients', id, 'client');
export function createClient(data) {
  const b = myBusiness();
  const c = cleanClient(data);
  if (c.email && db.find('clients', (x) => x.businessId === b.id && x.email === c.email)) throw new UserError('A client with this email already exists.', 'email');
  return db.insert('clients', { ...c, businessId: b.id, lastContactAt: null });
}
export function updateClient(id, data) { getClient(id); return db.update('clients', id, cleanClient(data)); }
export function deleteClient(id) {
  getClient(id);
  if (db.count('projects', (p) => p.clientId === id)) throw new UserError('This client has projects. Cancel or keep their projects instead of deleting the client.');
  db.remove('clients', id);
}
export function clientStats(clientId) {
  const projects = db.all('projects', (p) => p.clientId === clientId);
  const invoices = db.all('invoices', (i) => i.clientId === clientId && i.status !== 'cancelled');
  const paid = sum(invoices, (i) => invoicePaid(i.id));
  const outstanding = sum(invoices.filter((i) => i.status !== 'draft'), (i) => invoiceTotal(i.id) - invoicePaid(i.id));
  const last = projects.sort((a, z) => z.createdAt.localeCompare(a.createdAt))[0] || null;
  return { projects, revenue: paid, outstanding, lastProject: last };
}

// Invoice math lives here to avoid circular imports.
export function invoiceTotals(invoiceId) {
  const inv = db.get('invoices', invoiceId);
  const items = db.all('invoiceItems', (x) => x.invoiceId === invoiceId).sort((a, z) => (a.position || 0) - (z.position || 0));
  const subtotal = sum(items, (x) => x.quantity * x.unitPrice);
  const discount = Math.min(round2(inv?.discount || 0), subtotal);
  const tax = round2((subtotal - discount) * (Number(inv?.taxRate) || 0) / 100);
  const total = round2(subtotal - discount + tax);
  const paid = invoicePaid(invoiceId);
  return { items, subtotal, discount, tax, total, paid, balance: round2(total - paid) };
}
export const invoiceTotal = (id) => invoiceTotals(id).total;
export const invoicePaid = (id) => sum(db.all('payments', (p) => p.invoiceId === id && p.status === 'confirmed'), (p) => p.amount);

// ---------- Projects ----------
export function listProjects({ status, clientId } = {}) {
  const b = myBusiness();
  return db.all('projects', (p) => p.businessId === b.id && (!status || (status === 'open' ? OPEN_STATUSES.includes(p.status) : p.status === status)) && (!clientId || p.clientId === clientId))
    .sort((a, z) => (a.deadline || '9999').localeCompare(z.deadline || '9999'));
}
export const getProject = (id) => requireProject(id);

export function createProject(data) {
  const b = myBusiness();
  const tpl = data.templateKey ? TEMPLATES[data.templateKey] : null;
  let clientId = data.clientId;
  if (clientId === '__new') {
    clientId = createClient({ name: data.newClientName, company: data.newClientCompany, email: data.newClientEmail }).id;
  } else {
    if (!clientId) throw new UserError('Choose a client for this project.', 'clientId');
    getClient(clientId);
  }
  const type = PROJECT_TYPES.includes(data.type) ? data.type : (tpl?.type || 'Other');
  const project = db.insert('projects', {
    businessId: b.id, clientId,
    name: req(data.name, 'Project name', 'name', 140),
    type, status: 'draft',
    deadline: dateStr(data.deadline, 'Deadline', 'deadline') || (tpl ? addDays(clock.now(), tpl.days).toISOString().slice(0, 10) : ''),
    budget: data.budget ? money(data.budget, 'Budget', 'budget') : (tpl?.price || 0),
    currency: b.currency,
    revisionsIncluded: data.revisionsIncluded !== undefined && data.revisionsIncluded !== '' ? int(data.revisionsIncluded, 'Revision rounds', 'revisionsIncluded', 0, 20) : (tpl?.revisions ?? b.defaultRevisions),
    depositPercent: data.depositPercent !== undefined && data.depositPercent !== '' ? int(data.depositPercent, 'Deposit', 'depositPercent', 0, 100) : (tpl?.deposit ?? b.defaultDepositPercent),
    exclusions: tpl ? [...tpl.exclusions] : ['Additional revision rounds beyond those included', 'Work outside the listed deliverables'],
    portalToken: randomToken(18), portalDisabled: false, lockDeliveryUntilPaid: false,
    templateKey: data.templateKey || null, deliveredAt: null, completedAt: null, cancelledAt: null,
  });
  db.insert('projectMembers', { projectId: project.id, userId: me().id, role: 'owner' });
  db.insert('briefs', {
    projectId: project.id, status: 'draft', objective: '', audience: '', platforms: '', tone: '', references: '', notes: '',
    deliverablesText: tpl ? tpl.deliverables.map(([t, q]) => `${q} × ${t}`).join('\n') : '', productionNeeds: '', budget: project.budget || '', submittedAt: null,
  });
  (tpl?.deliverables || []).forEach(([title, quantity], i) => db.insert('deliverables', { projectId: project.id, title, quantity, description: '', position: i, source: 'scope' }));
  logActivity(project, freelancerActor(), 'project.created', `Project created${tpl ? ` from the ${tpl.name} template` : ''}`);
  return project;
}

export function updateProject(id, data) {
  const p = requireProject(id);
  const clean = {};
  if ('name' in data) clean.name = req(data.name, 'Project name', 'name', 140);
  if ('type' in data) clean.type = PROJECT_TYPES.includes(data.type) ? data.type : 'Other';
  if ('deadline' in data) clean.deadline = dateStr(data.deadline, 'Deadline', 'deadline');
  if ('budget' in data) clean.budget = money(data.budget || 0, 'Budget', 'budget');
  if ('lockDeliveryUntilPaid' in data) clean.lockDeliveryUntilPaid = !!data.lockDeliveryUntilPaid;
  if ('portalDisabled' in data) clean.portalDisabled = !!data.portalDisabled;
  const locked = !['draft'].includes(p.status);
  if ('revisionsIncluded' in data) {
    const v = int(data.revisionsIncluded, 'Revision rounds', 'revisionsIncluded', 0, 20);
    if (locked && v !== p.revisionsIncluded) throw new UserError('Revision allowance is locked once the contract is accepted. Use a change order for extra rounds.');
    clean.revisionsIncluded = v;
  }
  if ('depositPercent' in data) {
    const v = int(data.depositPercent, 'Deposit', 'depositPercent', 0, 100);
    if (locked && v !== p.depositPercent) throw new UserError('The deposit is locked once the contract is accepted.');
    clean.depositPercent = v;
  }
  return db.update('projects', id, clean);
}

export function regeneratePortalLink(id) {
  requireProject(id);
  return db.update('projects', id, { portalToken: randomToken(18) });
}

export function cancelProject(id, reason) {
  const p = requireProject(id);
  if (['completed', 'cancelled'].includes(p.status)) throw new UserError('This project is already closed.');
  db.update('projects', id, { status: 'cancelled', cancelledAt: nowISO() });
  logActivity(p, freelancerActor(), 'project.cancelled', `Project cancelled${reason ? ` — ${opt(reason, 300)}` : ''}`);
}

export function setStatus(project, status) {
  if (project.status === status) return project;
  if (project.status === 'draft' && status !== 'cancelled') assertCanActivateProject(project.businessId);
  return db.update('projects', project.id, { status });
}

// Scope: deliverables and exclusions
export const listDeliverables = (projectId) => db.all('deliverables', (d) => d.projectId === projectId).sort((a, z) => (a.position || 0) - (z.position || 0));
export function saveScope(projectId, { deliverables, exclusions }) {
  const p = requireProject(projectId);
  if (!['draft'].includes(p.status)) throw new UserError('Scope is locked after the contract is accepted. Use a change order to add work.');
  const rows = (deliverables || []).filter((d) => String(d.title || '').trim());
  if (rows.length > 60) throw new UserError('That is a lot of deliverables — keep it under 60.');
  listDeliverables(projectId).filter((d) => d.source !== 'change_order').forEach((d) => db.remove('deliverables', d.id));
  rows.forEach((d, i) => db.insert('deliverables', {
    projectId, title: req(d.title, 'Deliverable', null, 200), quantity: int(d.quantity || 1, 'Quantity', null, 1, 10000), description: opt(d.description, 500), position: i, source: 'scope',
  }));
  db.update('projects', projectId, { exclusions: lines(exclusions).slice(0, 40) });
  logActivity(p, freelancerActor(), 'scope.updated', 'Scope updated');
}

// ---------- Derived project state ----------
export function acceptedProposal(projectId) { return db.find('proposals', (x) => x.projectId === projectId && x.status === 'accepted'); }
export function latestProposal(projectId) {
  return db.all('proposals', (x) => x.projectId === projectId).sort((a, z) => z.createdAt.localeCompare(a.createdAt))[0] || null;
}
export const proposalTotal = (proposalId) => sum(db.all('proposalItems', (i) => i.proposalId === proposalId), (i) => i.quantity * i.unitPrice);

export function financials(projectOrId) {
  const p = typeof projectOrId === 'string' ? db.get('projects', projectOrId) : projectOrId;
  const acc = acceptedProposal(p.id);
  const latest = latestProposal(p.id);
  const base = acc ? proposalTotal(acc.id) : latest && latest.status !== 'rejected' ? proposalTotal(latest.id) : Number(p.budget) || 0;
  const changeOrders = sum(db.all('changeOrders', (c) => c.projectId === p.id && c.status === 'approved'), (c) => c.amount);
  const total = round2(base + changeOrders);
  const invoices = db.all('invoices', (i) => i.projectId === p.id && i.status !== 'cancelled');
  const invoiced = sum(invoices, (i) => invoiceTotal(i.id));
  const paid = sum(invoices, (i) => invoicePaid(i.id));
  const depositAmount = round2(base * (p.depositPercent || 0) / 100);
  const depositInv = invoices.find((i) => i.kind === 'deposit');
  return {
    contracted: !!acc, base, changeOrders, total, invoiced, paid,
    balance: round2(total - paid), uninvoiced: round2(total - invoiced),
    depositAmount, depositPaid: depositInv ? invoicePaid(depositInv.id) >= invoiceTotal(depositInv.id) - 0.001 : false,
    paidPct: total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0,
  };
}

const PROGRESS = { draft: 10, awaiting_deposit: 25, active: 40, in_review: 60, revision_requested: 65, awaiting_approval: 85, approved: 90, completed: 100, cancelled: 0 };
export function progress(p) {
  let v = PROGRESS[p.status] ?? 0;
  if (p.status === 'draft') {
    const prop = latestProposal(p.id);
    if (prop?.status === 'accepted') v = 20; else if (prop && prop.status !== 'draft') v = 15;
  }
  if (p.status === 'approved' && p.deliveredAt) v = 95;
  return v;
}

// "What do I need to do next?" — one clear action per project.
export function nextAction(p) {
  const tab = (t) => `/projects/${p.id}/${t}`;
  const brief = db.find('briefs', (b) => b.projectId === p.id);
  const prop = latestProposal(p.id);
  const contract = db.all('contracts', (c) => c.projectId === p.id && c.status !== 'void').sort((a, z) => z.createdAt.localeCompare(a.createdAt))[0];
  const invoices = db.all('invoices', (i) => i.projectId === p.id && i.status !== 'cancelled');
  const reported = db.find('payments', (x) => x.status === 'reported' && invoices.some((i) => i.id === x.invoiceId));
  if (reported) return { label: 'Confirm payment', detail: 'The client reported a payment. Confirm it once received.', href: `/invoices/${reported.invoiceId}` };
  const pendingCO = db.find('changeOrders', (c) => c.projectId === p.id && c.status === 'pending');
  const extraRound = db.find('revisionRounds', (r) => r.projectId === p.id && r.isExtra && !r.changeOrderId && r.status !== 'delivered');
  if (extraRound && !pendingCO) return { label: 'Create change order', detail: `Revision ${extraRound.number} exceeds the ${p.revisionsIncluded} included rounds.`, href: tab('scope') };

  switch (p.status) {
    case 'cancelled': return { label: 'Cancelled', detail: 'No further action.', waiting: true };
    case 'completed': {
      if (!db.find('portfolioItems', (x) => x.projectId === p.id)) return { label: 'Add to portfolio', detail: 'Turn this project into a case study.', href: `/portfolio/new?project=${p.id}` };
      if (!db.find('reminders', (r) => r.projectId === p.id && !r.doneAt)) return { label: 'Set a follow-up', detail: 'Plan when to check in with this client.', href: tab('overview') };
      return { label: 'Completed', detail: 'Follow-up scheduled.', waiting: true };
    }
    case 'draft': {
      if (brief?.status === 'sent') return { label: 'Waiting for client', detail: 'The client is completing the brief.', waiting: true, href: tab('brief') };
      if (brief?.status === 'submitted') return { label: 'Review brief', detail: 'The client submitted the brief.', href: tab('brief') };
      if (!prop) return brief && brief.objective ? { label: 'Create proposal', detail: 'Turn the brief into a proposal.', href: tab('proposal') } : { label: 'Complete brief', detail: 'Define the objective and deliverables, or send the brief to your client.', href: tab('brief') };
      if (prop.status === 'draft') return { label: 'Send proposal', detail: 'Review the proposal and send it to your client.', href: `/proposals/${prop.id}` };
      if (['sent', 'viewed'].includes(prop.status)) return { label: 'Waiting for client', detail: prop.status === 'viewed' ? 'The client viewed your proposal.' : 'Proposal sent — waiting for a response.', waiting: true, href: `/proposals/${prop.id}` };
      if (['rejected', 'expired'].includes(prop.status)) return { label: 'Revise proposal', detail: `The proposal was ${prop.status === 'rejected' ? 'declined' : 'not answered in time'}.`, href: tab('proposal') };
      if (contract?.status === 'draft') return { label: 'Send contract', detail: 'Review the generated contract and send it.', href: tab('contract') };
      if (contract?.status === 'sent') return { label: 'Waiting for client', detail: 'Contract sent — waiting for acceptance.', waiting: true, href: tab('contract') };
      return { label: 'Generate contract', detail: 'The proposal was accepted.', href: tab('contract') };
    }
    case 'awaiting_deposit': {
      const dep = invoices.find((i) => i.kind === 'deposit');
      if (!dep) return { label: 'Request deposit', detail: 'Create the deposit invoice.', href: tab('invoices') };
      if (dep.status === 'draft') return { label: 'Send deposit invoice', detail: 'Send the deposit invoice to start work.', href: `/invoices/${dep.id}` };
      return { label: 'Waiting for deposit', detail: 'Record the payment when it arrives.', waiting: true, href: `/invoices/${dep.id}` };
    }
    case 'active': {
      const hasDraft = db.find('files', (f) => f.projectId === p.id && ['drafts', 'review'].includes(f.folder));
      return hasDraft ? { label: 'Send for review', detail: 'Share a version with your client.', href: tab('files') } : { label: 'Upload draft', detail: 'Upload your first draft.', href: tab('files') };
    }
    case 'in_review': return { label: 'Waiting for client', detail: 'Client is reviewing — or request final approval.', waiting: true, href: tab('feedback') };
    case 'revision_requested': {
      const r = db.all('revisionRounds', (x) => x.projectId === p.id && x.status !== 'delivered').sort((a, z) => z.number - a.number)[0];
      return { label: 'Upload revision', detail: r ? `Revision ${r.number} of ${p.revisionsIncluded} requested.` : 'Client requested changes.', href: tab('revisions') };
    }
    case 'awaiting_approval': return { label: 'Awaiting approval', detail: 'Final version sent for approval.', waiting: true, href: tab('approvals') };
    case 'approved': {
      if (!p.deliveredAt) return { label: 'Deliver final files', detail: 'Upload final files and deliver them.', href: tab('files') };
      const f = financials(p);
      if (f.balance > 0.001) {
        const draft = invoices.find((i) => i.status === 'draft');
        if (draft) return { label: 'Send final invoice', detail: 'Send the final invoice to your client.', href: `/invoices/${draft.id}` };
        if (f.uninvoiced > 0.001) return { label: 'Create final invoice', detail: 'Invoice the remaining balance.', href: tab('invoices') };
        return { label: 'Waiting for payment', detail: 'Final invoice sent.', waiting: true, href: tab('invoices') };
      }
      return { label: 'Mark as completed', detail: 'Everything is delivered and paid.', href: tab('overview') };
    }
    default: return { label: 'Open project', href: tab('overview') };
  }
}

export function isOverdue(p) {
  return p.deadline && OPEN_STATUSES.includes(p.status) && p.status !== 'approved' && p.deadline < todayISO();
}
