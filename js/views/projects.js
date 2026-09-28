// Projects: list, creation, workspace (overview, brief, proposal, contract, scope, invoices, activity).
import { html, raw, icon, href, pill, empty, pageHead, field, tabs, onAction, onForm, go, toast, openModal, closeModal, modalHead, confirmDialog, moneyEl } from '../ui.js';
import { db } from '../core/store.js';
import { fmtMoney, fmtDate, fmtShortDate, fmtDateTime, fmtRelative, UserError, lines } from '../core/util.js';
import { appLink } from '../core/mailer.js';
import { runAI } from '../core/ai.js';
import { myBusiness } from '../services/context.js';
import { listProjects, getProject, createProject, updateProject, cancelProject, listClients, nextAction, financials, progress, listDeliverables, saveScope, latestProposal, regeneratePortalLink, isOverdue } from '../services/core.js';
import { getBrief, saveBrief, sendBrief, markBriefReviewed, createProposal, projectContract, updateContract, regenerateContract, listChangeOrders, createChangeOrder, withdrawChangeOrder } from '../services/workflow.js';
import { listInvoices, createFinalInvoice, createInvoice } from '../services/billing.js';
import { projectActivity } from '../services/growth.js';
import { completeProject, createReminder, listRounds, defaultFollowUpDate, listReminders, completeReminder } from '../services/delivery.js';
import { PROJECT_STATUSES, PROPOSAL_STATUSES, CONTRACT_STATUSES, INVOICE_STATUSES, CO_STATUSES, TEMPLATES, PROJECT_TYPES } from '../services/constants.js';
import { projectRow } from './dashboard.js';
import { contractDoc } from './documents.js';
import { filesTab, feedbackTab, revisionsTab, approvalsTab } from './project-work.js';

const clientName = (id) => db.get('clients', id)?.name || '—';

// ---------------- List ----------------
export function projectsList(_, q) {
  const status = q.status || 'open';
  const projects = listProjects({ status: status === 'all' ? undefined : status });
  const filters = [['open', 'Open'], ['draft', 'Draft'], ['active', 'Active'], ['in_review', 'In review'], ['awaiting_approval', 'Awaiting approval'], ['completed', 'Completed'], ['cancelled', 'Cancelled'], ['all', 'All']];
  return html`${pageHead({ title: 'Projects', sub: 'Every project, its status and the next step.', actions: html`<a class="btn btn-primary" href="${href('/projects/new')}">${icon('plus', 16)} New Project</a>` })}
    <nav class="filters" aria-label="Filter projects">${filters.map(([id, l]) => html`<a href="${href(`/projects?status=${id}`)}" class="${status === id ? 'active' : ''}">${l}</a>`)}</nav>
    ${projects.length ? html`<div class="list"><div class="list-row list-head cols-project"><div>Project</div><div>Status</div><div class="hide-md">Deadline</div><div class="hide-md">Amount</div><div>Next step</div></div>${projects.map((p) => projectRow(p, clientName(p.clientId)))}</div>`
      : status === 'open' || status === 'all'
        ? empty({ title: 'No projects', body: 'Your projects will appear here.', cta: html`<a class="btn btn-primary" href="${href('/projects/new')}">+ Create Your First Project</a>` })
        : empty({ title: 'Nothing here', body: 'No projects match this filter.' })}`;
}

