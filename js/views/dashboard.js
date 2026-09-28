import { html, icon, href, pill, empty, progressBar } from '../ui.js';
import { db } from '../core/store.js';
import { t, locale } from '../core/i18n.js';
import { fmtMoney, fmtNumber, currencyLabel, fmtShortDate, fmtRelative, todayISO, addDays, clock } from '../core/util.js';
import { me, myBusiness, activityText } from '../services/context.js';
import { listProjects, nextAction, financials, progress, isOverdue } from '../services/core.js';
import { dashboardData, recentActivity, sweepReminders } from '../services/growth.js';
import { listInvoices } from '../services/billing.js';
import { listReminders } from '../services/delivery.js';
import { PROJECT_STATUSES } from '../services/constants.js';

export function greeting(d = clock.now()) {
  const h = d.getHours();
  return h < 12 ? t('Good morning') : h < 18 ? t('Good afternoon') : t('Good evening');
}

export function projectRow(p, clientName) {
  const f = financials(p);
  const na = nextAction(p);
  const late = isOverdue(p);
  return html`<a class="list-row cols-project" href="${href(`/projects/${p.id}`)}">
    <div><div class="cell-title">${p.name}</div><div class="cell-sub">${clientName}</div>${progressBar(progress(p), t('{name} progress', { name: p.name }))}</div>
    <div>${pill(PROJECT_STATUSES, p.status)}</div>
    <div class="hide-sm hide-md"><div class="${late ? 'pill-red' : ''}" style="font-size:13.5px">${p.deadline ? t('Due {date}', { date: fmtShortDate(p.deadline) }) : t('No deadline')}</div><div class="cell-sub">${progress(p)}%</div></div>
    <div class="hide-sm hide-md"><div class="num" style="font-size:13.5px">${fmtMoney(f.total, p.currency)}</div><div class="cell-sub">${t('{n}% paid', { n: f.paidPct })}</div></div>
    <div class="next-step${na.waiting ? ' waiting' : ''}"><b>${na.waiting ? '' : html`${icon('arrow', 13)} `}${na.label}</b><span>${na.detail || ''}</span></div>
  </a>`;
}

