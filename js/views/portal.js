// Client portal — simple, mobile-first, limited to one project via its secret link.
import { html, raw, icon, href, pill, empty, field, tabs, onAction, onForm, toast, confirmDialog, go } from '../ui.js';
import { db } from '../core/store.js';
import { auth } from '../core/auth.js';
import { fmtMoney, fmtDate, fmtShortDate, fmtDateTime, fmtRelative, fmtTimecode } from '../core/util.js';
import { portalProject, canAccessProject } from '../services/context.js';
import { financials, listDeliverables, proposalTotal, invoiceTotals } from '../services/core.js';
import { getBrief, portalSubmitBrief, portalProposal, portalViewProposal, portalRespondProposal, portalContract, portalAcceptContract, listChangeOrders, portalRespondChangeOrder } from '../services/workflow.js';
import { portalInvoices, portalViewInvoice, portalReportPayment } from '../services/billing.js';
import { portalFiles, portalUpload, portalAddFeedback, listFeedback, listRounds, listApprovals, portalRequestRevision, portalRespondApproval, deliveryLocked, fileKind } from '../services/delivery.js';
import { PAYMENT_METHODS } from '../core/payments.js';
import { PROJECT_STATUSES, INVOICE_STATUSES, CO_STATUSES, FOLDERS } from '../services/constants.js';
import { proposalDoc, contractDoc, invoiceDoc } from './documents.js';
import { thumb, openViewer, download } from './viewer.js';

