// Portfolio, analytics, AI assistant, all-files index, search and notifications.
import { html, raw, icon, href, empty, pageHead, field, onAction, onForm, go, toast, confirmDialog, pill, comingSoon, rerender } from '../ui.js';
import { db } from '../core/store.js';
import { t, lang, locale } from '../core/i18n.js';
import { fmtMoney, fmtNumber, fmtShortDate, fmtRelative, fmtBytes, humanError, fmtTimecode } from '../core/util.js';
import { runAI, AI_TASKS, aiConfig } from '../core/ai.js';
import { me, myBusiness, plan, notificationText } from '../services/context.js';
import { listProjects, getProject, listDeliverables, nextAction, financials } from '../services/core.js';
import { listPortfolio, getPortfolioItem, portfolioDraftFromProject, savePortfolioItem, deletePortfolioItem, analytics, search, listNotifications, markRead, markAllRead } from '../services/growth.js';
import { listAllFiles, listFeedback, listRounds, fileKind } from '../services/delivery.js';
import { PROJECT_TYPES } from '../services/constants.js';
import { thumb, openViewer } from './viewer.js';
import { folderName } from './project-work.js';

// ---------------- Portfolio ----------------
export function portfolioList() {
  const items = listPortfolio();
  const completed = listProjects({ status: 'completed' }).filter((p) => !items.some((i) => i.projectId === p.id));
  return html`${pageHead({ title: t('Portfolio'), sub: t('Turn completed projects into case studies.'), actions: html`<a class="btn btn-secondary" href="${href('/portfolio/preview')}">${icon('eye', 16)} ${t('Preview')}</a><a class="btn btn-primary" href="${href('/portfolio/new')}">${icon('plus', 16)} ${t('New item')}</a>` })}
    ${completed.length ? html`<div class="notice" style="margin-bottom:20px">${t('{n} completed project(s) not in your portfolio yet:', { n: completed.length })} ${completed.map((p, i) => html`${i ? t(', ') : ''}<a href="${href(`/portfolio/new?project=${p.id}`)}">${p.name}</a>`)}</div>` : ''}
    ${items.length ? html`<div class="pf-grid">${items.map((it) => pfCard(it, `/portfolio/${it.id}`))}</div>`
      : empty({ title: t('Your portfolio is empty'), body: t('Complete a project, then choose “Add to Portfolio” to turn it into a case study.') })}`;
}
function pfCard(it, link) {
  const v = it.coverVersionId ? db.get('fileVersions', it.coverVersionId) : null;
  return html`<a class="pf-card" href="${href(link)}"><div class="pf-cover">${v && ['image', 'video'].includes(fileKind(v)) ? (fileKind(v) === 'image' ? html`<img alt="" data-blob="${v.id}">` : html`<video muted data-blob="${v.id}"></video>`) : it.title.slice(0, 1)}</div>
    <div class="pf-body"><div class="eyebrow" style="margin-bottom:4px">${t(it.category)} · ${it.visibility === 'public' ? t('Public') : t('Private')}</div><div class="cell-title">${it.title}</div><div class="cell-sub">${it.client}</div></div></a>`;
}

