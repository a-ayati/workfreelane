// Collaboration inside a project: messages, tasks and scheduled events.
// Every read and write goes through project access, on either side.
import { db } from '../core/store.js';
import { t } from '../core/i18n.js';
import { UserError, ForbiddenError, req, opt, dateStr, nowISO } from '../core/util.js';
import { me, requireProject, projectAccess, access, logActivity, notify, projectParties, portalProject } from './context.js';

const actorOrg = (p) => projectParties(p).find((x) => x.side === access(p)?.side)?.name || '';

// ---------- Messages ----------
export function listMessages(projectId) {
  const p = requireProject(projectId, 'messages', { anySide: true });
  return db.all('messages', (m) => m.projectId === p.id).sort((a, z) => a.createdAt.localeCompare(z.createdAt));
}
export function postMessage(projectId, { body }) {
  const p = requireProject(projectId, 'messages', { anySide: true });
  const u = me();
  const acc = access(p);
  const text = req(body, 'Message', 'body', 4000);
  const m = db.insert('messages', { projectId: p.id, userId: u.id, authorName: u.name, side: acc.side, org: actorOrg(p), body: text });
  // Everyone on the project who can read messages, except the author.
  const others = [...new Set([...notifyTargets(p, 'provider'), ...notifyTargets(p, 'client')])].filter((id) => id !== u.id);
  notify(p, { type: 'message', users: others, title: '{name} sent you a message', body: '{text}', vars: { name: u.name, text: text.slice(0, 140) }, link: `/projects/${p.id}/messages` });
  return m;
}
function notifyTargets(p, side) {
  const ids = new Set();
  const orgIds = projectParties(p).filter((x) => x.side === side).map((x) => x.businessId).filter(Boolean);
  db.all('workspaceMembers', (m) => m.status === 'active' && orgIds.includes(m.businessId)).forEach((m) => ids.add(m.userId));
  db.all('projectMembers', (m) => m.projectId === p.id && m.side === side && m.userId && m.status !== 'invited').forEach((m) => ids.add(m.userId));
  return [...ids].filter((id) => { const a = projectAccess(db.get('users', id), p); return a && a.side === side && a.caps.has('messages'); });
}

// ---------- Tasks ----------
// Tasks belong to one side of the project (a team's internal work).
export function listTasks(projectId, { mine = false } = {}) {
  const p = requireProject(projectId, 'tasks.view', { anySide: true });
  const side = access(p).side;
  const u = me();
  return db.all('tasks', (x) => x.projectId === p.id && x.side === side && (!mine || x.assigneeId === u.id))
    .sort((a, z) => (a.status === 'done') - (z.status === 'done') || (a.dueDate || '9999').localeCompare(z.dueDate || '9999'));
}
export function createTask(projectId, { title, assigneeId, dueDate, note }) {
  const p = requireProject(projectId, 'tasks.manage', { anySide: true });
  const acc = access(p);
  const assignee = assigneeId ? db.get('users', assigneeId) : null;
  if (assigneeId && (!assignee || projectAccess(assignee, p)?.side !== acc.side)) throw new UserError(t('Choose someone on your side of the project.'), 'assigneeId');
  const task = db.insert('tasks', {
    projectId: p.id, side: acc.side, title: req(title, 'Task', 'title', 200), note: opt(note, 1000),
    assigneeId: assignee?.id || null, dueDate: dateStr(dueDate, 'Due date', 'dueDate') || '', status: 'open', createdBy: me().id, doneAt: null,
  });
  if (assignee && assignee.id !== me().id) notify(p, { type: 'task', users: [assignee.id], title: 'New task on {project}', body: '{title}', vars: { project: p.name, title: task.title }, link: `/projects/${p.id}/tasks` });
  return task;
}
function ownTask(id) {
  const x = db.get('tasks', id);
  if (!x) throw new UserError(t('That task was not found.'));
  const p = requireProject(x.projectId, 'tasks.view', { anySide: true });
  const acc = access(p);
  if (acc.side !== x.side) throw new ForbiddenError();
  if (!acc.caps.has('tasks.manage') && x.assigneeId !== me().id) throw new ForbiddenError(t("You don't have permission to do this."));
  return { x, p };
}
export function setTaskStatus(id, done) {
  const { x, p } = ownTask(id);
  const upd = db.update('tasks', id, { status: done ? 'done' : 'open', doneAt: done ? nowISO() : null });
  if (done) logActivity(p, { type: x.side === 'client' ? 'client' : 'freelancer', name: me().name, userId: me().id, org: actorOrg(p) }, 'task.done', 'Task completed: {title}', { title: x.title });
  return upd;
}
export function deleteTask(id) { ownTask(id); db.remove('tasks', id); }

