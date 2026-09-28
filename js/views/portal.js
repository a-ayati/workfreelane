// Client portal — simple, mobile-first, limited to one project via its secret link.
// Shown in the client's language (set by the freelancer; the client can switch).
import { html, raw, icon, href, pill, empty, field, tabs, onAction, onForm, toast, confirmDialog, go, checkBadge } from '../ui.js';
import { db } from '../core/store.js';
import { auth } from '../core/auth.js';
import { t, normLang } from '../core/i18n.js';
import { fmtMoney, fmtDate, fmtShortDate, fmtDateTime, fmtRelative, fmtTimecode } from '../core/util.js';
import { portalProject, canAccessProject, activityText, clientLang } from '../services/context.js';
import { financials, listDeliverables, proposalTotal, invoiceTotals } from '../services/core.js';
import { getBrief, portalSubmitBrief, portalProposal, portalViewProposal, portalRespondProposal, portalContract, portalAcceptContract, listChangeOrders, portalRespondChangeOrder } from '../services/workflow.js';
import { portalInvoices, portalViewInvoice, portalReportPayment } from '../services/billing.js';
import { portalFiles, portalUpload, portalAddFeedback, listFeedback, listRounds, listApprovals, portalRequestRevision, portalRespondApproval, deliveryLocked, fileKind } from '../services/delivery.js';
import { PAYMENT_METHODS } from '../core/payments.js';
import { INVOICE_STATUSES, CO_STATUSES, FOLDERS } from '../services/constants.js';
import { proposalDoc, contractDoc, invoiceDoc } from './documents.js';
import { thumb, openViewer, download, verLabel, conversation } from './viewer.js';

const CLIENT_STATUS = {
  draft: { label: 'Getting started', tone: 'neutral' }, awaiting_deposit: { label: 'Awaiting deposit', tone: 'amber' }, active: { label: 'In progress', tone: 'green' },
  in_review: { label: 'Ready for your review', tone: 'blue' }, revision_requested: { label: 'Revising', tone: 'amber' }, awaiting_approval: { label: 'Awaiting your approval', tone: 'blue' },
  approved: { label: 'Approved', tone: 'green' }, completed: { label: 'Completed', tone: 'ink' }, cancelled: { label: 'Cancelled', tone: 'red' },
};
const SECTIONS = [['overview', 'Overview'], ['brief', 'Brief'], ['proposal', 'Proposal'], ['contract', 'Contract'], ['scope', 'Scope'], ['files', 'Files'], ['feedback', 'Feedback'], ['revisions', 'Revisions'], ['approval', 'Approval'], ['invoice', 'Invoices']];
let rememberedName = '';
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};
const getName = (pid) => store.get(`sw.portal.name.${pid}`) || rememberedName;
const setName = (pid, n) => { rememberedName = n; store.set(`sw.portal.name.${pid}`, n); };

// Language for a portal page: the client's own choice, else what the freelancer set.
export function portalLang(pid) {
  const own = store.get(`sw.portal.lang.${pid}`);
  if (own) return normLang(own);
  const p = db.get('projects', pid);
  return p ? clientLang(p) : 'en';
}

export function portal(params, q) {
  const token = q.t;
  const p = portalProject(params.pid, token); // throws a friendly error on bad links
  const b = db.get('businesses', p.businessId);
  const c = db.get('clients', p.clientId);
  const section = SECTIONS.some(([id]) => id === params.section) ? params.section : 'overview';
  const link = (s) => `/client/${p.id}/${s}?t=${token}`;
  const ctx = { p, b, c, token, link, name: getName(p.id) || c?.name || '' };
  const todo = todos(ctx);
  const user = auth.currentUser();
  const preview = user && canAccessProject(user, p);
  const views = { overview, brief, proposal, contract, scope, files, feedback, revisions, approval, invoice };
  const count = (s) => todo.filter((x) => x.section === s && !x.done).length || '';
  const current = portalLang(p.id);
  document.title = `${p.name} — ${b.name}`;
  return html`<div class="portal">
    ${preview ? html`<div class="portal-preview-bar">${t("You're previewing what {client} sees.", { client: c?.name })} <a href="${href(`/projects/${p.id}`)}">${t('Back to project')}</a></div>` : ''}
    <header class="portal-top" style="border-top:3px solid ${b.brandColor || '#17150F'}"><div class="portal-top-inner">
      <div class="portal-biz">${b.logo ? html`<img class="doc-logo" src="${b.logo}" alt="" style="width:32px;height:32px">` : ''}<span>${b.name}</span></div>
      <span class="btn-row"><span class="small muted hide-sm">${t('For {client}', { client: c?.company || c?.name })}</span>
        <button class="btn btn-ghost btn-sm" data-action="portal-lang" data-pid="${p.id}" data-lang="${current === 'ar' ? 'en' : 'ar'}" lang="${current === 'ar' ? 'en' : 'ar'}">${current === 'ar' ? 'English' : 'العربية'}</button></span></div></header>
    <div class="portal-main">
      <div class="eyebrow">${t(p.type)}</div>
      <h1 style="margin-bottom:10px">${p.name}</h1>
      <div class="btn-row" style="margin-bottom:24px">${pill(CLIENT_STATUS, p.status)}${p.deadline ? html`<span class="small muted">${t('Target date {date}', { date: fmtDate(p.deadline) })}</span>` : ''}</div>
      ${tabs(SECTIONS.map(([id, l]) => [id, t(l), link(id), count(id)]), section)}
      ${views[section](ctx, todo)}
    </div></div>`;
}