export function portfolioEdit(params, q) {
  const isNew = params.id === 'new';
  const it = isNew ? (q.project ? portfolioDraftFromProject(q.project) : { title: '', client: '', category: 'Other', challenge: '', approach: '', deliverables: '', results: '', description: '', visibility: 'private', coverVersionId: '' }) : getPortfolioItem(params.id);
  const projectId = it.projectId || q.project;
  const media = projectId ? db.all('fileVersions', (v) => v.projectId === projectId && ['image', 'video'].includes(fileKind(v))) : [];
  const selected = new Set(it.mediaVersionIds || []);
  return html`${pageHead({ title: isNew ? t('New portfolio item') : it.title, back: ['/portfolio', t('Portfolio')], actions: !isNew ? html`<button class="btn btn-ghost" style="color:var(--red)" data-action="pf-delete" data-id="${it.id}">${t('Delete')}</button>` : '' })}
    <form class="card form-grid" data-form="pf-save" style="max-width:900px">
      <input type="hidden" name="id" value="${isNew ? '' : it.id}"><input type="hidden" name="projectId" value="${projectId || ''}">
      <div class="full btn-row" style="justify-content:space-between"><span class="muted small">${projectId ? t('From project: {name}', { name: db.get('projects', projectId)?.name }) : t('Standalone item')}</span>
        ${projectId ? html`<button type="button" class="btn btn-ghost btn-sm" data-action="pf-ai" data-project="${projectId}">${icon('sparkles', 14)} ${t('Draft case study')}</button>` : ''}</div>
      ${field({ label: t('Project title'), name: 'title', value: it.title, required: true })}
      ${field({ label: t('Client'), name: 'client', value: it.client })}
      ${field({ label: t('Category'), name: 'category', type: 'select', value: it.category, options: PROJECT_TYPES.map((x) => [x, t(x)]) })}
      ${field({ label: t('Visibility'), name: 'visibility', type: 'select', value: it.visibility, options: [['private', t('Private')], ['public', t('Public')]] })}
      ${field({ label: t('Challenge'), name: 'challenge', type: 'textarea', rows: 3, value: it.challenge, full: true })}
      ${field({ label: t('Approach'), name: 'approach', type: 'textarea', rows: 3, value: it.approach, full: true })}
      ${field({ label: t('Deliverables'), name: 'deliverables', type: 'textarea', rows: 3, value: it.deliverables, full: true })}
      ${field({ label: t('Results'), name: 'results', type: 'textarea', rows: 2, value: it.results, full: true })}
      ${field({ label: t('Description'), name: 'description', type: 'textarea', rows: 4, value: it.description, full: true })}
      ${media.length ? html`<div class="full"><div class="field"><span>${t('Images & videos from this project')}</span></div>
        <div class="pf-grid" style="grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin-top:8px">${media.map((v) => html`<div class="card" style="padding:8px">${thumb(v)}<div class="small" style="margin-top:6px">${db.get('files', v.fileId)?.name} ${v.label}</div>
          <label class="check small"><input type="checkbox" name="mediaVersionIds[]" value="${v.id}"${selected.has(v.id) ? raw(' checked') : ''}> ${t('Include')}</label>
          <label class="check small"><input type="radio" name="coverVersionId" value="${v.id}"${it.coverVersionId === v.id ? raw(' checked') : ''}> ${t('Cover')}</label></div>`)}</div></div>` : ''}
      <div class="notice full small">${t('Public portfolio pages')} ${comingSoon()} — ${t('they need cloud sync. “Public” marks items you want to publish; use Preview to see them today.')}</div>
      <div class="form-actions full"><button class="btn btn-primary" type="submit">${t('Save')}</button></div>
    </form>`;
}

export function portfolioPreview() {
  const b = myBusiness();
  const items = listPortfolio().filter((i) => i.visibility === 'public');
  return html`${pageHead({ title: b.name, eyebrow: t('Portfolio preview'), sub: t('Items marked Public.'), back: ['/portfolio', t('Portfolio')] })}
    ${items.length ? items.map((it) => html`<article class="doc" style="margin-bottom:24px;max-width:none">
      <div class="eyebrow">${t(it.category)} · ${it.client}</div><h1>${it.title}</h1>
      ${it.coverVersionId ? html`<div class="pf-cover" style="margin:20px 0;border-radius:10px">${fileKind(db.get('fileVersions', it.coverVersionId)) === 'video' ? html`<video controls data-blob="${it.coverVersionId}"></video>` : html`<img alt="" data-blob="${it.coverVersionId}">`}</div>` : ''}
      ${[['Challenge', it.challenge], ['Approach', it.approach], ['Deliverables', it.deliverables], ['Results', it.results], ['About', it.description]].filter(([, v]) => v).map(([k, v]) => html`<h2>${t(k)}</h2><p class="prose">${v}</p>`)}
      ${(it.mediaVersionIds || []).length ? html`<div class="pf-grid" style="margin-top:16px">${it.mediaVersionIds.map((id) => { const v = db.get('fileVersions', id); return v ? html`<div class="pf-cover" style="border-radius:8px">${fileKind(v) === 'video' ? html`<video controls data-blob="${id}"></video>` : html`<img alt="" data-blob="${id}">`}</div>` : ''; })}</div>` : ''}
    </article>`) : empty({ title: t('Nothing public yet'), body: t('Set a portfolio item to Public to see it here.') })}`;
}

