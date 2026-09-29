// Workspaces, organizations, members, teams and project membership.
import { db } from '../core/store.js';
import { auth } from '../core/auth.js';
import { mailer, appLink } from '../core/mailer.js';
import { t, tl, uiLang } from '../core/i18n.js';
import { UserError, ForbiddenError, req, opt, email as vEmail, nowISO } from '../core/util.js';
import {
  me, myBusiness, requireWs, requireProject, orgRole, projectAccess, projectParties, workspacesOf, switchWorkspace,
  logActivity, freelancerActor, notify, ORG_ROLES, PROJECT_ROLES, ORG_TYPES, access,
} from './context.js';
import { insertWorkspace, updateClient, PROJECT_COLORS, iconForType } from './core.js';
import { CURRENCIES } from './constants.js';

// ---------- Migration (idempotent, runs at start) ----------
// Brings data created before workspaces/organizations into the current model.
export function migrate() {
  db.all('businesses').forEach((b) => {
    if (!b.kind) db.update('businesses', b.id, { kind: 'personal', orgType: '' });
    if (!db.find('workspaceMembers', (m) => m.businessId === b.id && m.userId === b.ownerId)) {
      const u = db.get('users', b.ownerId);
      db.insert('workspaceMembers', { businessId: b.id, userId: b.ownerId, role: 'owner', title: '', teamIds: [], status: 'active', email: u?.email || '', name: u?.name || '' });
    }
  });
  const byBiz = {};
  db.all('projects').sort((a, z) => a.createdAt.localeCompare(z.createdAt)).forEach((p) => {
    const i = (byBiz[p.businessId] = (byBiz[p.businessId] ?? -1) + 1);
    const patch = {};
    if (!p.color) patch.color = PROJECT_COLORS[i % PROJECT_COLORS.length];
    if (!p.icon) patch.icon = iconForType(p.type);
    if (Object.keys(patch).length) db.update('projects', p.id, patch);
  });
  db.all('projectMembers', (m) => !m.side).forEach((m) => db.update('projectMembers', m.id, { side: 'provider', status: 'active', businessId: db.get('projects', m.projectId)?.businessId || null }));
}

// ---------- Workspaces ----------
export const listWorkspaces = () => workspacesOf(me());
export { switchWorkspace };

export function createOrganization({ name, orgType, currency }) {
  const u = me();
  const n = req(name, 'Organization name', 'name', 120);
  const cur = CURRENCIES.includes(currency) ? currency : (myBusinessOrNull()?.currency || 'QAR');
  return insertWorkspace(u, { kind: 'organization', orgType: ORG_TYPES.includes(orgType) ? orgType : 'Company', name: n, currency: cur });
}
function myBusinessOrNull() { try { return myBusiness(); } catch { return null; } }

export function updateWorkspaceIdentity({ name, orgType }) {
  const b = requireWs('settings');
  const patch = {};
  if (name !== undefined) patch.name = req(name, 'Business name', 'name', 120);
  if (orgType !== undefined && b.kind === 'organization') patch.orgType = ORG_TYPES.includes(orgType) ? orgType : 'Company';
  return db.update('businesses', b.id, patch);
}

// ---------- Members ----------
export function listMembers(businessId = myBusiness().id) {
  return db.all('workspaceMembers', (m) => m.businessId === businessId && m.status !== 'removed')
    .map((m) => ({ ...m, user: m.userId ? db.get('users', m.userId) : null, displayName: (m.userId && db.get('users', m.userId)?.name) || m.name || m.email }))
    .sort((a, z) => ORG_ROLES.indexOf(a.role) - ORG_ROLES.indexOf(z.role) || a.displayName.localeCompare(z.displayName));
}
const ownerCount = (businessId) => db.count('workspaceMembers', (m) => m.businessId === businessId && m.role === 'owner' && m.status === 'active');