// ---------------- New project ----------------
let newState = { mode: null, template: null };
export function projectNew(_, q) {
  const b = myBusiness();
  const clients = listClients();
  if (q.client && !newState.mode) newState = { mode: 'scratch', template: null };
  if (!newState.mode) {
    return html`${pageHead({ title: 'New project', sub: 'Start from scratch or use a template with typical deliverables and exclusions.', back: ['/projects', 'Projects'] })}
      <div class="grid-2" style="margin-bottom:28px">
        <button class="card" style="text-align:left;cursor:pointer;font:inherit" data-action="np-mode" data-mode="scratch"><div class="eyebrow">Option A</div><h2 class="serif" style="font-size:28px;font-weight:400">Create from scratch</h2><p class="muted" style="margin:6px 0 0">Define the scope yourself.</p></button>
        <div class="card"><div class="eyebrow">Option B</div><h2 class="serif" style="font-size:28px;font-weight:400">Use a template</h2><p class="muted" style="margin:6px 0 0">Pre-filled deliverables, exclusions and revisions.</p></div>
      </div>
      <div class="list">${Object.entries(TEMPLATES).map(([k, t]) => html`<button class="list-row clickable cols-4" style="width:100%;background:none;border-left:0;border-right:0;border-bottom:0;text-align:left;font:inherit;cursor:pointer" data-action="np-mode" data-mode="template" data-template="${k}">
        <div><div class="cell-title">${t.name}</div><div class="cell-sub">${t.deliverables.map(([d, n]) => `${n} × ${d}`).join(' · ')}</div></div>
        <div class="hide-sm cell-sub">${t.revisions} revision rounds</div><div class="hide-sm cell-sub">~${t.days} days</div><div class="right num">${fmtMoney(t.price, b.currency)}</div></button>`)}</div>`;
  }
  const t = newState.template ? TEMPLATES[newState.template] : null;
  const preClient = q.client || (clients[0]?.id ?? '__new');
  return html`${pageHead({ title: t ? `New ${t.name} project` : 'New project', sub: t ? 'Deliverables and exclusions are pre-filled. You can adjust them in Scope.' : 'You can refine the brief and scope next.', back: ['/projects/new', 'Choose another start'] })}
    <form class="card form-grid" data-form="project-create" style="max-width:760px">
      <input type="hidden" name="templateKey" value="${newState.template || ''}">
      ${field({ label: 'Project name', name: 'name', required: true, placeholder: 'e.g. Restaurant Campaign', full: true, attrs: 'autofocus' })}
      ${field({ label: 'Client', name: 'clientId', type: 'select', value: preClient, options: [...clients.map((c) => [c.id, c.company ? `${c.name} — ${c.company}` : c.name]), ['__new', '+ New client']], attrs: 'data-change="np-client"' })}
      ${field({ label: 'Project type', name: 'type', type: 'select', value: t?.type || 'Other', options: PROJECT_TYPES })}
      <div class="full form-grid" id="np-newclient" ${raw(preClient === '__new' ? '' : 'hidden')}>
        ${field({ label: 'Client name', name: 'newClientName', placeholder: 'e.g. ABC Restaurant' })}
        ${field({ label: 'Client email', name: 'newClientEmail', type: 'email', placeholder: 'For proposals and the client portal' })}
      </div>
      ${field({ label: 'Deadline', name: 'deadline', type: 'date' })}
      ${field({ label: `Budget (${b.currency})`, name: 'budget', type: 'number', value: t?.price || '', attrs: 'min="0" step="0.01" inputmode="decimal"' })}
      ${field({ label: 'Included revision rounds', name: 'revisionsIncluded', type: 'number', value: t?.revisions ?? b.defaultRevisions, attrs: 'min="0" max="20"' })}
      ${field({ label: 'Deposit %', name: 'depositPercent', type: 'number', value: t?.deposit ?? b.defaultDepositPercent, attrs: 'min="0" max="100"' })}
      <div class="form-actions full"><button type="button" class="btn btn-ghost" data-action="np-reset">Cancel</button><button class="btn btn-primary" type="submit">Create project</button></div>
    </form>`;
}

// ---------------- Workspace ----------------
const TABS = ['overview', 'brief', 'proposal', 'contract', 'scope', 'files', 'feedback', 'revisions', 'approvals', 'invoices', 'activity'];
const FLOW = [['Brief'], ['Proposal'], ['Contract'], ['Deposit'], ['Production'], ['Approval'], ['Delivery'], ['Payment'], ['Completed']];
function flowIndex(p) {
  const prop = latestProposal(p.id);
  const f = financials(p);
  if (p.status === 'completed') return 9;
  if (p.status === 'approved') return p.deliveredAt ? (f.balance > 0.001 ? 7 : 8) : 6;
  if (p.status === 'awaiting_approval') return 5;
  if (['active', 'in_review', 'revision_requested'].includes(p.status)) return 4;
  if (p.status === 'awaiting_deposit') return 3;
  if (prop?.status === 'accepted') return 2;
  if (prop) return 1;
  return 0;
}

export function workspace(params) {
  const p = getProject(params.id);
  const tab = TABS.includes(params.tab) ? params.tab : 'overview';
  const f = financials(p);
  const na = nextAction(p);
  const c = db.get('clients', p.clientId);
  const counts = {
    feedback: db.count('feedback', (x) => x.projectId === p.id && x.status === 'open' && x.authorType === 'client'),
    approvals: db.count('approvals', (x) => x.projectId === p.id && x.status === 'pending'),
    revisions: db.count('revisionRounds', (x) => x.projectId === p.id && x.status !== 'delivered'),
  };
  const labels = { overview: 'Overview', brief: 'Brief', proposal: 'Proposal', contract: 'Contract', scope: 'Scope', files: 'Files', feedback: 'Feedback', revisions: 'Revisions', approvals: 'Approvals', invoices: 'Invoices', activity: 'Activity' };
  const body = { overview, brief: briefTab, proposal: proposalTab, contract: contractTab, scope: scopeTab, files: filesTab, feedback: feedbackTab, revisions: revisionsTab, approvals: approvalsTab, invoices: invoicesTab, activity: activityTab }[tab](p, params);
  return html`
    <a class="back-link" href="${href('/projects')}">${icon('back', 16)} Projects</a>
    <div class="proj-head">
      <div>
        <div class="btn-row" style="margin-bottom:8px">${pill(PROJECT_STATUSES, p.status)}${isOverdue(p) ? html`<span class="pill pill-red"><span class="dot"></span>Past deadline</span>` : ''}</div>
        <h1>${p.name}</h1>
        <div class="proj-meta">
          <div><span>Client</span><a href="${href(`/clients/${p.clientId}`)}">${c?.name}</a></div>
          <div><span>Deadline</span>${p.deadline ? fmtDate(p.deadline) : '—'}</div>
          <div><span>Total value</span>${moneyEl(f.total, p.currency)}</div>
          <div><span>Paid</span>${f.paidPct}%</div>
          <div><span>Revisions</span>${listRounds(p.id).length} / ${p.revisionsIncluded}</div>
        </div>
      </div>
      <div class="btn-row">
        <button class="btn btn-secondary" data-action="portal-share" data-id="${p.id}">${icon('link', 16)} Client portal</button>
        <button class="icon-btn" data-action="project-menu" data-id="${p.id}" aria-label="Project settings">${icon('more')}</button>
      </div>
    </div>
    <div class="next-card${na.waiting ? ' waiting' : ''}">
      <div><div class="label">${na.waiting ? 'Status' : 'Next step'}</div><div class="title">${na.label}</div><div class="detail">${na.detail || ''}</div></div>
      ${na.href && !na.waiting ? html`<a class="btn btn-primary" href="${href(na.href)}">${na.label} ${icon('arrow', 16)}</a>` : na.href ? html`<a class="btn btn-secondary" href="${href(na.href)}">View</a>` : ''}
    </div>
    ${tabs(TABS.map((t) => [t, labels[t], `/projects/${p.id}/${t}`, counts[t] || '']), tab)}
    ${body}`;
}

