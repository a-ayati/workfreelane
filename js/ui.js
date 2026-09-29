// UI runtime: router, delegated actions/forms, modals, toasts and shared components.
import { html, raw, esc } from './core/html.js';
import { humanError, fmtMoney, initials } from './core/util.js';
import { t } from './core/i18n.js';

// ---------------- Icons ----------------
const P = {
  home: 'M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z',
  folder: 'M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  proposal: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5',
  contract: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  invoice: 'M6 2h12v20l-3-2-3 2-3-2-3 2zM9 7h6M9 11h6M9 15h4',
  wallet: 'M3 7a2 2 0 0 1 2-2h14v4M3 7v10a2 2 0 0 0 2 2h16V9H5a2 2 0 0 1-2-2M17 14h.01',
  files: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7zM14 2v6h6',
  star: 'm12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z',
  chart: 'M3 3v18h18M8 17V11M13 17V7M18 17v-4',
  sparkles: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16M21 21l-4.3-4.3',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  plus: 'M12 5v14M5 12h14', check: 'M20 6 9 17l-5-5', x: 'M18 6 6 18M6 6l12 12',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  arrow: 'M5 12h14M12 5l7 7-7 7', back: 'M19 12H5M12 19l-7-7 7-7',
  menu: 'M3 6h18M3 12h18M3 18h18', more: 'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2M19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2M5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 6v6l4 2', external: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3',
  trash: 'M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2',
  edit: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z',
  eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10', link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
  mail: 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2M22 6l-10 7L2 6', logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  pin: 'M12 22s-7-7.5-7-12a7 7 0 1 1 14 0c0 4.5-7 12-7 12M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5',
  calendar: 'M4 5h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1M3 10h18M8 3v4M16 3v4',
  chat: 'M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12',
  tasks: 'M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2',
  building: 'M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M3 21h18M8 7h4M8 11h4M8 15h4',
  team: 'M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6M5 20v-1a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v1M4.5 10.5a2.3 2.3 0 1 0 0-4.6M19.5 10.5a2.3 2.3 0 1 1 0-4.6',
  film: 'M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4',
  camera: 'M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  pen: 'M12 19l7-7 3 3-7 7zM18 13l-1.5-7.5L2 2l3.5 14.5L13 18zM2 2l7.6 7.6M11 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4',
  megaphone: 'M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1M16 8a5 5 0 0 1 0 8M19 5a9 9 0 0 1 0 14',
  tv: 'M3 7h18v12H3zM8 3l4 4 4-4',
  swap: 'M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7',
  flag: 'M4 22V4M4 4h13l-2 4 2 4H4',
};
// Project identity icons (a small, neutral set).
export const PROJECT_ICONS = ['folder', 'film', 'camera', 'pen', 'star', 'megaphone', 'tv', 'sparkles'];
export const icon = (name, size = 18) => raw(`<svg class="icon${name === 'arrow' || name === 'back' ? ' icon-dir' : ''}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${P[name] || ''}"/></svg>`);

// ---------------- Router ----------------
const routes = [];
export function route(pattern, handler) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/\/:(\w+)(\?)?/g, (_, k, optional) => { keys.push(k); return optional ? '(?:/([^/]+))?' : '/([^/]+)'; }) + '/?$');
  routes.push({ re, keys, handler, pattern });
}
export function parseHash() {
  const h = decodeURIComponent(location.hash.slice(1) || '/');
  const [path, qs = ''] = h.split('?');
  return { path: path || '/', query: Object.fromEntries(new URLSearchParams(qs)) };
}
export function match(path) {
  for (const r of routes) {
    const m = path.match(r.re);
    if (m) return { handler: r.handler, params: Object.fromEntries(r.keys.map((k, i) => [k, m[i + 1] && decodeURIComponent(m[i + 1])])) };
  }
  return null;
}
export const go = (path) => { if (location.hash.slice(1) === path) rerender(); else location.hash = path; };
export const href = (path) => '#' + path;

let renderFn = () => {};
export const setRenderer = (fn) => { renderFn = fn; };
export function rerender() {
  const y = window.scrollY;
  renderFn();
  window.scrollTo(0, y);
}

// ---------------- Actions & forms ----------------
const actions = {};
const forms = {};
export const onAction = (map) => Object.assign(actions, map);
export const onForm = (map) => Object.assign(forms, map);