// What the client needs to do, in order.
function todos({ p, token }) {
  const out = [];
  const brief = getBrief(p.id);
  if (brief?.status === 'sent') out.push({ section: 'brief', title: t('Complete the project brief'), body: t('A few questions so the proposal fits exactly.'), cta: t('Complete brief') });
  const prop = portalProposal(p.id, token);
  if (prop && ['sent', 'viewed'].includes(prop.status)) out.push({ section: 'proposal', title: t('Review the proposal'), body: t('{amount} · valid until {date}', { amount: fmtMoney(proposalTotal(prop.id), prop.currency), date: fmtDate(prop.validUntil) }), cta: t('View proposal') });
  const con = portalContract(p.id, token);
  if (con?.status === 'sent') out.push({ section: 'contract', title: t('Accept the contract'), body: t('Review and accept the service agreement to get started.'), cta: t('Review contract') });
  listChangeOrders(p.id).filter((x) => x.status === 'pending').forEach((co) => out.push({ section: 'scope', title: t('Approve change: {title}', { title: co.title }), body: t('+{amount} — only added if you approve.', { amount: fmtMoney(co.amount, p.currency) }), cta: t('Review change') }));
  portalInvoices(p.id, token).filter((i) => ['sent', 'viewed', 'partially_paid', 'overdue'].includes(i.status)).forEach((i) => {
    const reported = db.find('payments', (x) => x.invoiceId === i.id && x.status === 'reported');
    if (!reported) out.push({ section: 'invoice', title: t(i.kind === 'deposit' ? 'Pay the deposit {number}' : 'Pay invoice {number}', { number: i.number }), body: t('{amount} due {date}', { amount: fmtMoney(invoiceTotals(i.id).balance, i.currency), date: fmtDate(i.dueDate) }), cta: t('View invoice'), id: i.id });
  });
  if (listApprovals(p.id).some((a) => a.status === 'pending')) out.push({ section: 'approval', title: t('Final approval required'), body: t('This version is ready for final approval.'), cta: t('Review & approve') });
  if (p.status === 'in_review') out.push({ section: 'files', title: t('A new version is ready for review'), body: t('Leave comments, or request a revision.'), cta: t('Review files') });
  if (p.deliveredAt && ['approved', 'completed'].includes(p.status) && !deliveryLocked(p)) out.push({ section: 'files', title: t('Your final files are ready'), body: t('Download everything from Deliverables.'), cta: t('Download'), done: true });
  return out;
}

