// Portfolio, notifications, activity, search and analytics.
import { db } from '../core/store.js';
import { UserError, req, opt, lines, nowISO, todayISO, addDays, clock, daysBetween, sum, round2 } from '../core/util.js';
import { me, myBusiness, requireProject, requireOwned, notifyOwner, requireFeature } from './context.js';
import { financials, invoiceTotals, listDeliverables, isOverdue } from './core.js';
import { effectiveStatus } from './billing.js';
import { OPEN_STATUSES } from './constants.js';

// ---------- Portfolio ----------
export function listPortfolio() {
  const b = myBusiness();
  return db.all('portfolioItems', (x) => x.businessId === b.id).sort((a, z) => z.createdAt.localeCompare(a.createdAt));
}
export const getPortfolioItem = (id) => requireOwned('portfolioItems', id, 'portfolio item');
export function portfolioDraftFromProject(projectId) {
  const p = requireProject(projectId);
  const c = db.get('clients', p.clientId);
  const brief = db.find('briefs', (b) => b.projectId === p.id);
  return {
    projectId: p.id, title: p.name, client: c?.company || c?.name || '', category: p.type,
    challenge: brief?.objective || '', approach: '', deliverables: listDeliverables(p.id).map((d) => `${d.quantity} × ${d.title}`).join('\n'),
    results: '', description: '', visibility: 'private', coverVersionId: '',
  };
}
function cleanPortfolio(data) {
  return {
    title: req(data.title, 'Title', 'title', 140), client: opt(data.client, 140), category: opt(data.category, 80),
    challenge: opt(data.challenge, 3000), approach: opt(data.approach, 3000), deliverables: opt(data.deliverables, 2000),
    results: opt(data.results, 2000), description: opt(data.description, 5000),
    visibility: data.visibility === 'public' ? 'public' : 'private', coverVersionId: data.coverVersionId || '',
    mediaVersionIds: (data.mediaVersionIds || []).filter(Boolean).slice(0, 12),
  };
}
export function savePortfolioItem(id, data) {
  const b = myBusiness();
  const clean = cleanPortfolio(data);
  const all = [clean.coverVersionId, ...clean.mediaVersionIds].filter(Boolean);
  all.forEach((vid) => { const v = db.get('fileVersions', vid); if (!v || db.get('projects', v.projectId)?.businessId !== b.id) throw new UserError('One of the selected media files was not found.'); });
  if (id) { getPortfolioItem(id); return db.update('portfolioItems', id, clean); }
  if (data.projectId) requireProject(data.projectId);
  return db.insert('portfolioItems', { ...clean, businessId: b.id, projectId: data.projectId || null });
}
export function deletePortfolioItem(id) { getPortfolioItem(id); db.remove('portfolioItems', id); }

// ---------- Activity ----------
export function projectActivity(projectId) {
  requireProject(projectId);
  return db.all('activityLogs', (a) => a.projectId === projectId).sort((a, z) => z.createdAt.localeCompare(a.createdAt));
}
export function recentActivity(limit = 12) {
  const b = myBusiness();
  return db.all('activityLogs', (a) => a.businessId === b.id).sort((a, z) => z.createdAt.localeCompare(a.createdAt)).slice(0, limit);
}

// ---------- Notifications ----------
export function listNotifications() {
  const u = me();
  return db.all('notifications', (n) => n.userId === u.id).sort((a, z) => z.createdAt.localeCompare(a.createdAt));
}
export const unreadCount = () => { const u = me(); return db.count('notifications', (n) => n.userId === u.id && !n.readAt); };
export function markRead(id) {
  const n = db.get('notifications', id);
  if (!n || n.userId !== me().id) return;
  if (!n.readAt) db.update('notifications', id, { readAt: nowISO() });
}
export function markAllRead() { listNotifications().filter((n) => !n.readAt).forEach((n) => db.update('notifications', n.id, { readAt: nowISO() })); }

