// Freelancer app layout: floating glass sidebar, floating top bar, glass tab bar,
// notification center (swipe or button to dismiss) and appearance controls.
import { html, raw, icon, href, avatar, onAction, go, rerender, getTheme, setTheme } from '../ui.js';
import { auth } from '../core/auth.js';
import { db } from '../core/store.js';
import { persistent } from '../core/store.js';
import { t, lang, setUiLang } from '../core/i18n.js';
import { fmtRelative } from '../core/util.js';
import { maybeBusiness, plan, notificationText, wsCan, workspacesOf, switchWorkspace, orgRole, access } from '../services/context.js';
import { listNotifications, unreadCount, markRead, markAllRead, dismissNotification } from '../services/growth.js';
import { openCommand } from './command.js';

// [id, label, icon, path, workspace capability needed]
const NAV_MAIN = [
  ['dashboard', 'Dashboard', 'home', '/dashboard'],
  ['calendar', 'Calendar', 'calendar', '/calendar'],
  ['projects', 'Projects', 'folder', '/projects'],
  ['clients', 'Clients', 'users', '/clients', 'clients.view'],
  ['proposals', 'Proposals', 'proposal', '/proposals', 'proposal.view'],
  ['contracts', 'Contracts', 'contract', '/contracts', 'contract.view'],
  ['invoices', 'Invoices', 'invoice', '/invoices', 'finance.view'],
  ['payments', 'Payments', 'wallet', '/payments', 'finance.view'],
  ['files', 'Files::nav', 'files', '/files'],
];
const NAV_GROW = [
  ['portfolio', 'Portfolio', 'star', '/portfolio', 'portfolio'],
  ['analytics', 'Analytics', 'chart', '/analytics', 'analytics'],
  ['ai', 'AI Assistant', 'sparkles', '/ai', 'portfolio'],
];
const allowed = (item) => !item[4] || wsCan(item[4]);
let wsOpen = false;

let sidebarOpen = false;
let notifOpen = false;
const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

// Language switch used on every page (app, auth, landing).
export const langSwitch = (cls = 'btn btn-ghost btn-sm') => html`<button class="${cls}" data-action="lang-toggle" lang="${lang() === 'ar' ? 'en' : 'ar'}" aria-label="${lang() === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}"><span class="lang-full">${lang() === 'ar' ? 'English' : 'العربية'}</span><span class="lang-short" aria-hidden="true">${lang() === 'ar' ? 'EN' : 'ع'}</span></button>`;

export const themeSwitch = () => {
  const cur = getTheme();
  return html`<div class="seg" role="group" aria-label="${t('Appearance')}">${[['light', 'Light'], ['dark', 'Dark'], ['system', 'Auto']].map(([v, l]) => html`<button type="button" data-action="theme-set" data-theme="${v}" aria-pressed="${String(cur === v)}">${t(l)}</button>`)}</div>`;
};

const navLink = (active) => ([id, label, ic, link]) => html`<a href="${href(link)}" class="${id === active ? 'active' : ''}"${id === active ? raw(' aria-current="page"') : ''}>${icon(ic)} ${t(label)}</a>`;

const SECTION_LABELS = { overview: 'Overview', brief: 'Brief', proposal: 'Proposal', contract: 'Contract', scope: 'Scope', tasks: 'Tasks', files: 'Files', feedback: 'Feedback', revisions: 'Revisions', approvals: 'Approvals', approval: 'Approval', messages: 'Messages', calendar: 'Calendar', invoices: 'Invoices', invoice: 'Invoices', team: 'Team', activity: 'Activity' };
const wsMark = (b) => html`<span class="ws-mark ${b.kind === 'organization' ? 'org' : ''}" aria-hidden="true">${b.kind === 'organization' ? icon('building', 16) : String(b.name || '?').trim().slice(0, 1).toUpperCase()}</span>`;