// ---------- Events (meetings, milestones, reminders) ----------
export const EVENT_TYPES = ['meeting', 'milestone', 'reminder'];
export function createEvent(projectId, { title, type = 'meeting', date, time, note, shared = true }) {
  const p = requireProject(projectId, 'calendar.view', { anySide: true });
  const acc = access(p);
  const ev = db.insert('events', {
    projectId: p.id, side: acc.side, shared: !!shared, type: EVENT_TYPES.includes(type) ? type : 'meeting',
    title: req(title, 'Title', 'title', 160), date: dateStr(date, 'Date', 'date', true), time: /^\d{2}:\d{2}$/.test(time || '') ? time : '',
    note: opt(note, 1000), createdBy: me().id, createdByName: me().name,
  });
  logActivity(p, { type: acc.side === 'client' ? 'client' : 'freelancer', name: me().name, userId: me().id, org: actorOrg(p) }, 'event.created', '{type_t} scheduled: {title} ({date})', { type_t: EVENT_LABELS[ev.type], title: ev.title, date: ev.date });
  return ev;
}
export const EVENT_LABELS = { meeting: 'Meeting', milestone: 'Milestone', reminder: 'Reminder' };
export function deleteEvent(id) {
  const ev = db.get('events', id);
  if (!ev) return;
  const p = requireProject(ev.projectId, 'calendar.view', { anySide: true });
  if (access(p).side !== ev.side) throw new ForbiddenError();
  db.remove('events', id);
}
export function listEvents(p, side) {
  return db.all('events', (e) => e.projectId === p.id && (e.shared || e.side === side));
}

// ---------- Client portal (secret link, no account) ----------
export function portalMessages(pid, token) {
  const p = portalProject(pid, token);
  return db.all('messages', (m) => m.projectId === p.id).sort((a, z) => a.createdAt.localeCompare(z.createdAt));
}
export function portalPostMessage(pid, token, { name, body }) {
  const p = portalProject(pid, token);
  const c = db.get('clients', p.clientId);
  const author = opt(name, 80) || c?.name || t('Client');
  const text = req(body, 'Message', 'body', 4000);
  const m = db.insert('messages', { projectId: p.id, userId: null, authorName: author, side: 'client', org: c?.company || '', body: text });
  notify(p, { type: 'message', title: '{name} sent you a message', body: '{text}', vars: { name: author, text: text.slice(0, 140) }, link: `/projects/${p.id}/messages` });
  return m;
}
export function portalEvents(pid, token) {
  const p = portalProject(pid, token);
  return db.all('events', (e) => e.projectId === p.id && e.shared !== false).sort((a, z) => `${a.date} ${a.time}`.localeCompare(`${z.date} ${z.time}`));
}
export function portalTeam(pid, token) {
  const p = portalProject(pid, token);
  const biz = db.get('businesses', p.businessId);
  const c = db.get('clients', p.clientId);
  const people = db.all('projectMembers', (m) => m.projectId === p.id && m.status !== 'invited').map((m) => ({ name: m.name || db.get('users', m.userId)?.name || '', role: m.role, side: m.side }));
  return { provider: biz?.name || '', client: c?.company || c?.name || '', people: people.filter((x) => x.name) };
}