// ---------------- Analytics ----------------
function barChart(months, cur) {
  const W = 640, H = 220, pad = { l: 56, r: 12, t: 16, b: 28 };
  const rtl = lang() === 'ar';
  const max = Math.max(1, ...months.map((m) => m.amount));
  const step = Math.pow(10, Math.floor(Math.log10(max)));
  const top = Math.ceil(max / step) * step;
  const ticks = [0, top / 2, top];
  const n = months.length;
  const bw = Math.min(24, ((W - pad.l - pad.r) / n) * 0.5);
  // In Arabic the time axis runs right-to-left and the value axis sits on the right.
  const x = (i) => { const slot = (W - pad.l - pad.r) / n; const pos = rtl ? n - 1 - i : i; return (rtl ? pad.r : pad.l) + slot * (pos + 0.5); };
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / top);
  const label = (m) => new Date(m.month + '-01T00:00:00').toLocaleDateString(locale(), { month: 'short' });
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const bars = months.map((m, i) => {
    const h = Math.max(0, y(0) - y(m.amount));
    const r = Math.min(4, h);
    const x0 = x(i) - bw / 2, y0 = y(m.amount);
    const d = h > 0 ? `M${x0},${y(0)} V${y0 + r} Q${x0},${y0} ${x0 + r},${y0} H${x0 + bw - r} Q${x0 + bw},${y0} ${x0 + bw},${y0 + r} V${y(0)} Z` : '';
    const tip = esc(`${label(m)}: ${fmtMoney(m.amount, cur)}`);
    return `<path class="bar" d="${d}" tabindex="0" data-tip="${tip}"><title>${tip}</title></path><text x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(label(m))}</text>`;
  }).join('');
  const x1 = rtl ? pad.r : pad.l, x2 = rtl ? W - pad.l : W - pad.r;
  const grid = ticks.map((v) => `<line class="grid" x1="${x1}" x2="${x2}" y1="${y(v)}" y2="${y(v)}"/><text x="${rtl ? W - pad.l + 8 : pad.l - 8}" y="${y(v) + 4}" text-anchor="${rtl ? 'start' : 'end'}">${esc(fmtNumber(v))}</text>`).join('');
  return raw(`<div style="position:relative"><svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t('Paid revenue per month'))}">${grid}${bars}</svg><div class="chart-tip" hidden></div></div>`);
}

export function analyticsView() {
  if (!plan().features.analytics) {
    return html`${pageHead({ title: t('Analytics') })}${empty({ title: t('Analytics is on Pro'), body: t('See revenue trends, approval time, revision counts and payment delays.'), cta: html`<a class="btn btn-primary" href="${href('/settings/subscription')}">${t('See plans')}</a>` })}`;
  }
  const a = analytics();
  const c = a.currency;
  const stat = (label, value) => html`<div class="stat"><div class="metric-label">${t(label)}</div><div class="metric-value">${value}</div></div>`;
  const days = (n) => t('{n} days', { n });
  return html`${pageHead({ title: t('Analytics'), sub: t('A simple view of how your business is doing.') })}
    <section><div class="section-head"><h2>${t('Revenue')}</h2></div>
      <div class="stat-grid">${stat('This month', fmtMoney(a.revenueThisMonth, c))}${stat('Paid (all time)', fmtMoney(a.paidRevenue, c))}${stat('Pending', fmtMoney(a.pendingRevenue, c))}${stat('Overdue', fmtMoney(a.overdueRevenue, c))}</div>
      <div class="card" style="margin-top:12px"><div class="card-head"><h3>${t('Paid revenue, last 6 months')}</h3><details><summary class="small muted" style="cursor:pointer">${t('Table view')}</summary><table class="doc-table">${a.months.map((m) => html`<tr><td>${m.month}</td><td class="r num">${fmtMoney(m.amount, c)}</td></tr>`)}</table></details></div>${barChart(a.months, c)}</div></section>
    <section class="section"><div class="section-head"><h2>${t('Projects')}</h2></div>
      <div class="stat-grid">${stat('Active', a.projects.active)}${stat('Completed', a.projects.completed)}${stat('Cancelled', a.projects.cancelled)}${stat('Avg. duration', days(a.projects.avgDuration))}</div></section>
    <section class="section"><div class="section-head"><h2>${t('Clients')}</h2></div>
      <div class="stat-grid">${stat('Total clients', a.clients.total)}${stat('Returning', a.clients.returning)}${stat('New this month', a.clients.newThisMonth)}${stat('Revenue per client', fmtMoney(a.clients.revenuePerClient, c))}</div></section>
    <section class="section"><div class="section-head"><h2>${t('Project performance')}</h2></div>
      <div class="stat-grid">${stat('Avg. project value', fmtMoney(a.performance.avgProjectValue, c))}${stat('Avg. revisions', a.performance.avgRevisions)}${stat('Avg. approval time', days(a.performance.avgApprovalDays))}${stat('Avg. payment delay', days(a.performance.avgPaymentDelay))}</div></section>`;
}

