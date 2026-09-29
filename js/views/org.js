// Organization: identity, members, roles, teams — and creating an organization.
import { html, raw, icon, href, avatar, pageHead, field, empty, onAction, onForm, toast, openModal, closeModal, modalHead, confirmDialog, go } from '../ui.js';
import { t } from '../core/i18n.js';
import { fmtRelative } from '../core/util.js';
import { me, myBusiness, wsCan, orgRole, ORG_ROLES, ORG_TYPES, switchWorkspace, workspacesOf } from '../services/context.js';
import { listMembers, inviteMember, updateMember, removeMember, listTeams, createTeam, renameTeam, deleteTeam, teamMembers, createOrganization, updateWorkspaceIdentity, roleLabel } from '../services/org.js';
import { CURRENCIES } from '../services/constants.js';

const ROLE_HELP = {
  owner: 'Full control, including billing and deleting members.', admin: 'Manages members, teams, settings and every project.',
  manager: 'Sees and runs every project of the organization.', member: 'Works on the projects they are added to.',
  finance: 'Sees proposals, contracts, invoices and payments.', viewer: 'Read-only on the projects they are added to.',
};

export function organizationView(_, q) {
  if (q.switch && workspacesOf(me()).some((w) => w.id === q.switch)) { switchWorkspace(q.switch); go('/organization'); return html``; }
  const b = myBusiness();
  if (b.kind !== 'organization') return personalWorkspace(b);
  const manage = wsCan('members.manage');
  const members = listMembers(b.id);
  const teams = listTeams(b.id);
  const myRole = orgRole(me(), b.id);
  return html`${pageHead({ eyebrow: t(b.orgType || 'Organization'), title: b.name, sub: t('People, teams and roles. Members only see the projects and information their role allows.'), actions: manage ? html`<button class="btn btn-primary" data-action="org-invite">${icon('plus', 16)} ${t('Add Member')}</button>` : '' })}
    <div class="grid-main">
      <div class="stack">
        <section class="card"><div class="card-head"><h2>${t('Members')}</h2><span class="small muted">${t('{n} people', { n: members.length })}</span></div>
          <ul class="people">${members.map((m) => html`<li>
            ${avatar(m.displayName, null, 36)}
            <div class="person"><b>${m.displayName}${m.userId === me().id ? html` <span class="muted small">(${t('you')})</span>` : ''}</b>
              <span>${[m.title, (m.teamIds || []).map((id) => teams.find((x) => x.id === id)?.name).filter(Boolean).join(', '), m.status === 'invited' ? t('Invitation sent') : ''].filter(Boolean).join(' · ') || m.email}</span></div>
            ${manage && m.userId !== me().id ? html`<select class="role-select" data-change="org-role" data-id="${m.id}" aria-label="${t('Role of {name}', { name: m.displayName })}">${ORG_ROLES.map((r) => html`<option value="${r}"${r === m.role ? raw(' selected') : ''}>${t(roleLabel(r))}</option>`)}</select>
              <button class="icon-btn" data-action="org-edit" data-id="${m.id}" aria-label="${t('Edit {name}', { name: m.displayName })}">${icon('edit', 15)}</button>`
              : html`<span class="role-pill">${t(roleLabel(m.role))}</span>`}
          </li>`)}</ul></section>
        <section class="card"><div class="card-head"><h2>${t('Teams')}</h2>${manage ? html`<button class="btn btn-secondary btn-sm" data-action="team-new">${icon('plus', 14)} ${t('New team')}</button>` : ''}</div>
          ${teams.length ? html`<div class="teams">${teams.map((tm) => { const ms = teamMembers(tm.id); return html`<div class="team-card">
            <div class="btn-row" style="justify-content:space-between"><b>${icon('team', 16)} ${tm.name}</b>${manage ? html`<span class="btn-row"><button class="icon-btn" data-action="team-rename" data-id="${tm.id}" data-name="${tm.name}" aria-label="${t('Rename {name}', { name: tm.name })}">${icon('edit', 14)}</button><button class="icon-btn" data-action="team-delete" data-id="${tm.id}" aria-label="${t('Delete {name}', { name: tm.name })}">${icon('trash', 14)}</button></span>` : ''}</div>
            <div class="avatars">${ms.map((m) => avatar(members.find((x) => x.id === m.id)?.displayName || m.name, null, 28))}</div>
            <div class="small muted">${ms.length ? ms.map((m) => members.find((x) => x.id === m.id)?.displayName || m.name).join(', ') : t('No members yet')}</div></div>`; })}</div>`
            : html`<p class="muted" style="margin:0">${t('Group people into teams — for example Production, Content or Finance — and add a whole team to a project.')}</p>`}</section>
      </div>
      <aside class="stack">
        <section class="card"><h2 style="margin-bottom:8px">${t('Your role')}</h2><span class="role-pill">${t(roleLabel(myRole))}</span><p class="small muted" style="margin:10px 0 0">${t(ROLE_HELP[myRole] || '')}</p></section>
        <section class="card"><h2 style="margin-bottom:10px">${t('Organization roles')}</h2><dl class="kv">${ORG_ROLES.map((r) => html`<dt>${t(roleLabel(r))}</dt><dd>${t(ROLE_HELP[r])}</dd>`)}</dl>
          <p class="small muted" style="margin:10px 0 0">${t('On each project, people also get a project role (for example Editor or Approver). The two can differ.')}</p></section>
        ${manage ? html`<form class="card form-stack" data-form="org-identity"><h2>${t('Organization details')}</h2>
          ${field({ label: t('Organization name'), name: 'name', value: b.name, required: true })}
          ${field({ label: t('Organization type'), name: 'orgType', type: 'select', value: b.orgType || 'Company', options: ORG_TYPES.map((x) => [x, t(x)]) })}
          <button class="btn btn-secondary" type="submit">${t('Save changes')}</button></form>` : ''}
      </aside>
    </div>`;
}