const CLIENT_STATUS = {
  draft: { label: 'Getting started', tone: 'neutral' }, awaiting_deposit: { label: 'Awaiting deposit', tone: 'amber' }, active: { label: 'In progress', tone: 'green' },
  in_review: { label: 'Ready for your review', tone: 'blue' }, revision_requested: { label: 'Revising', tone: 'amber' }, awaiting_approval: { label: 'Awaiting your approval', tone: 'blue' },
  approved: { label: 'Approved', tone: 'green' }, completed: { label: 'Completed', tone: 'ink' }, cancelled: { label: 'Cancelled', tone: 'red' },
};
const SECTIONS = [['overview', 'Overview'], ['brief', 'Brief'], ['proposal', 'Proposal'], ['contract', 'Contract'], ['scope', 'Scope'], ['files', 'Files'], ['feedback', 'Feedback'], ['revisions', 'Revisions'], ['approval', 'Approval'], ['invoice', 'Invoices']];
let rememberedName = '';
const nameKey = (pid) => `sw.portal.name.${pid}`;
const getName = (pid) => { try { return localStorage.getItem(nameKey(pid)) || rememberedName; } catch { return rememberedName; } };
const setName = (pid, n) => { rememberedName = n; try { localStorage.setItem(nameKey(pid), n); } catch { /* ignore */ } };

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
  const badge = { proposal: todo.some((t) => t.section === 'proposal') ? '1' : '', contract: todo.some((t) => t.section === 'contract') ? '1' : '', approval: todo.some((t) => t.section === 'approval') ? '1' : '', invoice: todo.filter((t) => t.section === 'invoice').length || '', scope: todo.filter((t) => t.section === 'scope').length || '', brief: todo.some((t) => t.section === 'brief') ? '1' : '' };
  document.title = `${p.name} — ${b.name}`;
  return html`<div class="portal">
    ${preview ? html`<div class="portal-preview-bar">You're previewing what ${c?.name} sees. <a href="${href(`/projects/${p.id}`)}">Back to project</a></div>` : ''}
    <header class="portal-top" style="border-top:3px solid ${b.brandColor || '#17150F'}"><div class="portal-top-inner">
      <div class="portal-biz">${b.logo ? html`<img class="doc-logo" src="${b.logo}" alt="" style="width:32px;height:32px">` : ''}<span>${b.name}</span></div>
      <span class="small muted">For ${c?.company || c?.name}</span></div></header>
    <div class="portal-main">
      <div class="eyebrow">${p.type}</div>
      <h1 style="margin-bottom:10px">${p.name}</h1>
      <div class="btn-row" style="margin-bottom:24px">${pill(CLIENT_STATUS, p.status)}${p.deadline ? html`<span class="small muted">Target date ${fmtDate(p.deadline)}</span>` : ''}</div>
      ${tabs(SECTIONS.map(([id, l]) => [id, l, link(id), badge[id]]), section)}
      ${views[section](ctx, todo)}
    </div></div>`;
}

// What the client needs to do, in order.
function todos({ p, token }) {
  const out = [];
  const brief = getBrief(p.id);
  if (brief?.status === 'sent') out.push({ section: 'brief', title: 'Complete the project brief', body: 'A few questions so the proposal fits exactly.', cta: 'Complete brief' });
  const prop = portalProposal(p.id, token);
  if (prop && ['sent', 'viewed'].includes(prop.status)) out.push({ section: 'proposal', title: 'Review the proposal', body: `${fmtMoney(proposalTotal(prop.id), prop.currency)} · valid until ${fmtDate(prop.validUntil)}`, cta: 'View proposal' });
  const con = portalContract(p.id, token);
  if (con?.status === 'sent') out.push({ section: 'contract', title: 'Accept the contract', body: 'Review and accept the service agreement to get started.', cta: 'Review contract' });
  listChangeOrders(p.id).filter((x) => x.status === 'pending').forEach((co) => out.push({ section: 'scope', title: `Approve change: ${co.title}`, body: `+${fmtMoney(co.amount, p.currency)} — only added if you approve.`, cta: 'Review change' }));
  portalInvoices(p.id, token).filter((i) => ['sent', 'viewed', 'partially_paid', 'overdue'].includes(i.status)).forEach((i) => {
    const reported = db.find('payments', (x) => x.invoiceId === i.id && x.status === 'reported');
    if (!reported) out.push({ section: 'invoice', title: `${i.kind === 'deposit' ? 'Pay the deposit' : 'Pay invoice'} ${i.number}`, body: `${fmtMoney(invoiceTotals(i.id).balance, i.currency)} due ${fmtDate(i.dueDate)}`, cta: 'View invoice', id: i.id });
  });
  if (listApprovals(p.id).some((a) => a.status === 'pending')) out.push({ section: 'approval', title: 'Final approval required', body: 'This version is ready for final approval.', cta: 'Review & approve' });
  if (p.status === 'in_review') out.push({ section: 'files', title: 'A new version is ready for review', body: 'Leave comments, or request a revision.', cta: 'Review files' });
  if (p.deliveredAt && ['approved', 'completed'].includes(p.status) && !deliveryLocked(p)) out.push({ section: 'files', title: 'Your final files are ready', body: 'Download everything from Deliverables.', cta: 'Download', done: true });
  return out;
}

function overview(ctx, todo) {
  const { p, link } = ctx;
  const f = financials(p);
  const acts = db.all('activityLogs', (a) => a.projectId === p.id && !a.action.startsWith('file.renamed') && !a.action.startsWith('scope.') && !a.action.startsWith('brief.updated') && !a.action.startsWith('contract.updated')).sort((a, z) => z.createdAt.localeCompare(a.createdAt)).slice(0, 8);
  return html`<div class="stack">
    ${todo.length ? todo.map((t, i) => html`<div class="cta-card${i === 0 && !t.done ? ' attention' : ''}"><div><div class="eyebrow" style="margin-bottom:4px">${t.done ? 'Ready' : i === 0 ? 'Needed from you' : 'Also waiting'}</div><h2>${t.title}</h2><p class="muted" style="margin:4px 0 0">${t.body}</p></div><a class="btn btn-primary btn-lg" href="${href(link(t.section))}">${t.cta} ${icon('arrow', 16)}</a></div>`)
      : html`<div class="cta-card"><h2>Nothing needed from you right now</h2><p class="muted" style="margin:0">We'll email you when there's something to review.</p></div>`}
    ${f.contracted ? html`<div class="pay-grid"><div><span>Project total</span><b>${fmtMoney(f.total, p.currency)}</b></div><div><span>Paid</span><b>${fmtMoney(f.paid, p.currency)}</b></div><div><span>Remaining</span><b>${fmtMoney(f.balance, p.currency)}</b></div></div>` : ''}
    ${acts.length ? html`<div class="card"><h2 style="margin-bottom:8px">Recent updates</h2><ul class="timeline">${acts.map((a) => html`<li><time>${fmtShortDate(a.createdAt)}</time><div>${a.message}</div></li>`)}</ul></div>` : ''}
  </div>`;
}

function brief({ p, token, name }) {
  const b = getBrief(p.id);
  if (b.status !== 'sent') {
    return b.objective ? html`<div class="card"><dl class="kv">${[['Objective', b.objective], ['Audience', b.audience], ['Deliverables', b.deliverablesText], ['Platforms', b.platforms], ['Tone', b.tone], ['References', b.references], ['Notes', b.notes]].filter(([, v]) => v).map(([k, v]) => html`<dt>${k}</dt><dd class="prose">${v}</dd>`)}</dl>${b.status === 'submitted' ? html`<p class="small muted" style="margin:12px 0 0">Submitted ${fmtRelative(b.submittedAt)}. Thank you!</p>` : ''}</div>`
      : empty({ title: 'No brief yet', body: 'Your freelancer will share the brief with you if they need details.' });
  }
  return html`<form class="card form-grid" data-form="portal-brief">
    <input type="hidden" name="pid" value="${p.id}"><input type="hidden" name="t" value="${token}">
    <div class="full"><h2 class="serif" style="font-size:26px;font-weight:400">Tell us about the project</h2><p class="muted">Answer what you can — you can add files in the Files tab.</p></div>
    ${field({ label: 'What do you want to achieve?', name: 'objective', type: 'textarea', rows: 3, value: b.objective, required: true, full: true })}
    ${field({ label: 'Who is it for?', name: 'audience', value: b.audience, full: true })}
    ${field({ label: 'What do you need delivered?', name: 'deliverablesText', type: 'textarea', rows: 3, value: b.deliverablesText, full: true })}
    ${field({ label: 'Where will it be used?', name: 'platforms', value: b.platforms, placeholder: 'Instagram, website, print…' })}
    ${field({ label: 'Tone / style', name: 'tone', value: b.tone })}
    ${field({ label: `Budget (${p.currency})`, name: 'budget', type: 'number', value: b.budget, attrs: 'min="0" inputmode="decimal"' })}
    ${field({ label: 'Examples you like (links)', name: 'references', type: 'textarea', rows: 2, value: b.references, full: true })}
    ${field({ label: 'Anything else?', name: 'notes', type: 'textarea', rows: 3, value: b.notes, full: true })}
    <div class="sticky-actions full"><button class="btn btn-primary btn-lg" type="submit">Submit brief</button></div></form>`;
}

function proposal({ p, token, name }) {
  const prop = portalProposal(p.id, token);
  if (!prop) return empty({ title: 'No proposal yet', body: "You'll get an email when the proposal is ready." });
  if (prop.status === 'sent') portalViewProposal(p.id, token);
  const open = ['sent', 'viewed'].includes(prop.status);
  return html`${prop.status === 'accepted' ? html`<div class="notice notice-ok" style="margin-bottom:16px">✓ You accepted this proposal on ${fmtDate(prop.respondedAt)}. <a href="${href(`/client/${p.id}/contract?t=${token}`)}">Proceed to contract →</a></div>` : ''}
    ${prop.status === 'rejected' ? html`<div class="notice" style="margin-bottom:16px">You declined this proposal. Your freelancer may send a revised version.</div>` : ''}
    ${prop.status === 'expired' ? html`<div class="notice notice-warn" style="margin-bottom:16px">This proposal has expired. Please ask for an updated version.</div>` : ''}
    ${proposalDoc(prop)}
    ${open ? html`<form class="sticky-actions" data-form="portal-proposal" style="flex-direction:column;align-items:stretch">
      <input type="hidden" name="pid" value="${p.id}"><input type="hidden" name="t" value="${token}">
      <div class="btn-row" style="flex-wrap:nowrap"><input name="name" value="${name}" placeholder="Your full name" aria-label="Your full name" required></div>
      <div class="btn-row"><button class="btn btn-primary btn-lg" type="submit" name="decision" value="accept">Accept Proposal</button><button class="btn btn-secondary btn-lg" type="submit" name="decision" value="decline">Decline</button></div></form>` : ''}`;
}

function contract({ p, token, name }) {
  const c = portalContract(p.id, token);
  if (!c) return empty({ title: 'No contract yet', body: 'The contract is prepared once you accept the proposal.' });
  return html`${contractDoc(c, p)}
    ${c.status === 'sent' ? html`<form class="sticky-actions" data-form="portal-contract" style="flex-direction:column;align-items:stretch">
      <input type="hidden" name="pid" value="${p.id}"><input type="hidden" name="t" value="${token}">
      <label class="check"><input type="checkbox" name="agree" data-bool required> I have read and agree to these terms.</label>
      <input name="name" value="${name}" placeholder="Your full name" aria-label="Your full name" required>
      <button class="btn btn-primary btn-lg" type="submit">Accept Contract</button></form>` : ''}`;
}

function scope({ p, token, name }) {
  const del = listDeliverables(p.id);
  const cos = listChangeOrders(p.id);
  return html`<div class="scope-cols">
      <div class="card"><h2 style="margin-bottom:10px">Included</h2><ul class="scope-list in">${del.map((d) => html`<li>${icon('check', 16)}<span>${d.quantity} × ${d.title}</span></li>`)}<li>${icon('check', 16)}<span>${p.revisionsIncluded} revision round(s)</span></li></ul></div>
      <div class="card"><h2 style="margin-bottom:10px">Not included</h2><ul class="scope-list out">${(p.exclusions || []).map((x) => html`<li>${icon('x', 16)}<span>${x}</span></li>`)}</ul></div></div>
    ${cos.length ? html`<div class="section"><div class="section-head"><h2>Changes to the scope</h2></div><div class="stack">${cos.map((co) => html`<div class="cta-card${co.status === 'pending' ? ' attention' : ''}">
      <div class="btn-row" style="justify-content:space-between"><h2 style="font-size:22px">${co.title}</h2>${pill(CO_STATUSES, co.status)}</div>
      ${co.description ? html`<p class="muted" style="margin:0">${co.description}</p>` : ''}
      <div class="big-figure" style="font-size:32px">+${fmtMoney(co.amount, p.currency)}</div>${co.extraDays ? html`<p class="small muted" style="margin:0">Adds ${co.extraDays} day(s) to the timeline.</p>` : ''}
      ${co.status === 'pending' ? html`<form data-form="portal-co" class="form-stack" style="gap:10px"><input type="hidden" name="pid" value="${p.id}"><input type="hidden" name="t" value="${token}"><input type="hidden" name="id" value="${co.id}">
        <input name="name" value="${name}" placeholder="Your full name" aria-label="Your full name" required>
        <div class="btn-row"><button class="btn btn-primary btn-lg" type="submit" name="decision" value="approve">Approve</button><button class="btn btn-secondary btn-lg" type="submit" name="decision" value="decline">Decline</button></div></form>`
        : html`<p class="small muted" style="margin:0">${co.status === 'approved' ? 'Approved' : 'Declined'} by ${co.respondedByName} · ${fmtDate(co.respondedAt)}</p>`}</div>`)}</div></div>` : ''}`;
}

function files(ctx) {
  const { p, token } = ctx;
  const list = portalFiles(p.id, token);
  const locked = p.deliveredAt && deliveryLocked(p);
  const groups = FOLDERS.filter((f) => list.some((x) => x.folder === f.id));
  const vctx = { projectId: p.id, token };
  return html`${locked ? html`<div class="notice notice-warn" style="margin-bottom:16px">Your final files are ready and will unlock for download once the final invoice is paid. <a href="${href(`/client/${p.id}/invoice?t=${token}`)}">View invoice</a></div>` : ''}
    ${groups.map((g) => html`<div class="section-head" style="margin-top:8px"><h2>${g.id === 'deliverables' ? 'Final delivery' : g.id === 'review' ? 'For your review' : g.label.slice(3)}</h2></div>
      <div class="list" style="margin-bottom:20px">${list.filter((f) => f.folder === g.id).map((f) => html`<div class="file-row">${thumb(f.latest, vctx)}
        <div style="min-width:0"><div class="cell-title">${f.name} <span class="muted small">${f.latest.label}</span></div><div class="cell-sub">${fmtRelative(f.latest.createdAt)}</div></div>
        <div class="btn-row">${g.id !== 'deliverables' && g.id !== 'brand' ? html`<button class="btn btn-secondary btn-sm" data-action="portal-view" data-id="${f.latest.id}" data-pid="${p.id}" data-t="${token}">Review</button>` : ''}
          <button class="btn ${g.id === 'deliverables' ? 'btn-primary' : 'btn-ghost'} btn-sm" data-action="portal-download" data-id="${f.latest.id}" data-pid="${p.id}" data-t="${token}">${icon('download', 14)} Download</button></div></div>`)}</div>`)}
    ${!list.length ? empty({ title: 'No files yet', body: 'Drafts for review and final files will appear here.' }) : ''}
    <form class="card form-stack" data-form="portal-upload" style="margin-top:8px"><input type="hidden" name="pid" value="${p.id}"><input type="hidden" name="t" value="${token}">
      <h2>Share brand assets</h2><p class="muted small" style="margin:0">Logos, guidelines, photos or references for the project.</p>
      <input type="file" name="files" multiple aria-label="Files to upload"><div class="upload-progress" hidden><span></span></div>
      <div><button class="btn btn-secondary" type="submit">${icon('upload', 16)} Upload</button></div></form>`;
}

function feedback({ p, token, name }) {
  const list = listFeedback(p.id).filter((f) => f.authorType === 'client' || !f.fileVersionId || f.authorType === 'freelancer');
  const canRequest = ['in_review', 'awaiting_approval'].includes(p.status);
  return html`${canRequest ? html`<div class="notice" style="margin-bottom:16px">Tip: open a file in <a href="${href(`/client/${p.id}/files?t=${token}`)}">Files</a> to comment at an exact moment of a video or a spot on an image.</div>` : ''}
    <form class="card form-stack" data-form="portal-comment" style="margin-bottom:20px"><input type="hidden" name="pid" value="${p.id}"><input type="hidden" name="t" value="${token}">
      <h2>General comment</h2><input name="name" value="${name}" placeholder="Your name" aria-label="Your name" required>
      <textarea name="comment" rows="3" placeholder="Share your thoughts…" aria-label="Comment" required></textarea><div><button class="btn btn-primary" type="submit">Send comment</button></div></form>
    ${list.length ? html`<div class="stack" style="gap:8px">${list.slice().reverse().map((c) => { const v = c.fileVersionId ? db.get('fileVersions', c.fileVersionId) : null; return html`<div class="comment"><div class="comment-meta"><span><b>${c.authorName}</b> · ${fmtDateTime(c.createdAt)}${v ? ` · ${db.get('files', v.fileId)?.name} ${v.label}` : ''}</span><span>${c.timecode != null ? html`<span class="tc">${fmtTimecode(c.timecode)}</span>` : ''}${c.status === 'resolved' ? html`<span class="small muted">Resolved</span>` : ''}</span></div>${c.comment}</div>`; })}</div>` : ''}`;
}

function revisions({ p, token, name }) {
  const rounds = listRounds(p.id);
  const canRequest = ['in_review', 'awaiting_approval'].includes(p.status) && !rounds.some((r) => r.status !== 'delivered');
  const next = rounds.length + 1;
  const extra = next > p.revisionsIncluded;
  return html`<div class="card" style="margin-bottom:16px"><div class="muted small">Revision rounds used</div><div class="big-figure">${rounds.length} / ${p.revisionsIncluded}</div></div>
    ${canRequest ? html`<form class="card form-stack" data-form="portal-revision"><input type="hidden" name="pid" value="${p.id}"><input type="hidden" name="t" value="${token}">
      <h2>Request revision ${next}</h2>
      ${extra ? html`<div class="notice notice-warn">This would be an additional revision beyond the ${p.revisionsIncluded} included round(s). Your freelancer may send a change order with a price for you to approve first. Nothing is charged automatically.</div>` : html`<p class="muted small" style="margin:0">Put all your changes in one request — your comments on files are included automatically.</p>`}
      <input name="name" value="${name}" placeholder="Your name" aria-label="Your name" required>
      <textarea name="summary" rows="4" placeholder="What should change?" aria-label="What should change" required></textarea>
      <div><button class="btn btn-primary btn-lg" type="submit">Request revision</button></div></form>` : ''}
    ${rounds.length ? html`<div class="list" style="margin-top:16px">${rounds.slice().reverse().map((r) => html`<div class="list-row" style="grid-template-columns:minmax(0,1fr) auto"><div><div class="cell-title">Revision ${r.number}${r.isExtra ? ' (additional)' : ''}</div><div class="small">${r.summary}</div><div class="cell-sub">${fmtDate(r.requestedAt)}</div></div><span class="pill"><span class="dot"></span>${r.status === 'delivered' ? 'Delivered' : 'In progress'}</span></div>`)}</div>` : !canRequest ? empty({ title: 'No revisions', body: 'You can request changes once a version is shared for review.' }) : ''}`;
}

function approval({ p, token, name }) {
  const list = listApprovals(p.id).filter((a) => a.status !== 'withdrawn');
  if (!list.length) return empty({ title: 'Nothing to approve yet', body: "When the final version is ready, you'll approve it here." });
  const vctx = { projectId: p.id, token };
  return html`<div class="stack">${list.map((a) => a.status === 'pending' ? html`<div class="cta-card attention">
      <div class="eyebrow">Final Approval Required</div><h2>${a.fileName} · ${a.versionLabel}</h2><p class="muted" style="margin:0">${a.message || 'This version is ready for final approval.'}</p>
      <div class="btn-row"><button class="btn btn-secondary" data-action="portal-view" data-id="${a.fileVersionId}" data-pid="${p.id}" data-t="${token}">${icon('eye', 16)} View version</button></div>
      <form class="form-stack" data-form="portal-approval" style="gap:10px"><input type="hidden" name="pid" value="${p.id}"><input type="hidden" name="t" value="${token}"><input type="hidden" name="id" value="${a.id}">
        <input name="name" value="${name}" placeholder="Your full name" aria-label="Your full name" required>
        <textarea name="note" rows="2" placeholder="Changes needed (only if requesting changes)" aria-label="Changes needed"></textarea>
        <div class="btn-row"><button class="btn btn-primary btn-lg" type="submit" name="decision" value="approve">Approve</button><button class="btn btn-secondary btn-lg" type="submit" name="decision" value="changes">Request Changes</button></div></form></div>`
    : html`<div class="card"><div class="btn-row" style="justify-content:space-between"><b>${a.fileName} · ${a.versionLabel}</b>${a.status === 'approved' ? html`<span class="pill pill-green"><span class="dot"></span>✓ Approved</span>` : html`<span class="pill pill-amber"><span class="dot"></span>Changes requested</span>`}</div>
      <p class="small muted" style="margin:6px 0 0">${a.status === 'approved' ? `Approved by ${a.clientName} on ${fmtDateTime(a.respondedAt)}` : `${a.clientName}: ${a.note}`}</p></div>`)}</div>`;
}

function invoice({ p, token, name }) {
  const list = portalInvoices(p.id, token);
  if (!list.length) return empty({ title: 'No invoices yet', body: 'Invoices will appear here when they are issued.' });
  const b = db.get('businesses', p.businessId);
  return html`<div class="stack">${list.map((inv) => {
    portalViewInvoice(p.id, token, inv.id);
    const t = invoiceTotals(inv.id);
    const reported = db.find('payments', (x) => x.invoiceId === inv.id && x.status === 'reported');
    const due = t.balance > 0 && !['cancelled'].includes(inv.status);
    return html`<details class="card" ${due ? raw('open') : ''}><summary style="cursor:pointer;display:flex;justify-content:space-between;gap:12px;align-items:center;list-style:none">
        <span><b>Invoice ${inv.number}</b><br><span class="small muted">${inv.kind === 'deposit' ? 'Deposit' : inv.kind === 'final' ? 'Final payment' : 'Invoice'} · due ${fmtShortDate(inv.dueDate)}</span></span>
        <span style="text-align:right">${pill(INVOICE_STATUSES, inv.status)}<br><span class="num">${fmtMoney(t.balance > 0 ? t.balance : t.total, inv.currency)}</span></span></summary>
      <div style="margin-top:16px">${invoiceDoc({ ...inv })}</div>
      ${due ? reported ? html`<div class="notice notice-ok" style="margin-top:16px">Thanks — you reported a payment of ${fmtMoney(reported.amount, inv.currency)}. ${b.name} will confirm it once received.</div>`
        : html`<form class="card form-stack" data-form="portal-pay" style="margin-top:16px"><input type="hidden" name="pid" value="${p.id}"><input type="hidden" name="t" value="${token}"><input type="hidden" name="id" value="${inv.id}">
          <h2>How to pay</h2><p class="prose muted" style="margin:0">${inv.notes || b.paymentInstructions}</p>
          <p class="small muted" style="margin:0">Pay online by card ${raw('<span class="soon">Coming Soon</span>')}</p>
          <div class="form-grid">${field({ label: `Amount paid (${inv.currency})`, name: 'amount', type: 'number', value: t.balance, attrs: 'min="0.01" step="0.01" inputmode="decimal"' })}${field({ label: 'Method', name: 'method', type: 'select', options: PAYMENT_METHODS })}${field({ label: 'Reference (optional)', name: 'reference', full: true })}</div>
          <button class="btn btn-primary btn-lg" type="submit">I've sent the payment</button></form>` : ''}
    </details>`;
  })}</div>`;
}

// ---------------- Handlers ----------------
const remember = (v) => { if (v.name) setName(v.pid, v.name.trim()); };
onForm({
  'portal-brief': (v) => { portalSubmitBrief(v.pid, v.t, v); toast('Thank you! Your brief was sent.'); go(`/client/${v.pid}?t=${v.t}`); return false; },
  'portal-proposal': async (v, form, submitter) => {
    remember(v);
    const decision = submitter?.value;
    if (decision === 'decline') {
      if (!(await confirmDialog({ title: 'Decline this proposal?', body: 'Your freelancer will be notified and may send a revised proposal.', confirm: 'Decline' }))) return false;
      portalRespondProposal(v.pid, v.t, { decision: 'decline', name: v.name }); toast('Proposal declined.');
    } else {
      portalRespondProposal(v.pid, v.t, { decision: 'accept', name: v.name }); toast('Proposal accepted. Next: the contract.');
      go(`/client/${v.pid}/contract?t=${v.t}`); return false;
    }
  },
  'portal-contract': (v) => { remember(v); portalAcceptContract(v.pid, v.t, v); toast('Contract accepted. Thank you!'); go(`/client/${v.pid}?t=${v.t}`); return false; },
  'portal-co': (v, form, submitter) => { remember(v); portalRespondChangeOrder(v.pid, v.t, v.id, { decision: submitter?.value, name: v.name }); toast(submitter?.value === 'approve' ? 'Change approved.' : 'Change declined.'); },
  'portal-comment': (v) => { remember(v); portalAddFeedback(v.pid, v.t, v); toast('Comment sent.'); },
  'portal-revision': (v) => { remember(v); portalRequestRevision(v.pid, v.t, v); toast('Revision requested. Your freelancer has been notified.'); },
  'portal-approval': async (v, form, submitter) => {
    remember(v);
    if (submitter?.value === 'approve') {
      if (!(await confirmDialog({ title: 'Approve final version?', body: 'Your approval is recorded with your name, the date and the version.', confirm: 'Approve' }))) return false;
      portalRespondApproval(v.pid, v.t, v.id, { decision: 'approve', name: v.name, note: v.note }); toast('Approved. Thank you!');
    } else { portalRespondApproval(v.pid, v.t, v.id, { decision: 'changes', name: v.name, note: v.note }); toast('Changes requested.'); }
  },
  'portal-pay': (v) => { portalReportPayment(v.pid, v.t, v.id, v); toast('Thanks — your freelancer will confirm the payment.'); },
  'portal-upload': async (v, form) => {
    if (!v.files?.length) { toast('Choose a file to upload.', 'error'); return false; }
    const bar = form.querySelector('.upload-progress'); bar.hidden = false;
    for (const file of v.files) await portalUpload(v.pid, v.t, file, { name: getName(v.pid), onProgress: (x) => { bar.firstElementChild.style.width = `${Math.round(x * 100)}%`; } });
    toast('Uploaded. Thank you!');
  },
});
onAction({
  'portal-view': (el) => { openViewer(el.dataset.id, { projectId: el.dataset.pid, token: el.dataset.t, name: getName(el.dataset.pid) }); return false; },
  'portal-download': async (el) => { await download(el.dataset.id, { projectId: el.dataset.pid, token: el.dataset.t }); return false; },
});
export { fileKind };