// ctx: { project, section } when the page belongs to a project.
export function appShell(body, active, ctx = {}) {
  const user = auth.currentUser();
  const b = maybeBusiness();
  const unread = unreadCount();
  const p = plan();
  const project = ctx.project;
  const acc = project ? access(project) : null;
  const workspaces = workspacesOf(user);
  const section = ctx.section && SECTION_LABELS[ctx.section] ? t(SECTION_LABELS[ctx.section]) : '';
  const color = project?.color;
  return html`
  <div class="shell${project ? ' in-project' : ''}"${color ? raw(` style="--ctx:${color}"`) : ''}>
    ${project ? html`<div class="atmo" aria-hidden="true"><span class="atmo-glow"></span><span class="atmo-icon">${icon(project.icon || 'folder', 420)}</span></div>` : ''}
    ${sidebarOpen ? html`<div class="sidebar-scrim" data-action="nav-close"></div>` : ''}
    <aside class="sidebar${sidebarOpen ? ' open' : ''}" aria-label="${t('Main navigation')}">
      <a class="brand" href="${href('/dashboard')}"><img src="assets/icon.svg" alt="">Scopewise</a>
      <div class="ws">
        <button class="ws-switch" data-action="ws-toggle" aria-expanded="${String(wsOpen)}" aria-haspopup="true">
          ${wsMark(b)}<span class="ws-text"><b>${b.name}</b><span>${b.kind === 'organization' ? t(b.orgType || 'Organization') : t('Personal workspace')}</span></span>${icon('swap', 15)}
        </button>
        ${wsOpen ? html`<div class="ws-pop" role="menu" aria-label="${t('Switch workspace')}">
          <div class="ws-pop-label">${t('Workspaces')}</div>
          ${workspaces.map((w) => html`<button role="menuitemradio" aria-checked="${String(w.id === b.id)}" class="ws-item" data-action="ws-switch" data-id="${w.id}">${wsMark(w)}<span class="ws-text"><b>${w.name}</b><span>${w.kind === 'organization' ? `${t(w.orgType || 'Organization')} · ${t(roleName(orgRole(user, w.id)))}` : t('Personal workspace')}</span></span>${w.id === b.id ? icon('check', 15) : ''}</button>`)}
          <div class="ws-sep"></div>
          <a class="ws-item ws-link" href="${href('/organization')}" role="menuitem">${icon(b.kind === 'organization' ? 'team' : 'plus', 16)} ${b.kind === 'organization' ? t('Members & teams') : t('Create organization')}</a>
        </div>` : ''}
      </div>
      ${wsCan('projects.create') ? html`<a class="btn btn-primary" href="${href('/projects/new')}">${icon('plus', 16)} ${t('New Project')}</a>` : ''}
      <nav class="nav">
        ${NAV_MAIN.filter(allowed).map(navLink(active))}
        <div class="nav-label">${t('Grow')}</div>
        ${NAV_GROW.filter(allowed).map(navLink(active))}
        ${navLink(active)(['organization', b.kind === 'organization' ? 'Organization' : 'Organizations', 'building', '/organization'])}
        <div class="nav-sep"></div>
        ${navLink(active)(['settings', 'Settings', 'settings', '/settings'])}
      </nav>
      <div class="sidebar-foot">
        ${p.id === 'free' && wsCan('settings') ? html`<div class="plan-note">${t('Free plan · {n} active projects.', { n: p.limits.activeProjects })} <a href="${href('/settings/subscription')}">${t('See plans')}</a></div>` : ''}
        ${themeSwitch()}
        <div class="btn-row" style="justify-content:space-between">${langSwitch('btn btn-ghost btn-sm lang-btn')}<button class="btn btn-ghost btn-sm" data-action="logout">${icon('logout', 16)} ${t('Sign out')}</button></div>
      </div>
    </aside>
    <div class="main-col">
      ${!user.emailVerified ? html`<div class="banner"><span>${t('Please verify {email} to secure your account.', { email: user.email })}</span><span class="btn-row"><button class="btn btn-sm btn-secondary" data-action="resend-verification">${t('Resend email')}</button><a class="btn btn-sm btn-ghost" href="${href('/mailbox')}">${t('Open dev mailbox')}</a></span></div>` : ''}
      ${!persistent ? html`<div class="banner notice-warn">${t('Your browser is blocking storage, so changes will be lost when you close this tab.')}</div>` : ''}
      <header class="topbar${window.scrollY > 8 ? ' scrolled' : ''}">
        <button class="icon-btn menu-btn" data-action="nav-open" aria-label="${t('Open menu')}">${icon('menu')}</button>
        <nav class="crumbs" aria-label="${t('You are here')}">
          <a class="crumb ws-crumb" href="${href('/dashboard')}">${wsMark(b)}<span>${b.name}</span></a>
          ${project ? html`<span class="crumb-sep" aria-hidden="true">${icon('arrow', 12)}</span><a class="crumb proj-crumb" href="${href(`/projects/${project.id}`)}"><i class="dot" aria-hidden="true"></i><span>${project.name}</span></a>` : ''}
          ${project && section ? html`<span class="crumb-sep" aria-hidden="true">${icon('arrow', 12)}</span><span class="crumb current" aria-current="page">${section}</span>` : ''}
          ${project && acc?.side === 'client' ? html`<span class="crumb-note">${t('Shared with you')}</span>` : ''}
        </nav>
        <button class="search-trigger" data-action="cmd-open" aria-label="${t('Search')}" aria-keyshortcuts="${isMac ? 'Meta+K' : 'Control+K'}">${icon('search', 16)}<span>${t('Search projects, organizations, invoices…')}</span><kbd>${isMac ? '⌘' : 'Ctrl'} K</kbd></button>
        <div class="topbar-right">
          <button class="icon-btn" data-action="notif-toggle" aria-label="${unread ? t('Notifications, {n} unread', { n: unread }) : t('Notifications')}" aria-expanded="${String(notifOpen)}">${icon('bell')}${unread ? html`<span class="badge">${unread > 9 ? '9+' : unread}</span>` : ''}</button>
          ${notifOpen ? notifPopover() : ''}
          <a href="${href('/settings/profile')}" aria-label="${t('Profile')}">${avatar(user.name, b?.logo)}</a>
        </div>
      </header>
      <main id="main" tabindex="-1">${body}</main>
    </div>
    <nav class="bottom-nav" aria-label="${t('Quick navigation')}">
      ${[['dashboard', 'Home', 'home', '/dashboard'], ['projects', 'Projects', 'folder', '/projects'], ['calendar', 'Calendar', 'calendar', '/calendar'], ['inbox', 'Inbox', 'bell', '/notifications']].map(([id, l, ic, link]) => html`<a href="${href(link)}" class="${id === active ? 'active' : ''}"${id === active ? raw(' aria-current="page"') : ''}>${icon(ic, 21)}${t(l)}${id === 'inbox' && unread ? html`<span class="badge">${unread > 9 ? '9+' : unread}</span>` : ''}</a>`)}
      <button data-action="nav-open" aria-label="${t('More')}">${icon('menu', 21)}${t('More')}</button>
    </nav>
  </div>`;
}
const roleName = (r) => ({ owner: 'Owner', admin: 'Admin', manager: 'Manager', member: 'Member', finance: 'Finance', viewer: 'Viewer' }[r] || '');

