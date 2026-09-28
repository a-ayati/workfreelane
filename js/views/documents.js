// Proposals, contracts, invoices, payments: lists, editors and printable documents
// (the document renderers are shared with the client portal).
import { html, raw, icon, href, pill, empty, pageHead, field, onAction, onForm, go, toast, openModal, closeModal, modalHead, confirmDialog } from '../ui.js';
import { db } from '../core/store.js';
import { fmtMoney, fmtDate, fmtShortDate, fmtDateTime, todayISO } from '../core/util.js';
import { PAYMENT_METHODS, gateways } from '../core/payments.js';
import { runAI } from '../core/ai.js';
import { myBusiness } from '../services/context.js';
import { listDeliverables, proposalTotal, invoiceTotals } from '../services/core.js';
import { listProposals, getProposal, proposalItems, updateProposal, sendProposal, reviseProposal, listContracts } from '../services/workflow.js';
import { listInvoices, getInvoice, updateInvoice, sendInvoice, cancelInvoice, recordPayment, confirmPayment, rejectPayment, listPayments, totalsFor } from '../services/billing.js';
import { PROPOSAL_STATUSES, CONTRACT_STATUSES, INVOICE_STATUSES } from '../services/constants.js';
import { invoiceRow } from './projects.js';

const clientOf = (id) => db.get('clients', id);
const bizHead = (b) => html`<div class="btn-row">${b.logo ? html`<img class="doc-logo" src="${b.logo}" alt="">` : ''}<div><b>${b.name}</b>${b.address ? html`<div class="small muted prose">${b.address}</div>` : ''}</div></div>`;

// ---------------- Shared document renderers ----------------
export function proposalDoc(prop) {
  const b = db.get('businesses', prop.businessId);
  const p = db.get('projects', prop.projectId);
  const c = clientOf(prop.clientId);
  const items = proposalItems(prop.id);
  const total = proposalTotal(prop.id);
  const del = listDeliverables(p.id).filter((d) => d.source !== 'change_order');
  const deposit = Math.round(total * prop.depositPercent) / 100;
  return html`<article class="doc">
    <div class="doc-head">${bizHead(b)}<div class="small muted" style="text-align:right">Proposal ${prop.number}<br>Valid until ${fmtDate(prop.validUntil)}</div></div>
    <div class="eyebrow">Prepared for ${c?.company || c?.name}</div>
    <h1>${prop.title}</h1>
    ${prop.introduction ? html`<p class="lead prose" style="margin-top:16px">${prop.introduction}</p>` : ''}
    ${prop.objective ? html`<h2>Objective</h2><p class="prose">${prop.objective}</p>` : ''}
    <h2>Scope</h2>
    <div class="scope-cols">
      <div><b class="small">Included</b><ul class="scope-list in">${del.map((d) => html`<li>${icon('check', 16)}<span>${d.quantity} × ${d.title}</span></li>`)}<li>${icon('check', 16)}<span>${prop.revisions} revision round(s)</span></li></ul></div>
      <div><b class="small">Not included</b><ul class="scope-list out">${(p.exclusions || []).map((x) => html`<li>${icon('x', 16)}<span>${x}</span></li>`)}</ul></div>
    </div>
    <h2>Timeline</h2><p>${prop.timeline || '—'}${p.deadline ? ` · target delivery ${fmtDate(p.deadline)}` : ''}</p>
    <h2>Investment</h2>
    <table class="doc-table"><thead><tr><th>Item</th><th class="r">Qty</th><th class="r">Price</th><th class="r">Amount</th></tr></thead>
      <tbody>${items.map((i) => html`<tr><td>${i.description}</td><td class="r num">${i.quantity}</td><td class="r num">${fmtMoney(i.unitPrice, prop.currency)}</td><td class="r num">${fmtMoney(i.quantity * i.unitPrice, prop.currency)}</td></tr>`)}</tbody></table>
    <div class="totals"><div class="grand"><span>Total</span><span class="num">${fmtMoney(total, prop.currency)}</span></div>
      ${prop.depositPercent ? html`<div><span>Deposit (${prop.depositPercent}%)</span><span class="num">${fmtMoney(deposit, prop.currency)}</span></div>` : ''}</div>
    ${prop.paymentTerms ? html`<h2>Payment terms</h2><p class="prose">${prop.paymentTerms}</p>` : ''}
    ${prop.notes ? html`<h2>Notes</h2><p class="prose">${prop.notes}</p>` : ''}
  </article>`;
}

