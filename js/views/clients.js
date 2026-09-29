// Client CRM.
import { html, icon, href, empty, pageHead, field, onAction, onForm, go, toast, openModal, closeModal, modalHead, confirmDialog, pill, avatar, comingSoon } from '../ui.js';
import { db } from '../core/store.js';
import { t } from '../core/i18n.js';
import { fmtMoney, fmtDate, fmtShortDate, fmtRelative } from '../core/util.js';
import { runAI } from '../core/ai.js';
import { myBusiness, me, workspacesOf } from '../services/context.js';
import { listClients, getClient, createClient, updateClient, deleteClient, clientStats } from '../services/core.js';
import { listReminders, completeReminder, deleteReminder } from '../services/delivery.js';
import { PROJECT_STATUSES } from '../services/constants.js';

export function clientsList() {
  const clients = listClients();
  const cur = myBusiness().currency;
  return html`${pageHead({ title: t('Clients'), sub: t('Everyone you work with, with revenue and history.'), actions: html`<button class="btn btn-primary" data-action="client-new">${icon('plus', 16)} ${t('Add Client')}</button>` })}
    ${clients.length ? html`<div class="list"><div class="list-row list-head cols-5"><div>${t('Client')}</div><div>${t('Last project')}</div><div>${t('Revenue')}</div><div>${t('Outstanding')}</div><div class="right">${t('Last contact')}</div></div>
      ${clients.map((c) => { const s = clientStats(c.id); const org = c.linkedBusinessId ? db.get('businesses', c.linkedBusinessId) : null; return html`<a class="list-row cols-5" href="${href(`/clients/${c.id}`)}">
        <div class="btn-row" style="flex-wrap:nowrap;min-width:0">${avatar(c.name)}<div style="min-width:0"><div class="cell-title">${c.name}</div><div class="cell-sub">${org?.name || c.company || c.email || '—'}</div></div></div>
        <div class="hide-sm cell-sub">${s.lastProject?.name || '—'}</div><div class="hide-sm num">${fmtMoney(s.revenue, cur)}</div><div class="hide-sm num ${s.outstanding > 0 ? '' : 'muted'}">${fmtMoney(s.outstanding, cur)}</div>
        <div class="right cell-sub">${c.lastContactAt ? fmtRelative(c.lastContactAt) : '—'}</div></a>`; })}</div>`
      : empty({ title: t('No clients yet'), body: t('Your client list will grow as you create projects.'), cta: html`<button class="btn btn-primary" data-action="client-new">${t('Add Client')}</button>` })}`;
}

export function clientDetail(params) {
  const c = getClient(params.id);
  const linkedOrg = c.linkedBusinessId ? db.get('businesses', c.linkedBusinessId) : null;
  const s = clientStats(c.id);
  const cur = myBusiness().currency;
  const reminders = listReminders({ open: false }).filter((r) => r.clientId === c.id);
  const projects = s.projects.sort((a, z) => z.createdAt.localeCompare(a.createdAt));
  return html`${pageHead({ title: c.name, sub: [linkedOrg?.name || c.company, c.country].filter(Boolean).join(' · '), back: ['/clients', t('Clients')], actions: html`<a class="btn btn-primary" href="${href(`/projects/new?client=${c.id}`)}">${icon('plus', 16)} ${t('New project')}</a><button class="btn btn-secondary" data-action="client-edit" data-id="${c.id}">${t('Edit')}</button>` })}
    <div class="pay-grid" style="margin-bottom:24px"><div><span>${t('Total revenue')}</span><b>${fmtMoney(s.revenue, cur)}</b></div><div><span>${t('Outstanding')}</span><b>${fmtMoney(s.outstanding, cur)}</b></div><div><span>${t('Projects')}</span><b>${projects.length}</b></div></div>
    <div class="grid-main">
      <div class="stack">
        <div class="section-head"><h2>${t('Project history')}</h2></div>
        ${projects.length ? html`<div class="list">${projects.map((p) => html`<a class="list-row cols-4" href="${href(`/projects/${p.id}`)}"><div><div class="cell-title">${p.name}</div><div class="cell-sub">${t(p.type)}</div></div><div>${pill(PROJECT_STATUSES, p.status)}</div><div class="hide-sm cell-sub">${fmtShortDate(p.createdAt)}</div><div class="right cell-sub">${p.completedAt ? t('Completed {date}', { date: fmtShortDate(p.completedAt) }) : p.deadline ? t('Due {date}', { date: fmtShortDate(p.deadline) }) : ''}</div></a>`)}</div>` : html`<p class="muted">${t('No projects yet.')}</p>`}
        ${c.notes ? html`<div class="card"><h2 style="margin-bottom:8px">${t('Notes')}</h2><p class="prose" style="margin:0">${c.notes}</p></div>` : ''}
      </div>
      <aside class="stack">
        <div class="card"><h2 style="margin-bottom:10px">${t('Contact')}</h2><dl class="kv" style="grid-template-columns:100px 1fr">
          <dt>${t('Email')}</dt><dd>${c.email ? html`<a href="mailto:${c.email}" dir="ltr">${c.email}</a>` : '—'}</dd><dt>${t('Phone')}</dt><dd dir="ltr" style="text-align:start">${c.phone || '—'}</dd><dt>${t('Country')}</dt><dd>${c.country || '—'}</dd>
          <dt>${t('Language')}</dt><dd>${c.language === 'ar' ? 'العربية' : 'English'}</dd>
          <dt>${t('Last contact')}</dt><dd>${c.lastContactAt ? fmtDate(c.lastContactAt) : '—'}</dd><dt>${t('Last project')}</dt><dd>${s.lastProject?.name || '—'}</dd><dt>${t('Client since')}</dt><dd>${fmtDate(c.createdAt)}</dd></dl></div>
        <div class="card"><h2 style="margin-bottom:10px">${t('Follow-ups')}</h2>
          ${reminders.length ? reminders.map((r) => html`<div class="notice" style="margin-bottom:8px;${r.doneAt ? 'opacity:.6' : ''}"><b>${fmtShortDate(r.dueDate)}</b> · ${r.note}<br>${r.doneAt ? html`<span class="small muted">${t('Done')}</span> · ` : html`<button class="link-btn small" data-action="reminder-done" data-id="${r.id}">${t('Mark done')}</button> · `}<button class="link-btn small" data-action="reminder-delete" data-id="${r.id}">${t('Remove')}</button></div>`) : html`<p class="muted small">${t('No follow-ups scheduled.')}</p>`}
          <div class="btn-row"><button class="btn btn-secondary btn-sm" data-action="reminder-new" data-client="${c.id}" data-project="">${icon('clock', 14)} ${t('Add reminder')}</button><button class="btn btn-ghost btn-sm" data-action="client-followup-draft" data-id="${c.id}">${icon('sparkles', 14)} ${t('Draft follow-up')}</button></div>
          <p class="small muted" style="margin:10px 0 0">${t('Automated follow-up emails')} ${comingSoon()} — ${t('nothing is ever sent without your consent.')}</p></div>
        <button class="btn btn-ghost btn-sm" style="color:var(--red)" data-action="client-delete" data-id="${c.id}">${t('Delete client')}</button>
      </aside>
    </div>`;
}