// Time-based notifications, de-duplicated with a stable key. Runs on app load.
export function sweepReminders() {
  const b = myBusiness();
  const today = todayISO();
  const tomorrow = addDays(clock.now(), 1).toISOString().slice(0, 10);
  const projects = db.all('projects', (p) => p.businessId === b.id);
  projects.forEach((p) => {
    if (OPEN_STATUSES.includes(p.status) && p.deadline === tomorrow) notifyOwner(p, { type: 'deadline', title: 'Deadline tomorrow', body: `${p.name} is due tomorrow.`, link: `/projects/${p.id}`, key: `deadline:${p.id}:${p.deadline}` });
    if (isOverdue(p)) notifyOwner(p, { type: 'deadline', title: 'Project past deadline', body: `${p.name} was due ${p.deadline}.`, link: `/projects/${p.id}`, key: `late:${p.id}:${p.deadline}` });
    const waiting = [
      ...db.all('proposals', (x) => x.projectId === p.id && ['sent', 'viewed'].includes(x.status)).map((x) => ['proposal', x.sentAt]),
      ...db.all('contracts', (x) => x.projectId === p.id && x.status === 'sent').map((x) => ['contract', x.sentAt]),
      ...db.all('approvals', (x) => x.projectId === p.id && x.status === 'pending').map((x) => ['final approval', x.requestedAt]),
    ];
    waiting.forEach(([what, at]) => {
      if (at && daysBetween(at, clock.now()) >= 3) {
        notifyOwner(p, { type: 'stale', title: 'Client has not responded', body: `No response on the ${what} for ${p.name} for ${daysBetween(at, clock.now())} days. Consider a polite follow-up.`, link: `/projects/${p.id}`, key: `stale:${p.id}:${what}:${at}` });
      }
    });
  });
  db.all('invoices', (i) => i.businessId === b.id).forEach((inv) => {
    if (effectiveStatus(inv) === 'overdue') {
      notifyOwner(db.get('projects', inv.projectId), { type: 'payment', title: 'Invoice overdue', body: `${inv.number} was due ${inv.dueDate}.`, link: `/invoices/${inv.id}`, key: `overdue:${inv.id}:${inv.dueDate}` });
      if (inv.status !== 'overdue') db.update('invoices', inv.id, { status: 'overdue' });
    }
  });
  db.all('reminders', (r) => r.businessId === b.id && !r.doneAt && r.dueDate <= today).forEach((r) => {
    const c = db.get('clients', r.clientId);
    notifyOwner({ id: r.projectId, businessId: b.id }, { type: 'followup', title: `Follow up with ${c?.name || 'client'}`, body: r.note, link: `/clients/${r.clientId}`, key: `reminder:${r.id}` });
  });
}

// ---------- Search ----------
export function search(q) {
  const b = myBusiness();
  const term = String(q || '').trim().toLowerCase();
  if (term.length < 2) return [];
  const hit = (...xs) => xs.some((x) => String(x || '').toLowerCase().includes(term));
  const clients = db.all('clients', (c) => c.businessId === b.id);
  const cName = (id) => clients.find((c) => c.id === id)?.name || '';
  const out = [];
  db.all('projects', (p) => p.businessId === b.id && hit(p.name, p.type, cName(p.clientId))).forEach((p) => out.push({ kind: 'Project', title: p.name, sub: cName(p.clientId), href: `/projects/${p.id}` }));
  clients.filter((c) => hit(c.name, c.company, c.email)).forEach((c) => out.push({ kind: 'Client', title: c.name, sub: c.company || c.email, href: `/clients/${c.id}` }));
  db.all('proposals', (x) => x.businessId === b.id && hit(x.number, x.title, cName(x.clientId))).forEach((x) => out.push({ kind: 'Proposal', title: `${x.number} · ${x.title}`, sub: cName(x.clientId), href: `/proposals/${x.id}` }));
  db.all('invoices', (x) => x.businessId === b.id && hit(x.number, `#${x.number}`, cName(x.clientId), db.get('projects', x.projectId)?.name)).forEach((x) => out.push({ kind: 'Invoice', title: `Invoice ${x.number}`, sub: cName(x.clientId), href: `/invoices/${x.id}` }));
  db.all('files', (f) => f.businessId === b.id && hit(f.name)).forEach((f) => out.push({ kind: 'File', title: f.name, sub: db.get('projects', f.projectId)?.name, href: `/projects/${f.projectId}/files` }));
  return out.slice(0, 50);
}