export function formValues(form) {
  const out = {};
  const fd = new FormData(form);
  for (const [name, value] of fd.entries()) {
    if (value instanceof File) { if (value.size || value.name) (out[name] ||= []).push(value); continue; }
    if (name.endsWith('[]')) { (out[name.slice(0, -2)] ||= []).push(value); continue; }
    if (name.includes('.')) {
      const parts = name.split('.');
      let cur = out;
      parts.forEach((p, i) => {
        const last = i === parts.length - 1;
        const nextIsIndex = !last && /^\d+$/.test(parts[i + 1]);
        if (last) cur[p] = value; else cur = cur[p] ||= nextIsIndex ? [] : {};
      });
      continue;
    }
    out[name] = value;
  }
  // Unchecked checkboxes
  form.querySelectorAll('input[type=checkbox][data-bool]').forEach((cb) => { out[cb.name] = cb.checked; });
  Object.keys(out).forEach((k) => { if (Array.isArray(out[k])) out[k] = out[k].filter((x) => x !== undefined); });
  return out;
}

function markField(form, field) {
  form?.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
  if (!field || !form) return;
  const el = form.querySelector(`[name="${CSS.escape(field)}"]`);
  if (el) { el.setAttribute('aria-invalid', 'true'); el.focus(); }
}

async function runSafely(fn, { form, button } = {}) {
  if (button) { button.disabled = true; button.setAttribute('aria-busy', 'true'); }
  try {
    const result = await fn();
    if (result !== false) rerender();
    return result;
  } catch (err) {
    toast(humanError(err), 'error');
    markField(form, err?.field);
  } finally {
    if (button && button.isConnected) { button.disabled = false; button.removeAttribute('aria-busy'); }
  }
}

// Run a registered action programmatically (e.g. from the command center).
export function runAction(name, dataset = {}) {
  const fn = actions[name];
  if (!fn) return;
  const el = document.createElement('button');
  Object.entries(dataset).forEach(([k, v]) => { el.dataset[k] = v; });
  runSafely(() => fn(el, new Event('click')));
}

let dirty = false;
export const isDirty = () => dirty;
export const clearDirty = () => { dirty = false; };

export function installDelegation() {
  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const name = el.dataset.action;
    const fn = actions[name];
    if (!fn) { console.warn('No action', name); return; }
    ev.preventDefault();
    runSafely(() => fn(el, ev), { button: el.tagName === 'BUTTON' ? el : null, form: el.closest('form') });
  });
  document.addEventListener('submit', (ev) => {
    const form = ev.target.closest('form[data-form]');
    if (!form) return;
    ev.preventDefault();
    const fn = forms[form.dataset.form];
    if (!fn) return;
    const button = ev.submitter || form.querySelector('[type=submit]');
    runSafely(async () => { const r = await fn(formValues(form), form, ev.submitter); if (r !== false) dirty = false; return r; }, { form, button });
  });
  document.addEventListener('input', (ev) => { if (ev.target.closest('main form, #modal-root form')) dirty = true; });
  document.addEventListener('change', (ev) => {
    const el = ev.target.closest('[data-change]');
    if (el && actions[el.dataset.change]) runSafely(() => actions[el.dataset.change](el, ev));
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && document.querySelector('#modal-root .modal')) closeModal();
    if (ev.key === 'Tab') trapFocus(ev);
  });
}

// ---------------- Toasts & success cards ----------------
export function toast(message, tone = 'ok') {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = `toast toast-${tone}`;
  el.setAttribute('role', tone === 'error' ? 'alert' : 'status');
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => el.classList.add('out'), tone === 'error' ? 5200 : 3200);
  setTimeout(() => el.remove(), tone === 'error' ? 5600 : 3600);
}

export const checkBadge = (size) => raw(`<span class="check-badge"${size ? ` style="width:${size}px;height:${size}px"` : ''} aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>`);

// A calm, non-blocking success moment with the next step.
export function successCard({ title, next, href: link, label }) {
  const root = document.getElementById('toast-root');
  root.querySelectorAll('.success-card').forEach((x) => x.remove());
  const el = document.createElement('div');
  el.className = 'success-card';
  el.setAttribute('role', 'status');
  el.innerHTML = String(html`${checkBadge()}<div><b>${title}</b>${next ? html`<span class="next">${t('Next')}: ${next}</span>` : ''}</div>${link ? html`<a class="btn btn-primary btn-sm" href="${href(link)}">${label || t('Continue')} ${icon('arrow', 14)}</a>` : ''}`);
  root.appendChild(el);
  el.querySelector('a')?.addEventListener('click', () => el.remove());
  setTimeout(() => el.classList.add('out'), 6000);
  setTimeout(() => el.remove(), 6400);
}

