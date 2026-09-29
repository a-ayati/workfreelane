// Shared project views used by both sides of a project: activity timeline,
// messages, tasks, team and the project calendar.
import { html, raw, icon, href, avatar, empty, field, onAction, onForm, toast, openModal, closeModal, modalHead, confirmDialog, go } from '../ui.js';
import { db } from '../core/store.js';
import { t, locale } from '../core/i18n.js';
import { fmtDate, fmtShortDate, fmtRelative, todayISO } from '../core/util.js';
import { me, access, activityText, projectParties, PROJECT_ROLES } from '../services/context.js';
import { projectActivity } from '../services/growth.js';
import { listMessages, postMessage, listTasks, createTask, setTaskStatus, deleteTask, createEvent, deleteEvent, EVENT_TYPES, EVENT_LABELS } from '../services/collab.js';
import { projectTeam, addProjectMember, inviteToProject, updateProjectMember, removeProjectMember, canManageTeamOn, listMembers, roleLabel, projectRoleLabel } from '../services/org.js';
import { projectEvents, sortEvents, localDay, TYPE_ICON } from '../services/calendar.js';

const dayLabel = (day) => {
  const today = todayISO();
  const d = new Date(`${day}T12:00:00`);
  const diff = Math.round((d - new Date(`${today}T12:00:00`)) / 86400000);
  if (diff === 0) return t('Today');
  if (diff === -1) return t('Yesterday');
  if (diff === 1) return t('Tomorrow');
  return d.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
};
const timeOf = (iso) => new Date(iso).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
const groupBy = (list, key) => list.reduce((m, x) => { const k = key(x); (m.get(k) || m.set(k, []).get(k)).push(x); return m; }, new Map());

// ---------------- Activity timeline ----------------
const ACTION_ICON = {
  'file.uploaded': 'upload', 'file.shared': 'eye', 'feedback.added': 'chat', 'feedback.replied': 'chat', 'revision.requested': 'edit', 'revision.started': 'edit',
  'approval.requested': 'eye', 'approval.approved': 'check', 'delivery.sent': 'flag', 'invoice.created': 'invoice', 'invoice.sent': 'invoice', 'invoice.paid': 'wallet',
  'payment.recorded': 'wallet', 'payment.confirmed': 'wallet', 'payment.reported': 'wallet', 'contract.accepted': 'contract', 'contract.issued': 'contract',
  'proposal.accepted': 'proposal', 'proposal.sent': 'proposal', 'proposal.created': 'proposal', 'brief.submitted': 'proposal', 'project.created': 'star', 'project.completed': 'check',
  'team.added': 'users', 'team.invited': 'users', 'task.done': 'tasks', 'event.created': 'calendar',
};
const FINANCE_ACTIONS = /^(invoice|payment|deposit)\./;
export function timelineTab(p) {
  const acc = access(p);
  const acts = projectActivity(p.id).filter((a) => acc.caps.has('finance.view') || !FINANCE_ACTIONS.test(a.action));
  if (!acts.length) return empty({ title: t('No activity yet.'), body: t('A permanent record of every important action on this project. Entries cannot be edited or deleted.') });
  const days = groupBy(acts, (a) => localDay(a.createdAt));
  return html`<p class="muted small" style="margin:0 0 16px">${t('A permanent record of every important action on this project. Entries cannot be edited or deleted.')}</p>
    <ol class="tl" aria-label="${t('Activity')}">${[...days.entries()].map(([day, items]) => html`<li class="tl-day"><h3 class="tl-date">${dayLabel(day)}</h3>
      <ol>${items.map((a) => html`<li class="tl-item">
        <time datetime="${a.createdAt}">${timeOf(a.createdAt)}</time>
        <span class="tl-dot" aria-hidden="true">${icon(ACTION_ICON[a.action] || 'clock', 14)}</span>
        <div class="tl-body"><div>${activityText(a)}</div><div class="who">${a.actorName}${a.actorOrg ? ` · ${a.actorOrg}` : ''}</div></div>
      </li>`)}</ol></li>`)}</ol>`;
}