function overview(p) {
  const f = financials(p);
  const idx = flowIndex(p);
  const del = listDeliverables(p.id);
  const acts = projectActivity(p.id).slice(0, 6);
  const c = db.get('clients', p.clientId);
  const reminders = listReminders().filter((r) => r.projectId === p.id);
  return html`<div class="grid-main">
    <div class="stack">
      <ol class="flow" aria-label="Workflow">${FLOW.map(([l], i) => html`<li class="${i < idx ? 'done' : i === idx ? 'current' : ''}"${i === idx ? raw(' aria-current="step"') : ''}>${l}</li>`)}</ol>
      <div class="pay-grid">
        <div><span>Project total</span><b>${fmtMoney(f.total, p.currency)}</b></div>
        <div><span>Deposit (${p.depositPercent}%)</span><b>${fmtMoney(f.depositAmount, p.currency)}</b><div class="small ${f.depositPaid ? '' : 'muted'}">${f.depositAmount <= 0 ? 'No deposit' : f.depositPaid ? '✓ Deposit received' : f.contracted ? 'Pending deposit' : 'Due after contract'}</div></div>
        <div><span>Remaining</span><b>${fmtMoney(f.balance, p.currency)}</b><div class="small muted">${fmtMoney(f.paid, p.currency)} paid</div></div>
      </div>
      <div class="card"><div class="card-head"><h2>Scope</h2><a class="small" href="${href(`/projects/${p.id}/scope`)}">View scope</a></div>
        ${del.length ? html`<ul class="scope-list in">${del.slice(0, 6).map((d) => html`<li>${icon('check', 16)}<span>${d.quantity} × ${d.title}${d.source === 'change_order' ? html` <span class="tag">Change order</span>` : ''}</span></li>`)}</ul>` : html`<p class="muted">No deliverables defined yet.</p>`}
        <p class="small muted" style="margin:10px 0 0">${p.revisionsIncluded} revision round(s) included · ${(p.exclusions || []).length} exclusion(s) listed</p>
      </div>
      <div class="card"><div class="card-head"><h2>Recent activity</h2><a class="small" href="${href(`/projects/${p.id}/activity`)}">Full log</a></div>
        ${acts.length ? html`<ul class="timeline">${acts.map((a) => html`<li><time>${fmtShortDate(a.createdAt)}</time><div>${a.message}<div class="who">${a.actorName}</div></div></li>`)}</ul>` : html`<p class="muted">No activity yet.</p>`}
      </div>
    </div>
    <aside class="stack">
      <div class="card"><h2 style="margin-bottom:10px">Client</h2><div class="cell-title">${c?.name}</div><div class="cell-sub">${c?.company || ''}</div><div class="cell-sub">${c?.email || 'No email'}</div>
        <a class="btn btn-secondary btn-sm" style="margin-top:12px" href="${href(`/clients/${c?.id}`)}">Client profile</a></div>
      ${p.status === 'approved' ? html`<div class="card"><h2 style="margin-bottom:8px">Finish the project</h2><p class="muted small">${p.deliveredAt ? `Delivered ${fmtShortDate(p.deliveredAt)}.` : 'Deliver final files first.'} ${f.balance > 0.001 ? `${fmtMoney(f.balance, p.currency)} outstanding.` : 'Fully paid.'}</p><button class="btn btn-primary btn-block" data-action="project-complete" data-id="${p.id}">Mark as completed</button></div>` : ''}
      ${p.status === 'completed' ? html`<div class="card"><h2 style="margin-bottom:8px">After delivery</h2>
        <a class="btn btn-secondary btn-block" href="${href(`/portfolio/new?project=${p.id}`)}">${icon('star', 16)} Add to portfolio</a>
        <div class="divider"></div>
        ${reminders.length ? reminders.map((r) => html`<div class="notice" style="margin-bottom:8px"><b>Follow-up ${fmtShortDate(r.dueDate)}</b><br>${r.note}<br><button class="link-btn small" data-action="reminder-done" data-id="${r.id}">Mark done</button></div>`) : ''}
        <button class="btn btn-ghost btn-block" data-action="reminder-new" data-client="${p.clientId}" data-project="${p.id}">${icon('clock', 16)} Set follow-up reminder</button></div>` : ''}
      <div class="card"><h2 style="margin-bottom:8px">Details</h2><dl class="kv" style="grid-template-columns:100px 1fr">
        <dt>Type</dt><dd>${p.type}</dd><dt>Created</dt><dd>${fmtDate(p.createdAt)}</dd><dt>Started</dt><dd>${p.startedAt ? fmtDate(p.startedAt) : '—'}</dd><dt>Progress</dt><dd>${progress(p)}%</dd>
        <dt>Delivery</dt><dd>${p.lockDeliveryUntilPaid ? 'Files unlock when paid' : 'Files available on delivery'}</dd></dl></div>
    </aside>
  </div>`;
}