export function contractDoc(c, p) {
  const b = db.get('businesses', c.businessId);
  return html`<article class="doc">
    <div class="doc-head">${bizHead(b)}<div class="small muted" style="text-align:right">${fmtDate(c.createdAt)}</div></div>
    <h1>${c.title}</h1>
    <p class="muted" style="margin-top:12px">Between <b>${c.parties.freelancer}</b> (“the Freelancer”) and <b>${c.parties.client}</b> (“the Client”), for the project “${p.name}”.</p>
    ${c.sections.map((s, i) => html`<h2>${i + 1}. ${s.title}</h2><p class="prose">${s.body}</p>`)}
    <div class="notice" style="margin-top:32px">${c.disclaimer}</div>
    ${c.acceptedAt ? html`<div class="notice notice-ok" style="margin-top:12px"><b>✓ Accepted</b> by ${c.acceptedByName} on ${fmtDateTime(c.acceptedAt)} · fingerprint ${c.fingerprint}</div>` : ''}
  </article>`;
}

export function invoiceDoc(inv) {
  const b = db.get('businesses', inv.businessId);
  const c = clientOf(inv.clientId);
  const p = db.get('projects', inv.projectId);
  const t = invoiceTotals(inv.id);
  return html`<article class="doc">
    <div class="doc-head">${bizHead(b)}<div style="text-align:right">${pill(INVOICE_STATUSES, inv.status)}</div></div>
    <div class="eyebrow">Invoice</div><h1>${inv.number}</h1>
    <div class="grid-2" style="margin-top:24px">
      <dl class="kv" style="grid-template-columns:90px 1fr"><dt>Bill to</dt><dd><b>${c?.company || c?.name}</b>${c?.company ? html`<br>${c.name}` : ''}${c?.email ? html`<br>${c.email}` : ''}</dd><dt>Project</dt><dd>${p?.name}</dd></dl>
      <dl class="kv" style="grid-template-columns:90px 1fr"><dt>Issued</dt><dd>${fmtDate(inv.issueDate)}</dd><dt>Due</dt><dd>${fmtDate(inv.dueDate)}</dd></dl>
    </div>
    <table class="doc-table" style="margin-top:28px"><thead><tr><th>Item</th><th class="r">Qty</th><th class="r">Price</th><th class="r">Amount</th></tr></thead>
      <tbody>${t.items.map((i) => html`<tr><td>${i.description}</td><td class="r num">${i.quantity}</td><td class="r num">${fmtMoney(i.unitPrice, inv.currency)}</td><td class="r num">${fmtMoney(i.quantity * i.unitPrice, inv.currency)}</td></tr>`)}</tbody></table>
    <div class="totals">
      <div><span>Subtotal</span><span class="num">${fmtMoney(t.subtotal, inv.currency)}</span></div>
      ${t.discount ? html`<div><span>Discount</span><span class="num">−${fmtMoney(t.discount, inv.currency)}</span></div>` : ''}
      ${inv.taxRate ? html`<div><span>${inv.taxLabel || 'Tax'} (${inv.taxRate}%)</span><span class="num">${fmtMoney(t.tax, inv.currency)}</span></div>` : ''}
      <div class="grand"><span>Total</span><span class="num">${fmtMoney(t.total, inv.currency)}</span></div>
      <div><span>Paid</span><span class="num">${fmtMoney(t.paid, inv.currency)}</span></div>
      <div style="font-weight:600"><span>Balance due</span><span class="num">${fmtMoney(t.balance, inv.currency)}</span></div>
    </div>
    ${inv.notes ? html`<h2>Payment details</h2><p class="prose">${inv.notes}</p>` : ''}
  </article>`;
}

