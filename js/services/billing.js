// Invoices and payments. Live payment processing is not connected; the
// gateway abstraction lives in core/payments.js.
import { db } from '../core/store.js';
import { mailer, appLink } from '../core/mailer.js';
import { UserError, req, opt, money, int, dateStr, nowISO, todayISO, addDays, clock, round2, sum } from '../core/util.js';
import { myBusiness, requireProject, requireOwned, logActivity, freelancerActor, clientActor, notifyOwner, portalProject, touchClient } from './context.js';
import { invoiceTotals, financials, setStatus, acceptedProposal } from './core.js';

export function effectiveStatus(inv) {
  if (['draft', 'cancelled'].includes(inv.status)) return inv.status;
  const t = invoiceTotals(inv.id);
  if (t.total > 0 && t.balance <= 0.001) return 'paid';
  if (inv.dueDate && inv.dueDate < todayISO()) return 'overdue';
  if (t.paid > 0) return 'partially_paid';
  return inv.viewedAt ? 'viewed' : 'sent';
}

function refreshStatus(invoiceId) {
  const inv = db.get('invoices', invoiceId);
  const s = effectiveStatus(inv);
  if (s !== inv.status) db.update('invoices', invoiceId, { status: s, paidAt: s === 'paid' ? nowISO() : inv.paidAt || null });
  return s;
}

function takeNumber(business) {
  const n = business.nextInvoiceNumber || 1001;
  db.update('businesses', business.id, { nextInvoiceNumber: n + 1 });
  return `${business.invoicePrefix || 'INV-'}${n}`;
}

function cleanItems(items) {
  const rows = (items || []).filter((i) => String(i.description || '').trim());
  if (!rows.length) throw new UserError('Add at least one line item.');
  if (rows.length > 100) throw new UserError('Too many line items.');
  return rows.map((i, n) => ({
    description: req(i.description, 'Item description', null, 300),
    quantity: money(i.quantity || 1, 'Quantity', null, { allowZero: false }),
    unitPrice: money(i.unitPrice || 0, 'Price'),
    position: n,
  }));
}

// Internal: used by both freelancer actions and client-portal flows.
export function insertInvoice(project, { kind = 'custom', items, dueDays, notes = '', changeOrderId = null }) {
  const b = db.get('businesses', project.businessId);
  const rows = cleanItems(items);
  const inv = db.insert('invoices', {
    businessId: b.id, projectId: project.id, clientId: project.clientId, number: takeNumber(b), kind, changeOrderId,
    issueDate: todayISO(), dueDate: addDays(clock.now(), dueDays ?? b.defaultDueDays ?? 7).toISOString().slice(0, 10),
    currency: project.currency || b.currency, discount: 0, taxRate: b.taxRate || 0, taxLabel: b.taxLabel || 'Tax',
    notes: notes || b.paymentInstructions || '', status: 'draft', sentAt: null, viewedAt: null, paidAt: null,
  });
  rows.forEach((r) => db.insert('invoiceItems', { ...r, invoiceId: inv.id }));
  return inv;
}

export function createDepositInvoice(project, actor) {
  if (db.find('invoices', (i) => i.projectId === project.id && i.kind === 'deposit' && i.status !== 'cancelled')) return null;
  const f = financials(project);
  if (f.depositAmount <= 0) return null;
  const inv = insertInvoice(project, { kind: 'deposit', items: [{ description: `Deposit (${project.depositPercent}%) — ${project.name}`, quantity: 1, unitPrice: f.depositAmount }] });
  logActivity(project, actor, 'invoice.created', `Deposit invoice ${inv.number} created`);
  return inv;
}

export function listInvoices({ projectId, status } = {}) {
  const b = myBusiness();
  return db.all('invoices', (i) => i.businessId === b.id && (!projectId || i.projectId === projectId))
    .map((i) => ({ ...i, status: effectiveStatus(i) }))
    .filter((i) => !status || i.status === status)
    .sort((a, z) => z.issueDate.localeCompare(a.issueDate) || z.number.localeCompare(a.number));
}
export function getInvoice(id) { const i = requireOwned('invoices', id, 'invoice'); return { ...i, status: effectiveStatus(i) }; }

export function createInvoice(projectId, data) {
  const p = requireProject(projectId);
  const inv = insertInvoice(p, { kind: data.kind || 'custom', items: data.items, dueDays: data.dueDays != null ? int(data.dueDays, 'Due days', 'dueDays', 0, 365) : undefined });
  logActivity(p, freelancerActor(), 'invoice.created', `Invoice ${inv.number} created`);
  return inv;
}