const HIDDEN_ACTIONS = ['file.renamed', 'scope.updated', 'brief.updated', 'contract.updated', 'file.uploaded', 'file.deleted', 'file.final', 'invoice.created', 'proposal.created', 'proposal.revised', 'revision.started'];
function overview(ctx, todo) {
  const { p, link } = ctx;
  const f = financials(p);
  const acts = db.all('activityLogs', (a) => a.projectId === p.id && !HIDDEN_ACTIONS.includes(a.action)).sort((a, z) => z.createdAt.localeCompare(a.createdAt)).slice(0, 8);
  return html`<div class="stack">
    ${todo.length ? todo.map((x, i) => html`<div class="cta-card${i === 0 && !x.done ? ' attention' : ''}"><div><div class="eyebrow" style="margin-bottom:4px">${x.done ? t('Ready') : i === 0 ? t('Needed from you') : t('Also waiting')}</div><h2>${x.title}</h2><p class="muted" style="margin:4px 0 0">${x.body}</p></div><a class="btn btn-primary btn-lg" href="${href(link(x.section))}">${x.cta} ${icon('arrow', 16)}</a></div>`)
      : html`<div class="cta-card"><h2>${t('Nothing needed from you right now')}</h2><p class="muted" style="margin:0">${t("We'll email you when there's something to review.")}</p></div>`}
    ${f.contracted ? html`<div class="pay-grid"><div><span>${t('Project total')}</span><b>${fmtMoney(f.total, p.currency)}</b></div><div><span>${t('Paid::label')}</span><b>${fmtMoney(f.paid, p.currency)}</b></div><div><span>${t('Remaining')}</span><b>${fmtMoney(f.balance, p.currency)}</b></div></div>` : ''}
    ${acts.length ? html`<div class="card"><h2 style="margin-bottom:8px">${t('Recent updates')}</h2><ul class="timeline">${acts.map((a) => html`<li><time>${fmtShortDate(a.createdAt)}</time><div>${activityText(a)}</div></li>`)}</ul></div>` : ''}
  </div>`;
}

function brief({ p, token }) {
  const b = getBrief(p.id);
  if (b.status !== 'sent') {
    return b.objective ? html`<div class="card"><dl class="kv">${[['Objective', b.objective], ['Audience', b.audience], ['Deliverables', b.deliverablesText], ['Platforms', b.platforms], ['Tone', b.tone], ['References', b.references], ['Notes', b.notes]].filter(([, v]) => v).map(([k, v]) => html`<dt>${t(k)}</dt><dd class="prose">${v}</dd>`)}</dl>${b.status === 'submitted' ? html`<p class="small muted" style="margin:12px 0 0">${t('Submitted {when}. Thank you!', { when: fmtRelative(b.submittedAt) })}</p>` : ''}</div>`
      : empty({ title: t('No brief yet'), body: t('Your freelancer will share the brief with you if they need details.') });
  }
  return html`<form class="card form-grid" data-form="portal-brief">
    <input type="hidden" name="pid" value="${p.id}"><input type="hidden" name="t" value="${token}">
    <div class="full"><h2 class="serif" style="font-size:26px;font-weight:400">${t('Tell us about the project')}</h2><p class="muted">${t('Answer what you can — you can add files in the Files tab.')}</p></div>
    ${field({ label: t('What do you want to achieve?'), name: 'objective', type: 'textarea', rows: 3, value: b.objective, required: true, full: true })}
    ${field({ label: t('Who is it for?'), name: 'audience', value: b.audience, full: true })}
    ${field({ label: t('What do you need delivered?'), name: 'deliverablesText', type: 'textarea', rows: 3, value: b.deliverablesText, full: true })}
    ${field({ label: t('Where will it be used?'), name: 'platforms', value: b.platforms, placeholder: t('Instagram, website, print…') })}
    ${field({ label: t('Tone / style'), name: 'tone', value: b.tone })}
    ${field({ label: t('Budget ({currency})', { currency: p.currency }), name: 'budget', type: 'number', value: b.budget, attrs: 'min="0" inputmode="decimal"' })}
    ${field({ label: t('Examples you like (links)'), name: 'references', type: 'textarea', rows: 2, value: b.references, full: true })}
    ${field({ label: t('Anything else?'), name: 'notes', type: 'textarea', rows: 3, value: b.notes, full: true })}
    <div class="sticky-actions full"><button class="btn btn-primary btn-lg" type="submit">${t('Submit brief')}</button></div></form>`;
}