// ---------------- Proposals ----------------
export function proposalsList() {
  const list = listProposals();
  return html`${pageHead({ title: 'Proposals', sub: 'Draft, send and track proposals. Create one from any project.' })}
    ${list.length ? html`<div class="list"><div class="list-row list-head cols-5"><div>Proposal</div><div>Client</div><div>Status</div><div>Valid until</div><div class="right">Total</div></div>
      ${list.map((x) => html`<a class="list-row cols-5" href="${href(`/proposals/${x.id}`)}"><div><div class="cell-title">${x.title}</div><div class="cell-sub">${x.number}</div></div>
        <div class="hide-sm cell-sub">${clientOf(x.clientId)?.name}</div><div>${pill(PROPOSAL_STATUSES, x.status)}</div><div class="hide-sm cell-sub">${fmtShortDate(x.validUntil)}</div><div class="right num">${fmtMoney(proposalTotal(x.id), x.currency)}</div></a>`)}</div>`
      : empty({ title: 'No proposals yet', body: 'Open a project and create a proposal from its brief.', cta: html`<a class="btn btn-primary" href="${href('/projects')}">Go to projects</a>` })}`;
}

export function proposalDetail(params) {
  const prop = getProposal(params.id);
  const p = db.get('projects', prop.projectId);
  const back = [`/projects/${p.id}/proposal`, p.name];
  if (prop.status !== 'draft') {
    const events = [prop.sentAt && `Sent ${fmtDateTime(prop.sentAt)}`, prop.viewedAt && `Viewed ${fmtDateTime(prop.viewedAt)}`, prop.respondedAt && `${prop.status === 'accepted' ? `Accepted by ${prop.acceptedByName}` : 'Declined'} ${fmtDateTime(prop.respondedAt)}`].filter(Boolean);
    return html`${pageHead({ title: `Proposal ${prop.number}`, back, actions: html`${pill(PROPOSAL_STATUSES, prop.status)}${['rejected', 'expired', 'sent', 'viewed'].includes(prop.status) ? html`<button class="btn btn-secondary" data-action="proposal-revise" data-id="${prop.id}">Revise</button>` : ''}<button class="btn btn-ghost" data-action="print">Print / PDF</button>` })}
      ${events.length ? html`<p class="muted small">${events.join(' · ')}</p>` : ''}
      ${prop.responseNote ? html`<div class="notice notice-warn" style="margin-bottom:16px">Client note: “${prop.responseNote}”</div>` : ''}
      ${prop.status === 'accepted' ? html`<div class="notice notice-ok" style="margin-bottom:16px">Accepted — the contract was issued automatically. <a href="${href(`/projects/${p.id}/contract`)}">View contract</a></div>` : ''}
      ${proposalDoc(prop)}`;
  }
  const items = proposalItems(prop.id);
  const del = listDeliverables(p.id).filter((d) => d.source !== 'change_order');
  return html`${pageHead({ title: `Proposal ${prop.number}`, sub: 'Edit, preview, then send. The client accepts or declines in the portal.', back, actions: html`${pill(PROPOSAL_STATUSES, prop.status)}<button class="btn btn-ghost" data-action="proposal-preview" data-id="${prop.id}">${icon('eye', 16)} Preview</button>` })}
    <form class="card form-grid" data-form="proposal-save" style="max-width:900px">
      <input type="hidden" name="id" value="${prop.id}">
      ${field({ label: 'Project name', name: 'title', value: prop.title, required: true, full: true })}
      <div class="full">${field({ label: 'Introduction', name: 'introduction', type: 'textarea', rows: 4, value: prop.introduction })}
        <button type="button" class="btn btn-ghost btn-sm" data-action="proposal-ai-intro" data-id="${prop.id}" style="margin-top:6px">${icon('sparkles', 14)} Suggest introduction</button></div>
      ${field({ label: 'Objective', name: 'objective', type: 'textarea', rows: 3, value: prop.objective, full: true })}
      <div class="full"><div class="card-head" style="margin:8px 0"><h3>Deliverables (scope)</h3></div>
        <div class="rows" id="prop-del">${(del.length ? del : [{ title: '', quantity: 1 }]).map((d, i) => delRow(d, i))}</div>
        <button type="button" class="btn btn-ghost btn-sm" data-action="prop-add-del" style="margin-top:8px">${icon('plus', 14)} Add deliverable</button></div>
      ${field({ label: 'Not included (one per line)', name: 'exclusions', type: 'textarea', rows: 4, value: (p.exclusions || []).join('\n'), full: true })}
      ${field({ label: 'Timeline', name: 'timeline', value: prop.timeline, placeholder: 'e.g. 14 days' })}
      ${field({ label: 'Revision rounds', name: 'revisions', type: 'number', value: prop.revisions, attrs: 'min="0" max="20"' })}
      <div class="full"><div class="card-head" style="margin:8px 0"><h3>Price</h3></div>
        <div class="rows" id="prop-items"><div class="row-edit row-head"><span>Description</span><span>Qty</span><span>Price (${prop.currency})</span><span></span></div>${items.map((i, n) => itemRow(i, n))}</div>
        <button type="button" class="btn btn-ghost btn-sm" data-action="prop-add-item" style="margin-top:8px">${icon('plus', 14)} Add line</button></div>
      ${field({ label: 'Deposit %', name: 'depositPercent', type: 'number', value: prop.depositPercent, attrs: 'min="0" max="100"' })}
      ${field({ label: 'Valid until', name: 'validUntil', type: 'date', value: prop.validUntil, required: true })}
      ${field({ label: 'Payment terms', name: 'paymentTerms', type: 'textarea', rows: 2, value: prop.paymentTerms, full: true })}
      ${field({ label: 'Notes', name: 'notes', type: 'textarea', rows: 2, value: prop.notes, full: true })}
      <div class="form-actions full"><button class="btn btn-secondary" type="submit" name="intent" value="save">Save draft</button><button class="btn btn-primary" type="submit" name="intent" value="send">Save & send to client</button></div>
    </form>`;
}
const delRow = (d, i) => html`<div class="row-edit two"><input name="deliverables.${i}.title" value="${d.title}" aria-label="Deliverable" placeholder="e.g. Reels (30s)"><input name="deliverables.${i}.quantity" type="number" min="1" value="${d.quantity || 1}" aria-label="Quantity"><button type="button" class="icon-btn" data-action="row-remove" aria-label="Remove">${icon('trash', 16)}</button></div>`;
const itemRow = (i, n) => html`<div class="row-edit"><input name="items.${n}.description" value="${i.description}" aria-label="Description"><input name="items.${n}.quantity" type="number" min="0.01" step="any" value="${i.quantity}" aria-label="Quantity"><input class="price-col" name="items.${n}.unitPrice" type="number" min="0" step="0.01" value="${i.unitPrice}" aria-label="Price"><button type="button" class="icon-btn" data-action="row-remove" aria-label="Remove">${icon('trash', 16)}</button></div>`;
const addRow = (id, fn) => { const el = document.getElementById(id); const n = 100 + el.children.length + Math.floor(Math.random() * 1000); el.insertAdjacentHTML('beforeend', String(fn(n))); el.lastElementChild.querySelector('input').focus(); return false; };

