// Freelancer app layout: sidebar, top bar, bottom navigation.
import { html, raw, icon, href, avatar, onAction, onForm, go, rerender } from '../ui.js';
import { auth } from '../core/auth.js';
import { persistent } from '../core/store.js';
import { t, lang, setUiLang } from '../core/i18n.js';
import { maybeBusiness, plan, notificationText } from '../services/context.js';
import { listNotifications, unreadCount, markRead, markAllRead } from '../services/growth.js';
import { fmtRelative } from '../core/util.js';

const NAV = [
  ['dashboard', 'Dashboard', 'home', '/dashboard'],
  ['projects', 'Projects', 'folder', '/projects'],
  ['clients', 'Clients', 'users', '/clients'],
  ['proposals', 'Proposals', 'proposal', '/proposals'],
  ['contracts', 'Contracts', 'contract', '/contracts'],
  ['invoices', 'Invoices', 'invoice', '/invoices'],
  ['payments', 'Payments', 'wallet', '/payments'],
  ['files', 'Files', 'files', '/files'],
  ['portfolio', 'Portfolio', 'star', '/portfolio'],
  ['analytics', 'Analytics', 'chart', '/analytics'],
  ['ai', 'AI Assistant', 'sparkles', '/ai'],
];

let sidebarOpen = false;
let notifOpen = false;

// Language switch used on every page (app, auth, landing).
export const langSwitch = (cls = 'btn btn-ghost btn-sm') => html`<button class="${cls}" data-action="lang-toggle" lang="${lang() === 'ar' ? 'en' : 'ar'}" aria-label="${lang() === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}">${lang() === 'ar' ? 'English' : 'العربية'}</button>`;

export function appShell(body, active) {
  const user = auth.currentUser();
  const b = maybeBusiness();
  const unread = unreadCount();
  const p = plan();
  const q = decodeURIComponent((location.hash.split('?q=')[1] || '').split('&')[0] || '');
  return html`
  <div class="shell">
    ${sidebarOpen ? html`<div class="sidebar-scrim" data-action="nav-close"></div>` : ''}
    <aside class="sidebar${sidebarOpen ? ' open' : ''}" aria-label="${t('Main navigation')}">
      <a class="brand" href="${href('/dashboard')}"><img src="assets/icon.svg" alt="">Scopewise</a>
      <a class="btn btn-primary" href="${href('/projects/new')}">${icon('plus', 16)} ${t('New Project')}</a>
      <nav class="nav">
        ${NAV.map(([id, label, ic, link]) => html`<a href="${href(link)}" class="${id === active ? 'active' : ''}"${id === active ? raw(' aria-current="page"') : ''}>${icon(ic)} ${t(label)}</a>`)}
        <div class="nav-sep"></div>
        <a href="${href('/settings')}" class="${active === 'settings' ? 'active' : ''}">${icon('settings')} ${t('Settings')}</a>
      </nav>
      <div class="sidebar-foot">
        ${p.id === 'free' ? html`<div class="plan-note">${t('Free plan · {n} active projects.', { n: p.limits.activeProjects })} <a href="${href('/settings/subscription')}">${t('See plans')}</a></div>` : ''}
        ${langSwitch('btn btn-ghost btn-sm lang-btn')}
        <button class="btn btn-ghost btn-sm" data-action="logout" style="justify-content:flex-start">${icon('logout', 16)} ${t('Sign out')}</button>
      </div>
    </aside>
    <div class="main-col">
      ${!user.emailVerified ? html`<div class="banner"><span>${t('Please verify {email} to secure your account.', { email: user.email })}</span><span class="btn-row"><button class="btn btn-sm btn-secondary" data-action="resend-verification">${t('Resend email')}</button><a class="btn btn-sm btn-ghost" href="${href('/mailbox')}">${t('Open dev mailbox')}</a></span></div>` : ''}
      ${!persistent ? html`<div class="banner notice-warn">${t('Your browser is blocking storage, so changes will be lost when you close this tab.')}</div>` : ''}
      <header class="topbar">
        <button class="icon-btn menu-btn" data-action="nav-open" aria-label="${t('Open menu')}">${icon('menu')}</button>
        <form class="search-form" data-form="global-search" role="search">
          ${icon('search', 16)}<label class="sr-only" for="global-q">${t('Search')}</label>
          <input id="global-q" name="q" type="search" placeholder="${t('Search projects, clients, invoices…')}" value="${q}" autocomplete="off">
        </form>
        <div class="topbar-right" style="position:relative">
          <button class="icon-btn" data-action="notif-toggle" aria-label="${unread ? t('Notifications, {n} unread', { n: unread }) : t('Notifications')}" aria-expanded="${notifOpen}">${icon('bell')}${unread ? html`<span class="badge">${unread > 9 ? '9+' : unread}</span>` : ''}</button>
          ${notifOpen ? notifPopover() : ''}
          <a href="${href('/settings/profile')}" aria-label="${t('Profile')}">${avatar(user.name, b?.logo)}</a>
        </div>
      </header>
      <main id="main" tabindex="-1">${body}</main>
    </div>
    <nav class="bottom-nav" aria-label="${t('Quick navigation')}">
      ${[['dashboard', 'Home', 'home', '/dashboard'], ['projects', 'Projects', 'folder', '/projects'], ['new', 'New', 'plus', '/projects/new'], ['invoices', 'Invoices', 'invoice', '/invoices']].map(([id, l, ic, link]) => html`<a href="${href(link)}" class="${id === active ? 'active' : ''}">${icon(ic, 20)}${t(l)}</a>`)}
      <button data-action="nav-open">${icon('menu', 20)}${t('More')}</button>
    </nav>
  </div>`;
}