// ---------------- AI Assistant ----------------
const aiState = { task: 'brief', projectId: '', text: '', result: null, error: null };
function aiContext(task, projectId) {
  if (!projectId) return {};
  const p = getProject(projectId);
  const c = db.get('clients', p.clientId);
  const brief = db.find('briefs', (b) => b.projectId === p.id);
  const f = financials(p);
  const na = nextAction(p);
  const signals = [];
  const pendingSince = (at) => (at ? Math.round((Date.now() - new Date(at)) / 86400000) : 0);
  db.all('proposals', (x) => x.projectId === p.id && ['sent', 'viewed'].includes(x.status)).forEach((x) => signals.push(t(x.viewedAt ? 'Proposal waiting for the client for {n} day(s) (viewed).' : 'Proposal waiting for the client for {n} day(s) (not opened yet).', { n: pendingSince(x.sentAt) })));
  db.all('contracts', (x) => x.projectId === p.id && x.status === 'sent').forEach((x) => signals.push(t('Contract waiting for acceptance for {n} day(s).', { n: pendingSince(x.sentAt) })));
  db.all('approvals', (x) => x.projectId === p.id && x.status === 'pending').forEach((x) => signals.push(t('Final approval pending for {n} day(s).', { n: pendingSince(x.requestedAt) })));
  if (p.status === 'awaiting_deposit') signals.push(t('Work cannot start until the deposit is received.'));
  const extra = listRounds(p.id).filter((r) => r.isExtra && !r.changeOrderId);
  if (extra.length) signals.push(t('{n} revision round(s) beyond the allowance without an approved change order.', { n: extra.length }));
  const openFb = listFeedback(p.id).filter((x) => x.status === 'open').length;
  if (openFb) signals.push(t('{n} open feedback comment(s).', { n: openFb }));
  if (p.deadline && p.deadline < new Date().toISOString().slice(0, 10) && !['completed', 'cancelled'].includes(p.status)) signals.push(t('Past its deadline ({date}).', { date: p.deadline }));
  if (f.balance > 0 && p.status === 'approved' && p.deliveredAt) signals.push(t('{amount} still to be paid.', { amount: fmtMoney(f.balance, p.currency) }));
  return {
    name: p.name, type: p.type, clientName: c?.name, objective: brief?.objective, briefNotes: brief?.notes, deadline: p.deadline, revisions: p.revisionsIncluded, depositPercent: p.depositPercent,
    deliverables: listDeliverables(p.id).map((d) => ({ title: d.title, quantity: d.quantity })), exclusions: p.exclusions, status: p.status, nextAction: na, signals,
    feedback: listFeedback(p.id).filter((x) => x.status === 'open').map((x) => ({ comment: x.comment, at: x.timecode != null ? fmtTimecode(x.timecode) : x.reference })),
    revisionsUsed: listRounds(p.id).length, senderName: me().name, waitingOn: na.waiting ? `${p.name} — ${na.detail}` : p.name,
  };
}