// ---------------- Messages ----------------
export function messagesTab(p) {
  const list = listMessages(p.id);
  const u = me();
  const days = groupBy(list, (m) => localDay(m.createdAt));
  return html`<div class="chat card">
    <div class="chat-log" aria-live="polite">${list.length ? [...days.entries()].map(([day, items]) => html`<div class="chat-day"><span>${dayLabel(day)}</span></div>
      ${items.map((m) => html`<div class="bubble-row${m.userId === u.id ? ' me' : ''}">${avatar(m.authorName, null, 30)}<div class="bubble${m.userId === u.id ? ' mine' : ''}">
        <div class="meta"><b>${m.authorName}</b>${m.org ? html`<span>${m.org}</span>` : ''}<time datetime="${m.createdAt}">${timeOf(m.createdAt)}</time></div>
        <div class="prose" dir="auto">${m.body}</div></div></div>`)}`)
      : html`<div class="chat-empty">${icon('chat', 28)}<p>${t('Start the conversation. Everyone on this project can read and reply.')}</p></div>`}</div>
    <form class="chat-compose" data-form="msg-send"><input type="hidden" name="id" value="${p.id}">
      <textarea name="body" rows="1" required placeholder="${t('Write a message…')}" aria-label="${t('Message')}" data-autogrow></textarea>
      <button class="btn btn-primary" type="submit">${icon('arrow', 16)}<span class="sr-only">${t('Send message')}</span></button></form>
  </div>`;
}

// ---------------- Tasks ----------------
function sidePeople(p) {
  const acc = access(p);
  const { people } = projectTeam(p.id);
  return people.filter((x) => x.side === acc.side && x.userId && x.status !== 'invited');
}
export function tasksTab(p) {
  const acc = access(p);
  const list = listTasks(p.id);
  const open = list.filter((x) => x.status !== 'done');
  const done = list.filter((x) => x.status === 'done');
  const canManage = acc.caps.has('tasks.manage');
  const u = me();
  const row = (x) => {
    const who = x.assigneeId ? db.get('users', x.assigneeId) : null;
    const late = x.status !== 'done' && x.dueDate && x.dueDate < todayISO();
    const mayToggle = canManage || x.assigneeId === u.id;
    return html`<li class="task${x.status === 'done' ? ' done' : ''}">
      <button class="task-check" data-action="task-toggle" data-id="${x.id}" data-done="${x.status === 'done' ? '0' : '1'}" aria-pressed="${String(x.status === 'done')}" aria-label="${x.status === 'done' ? t('Mark as not done') : t('Mark as done')}"${mayToggle ? '' : raw(' disabled')}>${icon('check', 14)}</button>
      <div class="task-body"><div class="task-title">${x.title}</div>
        <div class="cell-sub">${who ? html`${avatar(who.name, null, 18)} ${who.name}` : t('Unassigned')}${x.dueDate ? html` · <span class="${late ? 'late' : ''}">${t('Due {date}', { date: fmtShortDate(x.dueDate) })}</span>` : ''}</div></div>
      ${canManage ? html`<button class="icon-btn" data-action="task-delete" data-id="${x.id}" aria-label="${t('Delete task')}">${icon('trash', 15)}</button>` : ''}
    </li>`;
  };
  return html`<div class="grid-main">
    <div class="stack">
      <div class="card"><div class="card-head"><h2>${t('Open tasks')}</h2><span class="small muted">${t('{n} open', { n: open.length })}</span></div>
        ${open.length ? html`<ul class="tasks">${open.map(row)}</ul>` : html`<p class="muted" style="margin:0">${t('Nothing open. Add the next piece of work below.')}</p>`}</div>
      ${done.length ? html`<details class="card"><summary><b>${t('Completed')}</b> <span class="muted small">(${done.length})</span></summary><ul class="tasks" style="margin-top:10px">${done.map(row)}</ul></details>` : ''}
    </div>
    <aside class="stack">${canManage ? html`<form class="card form-stack" data-form="task-create"><input type="hidden" name="id" value="${p.id}">
      <h2>${t('New task')}</h2>
      ${field({ label: t('Task'), name: 'title', required: true, placeholder: t('e.g. Colour grade episode 04') })}
      ${field({ label: t('Assign to'), name: 'assigneeId', type: 'select', value: u.id, options: [['', t('Unassigned')], ...sidePeople(p).map((x) => [x.userId, x.name])] })}
      ${field({ label: t('Due date'), name: 'dueDate', type: 'date' })}
      <button class="btn btn-primary" type="submit">${icon('plus', 16)} ${t('Add task')}</button>
      <p class="small muted" style="margin:0">${t('Tasks stay inside your team. The other organization does not see them.')}</p></form>` : ''}</aside>
  </div>`;
}

