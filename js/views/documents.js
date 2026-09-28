// Proposals, contracts, invoices, payments: lists, editors and printable documents
// (the document renderers are shared with the client portal). Documents are
// always written in the client's language, whoever is looking at them.
import { html, raw, icon, href, pill, empty, pageHead, field, onAction, onForm, go, toast, openModal, closeModal, modalHead, confirmDialog, comingSoon, successCard } from '../ui.js';
import { db } from '../core/store.js';
import { t, tl, LANGS } from '../core/i18n.js';
import { fmtMoney, fmtDate, fmtShortDate, fmtDateTime, todayISO } from '../core/util.js';
import { PAYMENT_METHODS, gateways } from '../core/payments.js';
import { runAI } from '../core/ai.js';
import { myBusiness, clientLang } from '../services/context.js';
import { listDeliverables, proposalTotal, invoiceTotals } from '../services/core.js';
import { listProposals, getProposal, proposalItems, updateProposal, sendProposal, reviseProposal, listContracts } from '../services/workflow.js';
import { listInvoices, getInvoice, updateInvoice, sendInvoice, cancelInvoice, recordPayment, confirmPayment, rejectPayment, listPayments, totalsFor } from '../services/billing.js';
import { PROPOSAL_STATUSES, CONTRACT_STATUSES, INVOICE_STATUSES } from '../services/constants.js';
import { invoiceRow } from './projects.js';

const clientOf = (id) => db.get('clients', id);
const docAttrs = (L) => raw(`lang="${L}" dir="${LANGS[L].dir}"`);
const bizHead = (b) => html`<div class="btn-row">${b.logo ? html`<img class="doc-logo" src="${b.logo}" alt="">` : ''}<div><b>${b.name}</b>${b.address ? html`<div class="small muted prose">${b.address}</div>` : ''}</div></div>`;
const docPill = (map, status, L) => { const s = map[status] || { label: status, tone: 'neutral' }; return html`<span class="pill pill-${s.tone}"><span class="dot" aria-hidden="true"></span>${tl(L, s.label)}</span>`; };

// ---------------- Shared document renderers ----------------
export function proposalDoc(prop) {
  const b = db.get('businesses', prop.businessId);
  const p = db.get('projects', prop.projectId);
  const c = clientOf(prop.clientId);
  const L = clientLang(p);
  const T = (s, v) => tl(L, s, v);
  const items = proposalItems(prop.id);
  const total = proposalTotal(prop.id);
  const del = listDeliverables(p.id).filter((d) => d.source !== 'change_order');
  const deposit = Math.round(total * prop.depositPercent) / 100;
  const M = (n) => fmtMoney(n, prop.currency, L);
  return html`<article class="doc" ${docAttrs(L)}>
    <div class="doc-head">${bizHead(b)}<div class="small muted" style="text-align:end">${T('Proposal {number}', { number: prop.number })}<br>${T('Valid until {date}', { date: fmtDate(prop.validUntil, undefined, L) })}</div></div>
    <div class="eyebrow">${T('Prepared for {client}', { client: c?.company || c?.name })}</div>
    <h1>${prop.title}</h1>
    ${prop.introduction ? html`<p class="lead prose" style="margin-top:16px">${prop.introduction}</p>` : ''}
    ${prop.objective ? html`<h2>${T('Objective')}</h2><p class="prose">${prop.objective}</p>` : ''}
    <h2>${T('Scope')}</h2>
    <div class="scope-cols">
      <div><b class="small">${T('Included')}</b><ul class="scope-list in">${del.map((d) => html`<li>${icon('check', 16)}<span>${d.quantity} × ${d.title}</span></li>`)}<li>${icon('check', 16)}<span>${T('{n} revision round(s)', { n: prop.revisions })}</span></li></ul></div>
      <div><b class="small">${T('Not included')}</b><ul class="scope-list out">${(p.exclusions || []).map((x) => html`<li>${icon('x', 16)}<span>${x}</span></li>`)}</ul></div>
    </div>
    <h2>${T('Timeline')}</h2><p>${prop.timeline || '—'}${p.deadline ? ` · ${T('target delivery {date}', { date: fmtDate(p.deadline, undefined, L) })}` : ''}</p>
    <h2>${T('Investment')}</h2>
    <table class="doc-table"><thead><tr><th>${T('Item')}</th><th class="r">${T('Qty')}</th><th class="r">${T('Price')}</th><th class="r">${T('Amount')}</th></tr></thead>
      <tbody>${items.map((i) => html`<tr><td>${i.description}</td><td class="r num">${i.quantity}</td><td class="r num">${M(i.unitPrice)}</td><td class="r num">${M(i.quantity * i.unitPrice)}</td></tr>`)}</tbody></table>
    <div class="totals"><div class="grand"><span>${T('Total')}</span><span class="num">${M(total)}</span></div>
      ${prop.depositPercent ? html`<div><span>${T('Deposit ({n}%)', { n: prop.depositPercent })}</span><span class="num">${M(deposit)}</span></div>` : ''}</div>
    ${prop.paymentTerms ? html`<h2>${T('Payment terms')}</h2><p class="prose">${prop.paymentTerms}</p>` : ''}
    ${prop.notes ? html`<h2>${T('Notes')}</h2><p class="prose">${prop.notes}</p>` : ''}
  </article>`;
}