const BRIEF_KEYS = { type: 'Project type', objective: 'Objective', audience: 'Audience', deliverablesText: 'Deliverable', platforms: 'Platforms', tone: 'Tone', productionNeeds: 'Production needs', notes: 'Notes' };
export function aiView() {
  if (!plan().features.ai) return html`${pageHead({ title: t('AI Assistant') })}${empty({ title: t('AI Assistant is on Pro'), body: t('Draft briefs, proposals, follow-ups and case studies, and spot scope risks.'), cta: html`<a class="btn btn-primary" href="${href('/settings/subscription')}">${t('See plans')}</a>` })}`;
  const projects = listProjects({});
  const task = AI_TASKS[aiState.task];
  const r = aiState.result;
  return html`${pageHead({ title: t('AI Assistant'), sub: t('Suggestions only. The assistant never sends messages, changes scope, charges clients, approves work or signs anything.') })}
    <div class="ai-grid">
      <nav class="ai-tasks" aria-label="${t('Assistant tasks')}">${Object.entries(AI_TASKS).map(([k, v]) => html`<button class="${k === aiState.task ? 'active' : ''}" data-action="ai-task" data-task="${k}"${k === aiState.task ? raw(' aria-current="true"') : ''}>${t(v.label)}</button>`)}</nav>
      <div class="stack">
        <form class="card form-stack" data-form="ai-run" id="ai-run-form">
          ${field({ label: t('Project (optional)'), name: 'projectId', type: 'select', value: aiState.projectId, options: [['', t('— None —')], ...projects.map((p) => [p.id, `${p.name} · ${db.get('clients', p.clientId)?.name}`])] })}
          ${field({ label: t('Your input'), name: 'text', type: 'textarea', rows: 4, value: aiState.text, placeholder: t(task.placeholder) })}
          <div class="btn-row" style="justify-content:space-between"><span class="small muted">${aiConfig.provider() === 'anthropic' ? t('Using Claude (your API key)') : t('Using the built-in local assistant')} · <a href="${href('/settings/ai')}">${t('Change')}</a></span><button class="btn btn-primary" type="submit">${icon('sparkles', 16)} ${t('Generate')}</button></div>
        </form>
        ${aiState.error ? html`<div class="notice notice-err" role="alert">${aiState.error} <button class="link-btn" type="submit" form="ai-run-form">${t('Try Again')}</button></div>` : ''}
        ${aiState.loading ? html`<div class="card ai-thinking" role="status" aria-label="${t('Generating…')}"><div class="small muted">${icon('sparkles', 14)} ${t('Generating…')}</div><div class="skel" style="width:92%"></div><div class="skel" style="width:78%"></div><div class="skel" style="width:85%"></div><div class="skel" style="width:60%"></div></div>` : ''}
        ${r ? html`<div class="card"><div class="card-head"><h2>${t('Suggestion')}</h2><span class="small muted">${t('Review and edit before using')}</span></div>
          ${r.kind === 'brief' ? html`<dl class="kv">${Object.entries(r.data).map(([k, v]) => html`<dt>${t(BRIEF_KEYS[k] || k)}</dt><dd class="prose">${k === 'type' ? t(v) : v}</dd>`)}</dl>
            <p class="small muted" style="margin-top:12px">${t("To apply this to a project, open the project's Brief tab and use the brief assistant there — you'll review every field first.")}</p>`
            : html`<textarea class="ai-out" rows="12" aria-label="${t('Suggestion')}">${r.text}</textarea><div class="modal-actions"><button class="btn btn-secondary" data-action="copy-ai-page">${t('Copy')}</button></div>`}</div>` : ''}
      </div>
    </div>`;
}

// ---------------- Files index ----------------
export function filesIndex() {
  const files = listAllFiles();
  return html`${pageHead({ title: t('Files::nav'), sub: t('Every file across your projects. Open a project to upload or manage versions.') })}
    ${files.length ? html`<div class="list">${files.map((f) => html`<div class="file-row">${f.latest ? thumb(f.latest) : html`<div class="file-thumb">—</div>`}
      <div style="min-width:0"><div class="cell-title">${f.name}</div><div class="cell-sub">${db.get('projects', f.projectId)?.name} · ${folderName(f.folder)} · ${t('{n} version(s)', { n: f.versions.length })} · ${fmtBytes(f.latest?.size)}</div></div>
      <div class="btn-row"><button class="icon-btn" data-action="file-view" data-id="${f.latest?.id}" aria-label="${t('Preview')}">${icon('eye', 16)}</button><a class="btn btn-ghost btn-sm" href="${href(`/projects/${f.projectId}/files?folder=${f.folder}`)}">${t('Open::action')}</a></div></div>`)}</div>`
      : empty({ title: t('No files yet'), body: t('Upload drafts and deliverables from a project’s Files tab.'), cta: html`<a class="btn btn-primary" href="${href('/projects')}">${t('Go to projects')}</a>` })}`;
}