export function inviteMember({ name, email, role = 'member', title = '', teamIds = [] }) {
  const b = requireWs('members.manage');
  const e = vEmail(email);
  if (!ORG_ROLES.includes(role) || role === 'owner') throw new UserError(t('Choose a role.'), 'role');
  if (db.find('workspaceMembers', (m) => m.businessId === b.id && m.email === e && m.status !== 'removed')) throw new UserError(t('This person is already a member.'), 'email');
  const existing = db.find('users', (u) => u.email === e);
  const row = db.insert('workspaceMembers', {
    businessId: b.id, userId: existing?.id || null, role, title: opt(title, 80), teamIds: cleanTeams(b.id, teamIds),
    status: existing ? 'active' : 'invited', email: e, name: opt(name, 120) || existing?.name || '', invitedBy: me().id,
  });
  const L = existing?.lang || uiLang();
  mailer.send({
    to: e, kind: 'invite',
    subject: tl(L, 'You have been added to {org} on Scopewise', { org: b.name }),
    body: tl(L, 'Hi {name},\n\n{inviter} added you to {org} as {role}.', { name: row.name || e, inviter: me().name, org: b.name, role: tl(L, roleLabel(role)) }),
    link: appLink(existing ? '/dashboard' : `/signup?email=${encodeURIComponent(e)}`), linkLabel: tl(L, existing ? 'Open Scopewise' : 'Create your account'),
  });
  if (existing) notify({ id: null, businessId: b.id }, { type: 'activity', users: [existing.id], title: 'You joined {org}', body: '{inviter} added you as {role_t}.', vars: { org: b.name, inviter: me().name, role_t: roleLabel(role) }, link: '/dashboard' });
  return row;
}
export function updateMember(id, { role, title, teamIds }) {
  const b = requireWs('members.manage');
  const m = db.get('workspaceMembers', id);
  if (!m || m.businessId !== b.id) throw new ForbiddenError();
  const patch = {};
  if (role !== undefined) {
    if (!ORG_ROLES.includes(role)) throw new UserError(t('Choose a role.'), 'role');
    if (m.role === 'owner' && role !== 'owner' && ownerCount(b.id) <= 1) throw new UserError(t('An organization needs at least one owner.'));
    patch.role = role;
  }
  if (title !== undefined) patch.title = opt(title, 80);
  if (teamIds !== undefined) patch.teamIds = cleanTeams(b.id, teamIds);
  return db.update('workspaceMembers', id, patch);
}
export function removeMember(id) {
  const b = requireWs('members.manage');
  const m = db.get('workspaceMembers', id);
  if (!m || m.businessId !== b.id) throw new ForbiddenError();
  if (m.role === 'owner' && ownerCount(b.id) <= 1) throw new UserError(t('An organization needs at least one owner.'));
  db.remove('workspaceMembers', id);
  // Their explicit roles on this organization's projects go too.
  db.all('projectMembers', (x) => x.userId && x.userId === m.userId && x.businessId === b.id).forEach((x) => db.remove('projectMembers', x.id));
}

// Accept pending invitations addressed to this user's email.
export function acceptInvites(user) {
  if (!user) return 0;
  let n = 0;
  db.all('workspaceMembers', (m) => m.status === 'invited' && m.email === user.email).forEach((m) => { db.update('workspaceMembers', m.id, { userId: user.id, status: 'active', joinedAt: nowISO() }); n++; });
  db.all('projectMembers', (m) => m.status === 'invited' && m.email === user.email).forEach((m) => { db.update('projectMembers', m.id, { userId: user.id, status: 'active', joinedAt: nowISO() }); n++; });
  // A person who only joined someone else's project still needs a home for the dashboard.
  if (n && !user.onboarded) {
    if (!workspacesOf(user).length) insertWorkspace(user, { kind: 'personal', name: user.name });
    db.update('users', user.id, { onboarded: true });
  }
  return n;
}

// What is waiting for this email address (shown on the invitation page, before sign-in).
export function pendingInvitesFor(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return { invites: [], hasAccount: false };
  const invites = [];
  db.all('projectMembers', (m) => m.status === 'invited' && String(m.email || '').toLowerCase() === e).forEach((m) => {
    const p = db.get('projects', m.projectId);
    if (p) invites.push({ kind: 'project', name: p.name, from: db.get('businesses', p.businessId)?.name || '', role: m.role, side: m.side });
  });
  db.all('workspaceMembers', (m) => m.status === 'invited' && String(m.email || '').toLowerCase() === e).forEach((m) => {
    const b = db.get('businesses', m.businessId);
    if (b) invites.push({ kind: 'organization', name: b.name, from: b.name, role: m.role });
  });
  return { invites, hasAccount: !!db.find('users', (u) => u.email === e) };
}