// ---------------- Team ----------------
const KIND_LABEL = { personal: 'Independent professional', organization: 'Organization', external: 'External contact' };
export function teamTab(p) {
  const { groups } = projectTeam(p.id);
  const acc = access(p);
  const manage = canManageTeamOn(p);
  return html`<div class="team-orgs">${groups.map(({ party, people }) => {
    const mine = party.side === acc.side;
    return html`<section class="card org-card${mine ? ' mine' : ''}">
      <header class="org-head">
        <span class="org-mark" aria-hidden="true">${icon(party.kind === 'organization' ? 'building' : party.kind === 'external' ? 'mail' : 'users', 18)}</span>
        <div><h2>${party.name}</h2><div class="small muted">${t(party.side === 'provider' ? 'Delivering the work' : 'Client')} · ${t(KIND_LABEL[party.kind] || 'Organization')}${mine ? ` · ${t('Your side')}` : ''}</div></div>
      </header>
      ${people.length ? html`<ul class="people">${people.map((x) => html`<li>
        ${avatar(x.name, null, 34)}
        <div class="person"><b>${x.name}</b><span>${[x.title, x.status === 'invited' ? t('Invitation sent') : '', x.via === 'organization' ? t('Through the organization') : ''].filter(Boolean).join(' · ') || x.email || ''}</span></div>
        ${manage && mine && x.id && x.userId !== me().id ? html`<select class="role-select" data-change="pm-role" data-id="${x.id}" aria-label="${t('Project role of {name}', { name: x.name })}">${PROJECT_ROLES.map((r) => html`<option value="${r}"${r === x.role ? raw(' selected') : ''}>${t(projectRoleLabel(r))}</option>`)}</select>
          <button class="icon-btn" data-action="pm-remove" data-id="${x.id}" aria-label="${t('Remove {name} from the project', { name: x.name })}">${icon('x', 15)}</button>`
          : html`<span class="role-pill">${t(projectRoleLabel(x.role))}</span>`}
      </li>`)}</ul>` : html`<p class="muted small" style="margin:0">${party.kind === 'external' ? t('This client works through the secure client link. Invite people by email to give them their own access.') : t('No one yet.')}</p>`}
      ${manage && (mine || acc.side === 'provider') ? html`<div class="btn-row" style="margin-top:14px">
        ${mine ? html`<button class="btn btn-secondary btn-sm" data-action="pm-add" data-id="${p.id}">${icon('plus', 14)} ${t('Add from my organization')}</button>` : ''}
        ${!mine && party.side === 'client' ? html`<button class="btn btn-primary btn-sm" data-action="pm-invite" data-id="${p.id}" data-side="client" data-client="1">${icon('mail', 14)} ${t('Invite the client to create an account')}</button>`
          : html`<button class="btn btn-ghost btn-sm" data-action="pm-invite" data-id="${p.id}" data-side="${party.side}">${icon('mail', 14)} ${t('Invite by email')}</button>`}</div>` : ''}
    </section>`;
  })}</div>
  <details class="card" style="margin-top:16px"><summary><b>${t('What each role can do')}</b></summary>${roleGuide()}</details>`;
}
function roleGuide() {
  const rows = [
    ['owner', 'Everything, including finance, team and settings.'], ['manager', 'Everything, including finance, team and settings.'],
    ['producer', 'The whole workflow except finance management and team.'], ['director', 'The whole workflow and the team, not finance management.'],
    ['designer', 'Files, versions, feedback, revisions, tasks and messages.'], ['editor', 'Files, versions, feedback, revisions, tasks and messages.'],
    ['reviewer', 'Review files, leave feedback and request revisions.'], ['approver', 'Review, approve the final version, accept proposals and contracts.'],
    ['finance', 'Proposals, contracts, invoices and payments.'], ['viewer', 'Read-only access to the work.'],
  ];
  return html`<dl class="kv" style="margin-top:12px">${rows.map(([r, d]) => html`<dt>${t(projectRoleLabel(r))}</dt><dd>${t(d)}</dd>`)}</dl>`;
}
function addMemberModal(p) {
  const acc = access(p);
  const org = projectParties(p).find((x) => x.side === acc.side && x.businessId);
  const onProject = new Set(projectTeam(p.id).people.map((x) => x.userId));
  const candidates = org ? listMembers(org.businessId).filter((m) => m.userId && m.status === 'active' && !onProject.has(m.userId)) : [];
  return html`${modalHead(t('Add from my organization'), org?.name)}
    ${candidates.length ? html`<form class="form-stack" data-form="pm-add"><input type="hidden" name="id" value="${p.id}">
      ${field({ label: t('Person'), name: 'userId', type: 'select', options: candidates.map((m) => [m.userId, `${m.displayName}${m.title ? ` — ${m.title}` : ''}`]) })}
      ${field({ label: t('Project role'), name: 'role', type: 'select', value: 'editor', options: PROJECT_ROLES.map((r) => [r, t(projectRoleLabel(r))]) })}
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-action="modal-close">${t('Cancel')}</button><button class="btn btn-primary" type="submit">${t('Add to project')}</button></div></form>`
      : html`<p class="muted">${t('Everyone in your organization is already on this project. Invite new colleagues from the Organization page.')}</p><div class="modal-actions"><a class="btn btn-secondary" href="${href('/organization')}">${t('Organization')}</a></div>`}`;
}
function inviteModal(p, side, prefill = {}) {
  const party = projectParties(p).find((x) => x.side === side);
  return html`${modalHead(t('Invite by email'), party?.name)}
    <form class="form-grid" data-form="pm-invite"><input type="hidden" name="id" value="${p.id}"><input type="hidden" name="side" value="${side}">
      ${field({ label: t('Name'), name: 'name', value: prefill.name || '' })}
      ${field({ label: t('Email'), name: 'email', type: 'email', required: true, value: prefill.email || '', attrs: 'dir="ltr"' })}
      ${field({ label: t('Project role'), name: 'role', type: 'select', value: prefill.role || (side === 'client' ? 'reviewer' : 'editor'), options: PROJECT_ROLES.map((r) => [r, t(projectRoleLabel(r))]), full: true })}
      <p class="small muted full" style="margin:0">${t('They get an email with a link. When they sign in with this address, the project appears in their workspace with exactly this role.')}</p>
      <div class="form-actions full"><button type="button" class="btn btn-ghost" data-action="modal-close">${t('Cancel')}</button><button class="btn btn-primary" type="submit">${t('Send invitation')}</button></div></form>`;
}