// ---------------- Search ----------------
export function searchView(_, q) {
  const results = search(q.q);
  return html`${pageHead({ title: q.q ? `“${q.q}”` : t('Search'), eyebrow: t('Search results') })}
    ${!q.q || q.q.length < 2 ? html`<p class="muted">${t('Type at least two characters in the search bar.')}</p>`
      : results.length ? html`<div class="list">${results.map((r) => html`<a class="list-row" style="grid-template-columns:100px minmax(0,1fr)" href="${href(r.href)}"><span class="tag" data-kind="${r.kind}">${t(r.kind)}</span><div><div class="cell-title">${r.title}</div><div class="cell-sub">${r.sub || ''}</div></div></a>`)}</div>`
      : empty({ title: t('No results'), body: t('Try a project, client, invoice number or file name.') })}`;
}

// ---------------- Notifications ----------------
export function notificationsView() {
  const list = listNotifications();
  return html`${pageHead({ title: t('Notifications'), actions: html`<button class="btn btn-secondary" data-action="notif-read-all">${t('Mark all read')}</button><a class="btn btn-ghost" href="${href('/settings/notifications')}">${t('Settings')}</a>` })}
    ${list.length ? html`<div class="list">${list.map((n) => { const x = notificationText(n); return html`<a class="list-row notif${n.readAt ? '' : ' unread'}" style="grid-template-columns:minmax(0,1fr) auto" href="${href(n.link || '/notifications')}" data-action="notif-open" data-id="${n.id}" data-href="${n.link || '/notifications'}"><div><b>${x.title}</b><span>${x.body}</span></div><span class="cell-sub">${fmtRelative(n.createdAt)}</span></a>`; })}</div>`
      : empty({ title: t("You're all caught up"), body: t('Client actions, overdue invoices and deadlines will show up here.') })}`;
}

// ---------------- Handlers ----------------
onAction({
  'pf-delete': async (el) => { if (await confirmDialog({ title: t('Delete portfolio item?'), body: t('The project and its files are not affected.'), confirm: t('Delete'), tone: 'danger' })) { deletePortfolioItem(el.dataset.id); go('/portfolio'); return false; } return false; },
  'pf-ai': async (el) => {
    const r = await runAI('caseStudy', { ctx: aiContext('caseStudy', el.dataset.project) });
    const form = document.querySelector('form[data-form="pf-save"]');
    const desc = form.querySelector('[name=description]');
    if (desc.value.trim() && !(await confirmDialog({ title: t('Replace description?'), body: t('The draft case study will replace the current description text.'), confirm: t('Replace') }))) return false;
    desc.value = r.text; toast(t('Draft inserted into Description — review, edit and save.'));
    return false;
  },
  'ai-task': (el) => { aiState.task = el.dataset.task; aiState.result = null; aiState.error = null; },
  'copy-ai-page': async () => { const txt = document.querySelector('.ai-out')?.value || ''; try { await navigator.clipboard.writeText(txt); toast(t('Copied.')); } catch { toast(t('Select the text and copy it.')); } return false; },
});
onForm({
  'pf-save': (v) => { const it = savePortfolioItem(v.id || null, v); toast(t('Portfolio item saved.')); go(`/portfolio/${it.id}`); return false; },
  'ai-run': async (v) => {
    aiState.projectId = v.projectId; aiState.text = v.text; aiState.error = null; aiState.result = null; aiState.loading = true;
    rerender();
    try { aiState.result = await runAI(aiState.task, { text: v.text, ctx: aiContext(aiState.task, v.projectId) }); } catch (e) { aiState.error = humanError(e); } finally { aiState.loading = false; }
  },
});

// Chart tooltips
document.addEventListener('mouseover', (e) => {
  const bar = e.target.closest?.('.chart .bar');
  const tip = bar?.closest('div')?.querySelector('.chart-tip');
  if (!bar || !tip) return;
  const box = bar.getBoundingClientRect(), host = tip.parentElement.getBoundingClientRect();
  tip.textContent = bar.dataset.tip; tip.hidden = false;
  tip.style.left = `${box.left - host.left + box.width / 2}px`; tip.style.top = `${box.top - host.top}px`;
  bar.addEventListener('mouseleave', () => { tip.hidden = true; }, { once: true });
});
export { markRead, markAllRead, openViewer, pill, fmtShortDate };
