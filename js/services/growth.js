// Portfolio, notifications, activity, search and analytics.
import { db } from '../core/store.js';
import { t } from '../core/i18n.js';
import { UserError, req, opt, lines, nowISO, todayISO, addDays, clock, daysBetween, sum, round2 } from '../core/util.js';
import { me, myBusiness, requireProject, requireOwned, notifyOwner, notify, requireFeature, projectAccess, orgRole, can, wsCan, projectParties, workspacesOf } from './context.js';
import { financials, invoiceTotals, listDeliverables, isOverdue, listProjects } from './core.js';
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
  all.forEach((vid) => { const v = db.get('fileVersions', vid); if (!v || db.get('projects', v.projectId)?.businessId !== b.id) throw new UserError(t('One of the selected media files was not found.')); });
  if (id) { getPortfolioItem(id); return db.update('portfolioItems', id, clean); }
  if (data.projectId) requireProject(data.projectId);
  return db.insert('portfolioItems', { ...clean, businessId: b.id, projectId: data.projectId || null });
}
export function deletePortfolioItem(id) { getPortfolioItem(id); db.remove('portfolioItems', id); }

// ---------- Activity ----------
export function projectActivity(projectId) {
  requireProject(projectId, 'activity.view', { anySide: true });
  return db.all('activityLogs', (a) => a.projectId === projectId).sort((a, z) => z.createdAt.localeCompare(a.createdAt));
}
export function recentActivity(limit = 12) {
  const projects = new Map(listProjects({}).map((p) => [p.id, p]));
  const ok = (a) => { const p = projects.get(a.projectId); return p && can(p, 'activity.view') && (can(p, 'finance.view') || !/^(invoice|payment|deposit)\./.test(a.action)); };
  return db.all('activityLogs', (a) => projects.has(a.projectId)).filter(ok).sort((a, z) => z.createdAt.localeCompare(a.createdAt)).slice(0, limit);
}

// ---------- Notifications ----------
export function listNotifications() {
  const u = me();
  return db.all('notifications', (n) => n.userId === u.id && !n.dismissedAt).sort((a, z) => z.createdAt.localeCompare(a.createdAt));
}
export const unreadCount = () => { const u = me(); return db.count('notifications', (n) => n.userId === u.id && !n.readAt && !n.dismissedAt); };
export function markRead(id) {
  const n = db.get('notifications', id);
  if (!n || n.userId !== me().id) return;
  if (!n.readAt) db.update('notifications', id, { readAt: nowISO() });
}
export function dismissNotification(id) {
  const n = db.get('notifications', id);
  if (!n || n.userId !== me().id) return;
  // Kept (not deleted) so time-based reminders are not re-created by the sweep.
  db.update('notifications', id, { dismissedAt: nowISO(), readAt: n.readAt || nowISO() });
}
export function markAllRead() { listNotifications().filter((n) => !n.readAt).forEach((n) => db.update('notifications', n.id, { readAt: nowISO() })); }