// ---------------- Contracts ----------------
export function contractsList() {
  const list = listContracts();
  return html`${pageHead({ title: 'Contracts', sub: 'Generated from accepted proposals. Adapt the template to your jurisdiction in Settings.' })}
    ${list.length ? html`<div class="list">${list.map((c) => { const p = db.get('projects', c.projectId); return html`<a class="list-row cols-4" href="${href(`/projects/${c.projectId}/contract`)}">
      <div><div class="cell-title">${c.title}</div><div class="cell-sub">${clientOf(c.clientId)?.name}</div></div><div>${pill(CONTRACT_STATUSES, c.status)}</div>
      <div class="hide-sm cell-sub">${c.acceptedAt ? `Accepted ${fmtShortDate(c.acceptedAt)}` : `Issued ${fmtShortDate(c.createdAt)}`}</div><div class="right cell-sub">${p?.name}</div></a>`; })}</div>`
      : empty({ title: 'No contracts yet', body: 'When a client accepts a proposal, the contract is generated from your template and stored with the project.' })}`;
}

// ---------------- Invoices ----------------
export function invoicesList(_, q) {
  const status = q.status || '';
  const list = listInvoices({ status: status || undefined });
  const all = listInvoices();
  const t = totalsFor(all.filter((i) => !['draft', 'cancelled'].includes(i.status)));
  const cur = myBusiness().currency;
  return html`${pageHead({ title: 'Invoices', sub: 'Deposit and final invoices are created from projects.' })}
    <div class="pay-grid" style="margin-bottom:20px"><div><span>Invoiced</span><b>${fmtMoney(t.total, cur)}</b></div><div><span>Paid</span><b>${fmtMoney(t.paid, cur)}</b></div><div><span>Outstanding</span><b>${fmtMoney(t.balance, cur)}</b></div></div>
    <nav class="filters">${[['', 'All'], ['draft', 'Draft'], ['sent', 'Sent'], ['viewed', 'Viewed'], ['partially_paid', 'Partially paid'], ['paid', 'Paid'], ['overdue', 'Overdue'], ['cancelled', 'Cancelled']].map(([id, l]) => html`<a href="${href(`/invoices${id ? `?status=${id}` : ''}`)}" class="${status === id ? 'active' : ''}">${l}</a>`)}</nav>
    ${list.length ? html`<div class="list">${list.map((i) => invoiceRow(i))}</div>` : empty({ title: 'No invoices', body: status ? 'No invoices with this status.' : 'Invoices appear here once a project reaches the deposit or final payment stage.' })}`;
}