// ---------------- Brief ----------------
function briefTab(p) {
  const b = getBrief(p.id);
  const c = db.get('clients', p.clientId);
  const statusNote = {
    sent: html`<div class="notice notice-warn">Sent to ${c?.name} ${b.sentAt ? fmtRelative(b.sentAt) : ''}. The client can fill it in through the portal. You can still edit it.</div>`,
    submitted: html`<div class="notice notice-ok">${c?.name} submitted the brief ${fmtRelative(b.submittedAt)}. <button class="link-btn" data-action="brief-reviewed" data-id="${p.id}">Mark as reviewed</button></div>`,
    reviewed: html`<div class="notice">Brief reviewed.</div>`,
  }[b.status] || '';
  return html`<div class="grid-main">
    <form class="card form-grid" data-form="brief-save" data-id="${p.id}">
      <input type="hidden" name="id" value="${p.id}">
      <div class="full">${statusNote}</div>
      ${field({ label: 'Project type', name: 'type', type: 'select', value: p.type, options: PROJECT_TYPES })}
      ${field({ label: 'Deadline', name: 'deadline', type: 'date', value: p.deadline })}
      ${field({ label: 'Objective', name: 'objective', type: 'textarea', rows: 3, value: b.objective, full: true, placeholder: 'What should this project achieve?' })}
      ${field({ label: 'Target audience', name: 'audience', value: b.audience })}
      ${field({ label: 'Platforms', name: 'platforms', value: b.platforms, placeholder: 'Instagram, TikTok, Website…' })}
      ${field({ label: 'Deliverables', name: 'deliverablesText', type: 'textarea', rows: 4, value: b.deliverablesText, full: true, hint: 'The agreed deliverables live in Scope — this is what the client asked for.' })}
      ${field({ label: 'Tone', name: 'tone', value: b.tone, placeholder: 'Premium, modern…' })}
      ${field({ label: `Budget (${p.currency})`, name: 'budget', type: 'number', value: b.budget, attrs: 'min="0" step="0.01"' })}
      ${field({ label: 'References', name: 'references', type: 'textarea', rows: 3, value: b.references, full: true, placeholder: 'Links to examples the client likes' })}
      ${field({ label: 'Production needs', name: 'productionNeeds', type: 'textarea', rows: 2, value: b.productionNeeds, full: true })}
      ${field({ label: 'Notes', name: 'notes', type: 'textarea', rows: 3, value: b.notes, full: true })}
      <div class="form-actions full">
        ${p.status === 'draft' && b.status !== 'sent' ? html`<button type="button" class="btn btn-secondary" data-action="brief-send" data-id="${p.id}">Send to client to complete</button>` : ''}
        <button class="btn btn-primary" type="submit">Save brief</button>
      </div>
    </form>
    <aside class="stack">
      <div class="card">
        <h2 style="margin-bottom:4px">${icon('sparkles', 16)} AI brief assistant</h2>
        <p class="muted small">Paste the client's message. You'll review the suggestion before anything is applied.</p>
        <form class="form-stack" data-form="brief-ai" style="gap:10px">
          <input type="hidden" name="id" value="${p.id}">
          <textarea name="text" rows="5" aria-label="Client message" placeholder='"I need a 30-second promotional video for my restaurant."'></textarea>
          <button class="btn btn-secondary" type="submit">Draft brief</button>
        </form>
      </div>
      <div class="card"><h2 style="margin-bottom:8px">Brief files & brand assets</h2><p class="muted small">Upload references, logos and guidelines to 01 Brief and 02 Brand Assets.</p>
        <a class="btn btn-secondary btn-sm" href="${href(`/projects/${p.id}/files?folder=brief`)}">Open files</a></div>
    </aside>
  </div>`;
}

// ---------------- Proposal ----------------
function proposalTab(p) {
  const props = db.all('proposals', (x) => x.projectId === p.id).sort((a, z) => z.createdAt.localeCompare(a.createdAt));
  const canCreate = !props.some((x) => ['draft', 'sent', 'viewed', 'accepted'].includes(x.status));
  if (!props.length) return empty({ title: 'No proposal yet', body: 'Create a proposal from this project — scope, timeline, revisions and price are pre-filled from the brief.', cta: html`<button class="btn btn-primary" data-action="proposal-create" data-id="${p.id}">Create proposal</button>` });
  return html`<div class="list">${props.map((x) => html`<a class="list-row cols-4" href="${href(`/proposals/${x.id}`)}">
      <div><div class="cell-title">${x.number} · ${x.title}</div><div class="cell-sub">Valid until ${fmtDate(x.validUntil)}</div></div>
      <div>${pill(PROPOSAL_STATUSES, x.status)}</div><div class="hide-sm cell-sub">${x.sentAt ? `Sent ${fmtShortDate(x.sentAt)}` : 'Not sent'}</div>
      <div class="right num">${fmtMoney(db.all('proposalItems', (i) => i.proposalId === x.id).reduce((a, i) => a + i.quantity * i.unitPrice, 0), x.currency)}</div></a>`)}</div>
    ${canCreate ? html`<div style="margin-top:16px"><button class="btn btn-secondary" data-action="proposal-create" data-id="${p.id}">New proposal</button></div>` : ''}`;
}