function proposal({ p, token, name }) {
  const prop = portalProposal(p.id, token);
  if (!prop) return empty({ title: t('No proposal yet'), body: t("You'll get an email when the proposal is ready.") });
  if (prop.status === 'sent') portalViewProposal(p.id, token);
  const open = ['sent', 'viewed'].includes(prop.status);
  return html`${prop.status === 'accepted' ? html`<div class="notice notice-ok" style="margin-bottom:16px">${t('✓ You accepted this proposal on {date}.', { date: fmtDate(prop.respondedAt) })} <a href="${href(`/client/${p.id}/contract?t=${token}`)}">${t('Proceed to contract')} →</a></div>` : ''}
    ${prop.status === 'rejected' ? html`<div class="notice" style="margin-bottom:16px">${t('You declined this proposal. Your freelancer may send a revised version.')}</div>` : ''}
    ${prop.status === 'expired' ? html`<div class="notice notice-warn" style="margin-bottom:16px">${t('This proposal has expired. Please ask for an updated version.')}</div>` : ''}
    ${proposalDoc(prop)}
    ${open ? html`<form class="sticky-actions" data-form="portal-proposal" style="flex-direction:column;align-items:stretch">
      <input type="hidden" name="pid" value="${p.id}"><input type="hidden" name="t" value="${token}">
      <div class="btn-row" style="flex-wrap:nowrap"><input name="name" value="${name}" placeholder="${t('Your full name')}" aria-label="${t('Your full name')}" required></div>
      <div class="btn-row"><button class="btn btn-primary btn-lg" type="submit" name="decision" value="accept">${t('Accept Proposal')}</button><button class="btn btn-secondary btn-lg" type="submit" name="decision" value="decline">${t('Decline')}</button></div></form>` : ''}`;
}

function contract({ p, token, name }) {
  const c = portalContract(p.id, token);
  if (!c) return empty({ title: t('No contract yet'), body: t('The contract is prepared once you accept the proposal.') });
  return html`${contractDoc(c, p)}
    ${c.status === 'sent' ? html`<form class="sticky-actions" data-form="portal-contract" style="flex-direction:column;align-items:stretch">
      <input type="hidden" name="pid" value="${p.id}"><input type="hidden" name="t" value="${token}">
      <label class="check"><input type="checkbox" name="agree" data-bool required> ${t('I have read and agree to these terms.')}</label>
      <input name="name" value="${name}" placeholder="${t('Your full name')}" aria-label="${t('Your full name')}" required>
      <button class="btn btn-primary btn-lg" type="submit">${t('Accept Contract')}</button></form>` : ''}`;
}

function scope({ p, token, name }) {
  const del = listDeliverables(p.id);
  const cos = listChangeOrders(p.id);
  return html`<div class="scope-cols">
      <div class="card"><h2 style="margin-bottom:10px">${t('Included')}</h2><ul class="scope-list in">${del.map((d) => html`<li>${icon('check', 16)}<span>${d.quantity} × ${d.title}</span></li>`)}<li>${icon('check', 16)}<span>${t('{n} revision round(s)', { n: p.revisionsIncluded })}</span></li></ul></div>
      <div class="card"><h2 style="margin-bottom:10px">${t('Not included')}</h2><ul class="scope-list out">${(p.exclusions || []).map((x) => html`<li>${icon('x', 16)}<span>${x}</span></li>`)}</ul></div></div>
    ${cos.length ? html`<div class="section"><div class="section-head"><h2>${t('Changes to the scope')}</h2></div><div class="stack">${cos.map((co) => html`<div class="cta-card${co.status === 'pending' ? ' attention' : ''}">
      <div class="btn-row" style="justify-content:space-between"><h2 style="font-size:22px">${co.title}</h2>${pill(CO_STATUSES, co.status)}</div>
      ${co.description ? html`<p class="muted" style="margin:0">${co.description}</p>` : ''}
      <div class="big-figure" style="font-size:32px">+${fmtMoney(co.amount, p.currency)}</div>${co.extraDays ? html`<p class="small muted" style="margin:0">${t('Adds {n} day(s) to the timeline.', { n: co.extraDays })}</p>` : ''}
      ${co.status === 'pending' ? html`<form data-form="portal-co" class="form-stack" style="gap:10px"><input type="hidden" name="pid" value="${p.id}"><input type="hidden" name="t" value="${token}"><input type="hidden" name="id" value="${co.id}">
        <input name="name" value="${name}" placeholder="${t('Your full name')}" aria-label="${t('Your full name')}" required>
        <div class="btn-row"><button class="btn btn-primary btn-lg" type="submit" name="decision" value="approve">${t('Approve')}</button><button class="btn btn-secondary btn-lg" type="submit" name="decision" value="decline">${t('Decline')}</button></div></form>`
        : html`<p class="small muted" style="margin:0">${t(co.status === 'approved' ? 'Approved by {name} · {date}' : 'Declined by {name} · {date}', { name: co.respondedByName, date: fmtDate(co.respondedAt) })}</p>`}</div>`)}</div></div>` : ''}`;
}