// ---------------- Modals & bottom sheets ----------------
let lastFocus = null;
let modalRenderer = null;
let closeTimer = null;
export function openModal(renderer, { size = '' } = {}) {
  clearTimeout(closeTimer);
  lastFocus = document.activeElement;
  modalRenderer = typeof renderer === 'function' ? renderer : () => renderer;
  const root = document.getElementById('modal-root');
  root.classList.remove('closing');
  root.innerHTML = `<div class="modal-backdrop" data-action="modal-close"></div><div class="modal ${size}" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="sheet-grip"><div class="sheet-handle" aria-hidden="true"></div></div><div class="modal-body">${modalRenderer()}</div></div>`;
  document.body.classList.add('has-modal');
  installSheetDrag(root.querySelector('.modal'));
  const first = root.querySelector('[autofocus], input:not([type=hidden]), textarea, select, button:not(.modal-x)');
  // Avoid popping the keyboard on phones when a sheet opens.
  if (!matchMedia('(max-width: 900px)').matches) (first || root.querySelector('.modal')).focus?.();
  else root.querySelector('.modal').setAttribute('tabindex', '-1'), root.querySelector('.modal').focus({ preventScroll: true });
}
export function refreshModal() {
  const body = document.querySelector('#modal-root .modal-body');
  if (body && modalRenderer) body.innerHTML = String(modalRenderer());
}
export function closeModal() {
  const root = document.getElementById('modal-root');
  if (!root.firstChild) return;
  modalRenderer = null;
  document.body.classList.remove('has-modal');
  root.classList.add('closing');
  clearTimeout(closeTimer);
  closeTimer = setTimeout(() => { root.innerHTML = ''; root.classList.remove('closing'); }, 170);
  lastFocus?.focus?.({ preventScroll: true });
}
// Drag the sheet down to dismiss (the close button and Escape remain).
function installSheetDrag(modal) {
  const grip = modal?.querySelector('.sheet-grip');
  if (!grip) return;
  let startY = 0, dy = 0, t0 = 0, active = false;
  grip.addEventListener('pointerdown', (e) => {
    if (!matchMedia('(max-width: 900px)').matches) return;
    active = true; startY = e.clientY; dy = 0; t0 = performance.now();
    grip.setPointerCapture(e.pointerId);
    modal.classList.add('dragging'); modal.classList.remove('settle');
  });
  grip.addEventListener('pointermove', (e) => {
    if (!active) return;
    dy = Math.max(0, e.clientY - startY);
    modal.style.transform = `translateY(${dy}px)`;
  });
  const end = () => {
    if (!active) return;
    active = false;
    modal.classList.remove('dragging');
    const velocity = dy / Math.max(1, performance.now() - t0);
    if (dy > 120 || velocity > 0.6) { modal.style.transform = ''; closeModal(); return; }
    modal.classList.add('settle'); modal.style.transform = '';
  };
  grip.addEventListener('pointerup', end);
  grip.addEventListener('pointercancel', end);
}
function trapFocus(ev) {
  const modal = document.querySelector('#modal-root .modal');
  if (!modal) return;
  const f = [...modal.querySelectorAll('a[href], button:not([disabled]), input:not([type=hidden]), select, textarea, [tabindex]:not([tabindex="-1"])')];
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
  else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
}
// "Try again" on error states simply re-renders the current route.
onAction({ 'modal-close': () => { closeModal(); return false; }, retry: () => {} });

export const modalHead = (title, sub) => html`<div class="modal-head"><div><h2 id="modal-title">${title}</h2>${sub ? html`<p class="muted">${sub}</p>` : ''}</div><button class="icon-btn modal-x" data-action="modal-close" aria-label="${t('Close')}">${icon('x')}</button></div>`;

// Confirmation dialog returning a promise.
export function confirmDialog({ title, body, confirm = t('Confirm'), tone = 'primary', requireText = '' }) {
  return new Promise((resolve) => {
    onAction({
      'confirm-yes': () => {
        if (requireText) {
          const v = document.querySelector('#confirm-text')?.value.trim();
          if (v !== requireText) { toast(t('Type "{text}" to confirm.', { text: requireText }), 'error'); return false; }
        }
        closeModal(); resolve(true); return false;
      },
      'confirm-no': () => { closeModal(); resolve(false); return false; },
    });
    openModal(html`${modalHead(title)}<p class="modal-text">${body}</p>
      ${requireText ? html`<label class="field"><span>${t('Type {text} to confirm', { text: requireText })}</span><input id="confirm-text" autocomplete="off"></label>` : ''}
      <div class="modal-actions"><button class="btn btn-ghost" data-action="confirm-no">${t('Cancel')}</button><button class="btn btn-${tone}" data-action="confirm-yes">${confirm}</button></div>`, { size: 'sm' });
  });
}

// ---------------- Components ----------------
export const pill = (map, status) => {
  const s = map[status] || { label: status, tone: 'neutral' };
  return html`<span class="pill pill-${s.tone}"><span class="dot" aria-hidden="true"></span>${t(s.label)}</span>`;
};
export const moneyEl = (n, cur) => html`<span class="num">${fmtMoney(n, cur)}</span>`;
export const avatar = (name, img, size = 32) => img
  ? html`<img class="avatar" src="${img}" alt="" width="${size}" height="${size}">`
  : html`<span class="avatar" style="width:${size}px;height:${size}px" aria-hidden="true">${initials(name)}</span>`;