function todaysActions() {
  const b = myBusiness();
  const out = [];
  const clientName = (id) => db.get('clients', id)?.name || t('Client');
  const today = todayISO();
  const tomorrow = addDays(clock.now(), 1).toISOString().slice(0, 10);
  db.all('payments', (x) => x.businessId === b.id && x.status === 'reported').forEach((x) => {
    const inv = db.get('invoices', x.invoiceId);
    out.push({ tone: 'green', text: t('{client} reported a payment on invoice {number}', { client: clientName(inv.clientId), number: inv.number }), sub: t('Confirm it once received'), link: `/invoices/${inv.id}` });
  });
  listProjects({ status: 'open' }).forEach((p) => {
    const brief = db.find('briefs', (x) => x.projectId === p.id);
    if (brief?.status === 'submitted') out.push({ tone: 'blue', text: t('{client} is waiting for your response', { client: clientName(p.clientId) }), sub: t('Brief submitted for {project}', { project: p.name }), link: `/projects/${p.id}/brief` });
    if (p.status === 'revision_requested') {
      const r = db.all('revisionRounds', (x) => x.projectId === p.id && x.status !== 'delivered')[0];
      out.push({ tone: r?.isExtra ? 'red' : 'blue', text: t('{client} requested a revision', { client: clientName(p.clientId) }), sub: r ? t('{project} · revision {n} of {max}', { project: p.name, n: r.number, max: p.revisionsIncluded }) : p.name, link: `/projects/${p.id}/revisions` });
    }
    if (p.deadline === tomorrow) out.push({ tone: 'amber', text: t('{project} deadline is tomorrow', { project: p.name }), sub: nextAction(p).label, link: `/projects/${p.id}` });
    else if (p.deadline === today) out.push({ tone: 'amber', text: t('{project} is due today', { project: p.name }), sub: nextAction(p).label, link: `/projects/${p.id}` });
    else if (isOverdue(p)) out.push({ tone: 'red', text: t('{project} is past its deadline', { project: p.name }), sub: t('Was due {date}', { date: fmtShortDate(p.deadline) }), link: `/projects/${p.id}` });
    const newFeedback = db.count('feedback', (f) => f.projectId === p.id && f.authorType === 'client' && f.status === 'open' && !f.revisionRoundId);
    if (newFeedback && p.status === 'in_review') out.push({ tone: 'blue', text: t(newFeedback === 1 ? '1 new comment on {project}' : '{n} new comments on {project}', { n: newFeedback, project: p.name }), sub: clientName(p.clientId), link: `/projects/${p.id}/feedback` });
  });
  listInvoices({ status: 'overdue' }).forEach((i) => out.push({ tone: 'red', text: t('Invoice {number} is overdue', { number: i.number }), sub: t('{client} · due {date}', { client: clientName(i.clientId), date: fmtShortDate(i.dueDate) }), link: `/invoices/${i.id}` }));
  listInvoices({ status: 'draft' }).forEach((i) => out.push({ tone: 'amber', text: t('Invoice {number} is ready to send', { number: i.number }), sub: clientName(i.clientId), link: `/invoices/${i.id}` }));
  listReminders().filter((r) => r.dueDate <= today).forEach((r) => out.push({ tone: 'green', text: t('Follow up with {client}', { client: clientName(r.clientId) }), sub: r.note, link: `/clients/${r.clientId}` }));
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
  return html`
    <header class="page-head"><div class="page-head-row"><div>
      <div class="eyebrow">${clock.now().toLocaleDateString(locale(), { weekday: 'long', month: 'long', day: 'numeric' })}</div>
      <h1>${t('{greeting}, {name}', { greeting: greeting(), name: first })}</h1></div>
      <div class="page-actions"><a class="btn btn-primary" href="${href('/projects/new')}">${icon('plus', 16)} ${t('New Project')}</a></div></div></header>

    <section class="metrics" aria-label="${t('Key figures')}">
      <a class="metric" href="${href('/payments')}"><div class="metric-label">${t('Revenue this month')}</div><div class="metric-value">${fmtNumber(d.revenueThisMonth)}<small>${cur}</small></div></a>
      <a class="metric" href="${href('/invoices')}"><div class="metric-label">${t('Pending')}</div><div class="metric-value">${fmtNumber(d.pending)}<small>${cur}</small></div></a>
      <a class="metric" href="${href('/projects')}"><div class="metric-label">${t('Active projects')}</div><div class="metric-value">${d.active}</div></a>
      <a class="metric" href="${href('/projects?status=awaiting_approval')}"><div class="metric-label">${t('Awaiting approval')}</div><div class="metric-value">${d.awaitingApproval}</div></a>
      <a class="metric${d.overdue ? ' alert' : ''}" href="${href('/invoices?status=overdue')}"><div class="metric-label">${t('Overdue')}</div><div class="metric-value">${d.overdue}</div></a>
    </section>

    <section class="section">
      <div class="section-head"><h2>${t("Today's actions")}</h2></div>
      ${acts.length ? html`<ul class="actions-list">${acts.map((a) => html`<li><a href="${href(a.link)}"><span class="a-dot ${a.tone}" aria-hidden="true"></span><span class="a-text">${a.text}<span>${a.sub}</span></span>${icon('arrow', 16)}</a></li>`)}</ul>`
        : html`<div class="notice">${t('Nothing urgent. Every project is moving — check the next steps below.')}</div>`}
    </section>

    <section class="section">
      <div class="section-head"><h2>${t('Projects in progress')}</h2><a href="${href('/projects')}">${t('All projects')}</a></div>
      ${projects.length ? html`<div class="list">
        <div class="list-row list-head cols-project"><div>${t('Project')}</div><div>${t('Status')}</div><div class="hide-md">${t('Deadline')}</div><div class="hide-md">${t('Amount')}</div><div>${t('Next step')}</div></div>
        ${projects.map((p) => projectRow(p, clientName(p.clientId)))}</div>`
        : empty({ title: t('No projects yet'), body: t('Your projects will appear here.'), cta: html`<a class="btn btn-primary" href="${href('/projects/new')}">${t('+ Create Your First Project')}</a>` })}
    </section>

    ${activity.length ? html`<section class="section"><div class="section-head"><h2>${t('Recent activity')}</h2></div>
      <div class="card"><ul class="timeline">${activity.map((a) => html`<li><time datetime="${a.createdAt}">${fmtRelative(a.createdAt)}</time><div>${activityText(a)}<div class="who">${a.actorName} · ${db.get('projects', a.projectId)?.name || ''}</div></div></li>`)}</ul></div></section>` : ''}
  `;
}