// ---------------- Contract ----------------
function contractTab(p) {
  const c = projectContract(p.id);
  if (!c) return empty({ title: 'No contract yet', body: 'A contract is generated automatically from the project when the client accepts the proposal. You can edit the template in Settings → Contract Templates.' });
  return html`<div class="btn-row" style="margin-bottom:16px;justify-content:space-between">
      <span>${pill(CONTRACT_STATUSES, c.status)} ${c.acceptedAt ? html`<span class="muted small">Accepted by ${c.acceptedByName} · ${fmtDateTime(c.acceptedAt)} · fingerprint ${c.fingerprint}</span>` : ''}</span>
      <span class="btn-row">${c.status !== 'accepted' ? html`<button class="btn btn-secondary btn-sm" data-action="contract-edit" data-id="${c.id}">${icon('edit', 14)} Edit terms</button><button class="btn btn-ghost btn-sm" data-action="contract-regenerate" data-id="${p.id}">Regenerate</button>` : ''}<button class="btn btn-ghost btn-sm" data-action="print">Print / PDF</button></span></div>
    ${contractDoc(c, p)}`;
}

// ---------------- Scope ----------------
function scopeTab(p) {
  const del = listDeliverables(p.id);
  const cos = listChangeOrders(p.id);
  const rounds = listRounds(p.id);
  const editable = p.status === 'draft';
  const extra = rounds.filter((r) => r.isExtra && !r.changeOrderId);
  return html`
    ${editable ? html`<form class="card" data-form="scope-save">
        <input type="hidden" name="id" value="${p.id}">
        <div class="card-head"><h2>Included</h2><span class="muted small">Locked once the contract is accepted</span></div>
        <div class="rows" id="scope-rows">
          <div class="row-edit two row-head"><span>Deliverable</span><span>Qty</span><span></span></div>
          ${(del.length ? del : [{ title: '', quantity: 1 }]).map((d, i) => scopeRow(d, i))}
        </div>
        <button type="button" class="btn btn-ghost btn-sm" data-action="scope-add-row" style="margin-top:8px">${icon('plus', 14)} Add deliverable</button>
        <div class="divider"></div>
        ${field({ label: 'Not included (one per line)', name: 'exclusions', type: 'textarea', rows: 6, value: (p.exclusions || []).join('\n') })}
        <p class="small muted" style="margin-top:12px">Revision rounds included: <b>${p.revisionsIncluded}</b> — change this in the proposal.</p>
        <div class="form-actions"><button class="btn btn-primary" type="submit">Save scope</button></div>
      </form>`
      : html`<div class="scope-cols">
        <div class="card"><h2 style="margin-bottom:10px">Included</h2><ul class="scope-list in">${del.map((d) => html`<li>${icon('check', 16)}<span>${d.quantity} × ${d.title}${d.source === 'change_order' ? html` <span class="tag">Change order</span>` : ''}</span></li>`)}<li>${icon('check', 16)}<span>${p.revisionsIncluded} revision round(s)</span></li></ul></div>
        <div class="card"><h2 style="margin-bottom:10px">Not included</h2><ul class="scope-list out">${(p.exclusions || []).map((x) => html`<li>${icon('x', 16)}<span>${x}</span></li>`)}</ul></div>
      </div>`}
    <section class="section">
      <div class="section-head"><h2>Change orders</h2>${p.status !== 'draft' && !['completed', 'cancelled'].includes(p.status) ? html`<button class="btn btn-secondary btn-sm" data-action="co-new" data-id="${p.id}">${icon('plus', 14)} Change order</button>` : ''}</div>
      ${extra.length ? html`<div class="notice notice-warn" style="margin-bottom:12px">Revision ${extra.map((r) => r.number).join(', ')} exceeds the ${p.revisionsIncluded} included round(s). Create a change order for the additional revision — the client will be asked to approve it. Nothing is charged automatically.
        <div style="margin-top:8px"><button class="btn btn-sm btn-primary" data-action="co-new" data-id="${p.id}" data-round="${extra[0].id}" data-title="Additional revision (round ${extra[0].number})">Create change order for revision ${extra[0].number}</button></div></div>` : ''}
      ${cos.length ? html`<div class="list">${cos.map((co) => html`<div class="list-row cols-4">
          <div><div class="cell-title">${co.title}</div><div class="cell-sub">${co.description || '—'}</div></div>
          <div>${pill(CO_STATUSES, co.status)}</div>
          <div class="hide-sm cell-sub">${co.respondedAt ? `${co.status === 'approved' ? 'Approved' : 'Declined'} by ${co.respondedByName} · ${fmtShortDate(co.respondedAt)}` : `Sent ${fmtShortDate(co.createdAt)}`}</div>
          <div class="right"><span class="num">+${fmtMoney(co.amount, p.currency)}</span>
            ${co.status === 'pending' ? html`<br><button class="link-btn small" data-action="co-withdraw" data-id="${co.id}">Withdraw</button>` : ''}
            ${co.status === 'approved' && co.amount > 0 && !db.find('invoices', (i) => i.changeOrderId === co.id && i.status !== 'cancelled') ? html`<br><button class="link-btn small" data-action="co-invoice" data-id="${co.id}">Create invoice</button>` : ''}</div>
        </div>`)}</div>` : html`<p class="muted">${p.status === 'draft' ? 'Change orders become available once the proposal is accepted — until then, edit the proposal.' : 'No change orders. If the client asks for something outside the scope, create one here — work is never added silently.'}</p>`}
    </section>`;
}
const scopeRow = (d, i) => html`<div class="row-edit two"><input name="deliverables.${i}.title" value="${d.title}" aria-label="Deliverable" placeholder="e.g. Reels (30s)"><input name="deliverables.${i}.quantity" type="number" min="1" value="${d.quantity || 1}" aria-label="Quantity"><button type="button" class="icon-btn" data-action="row-remove" aria-label="Remove">${icon('trash', 16)}</button></div>`;