export function pageHead({ title, sub, actions: acts, back, eyebrow }) {
  return html`<header class="page-head">
    ${back ? html`<a class="back-link" href="${href(back[0])}">${icon('back', 16)} ${back[1]}</a>` : ''}
    <div class="page-head-row">
      <div>${eyebrow ? html`<div class="eyebrow">${eyebrow}</div>` : ''}<h1>${title}</h1>${sub ? html`<p class="page-sub">${sub}</p>` : ''}</div>
      ${acts ? html`<div class="page-actions">${acts}</div>` : ''}
    </div>
  </header>`;
}

export function empty({ title, body, cta }) {
  return html`<div class="empty"><div class="empty-mark" aria-hidden="true"></div><h3>${title}</h3><p>${body}</p>${cta || ''}</div>`;
}

export function progressBar(value, label, key = '') {
  const v = Math.max(0, Math.min(100, value));
  return html`<div class="progress" role="progressbar" aria-valuenow="${v}" aria-valuemin="0" aria-valuemax="100" aria-label="${label || t('Progress')}"><span style="width:${v}%" data-width="${v}" data-key="${key}"></span></div>`;
}

export function field({ label, name, value = '', type = 'text', required, placeholder, hint, rows, options, attrs = '', full }) {
  const id = `f-${name.replace(/[^a-z0-9]/gi, '-')}-${Math.random().toString(36).slice(2, 6)}`;
  let control;
  if (type === 'textarea') control = html`<textarea id="${id}" name="${name}" rows="${rows || 4}" placeholder="${placeholder || ''}" ${raw(attrs)}${required ? raw(' required') : ''}>${value}</textarea>`;
  else if (type === 'select') control = html`<select id="${id}" name="${name}" ${raw(attrs)}${required ? raw(' required') : ''}>${options.map((o) => { const [v, l] = Array.isArray(o) ? o : [o, o]; return html`<option value="${v}"${String(v) === String(value) ? raw(' selected') : ''}>${l}</option>`; })}</select>`;
  else control = html`<input id="${id}" name="${name}" type="${type}" value="${value}" placeholder="${placeholder || ''}" ${raw(attrs)}${required ? raw(' required') : ''}>`;
  return html`<label class="field${full ? ' full' : ''}" for="${id}"><span>${label}${required ? html`<em aria-hidden="true"> *</em>` : ''}</span>${control}${hint ? html`<small>${hint}</small>` : ''}</label>`;
}

export function tabs(items, active) {
  return html`<nav class="tabs" aria-label="${t('Sections')}"><div class="tabs-inner">${items.map(([id, label, link, badge]) => html`<a class="tab${id === active ? ' active' : ''}" href="${href(link)}"${id === active ? raw(' aria-current="page"') : ''}>${label}${badge ? html`<span class="tab-badge">${badge}</span>` : ''}</a>`)}</div></nav>`;
}

export const comingSoon = (label) => html`<span class="soon">${label || t('Coming Soon')}</span>`;
export { html, raw, esc };

// ---------------- Motion helpers ----------------
export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
// Numbers marked data-count animate from their previous value (keyed by data-key).
const lastCounts = new Map();
export function animateCounts(root = document) {
  root.querySelectorAll('[data-count]').forEach((el) => {
    const to = Number(el.dataset.count) || 0;
    const key = el.dataset.key || '';
    const from = key && lastCounts.has(key) ? lastCounts.get(key) : Math.max(0, to - Math.min(to, 12));
    if (key) lastCounts.set(key, to);
    if (from === to || reducedMotion()) { el.textContent = String(to); return; }
    const start = performance.now(), dur = 420;
    const step = (now) => {
      const k = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      el.textContent = String(Math.round(from + (to - from) * e));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  // Progress bars grow from their previous width.
  root.querySelectorAll('[data-width]').forEach((el) => {
    const key = el.dataset.key || '';
    const to = Number(el.dataset.width) || 0;
    const from = key && lastCounts.has('w:' + key) ? lastCounts.get('w:' + key) : 0;
    if (key) lastCounts.set('w:' + key, to);
    if (from === to || reducedMotion()) return;
    el.style.width = `${from}%`;
    requestAnimationFrame(() => requestAnimationFrame(() => { el.style.width = `${to}%`; }));
  });
}

// ---------------- Appearance ----------------
const THEME_KEY = 'sw.theme';
export function getTheme() { try { return localStorage.getItem(THEME_KEY) || 'system'; } catch { return 'system'; } }
export function setTheme(v) {
  const theme = ['light', 'dark'].includes(v) ? v : 'system';
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* ignore */ }
  if (theme === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = theme;
}
