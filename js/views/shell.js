// Freelancer app layout: floating glass sidebar, floating top bar, glass tab bar,
// notification center (swipe or button to dismiss) and appearance controls.
import { html, raw, icon, href, avatar, onAction, go, rerender, getTheme, setTheme } from '../ui.js';
import { auth } from '../core/auth.js';
import { persistent } from '../core/store.js';
import { t, lang, setUiLang } from '../core/i18n.js';
import { fmtRelative } from '../core/util.js';
import { maybeBusiness, plan, notificationText } from '../services/context.js';
import { listNotifications, unreadCount, markRead, markAllRead, dismissNotification } from '../services/growth.js';
import { openCommand } from './command.js';

const NAV_MAIN = [
  ['dashboard', 'Dashboard', 'home', '/dashboard'],
  ['projects', 'Projects', 'folder', '/projects'],
  ['clients', 'Clients', 'users', '/clients'],
  ['proposals', 'Proposals', 'proposal', '/proposals'],
  ['contracts', 'Contracts', 'contract', '/contracts'],
  ['invoices', 'Invoices', 'invoice', '/invoices'],
  ['payments', 'Payments', 'wallet', '/payments'],
  ['files', 'Files::nav', 'files', '/files'],
];
const NAV_GROW = [
  ['portfolio', 'Portfolio', 'star', '/portfolio'],
  ['analytics', 'Analytics', 'chart', '/analytics'],
  ['ai', 'AI Assistant', 'sparkles', '/ai'],
];

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

export function appShell(body, active) {
  const user = auth.currentUser();
  const b = maybeBusiness();
  const unread = unreadCount();
  const p = plan();
  return html`
  <div class="shell">
    ${sidebarOpen ? html`<div class="sidebar-scrim" data-action="nav-close"></div>` : ''}
    <aside class="sidebar${sidebarOpen ? ' open' : ''}" aria-label="${t('Main navigation')}">
      <a class="brand" href="${href('/dashboard')}"><img src="assets/icon.svg" alt="">Scopewise</a>
      <a class="btn btn-primary" href="${href('/projects/new')}">${icon('plus', 16)} ${t('New Project')}</a>
      <nav class="nav">
        ${NAV_MAIN.map(navLink(active))}
        <div class="nav-label">${t('Grow')}</div>
        ${NAV_GROW.map(navLink(active))}
        <div class="nav-sep"></div>
        ${navLink(active)(['settings', 'Settings', 'settings', '/settings'])}
      </nav>
      <div class="sidebar-foot">
        ${p.id === 'free' ? html`<div class="plan-note">${t('Free plan · {n} active projects.', { n: p.limits.activeProjects })} <a href="${href('/settings/subscription')}">${t('See plans')}</a></div>` : ''}
        ${themeSwitch()}
        <div class="btn-row" style="justify-content:space-between">${langSwitch('btn btn-ghost btn-sm lang-btn')}<button class="btn btn-ghost btn-sm" data-action="logout">${icon('logout', 16)} ${t('Sign out')}</button></div>
      </div>
    </aside>
    <div class="main-col">
      ${!user.emailVerified ? html`<div class="banner"><span>${t('Please verify {email} to secure your account.', { email: user.email })}</span><span class="btn-row"><button class="btn btn-sm btn-secondary" data-action="resend-verification">${t('Resend email')}</button><a class="btn btn-sm btn-ghost" href="${href('/mailbox')}">${t('Open dev mailbox')}</a></span></div>` : ''}
      ${!persistent ? html`<div class="banner notice-warn">${t('Your browser is blocking storage, so changes will be lost when you close this tab.')}</div>` : ''}
      <header class="topbar${window.scrollY > 8 ? ' scrolled' : ''}">
        <button class="icon-btn menu-btn" data-action="nav-open" aria-label="${t('Open menu')}">${icon('menu')}</button>
        <button class="search-trigger" data-action="cmd-open" aria-label="${t('Search')}" aria-keyshortcuts="${isMac ? 'Meta+K' : 'Control+K'}">${icon('search', 16)}<span>${t('Search projects, clients, invoices…')}</span><kbd>${isMac ? '⌘' : 'Ctrl'} K</kbd></button>
        <div class="topbar-right">
          <button class="icon-btn" data-action="notif-toggle" aria-label="${unread ? t('Notifications, {n} unread', { n: unread }) : t('Notifications')}" aria-expanded="${String(notifOpen)}">${icon('bell')}${unread ? html`<span class="badge">${unread > 9 ? '9+' : unread}</span>` : ''}</button>
          ${notifOpen ? notifPopover() : ''}
          <a href="${href('/settings/profile')}" aria-label="${t('Profile')}">${avatar(user.name, b?.logo)}</a>
        </div>
      </header>
      <main id="main" tabindex="-1">${body}</main>
    </div>
    <nav class="bottom-nav" aria-label="${t('Quick navigation')}">
      ${[['dashboard', 'Home', 'home', '/dashboard'], ['projects', 'Projects', 'folder', '/projects'], ['clients', 'Clients', 'users', '/clients'], ['inbox', 'Inbox', 'bell', '/notifications']].map(([id, l, ic, link]) => html`<a href="${href(link)}" class="${id === active ? 'active' : ''}"${id === active ? raw(' aria-current="page"') : ''}>${icon(ic, 21)}${t(l)}${id === 'inbox' && unread ? html`<span class="badge">${unread > 9 ? '9+' : unread}</span>` : ''}</a>`)}
      <button data-action="nav-open" aria-label="${t('More')}">${icon('menu', 21)}${t('More')}</button>
    </nav>
  </div>`;
}

export function notificationItem(n) {
  const x = notificationText(n);
  return html`<div class="notif-wrap" data-notif="${n.id}"><a class="notif${n.readAt ? '' : ' unread'}" href="${href(n.link || '/notifications')}" data-action="notif-open" data-id="${n.id}" data-href="${n.link || '/notifications'}"><b>${x.title}</b><span>${x.body}</span><span>${fmtRelative(n.createdAt)}</span></a><button class="dismiss" data-action="notif-dismiss" data-id="${n.id}" aria-label="${t('Dismiss')}">${icon('x', 14)}</button></div>`;
}

function notifPopover() {
  const items = listNotifications().slice(0, 12);
  return html`<div class="popover" role="dialog" aria-label="${t('Notifications')}">
    <div class="popover-head"><b>${t('Notifications')}</b><span class="btn-row"><button class="btn btn-ghost btn-sm" data-action="notif-read-all">${t('Mark all read')}</button><a class="btn btn-ghost btn-sm" href="${href('/notifications')}" data-action="notif-close-go" data-href="/notifications">${t('View all')}</a></span></div>
    ${items.length ? items.map(notificationItem) : html`<p class="muted small" style="padding:16px">${t("You're all caught up.")}</p>`}
  </div>`;
}

onAction({
  'nav-open': () => { sidebarOpen = true; },
  'nav-close': () => { sidebarOpen = false; },
  'notif-toggle': () => { notifOpen = !notifOpen; },
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

export function resetShellState() { sidebarOpen = false; notifOpen = false; }
window.addEventListener('hashchange', resetShellState);
document.addEventListener('click', (e) => {
  if (notifOpen && !e.target.closest('.popover, [data-action="notif-toggle"]')) { notifOpen = false; rerender(); }
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