// ---------------- Invoices ----------------
function invoicesTab(p) {
  const invs = listInvoices({ projectId: p.id });
  const f = financials(p);
  return html`<div class="pay-grid" style="margin-bottom:20px">
      <div><span>Total</span><b>${fmtMoney(f.total, p.currency)}</b></div><div><span>Invoiced</span><b>${fmtMoney(f.invoiced, p.currency)}</b></div><div><span>Paid</span><b>${fmtMoney(f.paid, p.currency)}</b></div></div>
    <div class="btn-row" style="margin-bottom:16px">
      ${f.contracted && f.uninvoiced > 0.001 ? html`<button class="btn btn-primary btn-sm" data-action="invoice-final" data-id="${p.id}">Invoice remaining ${fmtMoney(f.uninvoiced, p.currency)}</button>` : ''}
      <button class="btn btn-secondary btn-sm" data-action="invoice-custom" data-id="${p.id}">${icon('plus', 14)} Custom invoice</button>
    </div>
    ${invs.length ? html`<div class="list">${invs.map((i) => invoiceRow(i))}</div>` : html`<p class="muted">No invoices yet. The deposit invoice is created automatically when the client accepts the contract.</p>`}`;
}
export function invoiceRow(i) {
  const t = db.all('invoiceItems', (x) => x.invoiceId === i.id).reduce((a, x) => a + x.quantity * x.unitPrice, 0);
  return html`<a class="list-row cols-4" href="${href(`/invoices/${i.id}`)}">
    <div><div class="cell-title">Invoice ${i.number}</div><div class="cell-sub">${{ deposit: 'Deposit', final: 'Final payment', change_order: 'Change order', custom: 'Invoice' }[i.kind] || 'Invoice'} · ${clientName(i.clientId)}</div></div>
    <div>${pill(INVOICE_STATUSES, i.status)}</div><div class="hide-sm cell-sub">Due ${fmtShortDate(i.dueDate)}</div><div class="right num">${fmtMoney(t, i.currency)}${i.discount || i.taxRate ? '*' : ''}</div></a>`;
}

// ---------------- Activity ----------------
function activityTab(p) {
  const acts = projectActivity(p.id);
  return html`<div class="card"><p class="muted small">A permanent record of every important action on this project. Entries cannot be edited or deleted.</p>
    <ul class="timeline">${acts.map((a) => html`<li><time datetime="${a.createdAt}">${fmtDateTime(a.createdAt)}</time><div>${a.message}<div class="who">${a.actorName} · ${a.actorType}</div></div></li>`)}</ul></div>`;
}

// ---------------- Modals ----------------
function portalShareModal(p) {
  const link = appLink(`/client/${p.id}?t=${p.portalToken}`);
  return html`${modalHead('Client portal', 'Your client sees only this project: proposal, contract, files, feedback, approvals and invoices.')}
    <label class="field"><span>Private client link</span><input readonly value="${link}" id="portal-link" onfocus="this.select()"></label>
    <div class="notice" style="margin-top:12px">This MVP stores data in this browser. Links open the portal on this device (use “Preview as client”). Sharing to other devices needs cloud sync ${raw('<span class="soon">Coming Soon</span>')}.</div>
    <div class="modal-actions" style="justify-content:space-between">
      <button class="btn btn-ghost btn-sm" data-action="portal-regenerate" data-id="${p.id}">Reset link</button>
      <span class="btn-row"><button class="btn btn-secondary" data-action="copy-link">Copy link</button><a class="btn btn-primary" href="${link}" target="_blank" rel="noopener">${icon('external', 16)} Preview as client</a></span>
    </div>`;
}

function projectMenuModal(p) {
  return html`${modalHead('Project settings')}
    <form class="form-grid" data-form="project-update">
      <input type="hidden" name="id" value="${p.id}">
      ${field({ label: 'Project name', name: 'name', value: p.name, required: true, full: true })}
      ${field({ label: 'Deadline', name: 'deadline', type: 'date', value: p.deadline })}
      ${field({ label: 'Type', name: 'type', type: 'select', value: p.type, options: PROJECT_TYPES })}
      <label class="check full"><input type="checkbox" name="lockDeliveryUntilPaid" data-bool${p.lockDeliveryUntilPaid ? raw(' checked') : ''}> Hold final file downloads until the project is paid in full</label>
      <label class="check full"><input type="checkbox" name="portalDisabled" data-bool${p.portalDisabled ? raw(' checked') : ''}> Turn off the client portal for this project</label>
      <div class="form-actions full" style="justify-content:space-between">
        ${!['completed', 'cancelled'].includes(p.status) ? html`<button type="button" class="btn btn-ghost" style="color:var(--red)" data-action="project-cancel" data-id="${p.id}">Cancel project</button>` : html`<span></span>`}
        <button class="btn btn-primary" type="submit">Save</button></div>
    </form>`;
}