export function invoiceDetail(params) {
  const inv = getInvoice(params.id);
  const p = db.get('projects', inv.projectId);
  const t = invoiceTotals(inv.id);
  const pays = db.all('payments', (x) => x.invoiceId === inv.id).sort((a, z) => a.createdAt.localeCompare(z.createdAt));
  const back = [`/projects/${p.id}/invoices`, p.name];
  if (inv.status === 'draft') {
    return html`${pageHead({ title: `Invoice ${inv.number}`, sub: 'Draft — edit and send when ready.', back, actions: html`<button class="btn btn-ghost" data-action="invoice-cancel" data-id="${inv.id}">Cancel invoice</button>` })}
      <form class="card form-grid" data-form="invoice-save" style="max-width:900px"><input type="hidden" name="id" value="${inv.id}">
        ${field({ label: 'Issue date', name: 'issueDate', type: 'date', value: inv.issueDate, required: true })}
        ${field({ label: 'Due date', name: 'dueDate', type: 'date', value: inv.dueDate, required: true })}
        <div class="full"><div class="rows" id="inv-items"><div class="row-edit row-head"><span>Description</span><span>Qty</span><span>Price (${inv.currency})</span><span></span></div>${t.items.map((i, n) => itemRow(i, n))}</div>
          <button type="button" class="btn btn-ghost btn-sm" data-action="inv-add-item" style="margin-top:8px">${icon('plus', 14)} Add line</button></div>
        ${field({ label: `Discount (${inv.currency})`, name: 'discount', type: 'number', value: inv.discount, attrs: 'min="0" step="0.01"' })}
        ${field({ label: `${inv.taxLabel || 'Tax'} rate %`, name: 'taxRate', type: 'number', value: inv.taxRate, attrs: 'min="0" max="100" step="0.01"' })}
        ${field({ label: 'Payment details / notes', name: 'notes', type: 'textarea', rows: 3, value: inv.notes, full: true })}
        <div class="form-actions full"><button class="btn btn-secondary" type="submit" name="intent" value="save">Save draft</button><button class="btn btn-primary" type="submit" name="intent" value="send">Save & send</button></div>
      </form>`;
  }
  const reported = pays.filter((x) => x.status === 'reported');
  return html`${pageHead({ title: `Invoice ${inv.number}`, back, actions: html`
      ${!['paid', 'cancelled'].includes(inv.status) ? html`<button class="btn btn-primary" data-action="payment-new" data-id="${inv.id}">Record payment</button>` : ''}
      <button class="btn btn-ghost" data-action="print">Print / PDF</button>
      ${!['paid', 'cancelled'].includes(inv.status) && !pays.some((x) => x.status === 'confirmed') ? html`<button class="btn btn-ghost" data-action="invoice-cancel" data-id="${inv.id}">Cancel</button>` : ''}` })}
    ${reported.map((x) => html`<div class="notice notice-warn" style="margin-bottom:12px;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center"><span>The client reported a payment of <b>${fmtMoney(x.amount, inv.currency)}</b> (${x.method}${x.reference ? `, ref ${x.reference}` : ''}) on ${fmtShortDate(x.createdAt)}. Confirm it once it arrives.</span>
      <span class="btn-row"><button class="btn btn-sm btn-primary" data-action="payment-confirm" data-id="${x.id}">Confirm received</button><button class="btn btn-sm btn-ghost" data-action="payment-reject" data-id="${x.id}">Not received</button></span></div>`)}
    <div class="grid-main">
      ${invoiceDoc(inv)}
      <aside class="stack">
        <div class="card"><h2 style="margin-bottom:8px">Status</h2>${pill(INVOICE_STATUSES, inv.status)}
          <dl class="kv" style="grid-template-columns:80px 1fr;margin-top:12px"><dt>Sent</dt><dd>${inv.sentAt ? fmtDateTime(inv.sentAt) : '—'}</dd><dt>Viewed</dt><dd>${inv.viewedAt ? fmtDateTime(inv.viewedAt) : '—'}</dd><dt>Balance</dt><dd class="num">${fmtMoney(t.balance, inv.currency)}</dd></dl></div>
        <div class="card"><h2 style="margin-bottom:8px">Payments</h2>
          ${pays.filter((x) => x.status !== 'reported').length ? html`<ul class="timeline">${pays.filter((x) => x.status !== 'reported').map((x) => html`<li style="grid-template-columns:1fr auto"><div>${x.method}${x.reference ? html` · <span class="muted">${x.reference}</span>` : ''}<div class="who">${fmtDate(x.paidAt)}${x.status === 'rejected' ? ' · rejected' : ''}</div></div><div class="num" style="${x.status === 'rejected' ? 'text-decoration:line-through;color:var(--muted)' : ''}">${fmtMoney(x.amount, inv.currency)}</div></li>`)}</ul>` : html`<p class="muted small">No payments yet.</p>`}
          <p class="small muted" style="margin-top:12px">Online card payments ${raw('<span class="soon">Coming Soon</span>')} — record bank transfers and cash here.</p></div>
      </aside>
    </div>`;
}