export function contractDoc(c, p) {
  const b = db.get('businesses', c.businessId);
  const L = c.lang || clientLang(p);
  const T = (s, v) => tl(L, s, v);
  return html`<article class="doc" ${docAttrs(L)}>
    <div class="doc-head">${bizHead(b)}<div class="small muted" style="text-align:end">${fmtDate(c.createdAt, undefined, L)}</div></div>
    <h1>${c.title}</h1>
    <p class="muted" style="margin-top:12px">${raw(T('Between {freelancer} (“the Freelancer”) and {client} (“the Client”), for the project “{project}”.', { freelancer: `<b>${escapeText(c.parties.freelancer)}</b>`, client: `<b>${escapeText(c.parties.client)}</b>`, project: escapeText(p.name) }))}</p>
    ${c.sections.map((s, i) => html`<h2>${i + 1}. ${s.title}</h2><p class="prose">${s.body}</p>`)}
    <div class="notice" style="margin-top:32px">${c.disclaimer}</div>
    ${c.acceptedAt ? html`<div class="notice notice-ok" style="margin-top:12px">${T('✓ Accepted by {name} on {date} · fingerprint {fp}', { name: c.acceptedByName, date: fmtDateTime(c.acceptedAt, L), fp: c.fingerprint })}</div>` : ''}
  </article>`;
}
function escapeText(s) { return String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); }

export function invoiceDoc(inv) {
  const b = db.get('businesses', inv.businessId);
  const c = clientOf(inv.clientId);
  const p = db.get('projects', inv.projectId);
  const L = clientLang(p);
  const T = (s, v) => tl(L, s, v);
  const tot = invoiceTotals(inv.id);
  const M = (n) => fmtMoney(n, inv.currency, L);
  return html`<article class="doc" ${docAttrs(L)}>
    <div class="doc-head">${bizHead(b)}<div style="text-align:end">${docPill(INVOICE_STATUSES, inv.status, L)}</div></div>
    <div class="eyebrow">${T('Invoice')}</div><h1>${inv.number}</h1>
    <div class="grid-2" style="margin-top:24px">
      <dl class="kv" style="grid-template-columns:90px 1fr"><dt>${T('Bill to')}</dt><dd><b>${c?.company || c?.name}</b>${c?.company ? html`<br>${c.name}` : ''}${c?.email ? html`<br><span dir="ltr">${c.email}</span>` : ''}</dd><dt>${T('Project')}</dt><dd>${p?.name}</dd></dl>
      <dl class="kv" style="grid-template-columns:90px 1fr"><dt>${T('Issued')}</dt><dd>${fmtDate(inv.issueDate, undefined, L)}</dd><dt>${T('Due')}</dt><dd>${fmtDate(inv.dueDate, undefined, L)}</dd></dl>
    </div>
    <table class="doc-table" style="margin-top:28px"><thead><tr><th>${T('Item')}</th><th class="r">${T('Qty')}</th><th class="r">${T('Price')}</th><th class="r">${T('Amount')}</th></tr></thead>
      <tbody>${tot.items.map((i) => html`<tr><td>${i.description}</td><td class="r num">${i.quantity}</td><td class="r num">${M(i.unitPrice)}</td><td class="r num">${M(i.quantity * i.unitPrice)}</td></tr>`)}</tbody></table>
    <div class="totals">
      <div><span>${T('Subtotal')}</span><span class="num">${M(tot.subtotal)}</span></div>
      ${tot.discount ? html`<div><span>${T('Discount')}</span><span class="num">−${M(tot.discount)}</span></div>` : ''}
      ${inv.taxRate ? html`<div><span>${inv.taxLabel || T('Tax')} (${inv.taxRate}%)</span><span class="num">${M(tot.tax)}</span></div>` : ''}
      <div class="grand"><span>${T('Total')}</span><span class="num">${M(tot.total)}</span></div>
      <div><span>${T('Paid')}</span><span class="num">${M(tot.paid)}</span></div>
      <div style="font-weight:600"><span>${T('Balance due')}</span><span class="num">${M(tot.balance)}</span></div>
    </div>
    ${inv.notes ? html`<h2>${T('Payment details')}</h2><p class="prose">${inv.notes}</p>` : ''}
  </article>`;
}

