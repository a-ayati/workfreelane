import { html, icon, href, pill, empty, progressBar } from '../ui.js';
import { db } from '../core/store.js';
import { fmtMoney, fmtShortDate, fmtRelative, todayISO, addDays, clock } from '../core/util.js';
import { me, myBusiness } from '../services/context.js';
import { listProjects, nextAction, financials, progress, isOverdue } from '../services/core.js';
import { dashboardData, recentActivity, sweepReminders } from '../services/growth.js';
import { listInvoices } from '../services/billing.js';
import { listReminders } from '../services/delivery.js';
import { PROJECT_STATUSES, OPEN_STATUSES } from '../services/constants.js';

export function greeting(d = clock.now()) {
  const h = d.getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export function projectRow(p, clientName) {
  const f = financials(p);
  const na = nextAction(p);
  const late = isOverdue(p);
  return html`<a class="list-row cols-project" href="${href(`/projects/${p.id}`)}">
    <div><div class="cell-title">${p.name}</div><div class="cell-sub">${clientName}</div>${progressBar(progress(p), `${p.name} progress`)}</div>
    <div>${pill(PROJECT_STATUSES, p.status)}</div>
    <div class="hide-sm hide-md"><div class="${late ? 'pill-red' : ''}" style="font-size:13.5px">${p.deadline ? `Due ${fmtShortDate(p.deadline)}` : 'No deadline'}</div><div class="cell-sub">${progress(p)}%</div></div>
    <div class="hide-sm hide-md"><div class="num" style="font-size:13.5px">${fmtMoney(f.total, p.currency)}</div><div class="cell-sub">${f.paidPct}% paid</div></div>
    <div class="next-step${na.waiting ? ' waiting' : ''}"><b>${na.waiting ? '' : '→ '}${na.label}</b><span>${na.detail || ''}</span></div>
  </a>`;
}

function todaysActions() {
  const b = myBusiness();
  const out = [];
  const clientName = (id) => db.get('clients', id)?.name || 'Client';
  const today = todayISO();
  const tomorrow = addDays(clock.now(), 1).toISOString().slice(0, 10);
  db.all('payments', (x) => x.businessId === b.id && x.status === 'reported').forEach((x) => {
    const inv = db.get('invoices', x.invoiceId);
    out.push({ tone: 'green', text: `${clientName(inv.clientId)} reported a payment on invoice ${inv.number}`, sub: 'Confirm it once received', link: `/invoices/${inv.id}` });
  });
  listProjects({ status: 'open' }).forEach((p) => {
    const brief = db.find('briefs', (x) => x.projectId === p.id);
    if (brief?.status === 'submitted') out.push({ tone: 'blue', text: `${clientName(p.clientId)} is waiting for your response`, sub: `Brief submitted for ${p.name}`, link: `/projects/${p.id}/brief` });
    if (p.status === 'revision_requested') {
      const r = db.all('revisionRounds', (x) => x.projectId === p.id && x.status !== 'delivered')[0];
      out.push({ tone: r?.isExtra ? 'red' : 'blue', text: `${clientName(p.clientId)} requested a revision`, sub: `${p.name}${r ? ` · revision ${r.number} of ${p.revisionsIncluded}` : ''}`, link: `/projects/${p.id}/revisions` });
    }
    if (p.deadline === tomorrow) out.push({ tone: 'amber', text: `${p.name} deadline is tomorrow`, sub: nextAction(p).label, link: `/projects/${p.id}` });
    else if (p.deadline === today) out.push({ tone: 'amber', text: `${p.name} is due today`, sub: nextAction(p).label, link: `/projects/${p.id}` });
    else if (isOverdue(p)) out.push({ tone: 'red', text: `${p.name} is past its deadline`, sub: `Was due ${fmtShortDate(p.deadline)}`, link: `/projects/${p.id}` });
    const newFeedback = db.count('feedback', (f) => f.projectId === p.id && f.authorType === 'client' && f.status === 'open' && !f.revisionRoundId);
    if (newFeedback && p.status === 'in_review') out.push({ tone: 'blue', text: `${newFeedback} new comment${newFeedback > 1 ? 's' : ''} on ${p.name}`, sub: clientName(p.clientId), link: `/projects/${p.id}/feedback` });
  });
  listInvoices({ status: 'overdue' }).forEach((i) => out.push({ tone: 'red', text: `Invoice ${i.number} is overdue`, sub: `${clientName(i.clientId)} · due ${fmtShortDate(i.dueDate)}`, link: `/invoices/${i.id}` }));
  listInvoices({ status: 'draft' }).forEach((i) => out.push({ tone: 'amber', text: `Invoice ${i.number} is ready to send`, sub: clientName(i.clientId), link: `/invoices/${i.id}` }));
  listReminders().filter((r) => r.dueDate <= today).forEach((r) => out.push({ tone: 'green', text: `Follow up with ${clientName(r.clientId)}`, sub: r.note, link: `/clients/${r.clientId}` }));
  return out.slice(0, 8);
}

export function dashboard() {
  sweepReminders();
  const u = me();
  const b = myBusiness();
  const d = dashboardData();
  const cur = b.currency;
  const projects = listProjects({ status: 'open' });
  const clientName = (id) => db.get('clients', id)?.name || '—';
  const acts = todaysActions();
  const activity = recentActivity(8);
  const first = u.name.split(' ')[0];
  return html`
    <header class="page-head"><div class="page-head-row"><div>
      <div class="eyebrow">${clock.now().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
      <h1>${greeting()}, ${first}</h1></div>
      <div class="page-actions"><a class="btn btn-primary" href="${href('/projects/new')}">${icon('plus', 16)} New Project</a></div></div></header>

    <section class="metrics" aria-label="Key figures">
      <a class="metric" href="${href('/payments')}"><div class="metric-label">Revenue this month</div><div class="metric-value">${fmtMoney(d.revenueThisMonth, '').trim()}<small>${cur}</small></div></a>
      <a class="metric" href="${href('/invoices')}"><div class="metric-label">Pending</div><div class="metric-value">${fmtMoney(d.pending, '').trim()}<small>${cur}</small></div></a>
      <a class="metric" href="${href('/projects')}"><div class="metric-label">Active projects</div><div class="metric-value">${d.active}</div></a>
      <a class="metric" href="${href('/projects?status=awaiting_approval')}"><div class="metric-label">Awaiting approval</div><div class="metric-value">${d.awaitingApproval}</div></a>
      <a class="metric${d.overdue ? ' alert' : ''}" href="${href('/invoices?status=overdue')}"><div class="metric-label">Overdue</div><div class="metric-value">${d.overdue}</div></a>
    </section>

    <section class="section">
      <div class="section-head"><h2>Today's actions</h2></div>
      ${acts.length ? html`<ul class="actions-list">${acts.map((a) => html`<li><a href="${href(a.link)}"><span class="a-dot ${a.tone}" aria-hidden="true"></span><span class="a-text">${a.text}<span>${a.sub}</span></span>${icon('arrow', 16)}</a></li>`)}</ul>`
        : html`<div class="notice">Nothing urgent. Every project is moving — check the next steps below.</div>`}
    </section>

    <section class="section">
      <div class="section-head"><h2>Projects in progress</h2><a href="${href('/projects')}">All projects</a></div>
      ${projects.length ? html`<div class="list">
        <div class="list-row list-head cols-project"><div>Project</div><div>Status</div><div class="hide-md">Deadline</div><div class="hide-md">Amount</div><div>Next step</div></div>
        ${projects.map((p) => projectRow(p, clientName(p.clientId)))}</div>`
        : empty({ title: 'No projects yet', body: 'Your projects will appear here.', cta: html`<a class="btn btn-primary" href="${href('/projects/new')}">+ Create Your First Project</a>` })}
    </section>

    ${activity.length ? html`<section class="section"><div class="section-head"><h2>Recent activity</h2></div>
      <div class="card"><ul class="timeline">${activity.map((a) => html`<li><time datetime="${a.createdAt}">${fmtRelative(a.createdAt)}</time><div>${a.message}<div class="who">${a.actorName} · ${db.get('projects', a.projectId)?.name || ''}</div></div></li>`)}</ul></div></section>` : ''}
  `;
}
export { OPEN_STATUSES };