// ---------------- Project calendar ----------------
export function projectCalendarTab(p) {
  const acc = access(p);
  const events = sortEvents(projectEvents(p, acc));
  const today = todayISO();
  const upcoming = events.filter((e) => e.date >= today);
  const past = events.filter((e) => e.date < today).reverse().slice(0, 30);
  return html`<div class="grid-main">
    <div class="stack">
      <section class="card"><div class="card-head"><h2>${t('Coming up')}</h2><a class="small" href="${href('/calendar')}">${t('All projects calendar')}</a></div>
        ${upcoming.length ? agenda(upcoming, { showProject: false }) : html`<p class="muted" style="margin:0">${t('Nothing scheduled. Deadlines, reviews, invoices and meetings appear here automatically.')}</p>`}</section>
      ${past.length ? html`<section class="card"><div class="card-head"><h2>${t('Recently')}</h2></div>${agenda(past, { showProject: false })}</section>` : ''}
    </div>
    <aside class="stack"><form class="card form-stack" data-form="event-create"><input type="hidden" name="id" value="${p.id}">
      <h2>${t('Schedule')}</h2>
      ${field({ label: t('Title'), name: 'title', required: true, placeholder: t('e.g. Episode 04 review call') })}
      ${field({ label: t('Type'), name: 'type', type: 'select', options: EVENT_TYPES.map((x) => [x, t(EVENT_LABELS[x])]) })}
      <div class="form-grid" style="gap:10px">${field({ label: t('Date'), name: 'date', type: 'date', required: true, value: today })}${field({ label: t('Time'), name: 'time', type: 'time' })}</div>
      <label class="check"><input type="checkbox" name="shared" data-bool checked> ${acc.side === 'provider' ? t('Visible to the client organization') : t('Visible to the delivering team')}</label>
      <button class="btn btn-primary" type="submit">${icon('calendar', 16)} ${t('Add to calendar')}</button></form></aside>
  </div>`;
}

