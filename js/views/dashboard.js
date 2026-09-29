// Dashboard — a workspace, not a report: greeting → needs your attention →
// active projects → recent activity → revenue.
import { html, icon, href, pill, empty, progressBar } from '../ui.js';
import { db } from '../core/store.js';
import { t, locale } from '../core/i18n.js';
import { fmtMoney, fmtNumber, currencyLabel, fmtShortDate, fmtRelative, todayISO, addDays, clock } from '../core/util.js';
import { me, myBusiness, activityText, can, wsCan, projectParties, access } from '../services/context.js';
import { clientContext, clientSectionView } from './portal.js';
import { listProjects, nextAction, financials, progress, isOverdue } from '../services/core.js';
import { dashboardData, recentActivity, sweepReminders } from '../services/growth.js';
import { listInvoices } from '../services/billing.js';
import { listReminders } from '../services/delivery.js';
import { PROJECT_STATUSES } from '../services/constants.js';

// Next step for this person on this project, from their side of the project.
export function nextFor(p) {
  if (p.side !== 'client' && access(p)?.side !== 'client') return nextAction(p);
  const first = clientSectionView(clientContext(p), 'overview').todo.find((x) => !x.done);
  const prov = projectParties(p).find((x) => x.side === 'provider');
  return first ? { label: first.title, detail: first.body, href: `/projects/${p.id}/${first.section}` } : { label: t('Waiting for {org}.', { org: prov?.name }), waiting: true, href: `/projects/${p.id}` };
}
// The other party's name, seen from my side.
export function counterpart(p, clientName) {
  if ((p.side || access(p)?.side) === 'client') return projectParties(p).find((x) => x.side === 'provider')?.name || '';
  return projectParties(p).find((x) => x.side === 'client')?.name || clientName;
}

export function greeting(d = clock.now()) {
  const h = d.getHours();
  return h < 12 ? t('Good morning') : h < 18 ? t('Good afternoon') : t('Good evening');
}

export function projectRow(p, clientName) {
  const f = financials(p);
  const na = nextFor(p);
  const money = can(p, 'finance.view');
  clientName = counterpart(p, clientName);
  const late = isOverdue(p);
  return html`<a class="list-row cols-project" href="${href(`/projects/${p.id}`)}" style="--pc:${p.color || 'var(--accent-mark)'}">
    <div><div class="cell-title"><i class="pdot" aria-hidden="true"></i>${p.name}${p.side === 'client' ? html` <span class="shared-tag">${t('Shared')}</span>` : ''}</div><div class="cell-sub">${clientName}</div>${progressBar(progress(p), t('{name} progress', { name: p.name }), `row-${p.id}`)}</div>
    <div>${pill(PROJECT_STATUSES, p.status)}</div>
    <div class="hide-sm hide-md"><div class="${late ? 'pill-red' : ''}" style="font-size:13.5px;background:none">${p.deadline ? t('Due {date}', { date: fmtShortDate(p.deadline) }) : t('No deadline')}</div><div class="cell-sub">${progress(p)}%</div></div>
    <div class="hide-sm hide-md">${money ? html`<div class="num" style="font-size:13.5px">${fmtMoney(f.total, p.currency)}</div><div class="cell-sub">${t('{n}% paid', { n: f.paidPct })}</div>` : html`<div class="cell-sub">—</div>`}</div>
    <div class="next-step${na.waiting ? ' waiting' : ''}"><b>${na.label}${na.waiting ? '' : html` ${icon('arrow', 13)}`}</b><span>${na.detail || ''}</span></div>
  </a>`;
}

// Interactive project surface: status, progress and one dominant next action.
export function projectCard(p, clientName) {
  const f = financials(p);
  const na = nextFor(p);
  const money = can(p, 'finance.view');
  clientName = counterpart(p, clientName);
  const pct = progress(p);
  const late = isOverdue(p);
  return html`<a class="pcard" style="--pc:${p.color || 'var(--accent-mark)'}" href="${href(na.href && !na.waiting ? na.href : `/projects/${p.id}`)}" aria-label="${p.name} — ${na.label}">
    <div class="pc-top"><div><div class="pc-name"><span class="pc-icon" aria-hidden="true">${icon(p.icon || 'folder', 15)}</span>${p.name}</div><div class="pc-client">${clientName}</div></div>${pill(PROJECT_STATUSES, p.status)}</div>
    <div><div class="pc-pct"><span data-count="${pct}" data-key="pct-${p.id}">${pct}</span><small>%</small></div>${progressBar(pct, t('{name} progress', { name: p.name }), `card-${p.id}`)}</div>
    <div class="pc-meta"><span style="${late ? 'color:var(--red)' : ''}">${p.deadline ? t('Due {date}', { date: fmtShortDate(p.deadline) }) : t('No deadline')}</span>${money ? html`<span class="num">${fmtMoney(f.total, p.currency)} · ${t('{n}% paid', { n: f.paidPct })}</span>` : p.side === 'client' ? html`<span class="shared-tag">${t('Shared with you')}</span>` : ''}</div>
    <div class="pc-action${na.waiting ? ' waiting' : ''}"><span>${na.waiting ? na.detail || na.label : na.label}</span>${na.waiting ? '' : icon('arrow', 16)}</div>
  </a>`;
}