// Three kinds of alerts, clearly told apart: something happened (activity, message),
// something will happen (reminder), something waits for you (action required).
export const NOTIF_CATS = [['all', 'All'], ['action', 'Action required'], ['reminder', 'Reminders'], ['message', 'Messages'], ['activity', 'Activity']];
const CAT_ICON = { action: 'flag', reminder: 'clock', message: 'chat', activity: 'bell' };
export const catOf = (n) => n.category || 'activity';
export function notificationItem(n) {
  const x = notificationText(n);
  const cat = catOf(n);
  const pr = n.projectId ? db.get('projects', n.projectId) : null;
  return html`<div class="notif-wrap" data-notif="${n.id}"><a class="notif cat-${cat}${n.readAt ? '' : ' unread'}" href="${href(n.link || '/notifications')}" data-action="notif-open" data-id="${n.id}" data-href="${n.link || '/notifications'}"${pr?.color ? raw(` style="--pc:${pr.color}"`) : ''}>
    <span class="n-icon" aria-hidden="true">${icon(CAT_ICON[cat], 15)}</span>
    <span class="n-text"><b>${x.title}</b>${x.body ? html`<span>${x.body}</span>` : ''}<span class="n-meta">${cat === 'action' ? html`<em>${t('Action required')}</em> · ` : cat === 'reminder' ? html`<em class="rem">${t('Reminder')}</em> · ` : ''}${pr ? html`<i class="dot" aria-hidden="true"></i>${pr.name} · ` : ''}${fmtRelative(n.createdAt)}</span></span></a>
    <button class="dismiss" data-action="notif-dismiss" data-id="${n.id}" aria-label="${t('Dismiss')}">${icon('x', 14)}</button></div>`;
}
let notifCat = 'all';
export function notifTabs(active, action = 'notif-cat', list = listNotifications()) {
  return html`<div class="seg notif-tabs" role="tablist" aria-label="${t('Notification type')}">${NOTIF_CATS.map(([id, l]) => { const n = id === 'all' ? list.filter((x) => !x.readAt).length : list.filter((x) => catOf(x) === id && !x.readAt).length; return html`<button type="button" role="tab" aria-selected="${String(active === id)}" aria-pressed="${String(active === id)}" data-action="${action}" data-cat="${id}">${t(l)}${n ? html`<span class="seg-count">${n}</span>` : ''}</button>`; })}</div>`;
}
function notifPopover() {
  const all = listNotifications();
  const items = all.filter((n) => notifCat === 'all' || catOf(n) === notifCat).slice(0, 14);
  return html`<div class="popover" role="dialog" aria-label="${t('Notifications')}">
    <div class="popover-head"><b>${t('Notifications')}</b><span class="btn-row"><button class="btn btn-ghost btn-sm" data-action="notif-read-all">${t('Mark all read')}</button><a class="btn btn-ghost btn-sm" href="${href('/notifications')}" data-action="notif-close-go" data-href="/notifications">${t('View all')}</a></span></div>
    ${notifTabs(notifCat, 'notif-cat', all)}
    ${items.length ? items.map(notificationItem) : html`<p class="muted small" style="padding:16px">${t("You're all caught up.")}</p>`}
  </div>`;
}