function personalWorkspace(b) {
  const orgs = workspacesOf(me()).filter((w) => w.kind === 'organization');
  return html`${pageHead({ eyebrow: t('Personal workspace'), title: t('Organizations'), sub: t('Work with a team, or collaborate as a company with other organizations on shared projects.') })}
    <div class="grid-main">
      <div class="stack">
        ${orgs.length ? html`<section class="card"><h2 style="margin-bottom:10px">${t('Your organizations')}</h2><div class="list">${orgs.map((o) => html`<a class="list-row" style="grid-template-columns:auto minmax(0,1fr) auto" href="${href(`/organization?switch=${o.id}`)}"><span class="org-mark">${icon('building', 18)}</span><div><div class="cell-title">${o.name}</div><div class="cell-sub">${t(o.orgType || 'Organization')} · ${t(roleLabel(orgRole(me(), o.id)))}</div></div>${icon('arrow', 16)}</a>`)}</div></section>`
          : empty({ title: t('No organizations yet'), body: t('Create one for your company, studio or channel, then invite colleagues with the right roles.') })}
      </div>
      <aside><form class="card form-stack" data-form="org-create"><h2>${t('Create an organization')}</h2>
        ${field({ label: t('Organization name'), name: 'name', required: true, placeholder: t('e.g. ABC Production') })}
        ${field({ label: t('Organization type'), name: 'orgType', type: 'select', value: 'Production company', options: ORG_TYPES.map((x) => [x, t(x)]) })}
        ${field({ label: t('Currency'), name: 'currency', type: 'select', value: b.currency, options: CURRENCIES })}
        <button class="btn btn-primary" type="submit">${icon('building', 16)} ${t('Create organization')}</button>
        <p class="small muted" style="margin:0">${t('Your personal workspace stays as it is. Switch between them at any time.')}</p></form></aside>
    </div>`;
}