// ---------- Teams ----------
export const listTeams = (businessId = myBusiness().id) => db.all('teams', (x) => x.businessId === businessId).sort((a, z) => a.name.localeCompare(z.name));
function cleanTeams(businessId, ids) { const valid = new Set(listTeams(businessId).map((x) => x.id)); return (ids || []).filter((x) => valid.has(x)); }
export function createTeam(name) {
  const b = requireWs('members.manage');
  const n = req(name, 'Team name', 'name', 80);
  if (listTeams(b.id).some((x) => x.name.toLowerCase() === n.toLowerCase())) throw new UserError(t('A team with this name already exists.'), 'name');
  return db.insert('teams', { businessId: b.id, name: n });
}
export function renameTeam(id, name) {
  const b = requireWs('members.manage');
  const tm = db.get('teams', id);
  if (!tm || tm.businessId !== b.id) throw new ForbiddenError();
  return db.update('teams', id, { name: req(name, 'Team name', 'name', 80) });
}
export function deleteTeam(id) {
  const b = requireWs('members.manage');
  const tm = db.get('teams', id);
  if (!tm || tm.businessId !== b.id) throw new ForbiddenError();
  db.remove('teams', id);
  db.all('workspaceMembers', (m) => m.businessId === b.id && (m.teamIds || []).includes(id)).forEach((m) => db.update('workspaceMembers', m.id, { teamIds: m.teamIds.filter((x) => x !== id) }));
}
export const teamMembers = (teamId) => db.all('workspaceMembers', (m) => (m.teamIds || []).includes(teamId) && m.status === 'active');

// ---------- Project team ----------
export const roleLabel = (r) => ({ owner: 'Owner', admin: 'Admin', manager: 'Manager', member: 'Member', finance: 'Finance', viewer: 'Viewer', producer: 'Producer', director: 'Director', designer: 'Designer', editor: 'Editor', reviewer: 'Reviewer', approver: 'Approver' }[r] || r);
export const projectRoleLabel = (r) => (r === 'owner' ? 'Project Owner' : r === 'manager' ? 'Project Manager' : roleLabel(r));

// Everyone on a project, grouped by organization.
export function projectTeam(projectId) {
  const p = requireProject(projectId, 'team.view', { anySide: true });
  const parties = projectParties(p);
  const rows = new Map();
  const put = (userId, data) => {
    const key = userId || data.email;
    const cur = rows.get(key);
    if (!cur || data.explicit) rows.set(key, { ...cur, ...data });
  };
  // Implicit: organization owners/admins/managers/finance of each party.
  parties.forEach((party) => {
    if (!party.businessId) return;
    db.all('workspaceMembers', (m) => m.businessId === party.businessId && m.status === 'active' && ['owner', 'admin', 'manager', 'finance'].includes(m.role)).forEach((m) => {
      const u = db.get('users', m.userId);
      if (u) put(u.id, { userId: u.id, name: u.name, email: u.email, title: m.title, side: party.side, businessId: party.businessId, role: { owner: 'owner', admin: 'owner', manager: 'manager', finance: 'finance' }[m.role], via: 'organization', orgRole: m.role });
    });
  });
  db.all('projectMembers', (m) => m.projectId === p.id).forEach((m) => {
    const u = m.userId ? db.get('users', m.userId) : null;
    const wm = u && m.businessId ? db.find('workspaceMembers', (x) => x.businessId === m.businessId && x.userId === u.id) : null;
    put(m.userId, { id: m.id, userId: m.userId, name: u?.name || m.name || m.email, email: u?.email || m.email, title: wm?.title || m.title || '', side: m.side || 'provider', businessId: m.businessId || null, role: m.role, status: m.status || 'active', via: 'project', explicit: true });
  });
  const people = [...rows.values()];
  const groups = parties.map((party) => ({
    party,
    people: people.filter((x) => x.side === party.side && (x.businessId === party.businessId || (!x.businessId && !parties.some((o) => o !== party && o.side === party.side && o.businessId))))
      .sort((a, z) => PROJECT_ROLES.indexOf(a.role) - PROJECT_ROLES.indexOf(z.role) || String(a.name).localeCompare(String(z.name))),
  }));
  return { project: p, groups, people };
}

function canManageTeam(p, side) {
  const acc = access(p);
  if (!acc || acc.side !== side) return false;
  return acc.caps.has('team.manage') || acc.role === 'owner' || ['owner', 'admin'].includes(orgRole(me(), sideOrg(p, side)));
}
const sideOrg = (p, side) => projectParties(p).find((x) => x.side === side && x.businessId)?.businessId || null;
export const canManageTeamOn = (p) => { const acc = access(p); return !!acc && canManageTeam(p, acc.side); };