onAction({
  'nav-open': () => { sidebarOpen = true; },
  'ws-toggle': () => { wsOpen = !wsOpen; },
  'ws-switch': (el) => { switchWorkspace(el.dataset.id); wsOpen = false; sidebarOpen = false; go('/dashboard'); return false; },
  'nav-close': () => { sidebarOpen = false; },
  'notif-toggle': () => { notifOpen = !notifOpen; },
  'notif-cat': (el) => { notifCat = el.dataset.cat; },
  'notif-read-all': () => { markAllRead(); },
  'notif-open': (el) => { markRead(el.dataset.id); notifOpen = false; go(el.dataset.href); return false; },
  'notif-close-go': (el) => { notifOpen = false; go(el.dataset.href); return false; },
  'notif-dismiss': (el) => { dismissNotification(el.dataset.id); },
  'cmd-open': () => { openCommand(); return false; },
  'theme-set': (el) => { setTheme(el.dataset.theme); },
  logout: () => { auth.logout(); go('/login'); return false; },
  'lang-toggle': () => {
    const next = lang() === 'ar' ? 'en' : 'ar';
    setUiLang(next);
    if (auth.currentUser()) auth.updateUser({ lang: next });
    sidebarOpen = false;
  },
});

export function resetShellState() { sidebarOpen = false; notifOpen = false; wsOpen = false; }
window.addEventListener('hashchange', resetShellState);
document.addEventListener('click', (e) => {
  if (notifOpen && !e.target.closest('.popover, [data-action="notif-toggle"]')) { notifOpen = false; rerender(); }
  if (wsOpen && !e.target.closest('.ws')) { wsOpen = false; rerender(); }
});
// Top bar becomes a glass layer once content scrolls beneath it.
let ticking = false;
window.addEventListener('scroll', () => {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => { document.querySelector('.topbar')?.classList.toggle('scrolled', window.scrollY > 8); ticking = false; });
}, { passive: true });

// Swipe a notification sideways to dismiss it (the × button does the same).
let swipe = null;
document.addEventListener('pointerdown', (e) => {
  const el = e.target.closest('.notif');
  if (!el || e.pointerType === 'mouse') return;
  swipe = { el, x: e.clientX, y: e.clientY, dx: 0, id: el.dataset.id, locked: false };
});
document.addEventListener('pointermove', (e) => {
  if (!swipe) return;
  const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
  if (!swipe.locked) { if (Math.abs(dy) > 10) { swipe = null; return; } if (Math.abs(dx) < 10) return; swipe.locked = true; swipe.el.classList.add('swiping'); }
  swipe.dx = dx;
  swipe.el.style.transform = `translateX(${dx}px)`;
  swipe.el.style.opacity = String(Math.max(0.2, 1 - Math.abs(dx) / 260));
});
document.addEventListener('pointerup', () => {
  if (!swipe) return;
  const { el, dx, id, locked } = swipe;
  swipe = null;
  el.classList.remove('swiping');
  if (locked && Math.abs(dx) > 90) {
    el.classList.add('gone');
    el.addEventListener('click', (ev) => ev.preventDefault(), { once: true, capture: true });
    setTimeout(() => { dismissNotification(id); rerender(); }, 200);
  } else { el.style.transform = ''; el.style.opacity = ''; }
});