const GROUP_TITLES = { deliverables: 'Final delivery', review: 'For your review', brief: 'Brief', brand: 'Brand Assets', final: 'Final' };
function files(ctx) {
  const { p, token } = ctx;
  const list = portalFiles(p.id, token);
  const locked = p.deliveredAt && deliveryLocked(p);
  const groups = FOLDERS.filter((f) => list.some((x) => x.folder === f.id));
  const vctx = { projectId: p.id, token };
  return html`${locked ? html`<div class="notice notice-warn" style="margin-bottom:16px">${t('Your final files are ready and will unlock for download once the final invoice is paid.')} <a href="${href(`/client/${p.id}/invoice?t=${token}`)}">${t('View invoice')}</a></div>` : ''}
    ${groups.map((g) => html`<div class="section-head" style="margin-top:8px"><h2>${t(GROUP_TITLES[g.id] || g.label)}</h2></div>
      <div class="list" style="margin-bottom:20px">${list.filter((f) => f.folder === g.id).map((f) => html`<div class="file-row">${thumb(f.latest, vctx)}
        <div style="min-width:0"><div class="cell-title">${f.name} <span class="muted small">${verLabel(f.latest)}</span></div><div class="cell-sub">${fmtRelative(f.latest.createdAt)}</div></div>
        <div class="btn-row">${g.id !== 'deliverables' && g.id !== 'brand' ? html`<button class="btn btn-secondary btn-sm" data-action="portal-view" data-id="${f.latest.id}" data-pid="${p.id}" data-t="${token}">${t('Review')}</button>` : ''}
          <button class="btn ${g.id === 'deliverables' ? 'btn-primary' : 'btn-ghost'} btn-sm" data-action="portal-download" data-id="${f.latest.id}" data-pid="${p.id}" data-t="${token}">${icon('download', 14)} ${t('Download')}</button></div></div>`)}</div>`)}
    ${!list.length ? empty({ title: t('No files yet'), body: t('Drafts for review and final files will appear here.') }) : ''}
    <form class="card form-stack" data-form="portal-upload" style="margin-top:8px"><input type="hidden" name="pid" value="${p.id}"><input type="hidden" name="t" value="${token}">
      <h2>${t('Share brand assets')}</h2><p class="muted small" style="margin:0">${t('Logos, guidelines, photos or references for the project.')}</p>
      <input type="file" name="files" multiple aria-label="${t('Files to upload')}"><div class="upload-progress" hidden><span></span></div>
      <div><button class="btn btn-secondary" type="submit">${icon('upload', 16)} ${t('Upload')}</button></div></form>`;
}

function feedback({ p, token, name }) {
  const list = listFeedback(p.id);
  const canRequest = ['in_review', 'awaiting_approval'].includes(p.status);
  const closed = ['completed', 'cancelled'].includes(p.status);
  const general = list.filter((c) => !c.fileVersionId);
  const byVersion = new Map();
  list.filter((c) => c.fileVersionId).forEach((c) => { if (!byVersion.has(c.fileVersionId)) byVersion.set(c.fileVersionId, []); byVersion.get(c.fileVersionId).push(c); });
  const cctx = { token, name };
  return html`${canRequest ? html`<div class="notice" style="margin-bottom:16px">${t('Tip: open a file in Files to comment at an exact moment of a video or a spot on an image.')} <a href="${href(`/client/${p.id}/files?t=${token}`)}">${t('Files')}</a></div>` : ''}
    ${!closed ? html`<form class="card form-stack" data-form="portal-comment" style="margin-bottom:20px"><input type="hidden" name="pid" value="${p.id}"><input type="hidden" name="t" value="${token}">
      <h2>${t('General comment')}</h2><input name="name" value="${name}" placeholder="${t('Your name')}" aria-label="${t('Your name')}" required>
      <textarea name="comment" rows="3" placeholder="${t('Share your thoughts…')}" aria-label="${t('Comment')}" required></textarea><div><button class="btn btn-primary" type="submit">${t('Send comment')}</button></div></form>` : ''}
    ${[...byVersion.entries()].reverse().map(([vid, items]) => { const v = db.get('fileVersions', vid); const f = v && db.get('files', v.fileId); return html`<div class="card" style="margin-bottom:12px"><div class="card-head"><h3>${f?.name || t('File')} · ${verLabel(v)}</h3>${v ? html`<button class="btn btn-ghost btn-sm" data-action="portal-view" data-id="${v.id}" data-pid="${p.id}" data-t="${token}">${icon('eye', 14)} ${t('Open viewer')}</button>` : ''}</div><div class="comments" style="max-height:none">${conversation(items, { isClient: true, ctx: cctx, canReply: !closed })}</div></div>`; })}
    ${general.length ? html`<div class="card"><div class="card-head"><h3>${t('General comments')}</h3></div><div class="comments" style="max-height:none">${conversation(general, { isClient: true, ctx: cctx, canReply: !closed })}</div></div>` : ''}`;
}