// Time-based notifications, de-duplicated with a stable key per person. Runs on
// app load for the signed-in user, across every project they can see, and only
// for what their role lets them act on.
export function sweepReminders() {
  const u = me();
  const today = todayISO();
  const days = (date) => daysBetween(today, date);
  const mine = (p, payload) => notify(p, { ...payload, users: [u.id], key: `${payload.key}:${u.id}` });
  db.all('projects').forEach((p) => {
    const acc = projectAccess(u, p);
    if (!acc) return;
    const has = (c) => acc.caps.has(c);
    const open = OPEN_STATUSES.includes(p.status);
    const link = `/projects/${p.id}`;
    // Delivery date: 2 days, tomorrow, today, overdue.
    if (open && p.deadline && p.status !== 'approved') {
      const d = days(p.deadline);
      const msg = d === 2 ? 'Delivery due in 2 days' : d === 1 ? 'Delivery due tomorrow' : d === 0 ? 'Delivery due today' : d < 0 ? 'Delivery overdue' : null;
      if (msg) mine(p, { type: 'deadline', category: d < 0 ? 'action' : 'reminder', title: msg, body: '{project}', vars: { project: p.name }, link, key: `due:${p.id}:${p.deadline}:${d < 0 ? 'late' : d}` });
    }
    // Invoices: 3 days, today, overdue (finance roles on either side).
    if (has('finance.view')) {
      db.all('invoices', (i) => i.projectId === p.id && !['draft', 'cancelled'].includes(i.status)).forEach((inv) => {
        const st = effectiveStatus(inv);
        if (st === 'overdue' && inv.status !== 'overdue') db.update('invoices', inv.id, { status: 'overdue' });
        if (['paid', 'cancelled'].includes(st)) return;
        const d = days(inv.dueDate);
        const ilink = acc.side === 'provider' ? `/invoices/${inv.id}` : `/projects/${p.id}/invoice`;
        const msg = d === 3 ? 'Invoice {number} is due in 3 days' : d === 0 ? 'Invoice {number} is due today' : d < 0 ? 'Invoice {number} is overdue' : null;
        if (msg) mine(p, { type: 'payment', category: d < 0 ? 'action' : 'reminder', title: msg, body: '{project}', vars: { number: inv.number, project: p.name }, link: ilink, key: `inv:${inv.id}:${inv.dueDate}:${d < 0 ? 'late' : d}` });
      });
    }
    // My tasks.
    db.all('tasks', (x) => x.projectId === p.id && x.assigneeId === u.id && x.status !== 'done' && x.dueDate).forEach((x) => {
      const d = days(x.dueDate);
      const msg = d === 1 ? 'Task due tomorrow' : d === 0 ? 'Task due today' : d < 0 ? 'Task overdue' : null;
      if (msg) mine(p, { type: 'task', category: d < 0 ? 'action' : 'reminder', title: msg, body: '{title} · {project}', vars: { title: x.title, project: p.name }, link: `${link}/tasks`, key: `task:${x.id}:${x.dueDate}:${d < 0 ? 'late' : d}` });
    });
    // Meetings and milestones today.
    if (has('calendar.view')) {
      db.all('events', (e) => e.projectId === p.id && (e.shared || e.side === acc.side) && e.date === today).forEach((e) => {
        mine(p, { type: 'meeting', title: e.type === 'milestone' ? 'Milestone today: {title}' : 'Today: {title}', body: e.time ? '{time} · {project}' : '{project}', vars: { title: e.title, time: e.time, project: p.name }, link: `${link}/calendar`, key: `event:${e.id}:${e.date}` });
      });
    }
    // Waiting for me (client side): approvals, proposals, contracts, change orders.
    if (acc.side === 'client') {
      if (has('approvals.respond')) db.all('approvals', (a) => a.projectId === p.id && a.status === 'pending').forEach((a) => mine(p, { type: 'approval', category: 'action', title: '{file} {version} is waiting for your approval', body: '{project}', vars: { file: a.fileName, version: a.versionLabel, project: p.name }, link: `${link}/approval`, key: `appr:${a.id}` }));
      if (has('proposal.respond')) db.all('proposals', (x) => x.projectId === p.id && ['sent', 'viewed'].includes(x.status)).forEach((x) => mine(p, { type: 'action', category: 'action', title: 'Proposal waiting for your response', body: '{project}', vars: { project: p.name }, link: `${link}/proposal`, key: `prop:${x.id}` }));
      if (has('contract.accept')) db.all('contracts', (x) => x.projectId === p.id && x.status === 'sent').forEach((x) => mine(p, { type: 'action', category: 'action', title: 'Contract waiting for your acceptance', body: '{project}', vars: { project: p.name }, link: `${link}/contract`, key: `con:${x.id}` }));
    }
    // Delivering side: nudge when the client has not answered.
    if (acc.side === 'provider' && has('proposal.edit')) {
      const waiting = [
        ...db.all('proposals', (x) => x.projectId === p.id && ['sent', 'viewed'].includes(x.status)).map((x) => ['proposal', x.sentAt]),
        ...db.all('contracts', (x) => x.projectId === p.id && x.status === 'sent').map((x) => ['contract', x.sentAt]),
        ...db.all('approvals', (x) => x.projectId === p.id && x.status === 'pending').map((x) => ['final approval', x.requestedAt]),
      ];
      waiting.forEach(([what, at]) => {
        if (at && daysBetween(at, clock.now()) >= 3) mine(p, { type: 'stale', title: 'Client has not responded', body: 'No response on the {what_t} for {project} for {n} days. Consider a polite follow-up.', vars: { what_t: what, project: p.name, n: daysBetween(at, clock.now()) }, link, key: `stale:${p.id}:${what}:${at}` });
      });
    }
  });
  // Follow-up reminders of the workspaces I manage.
  db.all('reminders', (r) => !r.doneAt && r.dueDate <= today && ['owner', 'admin', 'manager'].includes(orgRole(u, r.businessId))).forEach((r) => {
    const c = db.get('clients', r.clientId);
    notify({ id: r.projectId || null, businessId: r.businessId }, { type: 'followup', users: [u.id], title: 'Follow up with {client}', body: '{note}', vars: { client: c?.name || '', note: r.note }, link: `/clients/${r.clientId}`, key: `reminder:${r.id}:${u.id}` });
  });
}