// ---------------- Proposals ----------------
export function proposalsList() {
  const list = listProposals();
  return html`${pageHead({ title: t('Proposals'), sub: t('Draft, send and track proposals. Create one from any project.') })}
    ${list.length ? html`<div class="list"><div class="list-row list-head cols-5"><div>${t('Proposal')}</div><div>${t('Client')}</div><div>${t('Status')}</div><div>${t('Valid until')}</div><div class="right">${t('Total')}</div></div>
      ${list.map((x) => html`<a class="list-row cols-5" href="${href(`/proposals/${x.id}`)}"><div><div class="cell-title">${x.title}</div><div class="cell-sub">${x.number}</div></div>
        <div class="hide-sm cell-sub">${clientOf(x.clientId)?.name}</div><div>${pill(PROPOSAL_STATUSES, x.status)}</div><div class="hide-sm cell-sub">${fmtShortDate(x.validUntil)}</div><div class="right num">${fmtMoney(proposalTotal(x.id), x.currency)}</div></a>`)}</div>`
      : empty({ title: t('No proposals yet'), body: t('Open a project and create a proposal from its brief.'), cta: html`<a class="btn btn-primary" href="${href('/projects')}">${t('Go to projects')}</a>` })}`;
}

export function proposalDetail(params) {
  const prop = getProposal(params.id);
  const p = db.get('projects', prop.projectId);
  const back = [`/projects/${p.id}/proposal`, p.name];
  const L = clientLang(p);
  if (prop.status !== 'draft') {
    const events = [prop.sentAt && t('Sent {date}', { date: fmtDateTime(prop.sentAt) }), prop.viewedAt && t('Viewed {date}', { date: fmtDateTime(prop.viewedAt) }), prop.respondedAt && (prop.status === 'accepted' ? t('Accepted by {name} {date}', { name: prop.acceptedByName, date: fmtDateTime(prop.respondedAt) }) : t('Declined {date}', { date: fmtDateTime(prop.respondedAt) }))].filter(Boolean);
    return html`${pageHead({ title: t('Proposal {number}', { number: prop.number }), back, actions: html`${pill(PROPOSAL_STATUSES, prop.status)}${['rejected', 'expired', 'sent', 'viewed'].includes(prop.status) ? html`<button class="btn btn-secondary" data-action="proposal-revise" data-id="${prop.id}">${t('Revise')}</button>` : ''}<button class="btn btn-ghost" data-action="print">${t('Print / PDF')}</button>` })}
      ${events.length ? html`<p class="muted small">${events.join(' · ')}</p>` : ''}
      ${prop.responseNote ? html`<div class="notice notice-warn" style="margin-bottom:16px">${t('Client note: “{note}”', { note: prop.responseNote })}</div>` : ''}
      ${prop.status === 'accepted' ? html`<div class="notice notice-ok" style="margin-bottom:16px">${t('Accepted — the contract was issued automatically.')} <a href="${href(`/projects/${p.id}/contract`)}">${t('View contract')}</a></div>` : ''}
      ${proposalDoc(prop)}`;
  }
  const items = proposalItems(prop.id);
  const del = listDeliverables(p.id).filter((d) => d.source !== 'change_order');
  return html`${pageHead({ title: t('Proposal {number}', { number: prop.number }), sub: t('Edit, preview, then send. The client accepts or declines in the portal.'), back, actions: html`${pill(PROPOSAL_STATUSES, prop.status)}<button class="btn btn-ghost" data-action="proposal-preview" data-id="${prop.id}">${icon('eye', 16)} ${t('Preview')}</button>` })}
    <div class="notice small" style="max-width:900px;margin-bottom:12px">${t('The client reads this proposal in {language}. Write the text in that language.', { language: LANGS[L].label })}</div>
    <form class="card form-grid" data-form="proposal-save" style="max-width:900px" ${docAttrs(L)}>
      <input type="hidden" name="id" value="${prop.id}">
      ${field({ label: t('Project name'), name: 'title', value: prop.title, required: true, full: true })}
      <div class="full">${field({ label: t('Introduction'), name: 'introduction', type: 'textarea', rows: 4, value: prop.introduction })}
        <button type="button" class="btn btn-ghost btn-sm" data-action="proposal-ai-intro" data-id="${prop.id}" style="margin-top:6px">${icon('sparkles', 14)} ${t('Suggest introduction')}</button></div>
      ${field({ label: t('Objective'), name: 'objective', type: 'textarea', rows: 3, value: prop.objective, full: true })}
      <div class="full"><div class="card-head" style="margin:8px 0"><h3>${t('Deliverables (scope)')}</h3></div>
        <div class="rows" id="prop-del">${(del.length ? del : [{ title: '', quantity: 1 }]).map((d, i) => delRow(d, i))}</div>
        <button type="button" class="btn btn-ghost btn-sm" data-action="prop-add-del" style="margin-top:8px">${icon('plus', 14)} ${t('Add deliverable')}</button></div>
      ${field({ label: t('Not included (one per line)'), name: 'exclusions', type: 'textarea', rows: 4, value: (p.exclusions || []).join('\n'), full: true })}
      ${field({ label: t('Timeline'), name: 'timeline', value: prop.timeline, placeholder: t('e.g. 14 days') })}
      ${field({ label: t('Revision rounds'), name: 'revisions', type: 'number', value: prop.revisions, attrs: 'min="0" max="20"' })}
      <div class="full"><div class="card-head" style="margin:8px 0"><h3>${t('Price')}</h3></div>
        <div class="rows" id="prop-items"><div class="row-edit row-head"><span>${t('Description')}</span><span>${t('Qty')}</span><span>${t('Price ({currency})', { currency: prop.currency })}</span><span></span></div>${items.map((i, n) => itemRow(i, n))}</div>
        <button type="button" class="btn btn-ghost btn-sm" data-action="prop-add-item" style="margin-top:8px">${icon('plus', 14)} ${t('Add line')}</button></div>
      ${field({ label: t('Deposit %'), name: 'depositPercent', type: 'number', value: prop.depositPercent, attrs: 'min="0" max="100"' })}
      ${field({ label: t('Valid until'), name: 'validUntil', type: 'date', value: prop.validUntil, required: true })}
      ${field({ label: t('Payment terms'), name: 'paymentTerms', type: 'textarea', rows: 2, value: prop.paymentTerms, full: true })}
      ${field({ label: t('Notes'), name: 'notes', type: 'textarea', rows: 2, value: prop.notes, full: true })}
      <div class="form-actions full"><button class="btn btn-secondary" type="submit" name="intent" value="save">${t('Save draft')}</button><button class="btn btn-primary" type="submit" name="intent" value="send">${t('Save & send to client')}</button></div>
    </form>`;
}
const delRow = (d, i) => html`<div class="row-edit two"><input name="deliverables.${i}.title" value="${d.title}" aria-label="${t('Deliverable')}" placeholder="${t('e.g. Reels (30s)')}"><input name="deliverables.${i}.quantity" type="number" min="1" value="${d.quantity || 1}" aria-label="${t('Quantity')}"><button type="button" class="icon-btn" data-action="row-remove" aria-label="${t('Remove')}">${icon('trash', 16)}</button></div>`;
const itemRow = (i, n) => html`<div class="row-edit"><input name="items.${n}.description" value="${i.description}" aria-label="${t('Description')}"><input name="items.${n}.quantity" type="number" min="0.01" step="any" value="${i.quantity}" aria-label="${t('Quantity')}"><input class="price-col" name="items.${n}.unitPrice" type="number" min="0" step="0.01" value="${i.unitPrice}" aria-label="${t('Price')}"><button type="button" class="icon-btn" data-action="row-remove" aria-label="${t('Remove')}">${icon('trash', 16)}</button></div>`;
const addRow = (id, fn) => { const el = document.getElementById(id); const n = 100 + el.children.length + Math.floor(Math.random() * 1000); el.insertAdjacentHTML('beforeend', String(fn(n))); el.lastElementChild.querySelector('input').focus(); return false; };