function revisions({ p, token, name }) {
  const rounds = listRounds(p.id);
  const canRequest = ['in_review', 'awaiting_approval'].includes(p.status) && !rounds.some((r) => r.status !== 'delivered');
  const next = rounds.length + 1;
  const extra = next > p.revisionsIncluded;
  return html`<div class="card" style="margin-bottom:16px"><div class="muted small">${t('Revision rounds used')}</div><div class="big-figure">${rounds.length} / ${p.revisionsIncluded}</div></div>
    ${canRequest ? html`<form class="card form-stack" data-form="portal-revision"><input type="hidden" name="pid" value="${p.id}"><input type="hidden" name="t" value="${token}">
      <h2>${t('Request revision {n}', { n: next })}</h2>
      ${extra ? html`<div class="notice notice-warn">${t('This would be an additional revision beyond the {n} included round(s). Your freelancer may send a change order with a price for you to approve first. Nothing is charged automatically.', { n: p.revisionsIncluded })}</div>` : html`<p class="muted small" style="margin:0">${t('Put all your changes in one request — your comments on files are included automatically.')}</p>`}
      <input name="name" value="${name}" placeholder="${t('Your name')}" aria-label="${t('Your name')}" required>
      <textarea name="summary" rows="4" placeholder="${t('What should change?')}" aria-label="${t('What should change')}" required></textarea>
      <div><button class="btn btn-primary btn-lg" type="submit">${t('Request revision')}</button></div></form>` : ''}
    ${rounds.length ? html`<div class="list" style="margin-top:16px">${rounds.slice().reverse().map((r) => html`<div class="list-row" style="grid-template-columns:minmax(0,1fr) auto"><div><div class="cell-title">${t('Revision {n}', { n: r.number })}${r.isExtra ? ` ${t('(additional)')}` : ''}</div><div class="small">${r.summary}</div><div class="cell-sub">${fmtDate(r.requestedAt)}</div></div><span class="pill"><span class="dot"></span>${r.status === 'delivered' ? t('Delivered') : t('In progress')}</span></div>`)}</div>` : !canRequest ? empty({ title: t('No revisions'), body: t('You can request changes once a version is shared for review.') }) : ''}`;
}