// ---------- Analytics ----------
export function analytics({ gated = true } = {}) {
  if (gated) requireFeature('analytics', 'Analytics');
  const b = myBusiness();
  const projects = db.all('projects', (p) => p.businessId === b.id);
  const invoices = db.all('invoices', (i) => i.businessId === b.id && !['draft', 'cancelled'].includes(i.status));
  const payments = db.all('payments', (p) => p.businessId === b.id && p.status === 'confirmed');
  const now = clock.now();
  const monthKey = (d) => String(d).slice(0, 7);
  const thisMonth = now.toISOString().slice(0, 7);
  const months = [];
  for (let i = 5; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); }
  const monthly = months.map((m) => ({ month: m, amount: sum(payments.filter((p) => monthKey(p.paidAt) === m), (p) => p.amount) }));
  const inv = invoices.map((i) => ({ ...i, st: effectiveStatus(i), t: invoiceTotals(i.id) }));
  const completed = projects.filter((p) => p.status === 'completed');
  const durations = completed.filter((p) => p.startedAt && p.completedAt).map((p) => daysBetween(p.startedAt, p.completedAt));
  const clientsWithProjects = new Map();
  projects.filter((p) => p.status !== 'cancelled').forEach((p) => clientsWithProjects.set(p.clientId, (clientsWithProjects.get(p.clientId) || 0) + 1));
  const allClients = db.all('clients', (c) => c.businessId === b.id);
  const rounds = db.all('revisionRounds', (r) => projects.some((p) => p.id === r.projectId));
  const approvals = db.all('approvals', (a) => a.status === 'approved' && projects.some((p) => p.id === a.projectId));
  const paidInv = inv.filter((i) => i.st === 'paid' && i.paidAt && i.sentAt);
  const contracted = projects.filter((p) => p.status !== 'cancelled' && db.find('proposals', (x) => x.projectId === p.id && x.status === 'accepted'));
  const avg = (arr) => (arr.length ? round2(arr.reduce((a, x) => a + x, 0) / arr.length) : 0);
  return {
    currency: b.currency, months: monthly,
    revenueThisMonth: sum(payments.filter((p) => monthKey(p.paidAt) === thisMonth), (p) => p.amount),
    paidRevenue: sum(payments, (p) => p.amount),
    pendingRevenue: sum(inv.filter((i) => i.st !== 'overdue'), (i) => i.t.balance),
    overdueRevenue: sum(inv.filter((i) => i.st === 'overdue'), (i) => i.t.balance),
    projects: {
      completed: completed.length, active: projects.filter((p) => OPEN_STATUSES.includes(p.status) && p.status !== 'draft').length,
      cancelled: projects.filter((p) => p.status === 'cancelled').length, avgDuration: avg(durations),
    },
    clients: {
      total: allClients.length, returning: [...clientsWithProjects.values()].filter((n) => n > 1).length,
      newThisMonth: allClients.filter((c) => monthKey(c.createdAt) === thisMonth).length,
      revenuePerClient: clientsWithProjects.size ? round2(sum(payments, (p) => p.amount) / clientsWithProjects.size) : 0,
    },
    performance: {
      avgProjectValue: avg(contracted.map((p) => financials(p).total)),
      avgRevisions: avg(contracted.map((p) => rounds.filter((r) => r.projectId === p.id).length)),
      avgApprovalDays: avg(approvals.filter((a) => a.respondedAt && a.requestedAt).map((a) => Math.max(0, daysBetween(a.requestedAt, a.respondedAt)))),
      avgPaymentDelay: avg(paidInv.map((i) => Math.max(0, daysBetween(i.dueDate, i.paidAt.slice(0, 10))))),
    },
  };
}

export function dashboardData() {
  const b = myBusiness();
  const a = analytics({ gated: false });
  const projects = db.all('projects', (p) => p.businessId === b.id);
  return {
    revenueThisMonth: a.revenueThisMonth, pending: round2(a.pendingRevenue + a.overdueRevenue),
    active: projects.filter((p) => OPEN_STATUSES.includes(p.status) && p.status !== 'draft').length,
    awaitingApproval: projects.filter((p) => p.status === 'awaiting_approval').length,
    overdue: db.all('invoices', (i) => i.businessId === b.id).filter((i) => effectiveStatus(i) === 'overdue').length + projects.filter(isOverdue).length,
  };
}
export { lines };