function changeOrderModal(p, { round, title }) {
  return html`${modalHead('New change order', 'The client approves or declines it in the portal. Nothing is added to the project or charged until they approve.')}
    <form class="form-grid" data-form="co-create">
      <input type="hidden" name="id" value="${p.id}"><input type="hidden" name="revisionRoundId" value="${round || ''}">
      ${field({ label: 'What is being added', name: 'title', value: title || '', required: true, full: true, placeholder: 'e.g. Additional video' })}
      ${field({ label: 'Description', name: 'description', type: 'textarea', rows: 3, full: true })}
      ${field({ label: `Price (${p.currency})`, name: 'amount', type: 'number', required: true, attrs: 'min="0" step="0.01" inputmode="decimal"' })}
      ${field({ label: 'Extra days needed', name: 'extraDays', type: 'number', value: 0, attrs: 'min="0"' })}
      <div class="form-actions full"><button type="button" class="btn btn-ghost" data-action="modal-close">Cancel</button><button class="btn btn-primary" type="submit">Send to client</button></div>
    </form>`;
}

function contractEditModal(c) {
  return html`${modalHead('Edit contract terms', 'Changes apply to this project only. Edit the default template in Settings.')}
    <form class="form-stack" data-form="contract-save"><input type="hidden" name="id" value="${c.id}">
      ${c.sections.map((s, i) => html`<div class="card" style="padding:14px"><input name="sections.${i}.title" value="${s.title}" aria-label="Section title" style="font-weight:600;margin-bottom:8px"><textarea name="sections.${i}.body" rows="4" aria-label="${s.title}">${s.body}</textarea></div>`)}
      <div class="form-actions"><button type="button" class="btn btn-ghost" data-action="modal-close">Cancel</button><button class="btn btn-primary" type="submit">Save terms</button></div></form>`;
}

function reminderModal(clientId, projectId) {
  return html`${modalHead('Follow-up reminder', "You'll see it in Today's actions and notifications. Nothing is sent to the client automatically.")}
    <form class="form-grid" data-form="reminder-create"><input type="hidden" name="clientId" value="${clientId}"><input type="hidden" name="projectId" value="${projectId || ''}">
      ${field({ label: 'Remind me on', name: 'dueDate', type: 'date', value: defaultFollowUpDate(30), required: true })}
      <div></div>
      ${field({ label: 'Note', name: 'note', value: 'Check in about a new project', required: true, full: true })}
      <div class="form-actions full"><button type="button" class="btn btn-ghost" data-action="modal-close">Cancel</button><button class="btn btn-primary" type="submit">Save reminder</button></div></form>`;
}

function briefAIModal(projectId, data) {
  return html`${modalHead('Review the suggested brief', 'Edit anything before applying. Existing fields will be replaced by what you apply.')}
    <form class="form-grid" data-form="brief-ai-apply"><input type="hidden" name="id" value="${projectId}">
      ${field({ label: 'Project type', name: 'type', type: 'select', value: PROJECT_TYPES.includes(data.type) ? data.type : 'Other', options: PROJECT_TYPES })}
      ${field({ label: 'Objective', name: 'objective', value: data.objective || '' })}
      ${field({ label: 'Deliverables', name: 'deliverablesText', type: 'textarea', rows: 3, value: data.deliverablesText || '', full: true })}
      ${field({ label: 'Platforms', name: 'platforms', value: data.platforms || '' })}
      ${field({ label: 'Tone', name: 'tone', value: data.tone || '' })}
      ${field({ label: 'Target audience', name: 'audience', value: data.audience || '', full: true })}
      ${field({ label: 'Potential production needs', name: 'productionNeeds', type: 'textarea', rows: 2, value: data.productionNeeds || '', full: true })}
      ${field({ label: 'Notes', name: 'notes', type: 'textarea', rows: 3, value: data.notes || '', full: true })}
      <div class="form-actions full"><button type="button" class="btn btn-ghost" data-action="modal-close">Discard</button><button class="btn btn-primary" type="submit">Apply to brief</button></div></form>`;
}