function paymentModal(inv) {
  const t = invoiceTotals(inv.id);
  return html`${modalHead('Record payment', `Invoice ${inv.number} · balance ${fmtMoney(t.balance, inv.currency)}`)}
    <form class="form-grid" data-form="payment-create"><input type="hidden" name="id" value="${inv.id}">
      ${field({ label: `Amount (${inv.currency})`, name: 'amount', type: 'number', value: t.balance, required: true, attrs: 'min="0.01" step="0.01" inputmode="decimal"' })}
      ${field({ label: 'Date received', name: 'paidAt', type: 'date', value: todayISO(), required: true })}
      ${field({ label: 'Method', name: 'method', type: 'select', options: PAYMENT_METHODS })}
      ${field({ label: 'Reference', name: 'reference', placeholder: 'Transfer reference' })}
      <div class="form-actions full"><button type="button" class="btn btn-ghost" data-action="modal-close">Cancel</button><button class="btn btn-primary" type="submit">Record payment</button></div></form>`;
}

// ---------------- Payments ----------------
export function paymentsList() {
  const list = listPayments();
  const cur = myBusiness().currency;
  return html`${pageHead({ title: 'Payments', sub: 'Every payment recorded against your invoices.' })}
    <div class="notice" style="margin-bottom:16px">Payment providers: ${Object.values(gateways).map((g) => html`<b>${g.label}</b> ${g.available ? '(active)' : raw('<span class="soon">Coming Soon</span>')} · `)}The system is ready to connect a gateway later; today payments are recorded manually or reported by clients.</div>
    ${list.length ? html`<div class="list"><div class="list-row list-head cols-5"><div>Invoice</div><div>Client</div><div>Date</div><div>Status</div><div class="right">Amount</div></div>
      ${list.map((x) => { const inv = db.get('invoices', x.invoiceId); return html`<a class="list-row cols-5" href="${href(`/invoices/${inv.id}`)}"><div><div class="cell-title">${inv.number}</div><div class="cell-sub">${x.method}${x.reference ? ` · ${x.reference}` : ''}</div></div>
        <div class="hide-sm cell-sub">${clientOf(inv.clientId)?.name}</div><div class="hide-sm cell-sub">${fmtShortDate(x.paidAt)}</div><div>${pill({ confirmed: { label: 'Received', tone: 'green' }, reported: { label: 'Reported by client', tone: 'amber' }, rejected: { label: 'Rejected', tone: 'neutral' } }, x.status)}</div><div class="right num">${fmtMoney(x.amount, inv.currency || cur)}</div></a>`; })}</div>`
      : empty({ title: 'No payments yet', body: 'Payments you record — and payments clients report — appear here.' })}`;
}

