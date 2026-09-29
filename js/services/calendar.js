// Calendar: the time view of every project. Nothing is entered twice — events
// are derived from the records that already exist (deadlines, invoices, files,
// feedback, approvals, payments, tasks) plus scheduled meetings and milestones.
import { db } from '../core/store.js';
import { t } from '../core/i18n.js';
import { me, projectAccess, access } from './context.js';
import { listProjects } from './core.js';
import { listEvents, EVENT_LABELS } from './collab.js';
import { effectiveStatus } from './billing.js';
import { OPEN_STATUSES } from './constants.js';

// kind: 'deadline' (must happen by), 'event' (happened / scheduled), 'action' (waiting for someone).
// type drives filters and icons.
export const EVENT_FILTERS = [
  ['all', 'All projects'], ['mine', 'My projects'], ['tasks', 'My tasks'], ['deadlines', 'Deadlines'],
  ['meetings', 'Meetings'], ['reviews', 'Reviews'], ['approvals', 'Approvals'], ['payments', 'Payments'], ['deliveries', 'Deliveries'],
];
const FILTER_MATCH = {
  deadlines: (e) => e.kind === 'deadline',
  meetings: (e) => e.type === 'meeting',
  reviews: (e) => ['review', 'feedback', 'revision'].includes(e.type),
  approvals: (e) => e.type === 'approval',
  payments: (e) => ['payment', 'invoice'].includes(e.type),
  deliveries: (e) => e.type === 'delivery',
  tasks: (e) => e.type === 'task' && e.mine,
};
export const TYPE_ICON = { delivery: 'flag', meeting: 'users', milestone: 'star', reminder: 'bell', review: 'eye', feedback: 'chat', revision: 'edit', approval: 'check', payment: 'wallet', invoice: 'invoice', task: 'tasks', file: 'upload', contract: 'contract', proposal: 'proposal' };

const pad = (n) => String(n).padStart(2, '0');
export const localDay = (d) => { const x = new Date(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
const localTime = (d) => { const x = new Date(d); return `${pad(x.getHours())}:${pad(x.getMinutes())}`; };

// Activity actions that belong on the calendar, and how they read there.
const ACTIVITY = {
  'file.uploaded': ['file', 'activity.view'], 'file.shared': ['review', 'files.view'], 'feedback.added': ['feedback', 'feedback.view'],
  'revision.requested': ['revision', 'revisions.view'], 'approval.requested': ['review', 'approvals.view'], 'approval.approved': ['approval', 'approvals.view'],
  'delivery.sent': ['delivery', 'files.view'], 'payment.recorded': ['payment', 'finance.view'], 'payment.confirmed': ['payment', 'finance.view'],
  'contract.accepted': ['contract', 'contract.view'], 'proposal.accepted': ['proposal', 'proposal.view'], 'proposal.sent': ['proposal', 'proposal.view'],
  'brief.submitted': ['review', 'brief.view'], 'task.done': ['task', 'tasks.view'],
};

export function projectEvents(p, acc = access(p)) {
  if (!acc) return [];
  const has = (c) => acc.caps.has(c);
  const u = me();
  const base = { projectId: p.id, projectName: p.name, color: p.color || '#3B6FE0', icon: p.icon || 'folder' };
  const out = [];
  const push = (e) => out.push({ ...base, ...e, id: `${e.type}:${e.ref || e.date}:${out.length}` });
  const open = OPEN_STATUSES.includes(p.status);
  if (p.deadline && open && p.status !== 'approved') push({ kind: 'deadline', type: 'delivery', date: p.deadline, time: '', title: t('Delivery due'), href: `/projects/${p.id}`, ref: 'deadline' });
  if (has('proposal.view')) {
    db.all('proposals', (x) => x.projectId === p.id && ['sent', 'viewed'].includes(x.status) && x.validUntil).forEach((x) => push({ kind: 'deadline', type: 'proposal', date: x.validUntil, time: '', title: t('Proposal response due'), href: `/projects/${p.id}/proposal`, ref: x.id }));
  }
  if (has('finance.view')) {
    db.all('invoices', (i) => i.projectId === p.id && !['draft', 'cancelled'].includes(i.status)).forEach((i) => {
      const st = effectiveStatus(i);
      if (!['paid', 'cancelled'].includes(st)) push({ kind: 'deadline', type: 'invoice', date: i.dueDate, time: '', title: t('Invoice {number} due', { number: i.number }), href: acc.side === 'provider' ? `/invoices/${i.id}` : `/projects/${p.id}/invoice`, ref: i.id, overdue: st === 'overdue' });
    });
  }
  if (has('tasks.view')) {
    db.all('tasks', (x) => x.projectId === p.id && x.side === acc.side && x.status !== 'done' && x.dueDate).forEach((x) => push({ kind: 'deadline', type: 'task', date: x.dueDate, time: '', title: x.title, href: `/projects/${p.id}/tasks`, ref: x.id, mine: x.assigneeId === u.id, person: x.assigneeId ? db.get('users', x.assigneeId)?.name : '' }));
  }
  if (has('approvals.view') || has('approvals.request')) {
    db.all('approvals', (a) => a.projectId === p.id && a.status === 'pending').forEach((a) => push({ kind: 'action', type: 'approval', date: localDay(a.requestedAt), time: localTime(a.requestedAt), title: t('Waiting for approval: {file} {version}', { file: a.fileName, version: a.versionLabel }), href: `/projects/${p.id}/${acc.side === 'client' ? 'approval' : 'approvals'}`, ref: a.id }));
  }
  if (has('calendar.view')) {
    listEvents(p, acc.side).forEach((e) => push({ kind: e.type === 'milestone' ? 'deadline' : 'event', type: e.type, date: e.date, time: e.time || '', title: e.title, note: e.note, href: `/projects/${p.id}/calendar`, ref: e.id, eventId: e.id, own: e.side === acc.side, person: e.createdByName, label: t(EVENT_LABELS[e.type]) }));
  }
  if (has('activity.view')) {
    db.all('activityLogs', (a) => a.projectId === p.id && ACTIVITY[a.action]).forEach((a) => {
      const [type, cap] = ACTIVITY[a.action];
      if (!has(cap)) return;
      push({ kind: 'event', type, date: localDay(a.createdAt), time: localTime(a.createdAt), title: null, activity: a, href: `/projects/${p.id}/activity`, ref: a.id, person: a.actorName, org: a.actorOrg });
    });
  }
  return out;
}

// Every project the user can see in the current workspace (own and shared).
export function allEvents({ filter = 'all', hidden = [] } = {}) {
  const u = me();
  const projects = listProjects({});
  const events = [];
  projects.forEach((p) => {
    if (hidden.includes(p.id)) return;
    const acc = projectAccess(u, p);
    if (filter === 'mine' && !db.find('projectMembers', (m) => m.projectId === p.id && m.userId === u.id)) return;
    events.push(...projectEvents(p, acc));
  });
  const match = FILTER_MATCH[filter];
  return { projects, events: match ? events.filter(match) : events };
}

export function sortEvents(list) {
  const rank = { deadline: 0, action: 1, event: 2 };
  return list.sort((a, z) => a.date.localeCompare(z.date) || (a.time || '').localeCompare(z.time || '') || rank[a.kind] - rank[z.kind]);
}