// ---------------- Handlers ----------------
onAction({
  'np-mode': (el) => { newState = { mode: el.dataset.mode, template: el.dataset.template || null }; },
  'np-reset': () => { newState = { mode: null, template: null }; go('/projects'); return false; },
  'np-client': (el) => { document.getElementById('np-newclient').hidden = el.value !== '__new'; return false; },
  'portal-share': (el) => { openModal(portalShareModal(getProject(el.dataset.id))); return false; },
  'portal-regenerate': async (el) => {
    if (!(await confirmDialog({ title: 'Reset client link?', body: 'The current link stops working immediately. Send the new link to your client.', confirm: 'Reset link' }))) return false;
    const p = regeneratePortalLink(el.dataset.id); openModal(portalShareModal(p)); toast('New client link created.');
  },
  'copy-link': async () => {
    const v = document.getElementById('portal-link')?.value;
    try { await navigator.clipboard.writeText(v); toast('Link copied.'); } catch { document.getElementById('portal-link')?.select(); toast('Press Ctrl/Cmd+C to copy.'); }
    return false;
  },
  'project-menu': (el) => { openModal(projectMenuModal(getProject(el.dataset.id))); return false; },
  'project-cancel': async (el) => {
    closeModal();
    if (!(await confirmDialog({ title: 'Cancel this project?', body: 'The project is closed and marked Cancelled. Invoices and history are kept.', confirm: 'Cancel project', tone: 'danger' }))) return false;
    cancelProject(el.dataset.id); toast('Project cancelled.');
  },
  'project-complete': async (el) => {
    const p = getProject(el.dataset.id);
    const f = financials(p);
    let force = false;
    if (!p.deliveredAt || f.balance > 0.001) {
      const why = [!p.deliveredAt && 'final files have not been delivered', f.balance > 0.001 && `${fmtMoney(f.balance, p.currency)} is still outstanding`].filter(Boolean).join(' and ');
      if (!(await confirmDialog({ title: 'Complete anyway?', body: `Heads up: ${why}. You can still mark the project as completed.`, confirm: 'Mark completed' }))) return false;
      force = true;
    }
    completeProject(p.id, { force }); toast('Project completed. Add it to your portfolio or set a follow-up.');
  },
  'brief-send': (el) => { sendBrief(el.dataset.id); toast('Brief sent. The client can complete it in the portal.'); },
  'brief-reviewed': (el) => { markBriefReviewed(el.dataset.id); },
  'proposal-create': (el) => { const prop = createProposal(el.dataset.id); go(`/proposals/${prop.id}`); return false; },
  'contract-edit': (el) => { openModal(contractEditModal(db.get('contracts', el.dataset.id)), { size: 'lg' }); return false; },
  'contract-regenerate': async (el) => {
    if (!(await confirmDialog({ title: 'Regenerate contract?', body: 'The current contract is voided and a new one is issued from your template and the latest project details.', confirm: 'Regenerate' }))) return false;
    regenerateContract(el.dataset.id); toast('New contract issued.');
  },
  print: () => { window.print(); return false; },
  'scope-add-row': () => {
    const rows = document.getElementById('scope-rows');
    const i = rows.querySelectorAll('.row-edit:not(.row-head)').length + Date.now() % 1000;
    rows.insertAdjacentHTML('beforeend', String(scopeRow({ title: '', quantity: 1 }, i)));
    rows.lastElementChild.querySelector('input').focus();
    return false;
  },
  'row-remove': (el) => { el.closest('.row-edit').remove(); return false; },
  'co-new': (el) => { openModal(changeOrderModal(getProject(el.dataset.id), { round: el.dataset.round, title: el.dataset.title })); return false; },
  'co-withdraw': async (el) => { if (await confirmDialog({ title: 'Withdraw change order?', body: 'The client will no longer see it.', confirm: 'Withdraw' })) withdrawChangeOrder(el.dataset.id); },
  'co-invoice': (el) => {
    const co = db.get('changeOrders', el.dataset.id);
    const inv = createInvoice(co.projectId, { kind: 'change_order', items: [{ description: `Change order: ${co.title}`, quantity: 1, unitPrice: co.amount }] });
    db.update('invoices', inv.id, { changeOrderId: co.id });
    go(`/invoices/${inv.id}`); return false;
  },
  'invoice-final': (el) => { const inv = createFinalInvoice(el.dataset.id); go(`/invoices/${inv.id}`); return false; },
  'invoice-custom': (el) => { const inv = createInvoice(el.dataset.id, { kind: 'custom', items: [{ description: 'Additional work', quantity: 1, unitPrice: 0 }] }); go(`/invoices/${inv.id}`); return false; },
  'reminder-new': (el) => { openModal(reminderModal(el.dataset.client, el.dataset.project)); return false; },
  'reminder-done': (el) => { completeReminder(el.dataset.id); toast('Reminder done.'); },
});

onForm({
  'project-create': (v) => {
    const p = createProject(v);
    newState = { mode: null, template: null };
    toast('Project created. Next: complete the brief.');
    go(`/projects/${p.id}/brief`); return false;
  },
  'project-update': (v) => { updateProject(v.id, v); closeModal(); toast('Project updated.'); },
  'brief-save': (v) => { saveBrief(v.id, v); toast('Brief saved.'); },
  'brief-ai': async (v) => {
    if (!String(v.text || '').trim()) throw new UserError('Paste the client message first.', 'text');
    const r = await runAI('brief', { text: v.text });
    if (r.kind !== 'brief') { toast('The assistant returned text instead of a brief. Try again.', 'error'); return false; }
    openModal(briefAIModal(v.id, r.data), { size: 'lg' }); return false;
  },
  'brief-ai-apply': (v) => { saveBrief(v.id, v); closeModal(); toast('Brief updated from the suggestion.'); },
  'scope-save': (v) => { saveScope(v.id, { deliverables: v.deliverables || [], exclusions: v.exclusions }); toast('Scope saved.'); },
  'co-create': (v) => { createChangeOrder(v.id, v); closeModal(); toast('Change order sent to the client for approval.'); },
  'contract-save': (v) => { updateContract(v.id, v.sections || []); closeModal(); toast('Contract terms updated.'); },
  'reminder-create': (v) => { createReminder(v); closeModal(); toast('Follow-up reminder saved.'); },
});

export { lines };