export function createFinalInvoice(projectId) {
  const p = requireProject(projectId);
  const f = financials(p);
  if (f.uninvoiced <= 0.001) throw new UserError('Everything on this project has already been invoiced.');
  const acc = acceptedProposal(p.id);
  const inv = insertInvoice(p, { kind: 'final', items: [{ description: `Final payment — ${p.name}${acc ? ` (proposal ${acc.number})` : ''}`, quantity: 1, unitPrice: f.uninvoiced }] });
  logActivity(p, freelancerActor(), 'invoice.created', `Final invoice ${inv.number} created`);
  return inv;
}

export function updateInvoice(id, data) {
  const inv = getInvoice(id);
  if (inv.status !== 'draft') throw new UserError('Only draft invoices can be edited. Cancel it and create a new one if something changed.');
  const clean = {
    issueDate: dateStr(data.issueDate, 'Issue date', 'issueDate', true),
    dueDate: dateStr(data.dueDate, 'Due date', 'dueDate', true),
    discount: money(data.discount || 0, 'Discount', 'discount'),
    taxRate: money(data.taxRate || 0, 'Tax rate', 'taxRate'),
    notes: opt(data.notes, 3000),
  };
  if (clean.dueDate < clean.issueDate) throw new UserError('The due date must be on or after the issue date.', 'dueDate');
  if (clean.taxRate > 100) throw new UserError('Tax rate must be 100% or less.', 'taxRate');
  const rows = cleanItems(data.items);
  db.all('invoiceItems', (x) => x.invoiceId === id).forEach((x) => db.remove('invoiceItems', x.id));
  rows.forEach((r) => db.insert('invoiceItems', { ...r, invoiceId: id }));
  return db.update('invoices', id, clean);
}

export function sendInvoice(id) {
  const inv = getInvoice(id);
  if (inv.status !== 'draft') throw new UserError('This invoice has already been sent.');
  if (invoiceTotals(id).total <= 0) throw new UserError('The invoice total must be greater than zero.');
  const p = db.get('projects', inv.projectId);
  const c = db.get('clients', inv.clientId);
  db.update('invoices', id, { status: 'sent', sentAt: nowISO() });
  logActivity(p, freelancerActor(), 'invoice.sent', `Invoice ${inv.number} sent`);
  if (c?.email) mailer.send({ to: c.email, kind: 'invoice', subject: `Invoice ${inv.number} from ${myBusiness().name}`, body: `Hi ${c.name},\n\nYour invoice for ${p.name} is ready.`, link: appLink(`/client/${p.id}/invoice?t=${p.portalToken}`), linkLabel: 'View invoice' });
  touchClient(inv.clientId);
}

export function cancelInvoice(id) {
  const inv = getInvoice(id);
  if (db.find('payments', (x) => x.invoiceId === id && x.status === 'confirmed')) throw new UserError('This invoice has payments recorded, so it cannot be cancelled.');
  db.update('invoices', id, { status: 'cancelled' });
  logActivity(db.get('projects', inv.projectId), freelancerActor(), 'invoice.cancelled', `Invoice ${inv.number} cancelled`);
}

function afterPayment(invoiceId, actor) {
  const inv = db.get('invoices', invoiceId);
  const status = refreshStatus(invoiceId);
  const p = db.get('projects', inv.projectId);
  if (status === 'paid') logActivity(p, actor, 'invoice.paid', `Invoice ${inv.number} paid in full`);
  if (inv.kind === 'deposit' && status === 'paid' && p.status === 'awaiting_deposit') {
    setStatus(p, 'active');
    db.update('projects', p.id, { startedAt: nowISO() });
    logActivity(p, actor, 'deposit.received', 'Deposit received — project is now active');
  }
}

export function recordPayment(invoiceId, data) {
  const inv = getInvoice(invoiceId);
  if (['draft', 'cancelled'].includes(inv.status)) throw new UserError('Send the invoice before recording a payment.');
  const t = invoiceTotals(invoiceId);
  const amount = money(data.amount, 'Amount', 'amount', { allowZero: false });
  if (amount > t.balance + 0.001) throw new UserError(`The payment is more than the balance due (${t.balance}).`, 'amount');
  const pay = db.insert('payments', {
    invoiceId, businessId: inv.businessId, projectId: inv.projectId, amount,
    method: opt(data.method, 60) || 'Bank transfer', reference: opt(data.reference, 120),
    paidAt: dateStr(data.paidAt, 'Payment date', 'paidAt') || todayISO(), provider: 'manual', status: 'confirmed', confirmedAt: nowISO(),
  });
  const p = db.get('projects', inv.projectId);
  logActivity(p, freelancerActor(), 'payment.recorded', `Payment of ${amount} ${inv.currency} recorded on ${inv.number}`);
  afterPayment(invoiceId, freelancerActor());
  return pay;
}