// ---------------- Handlers ----------------
onAction({
  'prop-add-del': () => addRow('prop-del', (n) => delRow({ title: '', quantity: 1 }, n)),
  'prop-add-item': () => addRow('prop-items', (n) => itemRow({ description: '', quantity: 1, unitPrice: 0 }, n)),
  'inv-add-item': () => addRow('inv-items', (n) => itemRow({ description: '', quantity: 1, unitPrice: 0 }, n)),
  'proposal-preview': (el) => { openModal(html`${modalHead('Client preview')}${proposalDoc(getProposal(el.dataset.id))}`, { size: 'lg' }); return false; },
  'proposal-revise': async (el) => {
    if (!(await confirmDialog({ title: 'Revise proposal?', body: 'The proposal returns to draft. The client will not see it until you send it again.', confirm: 'Revise' }))) return false;
    reviseProposal(el.dataset.id);
  },
  'proposal-ai-intro': async (el) => {
    const prop = getProposal(el.dataset.id);
    const p = db.get('projects', prop.projectId);
    const r = await runAI('proposal', { ctx: { name: prop.title, objective: prop.objective, deliverables: listDeliverables(p.id).map((d) => ({ title: d.title, quantity: d.quantity })), revisions: prop.revisions, client: clientOf(p.clientId)?.company || clientOf(p.clientId)?.name } });
    const ta = document.querySelector('textarea[name=introduction]');
    openModal(html`${modalHead('Suggested introduction', 'Review and edit. Nothing changes until you click Use this.')}<textarea id="ai-intro" class="ai-out" rows="8" aria-label="Suggested introduction">${r.text}</textarea>
      <div class="modal-actions"><button class="btn btn-ghost" data-action="modal-close">Discard</button><button class="btn btn-primary" data-action="use-ai-intro">Use this</button></div>`);
    window.__introTarget = ta;
    return false;
  },
  'use-ai-intro': () => { const v = document.getElementById('ai-intro').value; if (window.__introTarget) { window.__introTarget.value = v; window.__introTarget.dispatchEvent(new Event('input', { bubbles: true })); } closeModal(); toast('Introduction inserted — save to keep it.'); return false; },
  'invoice-cancel': async (el) => { if (await confirmDialog({ title: 'Cancel invoice?', body: 'The invoice is kept for your records but marked Cancelled.', confirm: 'Cancel invoice', tone: 'danger' })) { cancelInvoice(el.dataset.id); toast('Invoice cancelled.'); } },
  'payment-new': (el) => { openModal(paymentModal(getInvoice(el.dataset.id))); return false; },
  'payment-confirm': (el) => { confirmPayment(el.dataset.id); toast('Payment confirmed.'); },
  'payment-reject': async (el) => { if (await confirmDialog({ title: 'Mark as not received?', body: 'The reported payment is rejected and the balance stays due.', confirm: 'Reject' })) rejectPayment(el.dataset.id); },
});

onForm({
  'proposal-save': (v, form, submitter) => {
    updateProposal(v.id, v);
    if (submitter?.value === 'send') {
      sendProposal(v.id);
      toast('Proposal sent. You will be notified when the client responds.');
    } else toast('Draft saved.');
  },
  'invoice-save': (v, form, submitter) => {
    updateInvoice(v.id, v);
    if (submitter?.value === 'send') { sendInvoice(v.id); toast('Invoice sent.'); } else toast('Draft saved.');
  },
  'payment-create': (v) => { recordPayment(v.id, v); closeModal(); toast('Payment recorded.'); },
});
export { go };