// ---------- Search ----------
// Arabic-aware matching: ignore diacritics and tatweel, fold alef/ya/ta-marbuta
// variants, so «برنامج», «برنامج» and «بَرنامج» all match.
export function normalizeSearch(s) {
  return String(s || '').toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627').replace(/\u0649/g, '\u064A').replace(/\u0629/g, '\u0647')
    .replace(/\u0624/g, '\u0648').replace(/\u0626/g, '\u064A')
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[#\s]+/g, ' ').trim();
}
export function search(q) {
  const u = me();
  const b = myBusiness();
  const term = normalizeSearch(q);
  if (term.length < 2) return [];
  const words = term.split(' ');
  const hit = (...xs) => { const hay = normalizeSearch(xs.filter(Boolean).join(' ')); return words.every((w) => hay.includes(w)); };
  const projects = listProjects({});
  const visible = new Map(projects.map((p) => [p.id, p]));
  const clients = db.all('clients', (c) => c.businessId === b.id);
  const cName = (id) => clients.find((c) => c.id === id)?.name || '';
  const partyName = (p) => projectParties(p).filter((x) => x.side !== 'provider' || p.side === 'client').map((x) => x.name).join(' ');
  const out = [];
  projects.filter((p) => hit(p.name, p.altName, t(p.type), cName(p.clientId), partyName(p))).forEach((p) => out.push({ kind: 'Project', title: p.name, sub: [p.altName, partyName(p)].filter(Boolean).join(' · '), href: `/projects/${p.id}`, color: p.color }));
  // Organizations: my workspaces, partner organizations of visible projects, clients.
  const orgs = new Map();
  projects.forEach((p) => projectParties(p).forEach((x) => { if (x.businessId && x.businessId !== b.id) orgs.set(x.businessId, x); }));
  workspacesOf(u).forEach((w) => { if (w.id !== b.id) orgs.set(w.id, { businessId: w.id, name: w.name, kind: w.kind }); });
  [...orgs.values()].filter((o) => hit(o.name, db.get('businesses', o.businessId)?.orgType)).forEach((o) => out.push({ kind: 'Organization', title: o.name, sub: t(db.get('businesses', o.businessId)?.orgType || 'Organization'), href: workspacesOf(u).some((w) => w.id === o.businessId) ? `/organization?switch=${o.businessId}` : '/projects' }));
  if (wsCan('clients.view')) clients.filter((c) => hit(c.name, c.company, c.email)).forEach((c) => out.push({ kind: 'Client', title: c.name, sub: c.company || c.email, href: `/clients/${c.id}` }));
  // People: my organization and everyone on visible projects.
  const people = new Map();
  db.all('workspaceMembers', (m) => m.businessId === b.id && m.status === 'active').forEach((m) => people.set(m.userId, { title: m.title, href: '/organization' }));
  projects.forEach((p) => db.all('projectMembers', (m) => m.projectId === p.id && m.userId).forEach((m) => { if (!people.has(m.userId)) people.set(m.userId, { title: '', href: `/projects/${p.id}/team`, project: p.name }); }));
  people.forEach((info, id) => { const pu = db.get('users', id); if (pu && hit(pu.name, pu.email, info.title)) out.push({ kind: 'Person', title: pu.name, sub: info.title || info.project || pu.email, href: info.href }); });
  const docs = (table, cap) => db.all(table, (x) => visible.has(x.projectId) && can(visible.get(x.projectId), cap));
  docs('proposals', 'proposal.view').filter((x) => hit(x.number, x.title, cName(x.clientId))).forEach((x) => out.push({ kind: 'Proposal', title: `${x.number} · ${x.title}`, sub: visible.get(x.projectId)?.name, href: visible.get(x.projectId)?.side === 'provider' ? `/proposals/${x.id}` : `/projects/${x.projectId}/proposal` }));
  docs('contracts', 'contract.view').filter((x) => x.status !== 'void' && hit(x.title, visible.get(x.projectId)?.name)).forEach((x) => out.push({ kind: 'Contract', title: x.title, sub: visible.get(x.projectId)?.name, href: `/projects/${x.projectId}/contract` }));
  docs('invoices', 'finance.view').filter((x) => x.status !== 'draft' || visible.get(x.projectId)?.side === 'provider').filter((x) => hit(x.number, cName(x.clientId), visible.get(x.projectId)?.name)).forEach((x) => out.push({ kind: 'Invoice', title: t('Invoice {number}', { number: x.number }), sub: visible.get(x.projectId)?.name, href: visible.get(x.projectId)?.side === 'provider' ? `/invoices/${x.id}` : `/projects/${x.projectId}/invoice` }));
  docs('files', 'files.view').filter((f) => hit(f.name)).forEach((f) => out.push({ kind: 'File', title: f.name, sub: visible.get(f.projectId)?.name, href: `/projects/${f.projectId}/files` }));
  docs('messages', 'messages').filter((m) => hit(m.body, m.authorName)).slice(0, 8).forEach((m) => out.push({ kind: 'Message', title: m.body.slice(0, 80), sub: `${m.authorName} · ${visible.get(m.projectId)?.name}`, href: `/projects/${m.projectId}/messages` }));
  return out.slice(0, 60);
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
