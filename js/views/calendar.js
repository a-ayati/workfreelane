// All-projects calendar: a month grid plus an agenda, with filters and
// per-project visibility. Every project keeps its own color.
import { html, raw, icon, href, pageHead, empty, onAction } from '../ui.js';
import { t, lang, locale } from '../core/i18n.js';
import { todayISO } from '../core/util.js';
import { allEvents, sortEvents, EVENT_FILTERS } from '../services/calendar.js';
import { agenda, eventTitle } from './collab.js';

const HIDDEN_KEY = 'sw.cal.hidden';
const readHidden = () => { try { return JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]'); } catch { return []; } };
const writeHidden = (v) => { try { localStorage.setItem(HIDDEN_KEY, JSON.stringify(v)); } catch { /* per-device convenience only */ } };
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function calendarView(_, q) {
  const filter = EVENT_FILTERS.some(([id]) => id === q.f) ? q.f : 'all';
  const view = q.view === 'agenda' ? 'agenda' : 'month';
  const today = todayISO();
  const month = /^\d{4}-\d{2}$/.test(q.m || '') ? q.m : today.slice(0, 7);
  const selected = /^\d{4}-\d{2}-\d{2}$/.test(q.d || '') ? q.d : (month === today.slice(0, 7) ? today : `${month}-01`);
  const hidden = readHidden();
  const { projects, events } = allEvents({ filter, hidden });
  const [y, mo] = month.split('-').map(Number);
  const first = new Date(y, mo - 1, 1);
  const monthName = first.toLocaleDateString(locale(), { month: 'long', year: 'numeric' });
  const prev = iso(new Date(y, mo - 2, 1)).slice(0, 7);
  const next = iso(new Date(y, mo, 1)).slice(0, 7);
  const link = (patch) => { const p = { f: filter, view, m: month, ...patch }; return `/calendar?${Object.entries(p).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join('&')}`; };
  const byDay = new Map();
  sortEvents(events).forEach((e) => { (byDay.get(e.date) || byDay.set(e.date, []).get(e.date)).push(e); });

  // Week starts Saturday in Arabic, Sunday in English.
  const startDow = lang() === 'ar' ? 6 : 0;
  const offset = (first.getDay() - startDow + 7) % 7;
  const gridStart = new Date(y, mo - 1, 1 - offset);
  const cells = Array.from({ length: 42 }, (_, i) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
  const weeks = cells.slice(35).every((d) => d.getMonth() !== mo - 1) ? 5 : 6;
  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(2023, 0, 1 + ((startDow + i) % 7)).toLocaleDateString(locale(), { weekday: 'short' }));

  const upcoming = sortEvents(events.filter((e) => e.date >= today)).slice(0, 80);
  const dayEvents = byDay.get(selected) || [];

  return html`${pageHead({ title: t('Calendar'), sub: t('Every deadline, review, approval, payment and delivery across your projects — added automatically.') })}
    <div class="cal-bar">
      <nav class="filters" aria-label="${t('Filter the calendar')}" style="margin:0">${EVENT_FILTERS.map(([id, l]) => html`<a href="${href(link({ f: id }))}" class="${filter === id ? 'active' : ''}"${filter === id ? raw(' aria-current="true"') : ''}>${t(l)}</a>`)}</nav>
      <div class="seg" role="group" aria-label="${t('View')}"><a class="seg-a" href="${href(link({ view: 'month' }))}" aria-pressed="${String(view === 'month')}">${t('Month')}</a><a class="seg-a" href="${href(link({ view: 'agenda' }))}" aria-pressed="${String(view === 'agenda')}">${t('Agenda')}</a></div>
    </div>
    ${projects.length ? html`<div class="cal-projects" role="group" aria-label="${t('Show or hide projects')}">${projects.map((p) => html`<button class="cal-proj${hidden.includes(p.id) ? ' off' : ''}" style="--pc:${p.color}" data-action="cal-toggle" data-id="${p.id}" aria-pressed="${String(!hidden.includes(p.id))}"><span class="sw" aria-hidden="true"></span>${p.name}</button>`)}</div>` : ''}
    ${view === 'month' ? html`<div class="cal-wrap">
      <section class="card cal-month" aria-label="${monthName}">
        <div class="cal-head"><h2>${monthName}</h2><div class="btn-row">
          <a class="icon-btn" href="${href(link({ m: prev, d: '' }))}" aria-label="${t('Previous month')}">${icon('back', 16)}</a>
          <a class="btn btn-secondary btn-sm" href="${href(link({ m: today.slice(0, 7), d: today }))}">${t('Today')}</a>
          <a class="icon-btn" href="${href(link({ m: next, d: '' }))}" aria-label="${t('Next month')}">${icon('arrow', 16)}</a></div></div>
        <div class="cal-grid" role="grid">
          ${weekdays.map((w) => html`<div class="cal-wd" role="columnheader">${w}</div>`)}
          ${cells.slice(0, weeks * 7).map((d) => {
            const k = iso(d);
            const evs = byDay.get(k) || [];
            const inMonth = d.getMonth() === mo - 1;
            return html`<a role="gridcell" class="cal-day${inMonth ? '' : ' out'}${k === today ? ' today' : ''}${k === selected ? ' sel' : ''}" href="${href(link({ d: k, m: month }))}" aria-label="${d.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' })}${evs.length ? ` — ${t('{n} items', { n: evs.length })}` : ''}"${k === selected ? raw(' aria-selected="true"') : ''}>
              <span class="n">${d.toLocaleDateString(locale(), { day: 'numeric' })}</span>
              <span class="chips">${evs.slice(0, 3).map((e) => html`<span class="chip-ev ev-${e.kind}" style="--pc:${e.color}">${eventTitle(e)}</span>`)}${evs.length > 3 ? html`<span class="more">+${evs.length - 3}</span>` : ''}</span>
              <span class="dots" aria-hidden="true">${evs.slice(0, 4).map((e) => html`<i style="--pc:${e.color}"></i>`)}</span>
            </a>`;
          })}
        </div>
      </section>
      <aside class="card cal-side"><h2>${new Date(`${selected}T12:00:00`).toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
        ${dayEvents.length ? agenda(dayEvents) : html`<p class="muted small" style="margin:0">${t('Nothing on this day.')}</p>`}</aside>
    </div>`
      : upcoming.length ? html`<section class="card">${agenda(upcoming)}</section>` : empty({ title: t('Nothing coming up'), body: t('Deadlines, reviews, invoices and meetings appear here automatically.') })}`;
}

onAction({
  'cal-toggle': (el) => {
    const h = readHidden();
    writeHidden(h.includes(el.dataset.id) ? h.filter((x) => x !== el.dataset.id) : [...h, el.dataset.id]);
  },
});