// ---------------- Contracts ----------------
export function contractsList() {
  const list = listContracts();
  return html`${pageHead({ title: t('Contracts'), sub: t('Generated from accepted proposals. Adapt the template to your jurisdiction in Settings.') })}
    ${list.length ? html`<div class="list">${list.map((c) => { const p = db.get('projects', c.projectId); return html`<a class="list-row cols-4" href="${href(`/projects/${c.projectId}/contract`)}">
      <div><div class="cell-title">${c.title}</div><div class="cell-sub">${clientOf(c.clientId)?.name}</div></div><div>${pill(CONTRACT_STATUSES, c.status)}</div>
      <div class="hide-sm cell-sub">${c.acceptedAt ? t('Accepted {date}', { date: fmtShortDate(c.acceptedAt) }) : t('Issued {date}', { date: fmtShortDate(c.createdAt) })}</div><div class="right cell-sub">${p?.name}</div></a>`; })}</div>`
      : empty({ title: t('No contracts yet'), body: t('When a client accepts a proposal, the contract is generated from your template and stored with the project.') })}`;
}

// ---------------- Invoices ----------------
export function invoicesList(_, q) {
  const status = q.status || '';
  const list = listInvoices({ status: status || undefined });
  const all = listInvoices();
  const tot = totalsFor(all.filter((i) => !['draft', 'cancelled'].includes(i.status)));
  const cur = myBusiness().currency;
  return html`${pageHead({ title: t('Invoices'), sub: t('Deposit and final invoices are created from projects.') })}
    <div class="pay-grid" style="margin-bottom:20px"><div><span>${t('Invoiced')}</span><b>${fmtMoney(tot.total, cur)}</b></div><div><span>${t('Paid')}</span><b>${fmtMoney(tot.paid, cur)}</b></div><div><span>${t('Outstanding')}</span><b>${fmtMoney(tot.balance, cur)}</b></div></div>
    <nav class="filters">${[['', 'All'], ['draft', 'Draft'], ['sent', 'Sent'], ['viewed', 'Viewed'], ['partially_paid', 'Partially Paid'], ['paid', 'Paid'], ['overdue', 'Overdue'], ['cancelled', 'Cancelled']].map(([id, l]) => html`<a href="${href(`/invoices${id ? `?status=${id}` : ''}`)}" class="${status === id ? 'active' : ''}">${t(l)}</a>`)}</nav>
    ${list.length ? html`<div class="list">${list.map((i) => invoiceRow(i))}</div>` : empty({ title: t('No invoices'), body: status ? t('No invoices with this status.') : t('Invoices appear here once a project reaches the deposit or final payment stage.') })}`;
}