function todaysActions() {
  const b = myBusiness();
  const out = [];
  const clientName = (id) => db.get('clients', id)?.name || t('Client');
  const today = todayISO();
  const tomorrow = addDays(clock.now(), 1).toISOString().slice(0, 10);
  if (wsCan('finance.view')) db.all('payments', (x) => x.businessId === b.id && x.status === 'reported').forEach((x) => {
    const inv = db.get('invoices', x.invoiceId);
    out.push({ tone: 'green', text: t('{client} reported a payment on invoice {number}', { client: clientName(inv.clientId), number: inv.number }), sub: t('Confirm it once received'), link: `/invoices/${inv.id}`, cta: t('Confirm payment') });
  });
  listProjects({ status: 'open' }).filter((p) => p.side === 'client').forEach((p) => {
    const prov = projectParties(p).find((x) => x.side === 'provider')?.name;
    clientSectionView(clientContext(p), 'overview').todo.filter((x) => !x.done).slice(0, 2).forEach((x) => out.push({ tone: 'blue', text: x.title, sub: `${p.name} · ${prov}`, link: `/projects/${p.id}/${x.section}`, cta: x.cta }));
  });
  listProjects({ status: 'open' }).filter((p) => p.side !== 'client').forEach((p) => {
    const brief = db.find('briefs', (x) => x.projectId === p.id);
    if (brief?.status === 'submitted') out.push({ tone: 'blue', text: t('{client} is waiting for your response', { client: clientName(p.clientId) }), sub: t('Brief submitted for {project}', { project: p.name }), link: `/projects/${p.id}/brief`, cta: t('Review brief') });
    if (p.status === 'revision_requested') {
      const r = db.all('revisionRounds', (x) => x.projectId === p.id && x.status !== 'delivered')[0];
      out.push({ tone: r?.isExtra ? 'red' : 'blue', text: t('{client} requested a revision', { client: clientName(p.clientId) }), sub: r ? t('{project} · revision {n} of {max}', { project: p.name, n: r.number, max: p.revisionsIncluded }) : p.name, link: `/projects/${p.id}/revisions`, cta: t('Open revision') });
    }
    if (p.deadline === tomorrow) out.push({ tone: 'amber', text: t('{project} deadline is tomorrow', { project: p.name }), sub: nextAction(p).label, link: `/projects/${p.id}`, cta: t('Open project') });
    else if (p.deadline === today) out.push({ tone: 'amber', text: t('{project} is due today', { project: p.name }), sub: nextAction(p).label, link: `/projects/${p.id}`, cta: t('Open project') });
    else if (isOverdue(p)) out.push({ tone: 'red', text: t('{project} is past its deadline', { project: p.name }), sub: t('Was due {date}', { date: fmtShortDate(p.deadline) }), link: `/projects/${p.id}`, cta: t('Open project') });
    const newFeedback = db.count('feedback', (f) => f.projectId === p.id && f.authorType === 'client' && f.status === 'open' && !f.revisionRoundId && !f.parentId);
    if (newFeedback && p.status === 'in_review') out.push({ tone: 'blue', text: t(newFeedback === 1 ? '1 new comment on {project}' : '{n} new comments on {project}', { n: newFeedback, project: p.name }), sub: clientName(p.clientId), link: `/projects/${p.id}/feedback`, cta: t('Read feedback') });
  });
  // My tasks due soon.
  db.all('tasks', (x) => x.assigneeId === me().id && x.status !== 'done' && x.dueDate && x.dueDate <= tomorrow).forEach((x) => {
    const pr = db.get('projects', x.projectId);
    if (pr && access(pr)) out.push({ tone: x.dueDate < today ? 'red' : 'amber', text: x.title, sub: `${pr.name} · ${x.dueDate < today ? t('Task overdue') : x.dueDate === today ? t('Task due today') : t('Task due tomorrow')}`, link: `/projects/${pr.id}/tasks`, cta: t('Open task') });
  });
  listInvoices({ status: 'overdue' }).forEach((i) => out.push({ tone: 'red', text: t('Invoice {number} is overdue', { number: i.number }), sub: t('{client} · due {date}', { client: clientName(i.clientId), date: fmtShortDate(i.dueDate) }), link: `/invoices/${i.id}`, cta: t('View invoice') }));
  listInvoices({ status: 'draft' }).forEach((i) => out.push({ tone: 'amber', text: t('Invoice {number} is ready to send', { number: i.number }), sub: clientName(i.clientId), link: `/invoices/${i.id}`, cta: t('Send invoice') }));
  listReminders().filter((r) => r.dueDate <= today).forEach((r) => out.push({ tone: 'green', text: t('Follow up with {client}', { client: clientName(r.clientId) }), sub: r.note, link: `/clients/${r.clientId}`, cta: t('Open client') }));
  return out.slice(0, 8);
}