// Add a colleague from my organization to the project (on my side).
export function addProjectMember(projectId, { userId, role }) {
  const p = requireProject(projectId, 'project.view', { anySide: true });
  const acc = access(p);
  if (!canManageTeam(p, acc.side)) throw new ForbiddenError(t("You don't have permission to do this."));
  if (!PROJECT_ROLES.includes(role)) throw new UserError(t('Choose a role.'), 'role');
  const org = sideOrg(p, acc.side);
  if (!org || !orgRole(db.get('users', userId), org)) throw new UserError(t('Choose a member of your organization.'), 'userId');
  const cur = db.find('projectMembers', (m) => m.projectId === p.id && m.userId === userId);
  if (cur) return db.update('projectMembers', cur.id, { role, side: acc.side, businessId: org, status: 'active' });
  const u = db.get('users', userId);
  const row = db.insert('projectMembers', { projectId: p.id, userId, businessId: org, side: acc.side, role, status: 'active', name: u.name, email: u.email });
  logActivity(p, freelancerActorFor(p), 'team.added', '{name} joined the project as {role_t}', { name: u.name, role_t: projectRoleLabel(role) });
  notify(p, { type: 'activity', users: [userId], title: 'You were added to {project}', body: 'Your role: {role_t}.', vars: { project: p.name, role_t: projectRoleLabel(role) }, link: `/projects/${p.id}` });
  return row;
}
// Invite someone by email (a person from the other organization, or a new colleague).
export function inviteToProject(projectId, { name, email, role, side }) {
  const p = requireProject(projectId, 'project.view', { anySide: true });
  const acc = access(p);
  const s = side === 'client' || side === 'provider' ? side : acc.side;
  if (!(canManageTeam(p, acc.side) && (s === acc.side || acc.side === 'provider'))) throw new ForbiddenError(t("You don't have permission to do this."));
  if (!PROJECT_ROLES.includes(role)) throw new UserError(t('Choose a role.'), 'role');
  const e = vEmail(email);
  if (db.find('projectMembers', (m) => m.projectId === p.id && (m.email === e || (m.userId && db.get('users', m.userId)?.email === e)))) throw new UserError(t('This person is already on the project.'), 'email');
  const existing = db.find('users', (u) => u.email === e);
  const org = sideOrg(p, s);
  const row = db.insert('projectMembers', { projectId: p.id, userId: existing?.id || null, businessId: org, side: s, role, status: existing ? 'active' : 'invited', name: opt(name, 120) || existing?.name || '', email: e });
  const L = existing?.lang || uiLang();
  mailer.send({
    to: e, kind: 'invite', subject: tl(L, 'You have been invited to {project}', { project: p.name }),
    body: tl(L, 'Hi {name},\n\n{inviter} invited you to work on {project} as {role}.', { name: row.name || e, inviter: me().name, project: p.name, role: tl(L, projectRoleLabel(role)) }),
    link: appLink(existing ? `/projects/${p.id}` : `/invite?e=${encodeURIComponent(e)}`), linkLabel: tl(L, existing ? 'Open project' : 'Open your invitation'),
  });
  logActivity(p, freelancerActorFor(p), 'team.invited', '{name} was invited as {role_t}', { name: row.name || e, role_t: projectRoleLabel(role) });
  if (existing) notify(p, { type: 'activity', users: [existing.id], title: 'You were added to {project}', body: 'Your role: {role_t}.', vars: { project: p.name, role_t: projectRoleLabel(role) }, link: `/projects/${p.id}` });
  return row;
}
export function updateProjectMember(memberId, { role }) {
  const m = db.get('projectMembers', memberId);
  const p = m && requireProject(m.projectId, 'project.view', { anySide: true });
  if (!p || !canManageTeam(p, m.side)) throw new ForbiddenError(t("You don't have permission to do this."));
  if (!PROJECT_ROLES.includes(role)) throw new UserError(t('Choose a role.'), 'role');
  return db.update('projectMembers', memberId, { role });
}
export function removeProjectMember(memberId) {
  const m = db.get('projectMembers', memberId);
  const p = m && requireProject(m.projectId, 'project.view', { anySide: true });
  if (!p || !canManageTeam(p, m.side)) throw new ForbiddenError(t("You don't have permission to do this."));
  if (m.userId === me().id && m.role === 'owner') throw new UserError(t('You cannot remove yourself as project owner.'));
  db.remove('projectMembers', memberId);
}
const freelancerActorFor = (p) => { const a = freelancerActor(); const party = projectParties(p).find((x) => x.side === access(p)?.side); return { ...a, org: party?.name || a.org }; };

// Link a client record to a Scopewise organization (shared projects).
export function linkClientOrganization(clientId, businessId) {
  const b = requireWs('clients.manage');
  const c = db.get('clients', clientId);
  if (!c || c.businessId !== b.id) throw new ForbiddenError();
  return updateClient(clientId, { ...c, linkedBusinessId: businessId || null });
}

export { projectAccess, auth };