export function invoiceDetail(params) {
  const inv = getInvoice(params.id);
  const p = db.get('projects', inv.projectId);
  const tot = invoiceTotals(inv.id);
  const pays = db.all('payments', (x) => x.invoiceId === inv.id).sort((a, z) => a.createdAt.localeCompare(z.createdAt));
  const back = [`/projects/${p.id}/invoices`, p.name];
  if (inv.status === 'draft') {
    const L = clientLang(p);
    return html`${pageHead({ title: t('Invoice {number}', { number: inv.number }), sub: t('Draft — edit and send when ready.'), back, actions: html`<button class="btn btn-ghost" data-action="invoice-cancel" data-id="${inv.id}">${t('Cancel invoice')}</button>` })}
      <form class="card form-grid" data-form="invoice-save" style="max-width:900px" ${docAttrs(L)}><input type="hidden" name="id" value="${inv.id}">
        ${field({ label: t('Issue date'), name: 'issueDate', type: 'date', value: inv.issueDate, required: true })}
        ${field({ label: t('Due date'), name: 'dueDate', type: 'date', value: inv.dueDate, required: true })}
        <div class="full"><div class="rows" id="inv-items"><div class="row-edit row-head"><span>${t('Description')}</span><span>${t('Qty')}</span><span>${t('Price ({currency})', { currency: inv.currency })}</span><span></span></div>${tot.items.map((i, n) => itemRow(i, n))}</div>
          <button type="button" class="btn btn-ghost btn-sm" data-action="inv-add-item" style="margin-top:8px">${icon('plus', 14)} ${t('Add line')}</button></div>
        ${field({ label: t('Discount ({currency})', { currency: inv.currency }), name: 'discount', type: 'number', value: inv.discount, attrs: 'min="0" step="0.01"' })}
        ${field({ label: t('{label} rate %', { label: inv.taxLabel || t('Tax') }), name: 'taxRate', type: 'number', value: inv.taxRate, attrs: 'min="0" max="100" step="0.01"' })}
        ${field({ label: t('Payment details / notes'), name: 'notes', type: 'textarea', rows: 3, value: inv.notes, full: true })}
        <div class="form-actions full"><button class="btn btn-secondary" type="submit" name="intent" value="save">${t('Save draft')}</button><button class="btn btn-primary" type="submit" name="intent" value="send">${t('Save & send')}</button></div>
      </form>`;
  }
  const reported = pays.filter((x) => x.status === 'reported');
  return html`${pageHead({ title: t('Invoice {number}', { number: inv.number }), back, actions: html`
      ${!['paid', 'cancelled'].includes(inv.status) ? html`<button class="btn btn-primary" data-action="payment-new" data-id="${inv.id}">${t('Record payment')}</button>` : ''}
      <button class="btn btn-ghost" data-action="print">${t('Print / PDF')}</button>
      ${!['paid', 'cancelled'].includes(inv.status) && !pays.some((x) => x.status === 'confirmed') ? html`<button class="btn btn-ghost" data-action="invoice-cancel" data-id="${inv.id}">${t('Cancel')}</button>` : ''}` })}
    ${reported.map((x) => html`<div class="notice notice-warn" style="margin-bottom:12px;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center"><span>${t('The client reported a payment of {amount} ({method}{ref}) on {date}. Confirm it once it arrives.', { amount: fmtMoney(x.amount, inv.currency), method: t(x.method), ref: x.reference ? `, ${t('ref {ref}', { ref: x.reference })}` : '', date: fmtShortDate(x.createdAt) })}</span>
      <span class="btn-row"><button class="btn btn-sm btn-primary" data-action="payment-confirm" data-id="${x.id}">${t('Confirm received')}</button><button class="btn btn-sm btn-ghost" data-action="payment-reject" data-id="${x.id}">${t('Not received')}</button></span></div>`)}
    <div class="grid-main">
      ${invoiceDoc(inv)}
      <aside class="stack">
        <div class="card"><h2 style="margin-bottom:8px">${t('Status')}</h2>${pill(INVOICE_STATUSES, inv.status)}
          <dl class="kv" style="grid-template-columns:80px 1fr;margin-top:12px"><dt>${t('Sent')}</dt><dd>${inv.sentAt ? fmtDateTime(inv.sentAt) : '—'}</dd><dt>${t('Viewed')}</dt><dd>${inv.viewedAt ? fmtDateTime(inv.viewedAt) : '—'}</dd><dt>${t('Balance')}</dt><dd class="num">${fmtMoney(tot.balance, inv.currency)}</dd></dl></div>
        <div class="card"><h2 style="margin-bottom:8px">${t('Payments')}</h2>
          ${pays.filter((x) => x.status !== 'reported').length ? html`<ul class="timeline">${pays.filter((x) => x.status !== 'reported').map((x) => html`<li style="grid-template-columns:1fr auto"><div>${t(x.method)}${x.reference ? html` · <span class="muted">${x.reference}</span>` : ''}<div class="who">${fmtDate(x.paidAt)}${x.status === 'rejected' ? ` · ${t('rejected')}` : ''}</div></div><div class="num" style="${x.status === 'rejected' ? 'text-decoration:line-through;color:var(--muted)' : ''}">${fmtMoney(x.amount, inv.currency)}</div></li>`)}</ul>` : html`<p class="muted small">${t('No payments yet.')}</p>`}
          <p class="small muted" style="margin-top:12px">${t('Online card payments')} ${comingSoon()} — ${t('record bank transfers and cash here.')}</p></div>
      </aside>
    </div>`;
}