function approval({ p, token, name, link }) {
  const list = listApprovals(p.id).filter((a) => a.status !== 'withdrawn');
  if (!list.length) return empty({ title: t('Nothing to approve yet'), body: t("When the final version is ready, you'll approve it here.") });
  const vl = (a) => (a.versionLabel === 'Final' ? t('Final') : a.versionLabel);
  const pending = list.filter((a) => a.status === 'pending');
  const lastApproved = !pending.length ? list.filter((a) => a.status === 'approved').sort((a, z) => (z.respondedAt || '').localeCompare(a.respondedAt || ''))[0] : null;
  const history = list.filter((a) => a.status !== 'pending' && a !== lastApproved);
  const vctx = { projectId: p.id, token };
  const locked = p.deliveredAt && deliveryLocked(p);
  const nextStep = !lastApproved ? null
    : p.deliveredAt && !locked ? [t('Your final files are ready.'), t('Download Files'), link('files')]
      : locked ? [t('Final files unlock once the final invoice is paid.'), t('View invoice'), link('invoice')]
        : [t('{business} is preparing your final files.', { business: db.get('businesses', p.businessId)?.name || '' }), '', ''];
  return html`<div class="stack">
    ${pending.map((a) => { const v = db.get('fileVersions', a.fileVersionId); return html`<section class="final-review" aria-labelledby="fr-${a.id}">
      <div class="eyebrow">${t('Final review')}</div>
      <h2 id="fr-${a.id}">${a.fileName}</h2>
      <div class="file-name">${vl(a)}${a.message ? html` · ${a.message}` : ''}</div>
      ${v ? html`<button class="fr-preview" data-action="portal-view" data-id="${a.fileVersionId}" data-pid="${p.id}" data-t="${token}" aria-label="${t('View version')}">${thumb(v, vctx)}<span>${icon('eye', 16)} ${t('View version')}</span></button>` : ''}
      <p class="question">${t('Everything looks good?')}</p>
      <form class="form-stack" data-form="portal-approval" style="gap:10px"><input type="hidden" name="pid" value="${p.id}"><input type="hidden" name="t" value="${token}"><input type="hidden" name="id" value="${a.id}">
        <input name="name" value="${name}" placeholder="${t('Your full name')}" aria-label="${t('Your full name')}" required>
        <textarea name="note" rows="2" placeholder="${t('Changes needed (only if requesting changes)')}" aria-label="${t('Changes needed')}"></textarea>
        <div class="btn-row"><button class="btn btn-secondary btn-lg" type="submit" name="decision" value="changes">${t('Request Changes')}</button><button class="btn btn-primary btn-lg" type="submit" name="decision" value="approve">${icon('check', 18)} ${t('Approve Final')}</button></div>
        <p class="small muted" style="margin:0">${t('Your approval is recorded with your name, the date and the version.')}</p></form></section>`; })}
    ${lastApproved ? html`<section class="approved-state" role="status">
      ${checkBadge()}
      <h2>${t('Approved')}</h2>
      <p class="muted" style="margin:0">${t('Final version confirmed.')}</p>
      <p class="small muted" style="margin:0">${lastApproved.fileName} · ${vl(lastApproved)} · ${t('Approved by {name} on {date}', { name: lastApproved.clientName, date: fmtDateTime(lastApproved.respondedAt) })}</p>
      <div class="next-box"><div class="eyebrow" style="margin:0">${t('Next step')}</div><div>${nextStep[0]}</div>${nextStep[1] ? html`<a class="btn btn-primary" href="${href(nextStep[2])}">${nextStep[1]} ${icon('arrow', 16)}</a>` : ''}</div>
    </section>` : ''}
    ${history.map((a) => html`<div class="card"><div class="btn-row" style="justify-content:space-between"><b>${a.fileName} · ${vl(a)}</b>${a.status === 'approved' ? html`<span class="pill pill-green"><span class="dot"></span>${t('✓ Approved')}</span>` : html`<span class="pill pill-amber"><span class="dot"></span>${t('Changes requested')}</span>`}</div>
      <p class="small muted" style="margin:6px 0 0">${a.status === 'approved' ? t('Approved by {name} on {date}', { name: a.clientName, date: fmtDateTime(a.respondedAt) }) : `${a.clientName}: ${a.note}`}</p></div>`)}</div>`;
}

const KIND_LABELS = { deposit: 'Deposit', final: 'Final payment', change_order: 'Change order', custom: 'Invoice' };
function invoice({ p, token }) {
  const list = portalInvoices(p.id, token);
  if (!list.length) return empty({ title: t('No invoices yet'), body: t('Invoices will appear here when they are issued.') });
  const b = db.get('businesses', p.businessId);
  return html`<div class="stack">${list.map((inv) => {
    portalViewInvoice(p.id, token, inv.id);
    const tot = invoiceTotals(inv.id);
    const reported = db.find('payments', (x) => x.invoiceId === inv.id && x.status === 'reported');
    const due = tot.balance > 0 && !['cancelled'].includes(inv.status);
    return html`<details class="card" ${due ? raw('open') : ''}><summary style="cursor:pointer;display:flex;justify-content:space-between;gap:12px;align-items:center;list-style:none">
        <span><b>${t('Invoice {number}', { number: inv.number })}</b><br><span class="small muted">${t(KIND_LABELS[inv.kind] || 'Invoice')} · ${t('due {date}', { date: fmtShortDate(inv.dueDate) })}</span></span>
        <span style="text-align:end">${pill(INVOICE_STATUSES, inv.status)}<br><span class="num">${fmtMoney(tot.balance > 0 ? tot.balance : tot.total, inv.currency)}</span></span></summary>
      <div style="margin-top:16px">${invoiceDoc({ ...inv })}</div>
      ${due ? reported ? html`<div class="notice notice-ok" style="margin-top:16px">${t('Thanks — you reported a payment of {amount}. {business} will confirm it once received.', { amount: fmtMoney(reported.amount, inv.currency), business: b.name })}</div>`
        : html`<form class="card form-stack" data-form="portal-pay" style="margin-top:16px"><input type="hidden" name="pid" value="${p.id}"><input type="hidden" name="t" value="${token}"><input type="hidden" name="id" value="${inv.id}">
          <h2>${t('How to pay')}</h2><p class="prose muted" style="margin:0">${inv.notes || b.paymentInstructions}</p>
          <p class="small muted" style="margin:0">${t('Pay online by card')} <span class="soon">${t('Coming Soon')}</span></p>
          <div class="form-grid">${field({ label: t('Amount paid ({currency})', { currency: inv.currency }), name: 'amount', type: 'number', value: tot.balance, attrs: 'min="0.01" step="0.01" inputmode="decimal"' })}${field({ label: t('Method'), name: 'method', type: 'select', options: PAYMENT_METHODS.map((m) => [m, t(m)]) })}${field({ label: t('Reference (optional)'), name: 'reference', full: true })}</div>
          <button class="btn btn-primary btn-lg" type="submit">${t("I've sent the payment")}</button></form>` : ''}
    </details>`;
  })}</div>`;
}