function notifPopover() {
  const items = listNotifications().slice(0, 12);
  return html`<div class="popover" role="dialog" aria-label="${t('Notifications')}">
    <div class="card-head" style="padding:12px 16px;margin:0;border-bottom:1px solid var(--line)"><b>${t('Notifications')}</b><span class="btn-row"><button class="link-btn small" data-action="notif-read-all">${t('Mark all read')}</button><a class="small" href="${href('/notifications')}" data-action="notif-close-go" data-href="/notifications">${t('View all')}</a></span></div>
    ${items.length ? items.map((n) => { const x = notificationText(n); return html`<a class="notif${n.readAt ? '' : ' unread'}" href="${href(n.link || '/notifications')}" data-action="notif-open" data-id="${n.id}" data-href="${n.link || '/notifications'}"><b>${x.title}</b><span>${x.body}</span><span>${fmtRelative(n.createdAt)}</span></a>`; }) : html`<p class="muted small" style="padding:16px">${t("You're all caught up.")}</p>`}
  </div>`;
}

onAction({
  'nav-open': () => { sidebarOpen = true; },
  'nav-close': () => { sidebarOpen = false; },
  'notif-toggle': () => { notifOpen = !notifOpen; },
  'notif-read-all': () => { markAllRead(); },
  'notif-open': (el) => { markRead(el.dataset.id); notifOpen = false; go(el.dataset.href); return false; },
  'notif-close-go': (el) => { notifOpen = false; go(el.dataset.href); return false; },
  logout: () => { auth.logout(); go('/login'); return false; },
  'lang-toggle': () => {
    const next = lang() === 'ar' ? 'en' : 'ar';
    setUiLang(next);
    if (auth.currentUser()) auth.updateUser({ lang: next });
    sidebarOpen = false;
  },
});
onForm({ 'global-search': (v) => { go(`/search?q=${encodeURIComponent(v.q || '')}`); return false; } });

export function resetShellState() { sidebarOpen = false; notifOpen = false; }
window.addEventListener('hashchange', resetShellState);
document.addEventListener('click', (e) => {
  if (notifOpen && !e.target.closest('.popover, [data-action="notif-toggle"]')) { notifOpen = false; rerender(); }
});