function paymentModal(inv) {
  const tot = invoiceTotals(inv.id);
  return html`${modalHead(t('Record payment'), t('Invoice {number} · balance {amount}', { number: inv.number, amount: fmtMoney(tot.balance, inv.currency) }))}
    <form class="form-grid" data-form="payment-create"><input type="hidden" name="id" value="${inv.id}">
      ${field({ label: t('Amount ({currency})', { currency: inv.currency }), name: 'amount', type: 'number', value: tot.balance, required: true, attrs: 'min="0.01" step="0.01" inputmode="decimal"' })}
      ${field({ label: t('Date received'), name: 'paidAt', type: 'date', value: todayISO(), required: true })}
      ${field({ label: t('Method'), name: 'method', type: 'select', options: PAYMENT_METHODS.map((m) => [m, t(m)]) })}
      ${field({ label: t('Reference'), name: 'reference', placeholder: t('Transfer reference') })}
      <div class="form-actions full"><button type="button" class="btn btn-ghost" data-action="modal-close">${t('Cancel')}</button><button class="btn btn-primary" type="submit">${t('Record payment')}</button></div></form>`;
}

// ---------------- Payments ----------------
const PAYMENT_STATES = { confirmed: { label: 'Received', tone: 'green' }, reported: { label: 'Reported by client', tone: 'amber' }, rejected: { label: 'Rejected', tone: 'neutral' } };
export function paymentsList() {
  const list = listPayments();
  const cur = myBusiness().currency;
  return html`${pageHead({ title: t('Payments'), sub: t('Every payment recorded against your invoices.') })}
    <div class="notice" style="margin-bottom:16px">${t('Payment providers:')} ${Object.values(gateways).map((g) => html`<b>${t(g.label)}</b> ${g.available ? `(${t('active')})` : comingSoon()} · `)}${t('The system is ready to connect a gateway later; today payments are recorded manually or reported by clients.')}</div>
    ${list.length ? html`<div class="list"><div class="list-row list-head cols-5"><div>${t('Invoice')}</div><div>${t('Client')}</div><div>${t('Date')}</div><div>${t('Status')}</div><div class="right">${t('Amount')}</div></div>
      ${list.map((x) => { const inv = db.get('invoices', x.invoiceId); return html`<a class="list-row cols-5" href="${href(`/invoices/${inv.id}`)}"><div><div class="cell-title">${inv.number}</div><div class="cell-sub">${t(x.method)}${x.reference ? ` · ${x.reference}` : ''}</div></div>
        <div class="hide-sm cell-sub">${clientOf(inv.clientId)?.name}</div><div class="hide-sm cell-sub">${fmtShortDate(x.paidAt)}</div><div>${pill(PAYMENT_STATES, x.status)}</div><div class="right num">${fmtMoney(x.amount, inv.currency || cur)}</div></a>`; })}</div>`
      : empty({ title: t('No payments yet'), body: t('Payments you record — and payments clients report — appear here.') })}`;
}