// ---------------- Handlers ----------------
const remember = (v) => { if (v.name) setName(v.pid, v.name.trim()); };
onForm({
  'portal-brief': (v) => { portalSubmitBrief(v.pid, v.t, v); toast(t('Thank you! Your brief was sent.')); go(`/client/${v.pid}?t=${v.t}`); return false; },
  'portal-proposal': async (v, form, submitter) => {
    remember(v);
    const decision = submitter?.value;
    if (decision === 'decline') {
      if (!(await confirmDialog({ title: t('Decline this proposal?'), body: t('Your freelancer will be notified and may send a revised proposal.'), confirm: t('Decline') }))) return false;
      portalRespondProposal(v.pid, v.t, { decision: 'decline', name: v.name }); toast(t('Proposal declined.'));
    } else {
      portalRespondProposal(v.pid, v.t, { decision: 'accept', name: v.name }); toast(t('Proposal accepted. Next: the contract.'));
      go(`/client/${v.pid}/contract?t=${v.t}`); return false;
    }
  },
  'portal-contract': (v) => { remember(v); portalAcceptContract(v.pid, v.t, v); toast(t('Contract accepted. Thank you!')); go(`/client/${v.pid}?t=${v.t}`); return false; },
  'portal-co': (v, form, submitter) => { remember(v); portalRespondChangeOrder(v.pid, v.t, v.id, { decision: submitter?.value, name: v.name }); toast(submitter?.value === 'approve' ? t('Change approved.') : t('Change declined.')); },
  'portal-comment': (v) => { remember(v); portalAddFeedback(v.pid, v.t, v); toast(t('Comment sent.')); },
  'portal-revision': (v) => { remember(v); portalRequestRevision(v.pid, v.t, v); toast(t('Revision requested. Your freelancer has been notified.')); },
  'portal-approval': async (v, form, submitter) => {
    remember(v);
    if (submitter?.value === 'approve') {
      if (!(await confirmDialog({ title: t('Approve final version?'), body: t('Your approval is recorded with your name, the date and the version.'), confirm: t('Approve Final') }))) return false;
      portalRespondApproval(v.pid, v.t, v.id, { decision: 'approve', name: v.name, note: v.note });
    } else {
      portalRespondApproval(v.pid, v.t, v.id, { decision: 'changes', name: v.name, note: v.note }); toast(t('Changes requested.'));
    }
  },
  'portal-pay': (v) => { portalReportPayment(v.pid, v.t, v.id, v); toast(t('Thanks — your freelancer will confirm the payment.')); },
  'portal-upload': async (v, form) => {
    if (!v.files?.length) { toast(t('Choose a file to upload.'), 'error'); return false; }
    const bar = form.querySelector('.upload-progress'); bar.hidden = false;
    for (const file of v.files) await portalUpload(v.pid, v.t, file, { name: getName(v.pid), onProgress: (x) => { bar.firstElementChild.style.width = `${Math.round(x * 100)}%`; } });
    toast(t('Uploaded. Thank you!'));
  },
});
onAction({
  'portal-view': (el) => { openViewer(el.dataset.id, { projectId: el.dataset.pid, token: el.dataset.t, name: getName(el.dataset.pid) }); return false; },
  'portal-download': async (el) => { await download(el.dataset.id, { projectId: el.dataset.pid, token: el.dataset.t }); return false; },
  'portal-lang': (el) => { store.set(`sw.portal.lang.${el.dataset.pid}`, el.dataset.lang); },
});
export { fileKind };