function clientForm(c = {}) {
  const orgs = workspacesOf(me()).filter((w) => w.kind === 'organization' && w.id !== myBusiness().id);
  return html`${modalHead(c.id ? t('Edit client') : t('Add client'))}
    <form class="form-grid" data-form="client-save"><input type="hidden" name="id" value="${c.id || ''}">
      ${field({ label: t('Name'), name: 'name', value: c.name, required: true, attrs: 'autofocus' })}
      ${field({ label: t('Company'), name: 'company', value: c.company })}
      ${field({ label: t('Client organization (optional)'), name: 'linkedBusinessId', type: 'select', value: c.linkedBusinessId || '', options: [['', t('Individual or external client')], ...orgs.map((w) => [w.id, w.name])], hint: t('Members of the linked organization can access this client’s shared projects according to their project roles.'), full: true })}
      ${field({ label: t('Email'), name: 'email', type: 'email', value: c.email, attrs: 'dir="ltr"' })}
      ${field({ label: t('Phone'), name: 'phone', type: 'tel', value: c.phone, attrs: 'dir="ltr"' })}
      ${field({ label: t('Country'), name: 'country', value: c.country })}
      ${field({ label: t('Client language'), name: 'language', type: 'select', value: c.language || 'en', options: [['en', 'English'], ['ar', 'العربية']], hint: t('Their portal, documents and emails use this language.') })}
      ${field({ label: t('Notes'), name: 'notes', type: 'textarea', rows: 3, value: c.notes, full: true })}
      <div class="form-actions full"><button type="button" class="btn btn-ghost" data-action="modal-close">${t('Cancel')}</button><button class="btn btn-primary" type="submit">${t('Save client')}</button></div></form>`;
}

onAction({
  'client-new': () => { openModal(clientForm()); return false; },
  'client-edit': (el) => { openModal(clientForm(getClient(el.dataset.id))); return false; },
  'client-delete': async (el) => {
    const c = getClient(el.dataset.id);
    if (!(await confirmDialog({ title: t('Delete {name}?', { name: c.name }), body: t('This removes the client. Clients with projects cannot be deleted.'), confirm: t('Delete'), tone: 'danger' }))) return false;
    deleteClient(c.id); toast(t('Client deleted.')); go('/clients'); return false;
  },
  'reminder-delete': (el) => { deleteReminder(el.dataset.id); },
  'client-followup-draft': async (el) => {
    const c = getClient(el.dataset.id);
    const s = clientStats(c.id);
    const r = await runAI('followup', { ctx: { clientName: c.name.split(' ')[0], senderName: me().name, waitingOn: s.lastProject ? t("{project} and whether there's anything new I can help with", { project: s.lastProject.name }) : t('working together') } });
    openModal(html`${modalHead(t('Follow-up draft'), t('Copy it into your email or messaging app. Nothing is sent from here.'))}<textarea class="ai-out" rows="10" aria-label="${t('Draft')}">${r.text}</textarea><div class="modal-actions"><button class="btn btn-secondary" data-action="copy-ai">${t('Copy')}</button>${c.email ? html`<a class="btn btn-primary" href="mailto:${c.email}?subject=${encodeURIComponent(t('Checking in'))}">${t('Open email app')}</a>` : ''}</div>`);
    return false;
  },
});
onForm({
  'client-save': (v) => {
    if (v.id) { updateClient(v.id, v); toast(t('Client updated.')); closeModal(); return; }
    const c = createClient(v); closeModal(); toast(t('Client added.')); go(`/clients/${c.id}`); return false;
  },
});
export { completeReminder, db };