export function confirmPayment(paymentId) {
  const pay = requireOwned('payments', paymentId, 'payment');
  if (pay.status !== 'reported') throw new UserError('This payment is already confirmed.');
  const t = invoiceTotals(pay.invoiceId);
  if (pay.amount > t.balance + 0.001) throw new UserError('This payment is more than the balance due. Reject it and record the correct amount.');
  db.update('payments', paymentId, { status: 'confirmed', confirmedAt: nowISO() });
  const inv = db.get('invoices', pay.invoiceId);
  logActivity(db.get('projects', inv.projectId), freelancerActor(), 'payment.confirmed', `Payment of ${pay.amount} ${inv.currency} confirmed on ${inv.number}`);
  afterPayment(pay.invoiceId, freelancerActor());
}
export function rejectPayment(paymentId) {
  const pay = requireOwned('payments', paymentId, 'payment');
  if (pay.status !== 'reported') throw new UserError('Only reported payments can be rejected.');
  db.update('payments', paymentId, { status: 'rejected' });
}

export function listPayments() {
  const b = myBusiness();
  return db.all('payments', (p) => p.businessId === b.id).sort((a, z) => (z.paidAt || '').localeCompare(a.paidAt || ''));
}

// ---------- Client portal ----------
export function portalInvoices(projectId, token) {
  portalProject(projectId, token);
  return db.all('invoices', (i) => i.projectId === projectId && !['draft', 'cancelled'].includes(i.status))
    .map((i) => ({ ...i, status: effectiveStatus(i) })).sort((a, z) => z.issueDate.localeCompare(a.issueDate));
}
export function portalViewInvoice(projectId, token, invoiceId) {
  const p = portalProject(projectId, token);
  const inv = db.get('invoices', invoiceId);
  if (!inv || inv.projectId !== p.id || inv.status === 'draft') throw new UserError('Invoice not found.');
  if (!inv.viewedAt) {
    db.update('invoices', inv.id, { viewedAt: nowISO(), status: inv.status === 'sent' ? 'viewed' : inv.status });
    logActivity(p, clientActor(p), 'invoice.viewed', `Client viewed invoice ${inv.number}`);
  }
}
export function portalReportPayment(projectId, token, invoiceId, data) {
  const p = portalProject(projectId, token);
  const inv = db.get('invoices', invoiceId);
  if (!inv || inv.projectId !== p.id || ['draft', 'cancelled'].includes(inv.status)) throw new UserError('Invoice not found.');
  const t = invoiceTotals(inv.id);
  if (t.balance <= 0) throw new UserError('This invoice is already paid.');
  if (db.find('payments', (x) => x.invoiceId === inv.id && x.status === 'reported')) throw new UserError('You already reported a payment for this invoice. Your freelancer will confirm it soon.');
  const amount = money(data.amount, 'Amount', 'amount', { allowZero: false });
  if (amount > t.balance + 0.001) throw new UserError('The amount is more than the balance due.', 'amount');
  db.insert('payments', {
    invoiceId: inv.id, businessId: inv.businessId, projectId: p.id, amount, method: opt(data.method, 60) || 'Bank transfer',
    reference: opt(data.reference, 120), paidAt: todayISO(), provider: 'manual', status: 'reported', confirmedAt: null,
  });
  logActivity(p, clientActor(p), 'payment.reported', `Client reported a payment of ${amount} ${inv.currency} on ${inv.number}`);
  notifyOwner(p, { type: 'payment', title: 'Payment reported', body: `${db.get('clients', p.clientId)?.name} reported paying ${amount} ${inv.currency} on ${inv.number}. Confirm once received.`, link: `/invoices/${inv.id}` });
}

export function totalsFor(invoices) {
  return { total: sum(invoices, (i) => invoiceTotals(i.id).total), paid: sum(invoices, (i) => invoiceTotals(i.id).paid), balance: round2(sum(invoices, (i) => invoiceTotals(i.id).balance)) };
}