export function dashboard() {
  sweepReminders();
  const u = me();
  const b = myBusiness();
  const d = dashboardData();
  const cur = currencyLabel(b.currency);
  const projects = listProjects({ status: 'open' });
  const clientName = (id) => db.get('clients', id)?.name || '—';
  const acts = todaysActions();
  const activity = recentActivity(8);
  const first = u.name.split(' ')[0];
  const activeCount = projects.filter((x) => x.status !== 'draft').length;
  const wsLine = b.kind === 'organization' ? t('{org} workspace', { org: b.name }) : t('Personal workspace');
  const lead = activeCount ? t(activeCount === 1 ? 'You have 1 active project.' : activeCount === 2 ? 'You have 2 active projects.' : 'You have {n} active projects.', { n: activeCount }) : t('No active projects yet.');
  const attn = acts.length ? ` ${t(acts.length === 1 ? '1 thing needs your attention.' : acts.length === 2 ? '2 things need your attention.' : '{n} things need your attention.', { n: acts.length })}` : '';
  return html`
    <header class="hello page-head-row" style="align-items:flex-end">
      <div>
        <div class="eyebrow">${clock.now().toLocaleDateString(locale(), { weekday: 'long', month: 'long', day: 'numeric' })} · ${wsLine}</div>
        <h1>${t('{greeting}, {name}.', { greeting: greeting(), name: first })}</h1>
        <p>${lead}${attn}</p>
      </div>
      <div class="page-actions">${wsCan('projects.create') ? html`<a class="btn btn-primary" href="${href('/projects/new')}">${icon('plus', 16)} ${t('New Project')}</a>` : ''}</div>
    </header>

    <section aria-labelledby="att-h">
      <div class="section-head"><h2 id="att-h">${t('Needs your attention')}</h2></div>
      ${acts.length ? html`<div class="attention">${acts.map((a) => html`<a class="att ${a.tone}" href="${href(a.link)}"><b>${a.text}</b><span class="sub">${a.sub}</span><span class="go">${a.cta || t('Open::action')} ${icon('arrow', 14)}</span></a>`)}</div>`
        : html`<div class="notice">${t('Nothing urgent. Every project is moving — check the next steps below.')}</div>`}
    </section>

    <section class="section" aria-labelledby="proj-h">
      <div class="section-head"><h2 id="proj-h">${t('Active projects')}</h2><a href="${href('/projects')}">${t('All projects')}</a></div>
      ${projects.length ? html`<div class="pcards">${projects.map((p) => projectCard(p, clientName(p.clientId)))}</div>`
        : empty({ title: t('No projects yet'), body: t('Your projects will appear here.'), cta: html`<a class="btn btn-primary" href="${href('/projects/new')}">${t('+ Create Your First Project')}</a>` })}
    </section>

    ${activity.length ? html`<section class="section"><div class="section-head"><h2>${t('Recent activity')}</h2></div>
      <div class="card"><ul class="timeline">${activity.map((a) => html`<li><time datetime="${a.createdAt}">${fmtRelative(a.createdAt)}</time><div>${activityText(a)}<div class="who">${a.actorName} · ${db.get('projects', a.projectId)?.name || ''}</div></div></li>`)}</ul></div></section>` : ''}

    ${wsCan('finance.view') ? html`<section class="section" aria-labelledby="rev-h">
      <div class="section-head"><h2 id="rev-h">${t('Revenue')}</h2><a href="${href('/analytics')}">${t('Analytics')}</a></div>
      <div class="metrics" aria-label="${t('Key figures')}">
        <a class="metric" href="${href('/payments')}"><div class="metric-label">${t('Revenue this month')}</div><div class="metric-value">${fmtNumber(d.revenueThisMonth)}<small>${cur}</small></div></a>
        <a class="metric" href="${href('/invoices')}"><div class="metric-label">${t('Pending')}</div><div class="metric-value">${fmtNumber(d.pending)}<small>${cur}</small></div></a>
        <a class="metric" href="${href('/projects')}"><div class="metric-label">${t('Active projects')}</div><div class="metric-value" data-count="${d.active}" data-key="dash-active">${d.active}</div></a>
        <a class="metric" href="${href('/projects?status=awaiting_approval')}"><div class="metric-label">${t('Awaiting approval')}</div><div class="metric-value">${d.awaitingApproval}</div></a>
        <a class="metric${d.overdue ? ' alert' : ''}" href="${href('/invoices?status=overdue')}"><div class="metric-label">${t('Overdue')}</div><div class="metric-value">${d.overdue}</div></a>
      </div>
    </section>` : ''}
  `;
}
