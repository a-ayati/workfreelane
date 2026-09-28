// Command center (⌘K / Ctrl+K): live search plus quick actions, fully keyboard driven.
import { html, icon, go, toast, runAction } from '../ui.js';
import { db } from '../core/store.js';
import { t } from '../core/i18n.js';
import { humanError } from '../core/util.js';
import { auth } from '../core/auth.js';
import { maybeBusiness } from '../services/context.js';
import { search } from '../services/growth.js';
import { listProjects, acceptedProposal } from '../services/core.js';
import { createProposal } from '../services/workflow.js';
import { createInvoice } from '../services/billing.js';
import { PROJECT_STATUSES } from '../services/constants.js';

const KIND_ICON = { Project: 'folder', Client: 'users', Proposal: 'proposal', Invoice: 'invoice', File: 'files' };
const KIND_GROUP = { Project: 'Projects', Client: 'Clients', Proposal: 'Proposals', Invoice: 'Invoices', File: 'Files::nav' };
const state = { open: false, q: '', sel: 0, mode: null, items: [] };

const available = () => !!auth.currentUser() && !!maybeBusiness();

function actions() {
  return [
    { id: 'new-project', icon: 'plus', label: t('New Project'), run: () => go('/projects/new') },
    { id: 'add-client', icon: 'users', label: t('Add Client'), run: () => { go('/clients'); setTimeout(() => runAction('client-new'), 60); } },
    { id: 'new-proposal', icon: 'proposal', label: t('New Proposal'), sub: t('Choose a project'), pick: 'proposal' },
    { id: 'new-invoice', icon: 'invoice', label: t('New Invoice'), sub: t('Choose a project'), pick: 'invoice' },
    { id: 'upload', icon: 'upload', label: t('Upload File'), sub: t('Choose a project'), pick: 'upload' },
  ];
}
function goTo() {
  return [
    ['Dashboard', 'home', '/dashboard'], ['Projects', 'folder', '/projects'], ['Clients', 'users', '/clients'], ['Invoices', 'invoice', '/invoices'],
    ['Notifications', 'bell', '/notifications'], ['Settings', 'settings', '/settings'],
  ].map(([l, ic, link]) => ({ id: 'go' + link, icon: ic, label: t(l), run: () => go(link) }));
}

function projectsFor(mode, q) {
  const term = q.trim().toLowerCase();
  return listProjects({}).filter((p) => {
    if (term && !`${p.name} ${db.get('clients', p.clientId)?.name}`.toLowerCase().includes(term)) return false;
    if (mode === 'proposal') return p.status === 'draft' && !acceptedProposal(p.id) && !db.find('proposals', (x) => x.projectId === p.id && ['draft', 'sent', 'viewed'].includes(x.status));
    if (mode === 'invoice') return !!acceptedProposal(p.id) && p.status !== 'cancelled';
    return p.status !== 'cancelled';
  }).map((p) => ({ id: 'p' + p.id, icon: 'folder', label: p.name, sub: `${db.get('clients', p.clientId)?.name} · ${t(PROJECT_STATUSES[p.status]?.label || p.status)}`, run: () => pickProject(mode, p) }));
}

function pickProject(mode, p) {
  try {
    if (mode === 'proposal') { const prop = createProposal(p.id); go(`/proposals/${prop.id}`); }
    else if (mode === 'invoice') { const inv = createInvoice(p.id, { kind: 'custom', items: [{ description: t('Additional work'), quantity: 1, unitPrice: 0 }] }); go(`/invoices/${inv.id}`); }
    else go(`/projects/${p.id}/files`);
  } catch (e) { toast(humanError(e), 'error'); }
}

function build() {
  const q = state.q.trim();
  const groups = [];
  if (state.mode) {
    groups.push([t('Choose a project'), projectsFor(state.mode, q)]);
  } else if (q.length >= 2) {
    const results = search(q);
    const byKind = {};
    results.forEach((r) => { (byKind[r.kind] ||= []).push({ id: r.href, icon: KIND_ICON[r.kind] || 'search', label: r.title, sub: r.sub, run: () => go(r.href) }); });
    Object.entries(byKind).forEach(([k, items]) => groups.push([t(KIND_GROUP[k] || k), items.slice(0, 6)]));
    const acts = actions().filter((a) => a.label.toLowerCase().includes(q.toLowerCase()));
    if (acts.length) groups.push([t('Quick actions'), acts]);
  } else {
    groups.push([t('Quick actions'), actions()]);
    groups.push([t('Go to'), goTo()]);
  }
  state.items = groups.flatMap(([, items]) => items);
  state.sel = Math.min(state.sel, Math.max(0, state.items.length - 1));
  return groups;
}