// Agenda list shared by the project and master calendars.
export function agenda(events, { showProject = true } = {}) {
  const days = groupBy(events, (e) => e.date);
  return html`<ol class="agenda">${[...days.entries()].map(([day, items]) => html`<li class="agenda-day"><h3>${dayLabel(day)}</h3><ul>${items.map((e) => eventItem(e, showProject))}</ul></li>`)}</ol>`;
}
export function eventTitle(e) { return e.title || (e.activity ? activityText(e.activity) : ''); }
export function eventItem(e, showProject = true) {
  const kindLabel = { deadline: t('Deadline'), action: t('Waiting for action'), event: e.label || '' }[e.kind];
  return html`<li class="ev ev-${e.kind}${e.overdue ? ' overdue' : ''}" style="--pc:${e.color}">
    <span class="ev-time">${e.time || (e.kind === 'deadline' ? t('All day') : '')}</span>
    <span class="ev-icon" aria-hidden="true">${icon(TYPE_ICON[e.type] || 'clock', 14)}</span>
    <a class="ev-body" href="${href(e.href)}"><b>${eventTitle(e)}</b><span>${[showProject ? e.projectName : '', kindLabel, e.person, e.org].filter(Boolean).join(' · ')}</span></a>
    ${e.eventId && e.own ? html`<button class="icon-btn" data-action="event-delete" data-id="${e.eventId}" aria-label="${t('Remove from calendar')}">${icon('x', 14)}</button>` : ''}
  </li>`;
}

// ---------------- Handlers ----------------
onForm({
  'msg-send': (v, form) => { postMessage(v.id, v); form.reset(); setTimeout(() => { const log = document.querySelector('.chat-log'); if (log) log.scrollTop = log.scrollHeight; document.querySelector('.chat-compose textarea')?.focus(); }, 30); },
  'task-create': (v) => { createTask(v.id, v); toast(t('Task added.')); },
  'pm-add': (v) => { addProjectMember(v.id, v); closeModal(); toast(t('Added to the project.')); },
  'pm-invite': (v) => { inviteToProject(v.id, v); closeModal(); toast(t('Invitation sent.')); },
  'event-create': (v) => { createEvent(v.id, v); toast(t('Added to the calendar.')); },
});
onAction({
  'task-toggle': (el) => { setTaskStatus(el.dataset.id, el.dataset.done === '1'); },
  'task-delete': async (el) => { if (await confirmDialog({ title: t('Delete this task?'), body: t('This cannot be undone.'), confirm: t('Delete'), tone: 'danger' })) deleteTask(el.dataset.id); },
  'pm-add': (el) => { openModal(addMemberModal(db.get('projects', el.dataset.id))); return false; },
  'pm-invite': (el) => {
    const p = db.get('projects', el.dataset.id);
    const cl = el.dataset.client ? db.get('clients', p.clientId) : null;
    openModal(inviteModal(p, el.dataset.side, cl ? { name: cl.name, email: cl.email || '', role: 'approver' } : {}));
    return false;
  },
  'pm-role': (el) => { updateProjectMember(el.dataset.id, { role: el.value }); toast(t('Role updated.')); },
  'pm-remove': async (el) => { if (await confirmDialog({ title: t('Remove from project?'), body: t('They lose access to this project. Their past activity stays in the timeline.'), confirm: t('Remove'), tone: 'danger' })) removeProjectMember(el.dataset.id); },
  'event-delete': (el) => { deleteEvent(el.dataset.id); },
});
// Growing message box; Enter sends, Shift+Enter adds a line.
document.addEventListener('input', (e) => { const ta = e.target.closest?.('textarea[data-autogrow]'); if (ta) { ta.style.height = 'auto'; ta.style.height = `${Math.min(ta.scrollHeight, 180)}px`; } });
document.addEventListener('keydown', (e) => {
  const ta = e.target.closest?.('.chat-compose textarea');
  if (ta && e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); ta.form.requestSubmit(); }
});
export { fmtDate, fmtRelative, go, roleLabel };