// ---------------- Handlers ----------------
onAction({
  'prop-add-del': () => addRow('prop-del', (n) => delRow({ title: '', quantity: 1 }, n)),
  'prop-add-item': () => addRow('prop-items', (n) => itemRow({ description: '', quantity: 1, unitPrice: 0 }, n)),
  'inv-add-item': () => addRow('inv-items', (n) => itemRow({ description: '', quantity: 1, unitPrice: 0 }, n)),
  'proposal-preview': (el) => { openModal(html`${modalHead(t('Client preview'))}${proposalDoc(getProposal(el.dataset.id))}`, { size: 'lg' }); return false; },
  'proposal-revise': async (el) => {
    if (!(await confirmDialog({ title: t('Revise proposal?'), body: t('The proposal returns to draft. The client will not see it until you send it again.'), confirm: t('Revise') }))) return false;
    reviseProposal(el.dataset.id);
  },
  'proposal-ai-intro': async (el) => {
    const prop = getProposal(el.dataset.id);
    const p = db.get('projects', prop.projectId);
    const r = await runAI('proposal', { ctx: { name: prop.title, objective: prop.objective, deliverables: listDeliverables(p.id).map((d) => ({ title: d.title, quantity: d.quantity })), revisions: prop.revisions, client: clientOf(p.clientId)?.company || clientOf(p.clientId)?.name } });
    const ta = document.querySelector('textarea[name=introduction]');
    openModal(html`${modalHead(t('Suggested introduction'), t('Review and edit. Nothing changes until you click Use this.'))}<textarea id="ai-intro" class="ai-out" rows="8" aria-label="${t('Suggested introduction')}">${r.text}</textarea>
      <div class="modal-actions"><button class="btn btn-ghost" data-action="modal-close">${t('Discard')}</button><button class="btn btn-primary" data-action="use-ai-intro">${t('Use this')}</button></div>`);
    window.__introTarget = ta;
    return false;
  },
  'use-ai-intro': () => { const v = document.getElementById('ai-intro').value; if (window.__introTarget) { window.__introTarget.value = v; window.__introTarget.dispatchEvent(new Event('input', { bubbles: true })); } closeModal(); toast(t('Introduction inserted — save to keep it.')); return false; },
  'invoice-cancel': async (el) => { if (await confirmDialog({ title: t('Cancel invoice?'), body: t('The invoice is kept for your records but marked Cancelled.'), confirm: t('Cancel invoice'), tone: 'danger' })) { cancelInvoice(el.dataset.id); toast(t('Invoice cancelled.')); } },
  'payment-new': (el) => { openModal(paymentModal(getInvoice(el.dataset.id))); return false; },
  'payment-confirm': (el) => { confirmPayment(el.dataset.id); toast(t('Payment confirmed.')); },
  'payment-reject': async (el) => { if (await confirmDialog({ title: t('Mark as not received?'), body: t('The reported payment is rejected and the balance stays due.'), confirm: t('Reject') })) rejectPayment(el.dataset.id); },
});

onForm({
  'proposal-save': (v, form, submitter) => {
    updateProposal(v.id, v);
    if (submitter?.value === 'send') {
      sendProposal(v.id);
      successCard({ title: t('Proposal sent'), next: t('You will be notified when the client responds.') });
    } else toast(t('Draft saved.'));
  },
  'invoice-save': (v, form, submitter) => {
    updateInvoice(v.id, v);
    if (submitter?.value === 'send') { sendInvoice(v.id); toast(t('Invoice sent.')); } else toast(t('Draft saved.'));
  },
  'payment-create': (v) => {
    recordPayment(v.id, v); closeModal();
    const inv = getInvoice(v.id); const bal = invoiceTotals(v.id).balance;
    successCard({ title: t('Payment recorded.'), next: bal > 0.001 ? t('Balance remaining: {amount}', { amount: fmtMoney(bal, inv.currency) }) : t('Invoice paid in full.') });
  },
});
export { go };