function renderList() {
  const groups = build();
  let i = -1;
  const list = document.querySelector('#cmd-root .cmd-list');
  if (!list) return;
  list.innerHTML = String(groups.length && state.items.length ? html`${groups.map(([title, items]) => items.length ? html`<div class="cmd-group" role="presentation">${title}</div>${items.map((it) => { i++; return html`<button class="cmd-item" role="option" id="cmd-opt-${i}" data-cmd-index="${i}" aria-selected="${String(i === state.sel)}" style="animation-delay:${Math.min(i, 10) * 18}ms"><span class="ci-icon">${icon(it.icon, 16)}</span><span class="ci-text">${it.label}${it.sub ? html`<span class="ci-sub">${it.sub}</span>` : ''}</span></button>`; })}` : '')}`
    : html`<div class="cmd-empty">${state.mode ? t('No matching projects.') : t('No results for “{q}”.', { q: state.q })}</div>`);
  document.getElementById('cmd-input')?.setAttribute('aria-activedescendant', `cmd-opt-${state.sel}`);
}

function select(delta) {
  if (!state.items.length) return;
  state.sel = (state.sel + delta + state.items.length) % state.items.length;
  document.querySelectorAll('#cmd-root .cmd-item').forEach((el) => el.setAttribute('aria-selected', String(Number(el.dataset.cmdIndex) === state.sel)));
  document.getElementById(`cmd-opt-${state.sel}`)?.scrollIntoView({ block: 'nearest' });
  document.getElementById('cmd-input')?.setAttribute('aria-activedescendant', `cmd-opt-${state.sel}`);
}

function activate(index) {
  const it = state.items[index];
  if (!it) return;
  if (it.pick) { state.mode = it.pick; state.q = ''; state.sel = 0; const input = document.getElementById('cmd-input'); input.value = ''; input.placeholder = t('Search projects…'); renderList(); input.focus(); return; }
  closeCommand();
  it.run();
}

let lastFocus = null;
export function openCommand(initial = '') {
  if (!available() || state.open) return;
  lastFocus = document.activeElement;
  Object.assign(state, { open: true, q: initial, sel: 0, mode: null });
  const root = document.getElementById('cmd-root');
  root.innerHTML = String(html`<div class="cmd-backdrop" data-cmd-close></div>
    <div class="cmd" role="dialog" aria-modal="true" aria-label="${t('Command center')}">
      <div class="cmd-input">${icon('search', 20)}<input id="cmd-input" role="combobox" aria-expanded="true" aria-controls="cmd-list" aria-autocomplete="list" autocomplete="off" spellcheck="false" placeholder="${t('Search projects, clients, invoices…')}" value="${initial}"><kbd>Esc</kbd></div>
      <div class="cmd-list" id="cmd-list" role="listbox"></div>
      <div class="cmd-foot"><span><kbd>↑</kbd> <kbd>↓</kbd> ${t('to navigate')}</span><span><kbd>↵</kbd> ${t('to open')}</span><span><kbd>Esc</kbd> ${t('to close')}</span></div>
    </div>`);
  renderList();
  const input = document.getElementById('cmd-input');
  input.focus();
  input.addEventListener('input', () => { state.q = input.value; state.sel = 0; renderList(); });
}
export function closeCommand() {
  if (!state.open) return;
  state.open = false;
  document.getElementById('cmd-root').innerHTML = '';
  lastFocus?.focus?.({ preventScroll: true });
}

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    if (!available()) return;
    e.preventDefault();
    state.open ? closeCommand() : openCommand();
    return;
  }
  if (!state.open) return;
  if (e.key === 'Escape') {
    e.preventDefault(); e.stopPropagation();
    if (state.mode) { state.mode = null; state.q = ''; const input = document.getElementById('cmd-input'); input.value = ''; input.placeholder = t('Search projects, clients, invoices…'); renderList(); } else closeCommand();
  } else if (e.key === 'ArrowDown') { e.preventDefault(); select(1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); select(-1); }
  else if (e.key === 'Enter') { e.preventDefault(); activate(state.sel); }
  else if (e.key === 'Tab') { e.preventDefault(); document.getElementById('cmd-input')?.focus(); }
}, true);
document.addEventListener('click', (e) => {
  if (!state.open) return;
  const item = e.target.closest('#cmd-root .cmd-item');
  if (item) { e.preventDefault(); activate(Number(item.dataset.cmdIndex)); return; }
  if (e.target.closest('[data-cmd-close]')) closeCommand();
});
window.addEventListener('hashchange', closeCommand);