function inviteModal() {
  const teams = listTeams();
  return html`${modalHead(t('Add Member'), t('They get an email invitation. The role decides what they can see and do.'))}
    <form class="form-grid" data-form="org-invite">
      ${field({ label: t('Name'), name: 'name' })}
      ${field({ label: t('Email'), name: 'email', type: 'email', required: true, attrs: 'dir="ltr"' })}
      ${field({ label: t('Job title'), name: 'title', placeholder: t('e.g. Executive Producer') })}
      ${field({ label: t('Role'), name: 'role', type: 'select', value: 'member', options: ORG_ROLES.filter((r) => r !== 'owner').map((r) => [r, t(roleLabel(r))]) })}
      ${teams.length ? html`<fieldset class="full field" style="border:0;padding:0;margin:0"><legend style="padding:0;margin-bottom:8px">${t('Teams')}</legend><div class="chips">${teams.map((tm) => html`<label class="chip"><input type="checkbox" name="teamIds[]" value="${tm.id}"><span>${tm.name}</span></label>`)}</div></fieldset>` : ''}
      <div class="form-actions full"><button type="button" class="btn btn-ghost" data-action="modal-close">${t('Cancel')}</button><button class="btn btn-primary" type="submit">${t('Send invitation')}</button></div></form>`;
}
function editModal(m) {
  const teams = listTeams();
  return html`${modalHead(m.displayName, m.email)}
    <form class="form-grid" data-form="org-member"><input type="hidden" name="id" value="${m.id}">
      ${field({ label: t('Job title'), name: 'title', value: m.title || '', full: true })}
      ${teams.length ? html`<fieldset class="full field" style="border:0;padding:0;margin:0"><legend style="padding:0;margin-bottom:8px">${t('Teams')}</legend><div class="chips">${teams.map((tm) => html`<label class="chip"><input type="checkbox" name="teamIds[]" value="${tm.id}"${(m.teamIds || []).includes(tm.id) ? raw(' checked') : ''}><span>${tm.name}</span></label>`)}</div></fieldset>` : ''}
      <div class="form-actions full" style="justify-content:space-between"><button type="button" class="btn btn-ghost" style="color:var(--red)" data-action="org-remove" data-id="${m.id}">${t('Remove from organization')}</button><button class="btn btn-primary" type="submit">${t('Save changes')}</button></div></form>`;
}
function teamModal(id = '', name = '') {
  return html`${modalHead(id ? t('Rename team') : t('New team'))}<form class="form-stack" data-form="team-save"><input type="hidden" name="id" value="${id}">
    ${field({ label: t('Team name'), name: 'name', value: name, required: true, placeholder: t('e.g. Production Team') })}
    <div class="modal-actions"><button type="button" class="btn btn-ghost" data-action="modal-close">${t('Cancel')}</button><button class="btn btn-primary" type="submit">${t('Save changes')}</button></div></form>`;
}

onAction({
  'org-invite': () => { openModal(inviteModal()); return false; },
  'org-edit': (el) => { openModal(editModal(listMembers().find((m) => m.id === el.dataset.id))); return false; },
  'org-role': (el) => { updateMember(el.dataset.id, { role: el.value }); toast(t('Role updated.')); },
  'org-remove': async (el) => {
    closeModal();
    if (await confirmDialog({ title: t('Remove from organization?'), body: t('They lose access to the organization and its projects. Their past activity stays in the timeline.'), confirm: t('Remove'), tone: 'danger' })) { removeMember(el.dataset.id); toast(t('Member removed.')); }
  },
  'team-new': () => { openModal(teamModal()); return false; },
  'team-rename': (el) => { openModal(teamModal(el.dataset.id, el.dataset.name)); return false; },
  'team-delete': async (el) => { if (await confirmDialog({ title: t('Delete this team?'), body: t('Members stay in the organization.'), confirm: t('Delete'), tone: 'danger' })) deleteTeam(el.dataset.id); },
});
onForm({
  'org-invite': (v) => { inviteMember({ ...v, teamIds: v.teamIds || [] }); closeModal(); toast(t('Invitation sent.')); },
  'org-member': (v) => { updateMember(v.id, { title: v.title, teamIds: v.teamIds || [] }); closeModal(); toast(t('Changes saved.')); },
  'team-save': (v) => { if (v.id) renameTeam(v.id, v.name); else createTeam(v.name); closeModal(); },
  'org-identity': (v) => { updateWorkspaceIdentity(v); toast(t('Changes saved.')); },
  'org-create': (v) => { createOrganization(v); toast(t('Organization created.')); go('/organization'); return false; },
});
export { fmtRelative };
