// Access control and shared side effects (activity log, notifications).
//
// Model
//   Workspace  = a `businesses` row. kind: 'personal' (one professional) or
//                'organization' (a company, channel, studio, agency…).
//   Membership = `workspaceMembers` row: a user's organization role in a workspace.
//   Project    = belongs to one workspace (the side that delivers the work).
//                The other side is the client: an external contact reached by a
//                secret link, and/or a Scopewise organization (client.linkedBusinessId)
//                whose members work in the same project.
//   Access     = implicit (organization role) ∪ explicit (`projectMembers` role),
//                filtered by side, expressed as capabilities.
import { db } from '../core/store.js';
import { auth } from '../core/auth.js';
import { planOf } from '../core/plans.js';
import { t, tl, lang } from '../core/i18n.js';
import { ForbiddenError, NotFoundError, UserError, PlanLimitError, nowISO, currencyLabel, fmtNumber } from '../core/util.js';
import { ACTIVE_STATUSES } from './constants.js';

export function me() { return auth.requireUser(); }

// ---------- Roles & capabilities ----------
export const ORG_ROLES = ['owner', 'admin', 'manager', 'member', 'finance', 'viewer'];
export const PROJECT_ROLES = ['owner', 'manager', 'producer', 'director', 'designer', 'editor', 'reviewer', 'approver', 'finance', 'viewer'];
export const ORG_TYPES = ['Production company', 'TV channel', 'Agency', 'Studio', 'Company', 'Institution', 'Team'];

const CAPS_ALL = [
  'project.view', 'brief.view', 'brief.edit', 'brief.submit', 'scope.view', 'scope.edit',
  'proposal.view', 'proposal.edit', 'proposal.respond', 'contract.view', 'contract.edit', 'contract.accept',
  'files.view', 'files.upload', 'feedback.view', 'feedback.write',
  'revisions.view', 'revisions.manage', 'revisions.request',
  'approvals.view', 'approvals.request', 'approvals.respond', 'changes.respond',
  'finance.view', 'finance.manage', 'finance.pay', 'delivery.manage',
  'team.view', 'team.manage', 'tasks.view', 'tasks.manage', 'messages', 'calendar.view', 'activity.view', 'settings.manage',
];
// Capabilities that only make sense on one side of a project.
const PROVIDER_ONLY = new Set(['brief.edit', 'scope.edit', 'proposal.edit', 'contract.edit', 'approvals.request', 'revisions.manage', 'delivery.manage', 'finance.manage', 'settings.manage']);
const CLIENT_ONLY = new Set(['brief.submit', 'proposal.respond', 'contract.accept', 'approvals.respond', 'changes.respond', 'revisions.request', 'finance.pay']);
const WORK = ['project.view', 'brief.view', 'scope.view', 'files.view', 'files.upload', 'feedback.view', 'feedback.write', 'revisions.view', 'tasks.view', 'messages', 'calendar.view', 'activity.view', 'team.view'];
const REVIEW = ['project.view', 'brief.view', 'scope.view', 'files.view', 'feedback.view', 'feedback.write', 'revisions.view', 'revisions.request', 'brief.submit', 'approvals.view', 'tasks.view', 'messages', 'calendar.view', 'activity.view', 'team.view'];
const ROLE_CAPS = {
  owner: CAPS_ALL,
  manager: CAPS_ALL,
  producer: CAPS_ALL.filter((c) => !['finance.manage', 'finance.pay', 'team.manage', 'settings.manage'].includes(c)),
  director: CAPS_ALL.filter((c) => !['finance.manage', 'finance.pay', 'settings.manage'].includes(c)),
  designer: [...WORK, 'tasks.manage'],
  editor: [...WORK, 'tasks.manage'],
  reviewer: REVIEW,
  approver: [...REVIEW, 'approvals.respond', 'proposal.view', 'proposal.respond', 'contract.view', 'contract.accept', 'changes.respond'],
  finance: ['project.view', 'scope.view', 'proposal.view', 'contract.view', 'approvals.view', 'finance.view', 'finance.manage', 'finance.pay', 'messages', 'calendar.view', 'activity.view', 'team.view'],
  viewer: ['project.view', 'brief.view', 'scope.view', 'files.view', 'feedback.view', 'revisions.view', 'approvals.view', 'calendar.view', 'activity.view', 'team.view'],
};
// Organization roles that grant access to every project of the organization.
const IMPLICIT = { owner: 'owner', admin: 'owner', manager: 'manager', finance: 'finance' };
export const roleCaps = (role) => ROLE_CAPS[role] || [];

// ---------- Workspaces ----------
export function membershipsOf(userId) {
  return db.all('workspaceMembers', (m) => m.userId === userId && m.status === 'active');
}
export function workspacesOf(user = auth.currentUser()) {
  if (!user) return [];
  const ids = new Set(membershipsOf(user.id).map((m) => m.businessId));
  db.all('businesses', (b) => b.ownerId === user.id).forEach((b) => ids.add(b.id)); // pre-membership data
  return [...ids].map((id) => db.get('businesses', id)).filter(Boolean)
    .sort((a, z) => (a.kind === 'personal' ? -1 : 0) - (z.kind === 'personal' ? -1 : 0) || a.name.localeCompare(z.name));
}
export function currentWorkspace(user = auth.currentUser()) {
  if (!user) return null;
  const list = workspacesOf(user);
  return list.find((b) => b.id === user.currentWorkspaceId) || list[0] || null;
}
export function myBusiness() {
  me();
  const b = currentWorkspace();
  if (!b) throw new UserError(t('Finish setting up your business first.'));
  return b;
}
export const maybeBusiness = () => currentWorkspace();
export function switchWorkspace(id) {
  const u = me();
  if (!workspacesOf(u).some((b) => b.id === id)) throw new ForbiddenError(t("You don't have access to this workspace."));
  db.update('users', u.id, { currentWorkspaceId: id });
}

// A user's organization role in a workspace (null when not a member).
export function orgRole(user, businessId) {
  if (!user || !businessId) return null;
  const m = db.find('workspaceMembers', (x) => x.businessId === businessId && x.userId === user.id && x.status === 'active');
  if (m) return m.role;
  return db.get('businesses', businessId)?.ownerId === user.id ? 'owner' : null;
}
export const myOrgRole = () => orgRole(me(), myBusiness().id);
// Workspace-level permission (lists and pages that span every project).
const WS_CAPS = {
  owner: ['*'], admin: ['*'],
  manager: ['projects.create', 'clients.view', 'clients.manage', 'finance.view', 'proposal.view', 'contract.view', 'portfolio', 'analytics', 'members.view'],
  finance: ['finance.view', 'finance.manage', 'proposal.view', 'contract.view', 'clients.view', 'members.view'],
  member: ['projects.create', 'members.view'],
  viewer: ['members.view'],
};
export function wsCan(cap, user = auth.currentUser(), businessId = currentWorkspace(user)?.id) {
  const r = orgRole(user, businessId);
  const caps = WS_CAPS[r] || [];
  return caps.includes('*') || caps.includes(cap);
}
export function requireWs(cap) {
  if (!wsCan(cap)) throw new ForbiddenError(t("You don't have permission to do this."));
  return myBusiness();
}

export function subscription(businessId = myBusiness().id) {
  return db.find('subscriptions', (s) => s.businessId === businessId);
}
export const plan = () => planOf(subscription());
export function requireFeature(feature, label) {
  if (!plan().features[feature]) throw new PlanLimitError(t('{label} is available on the Pro plan. You can change your plan in Settings → Subscription.', { label: t(label) }));
}
export function assertCanActivateProject(businessId) {
  const p = planOf(subscription(businessId));
  const active = db.count('projects', (x) => x.businessId === businessId && ACTIVE_STATUSES.includes(x.status));
  if (active >= p.limits.activeProjects) {
    throw new PlanLimitError(t('The {plan} plan includes {n} active projects. Complete a project or upgrade to Pro in Settings → Subscription.', { plan: t(p.name), n: p.limits.activeProjects }));
  }
}

// ---------- Project parties & access ----------
// The organizations taking part in a project, provider side first.
export function projectParties(p) {
  const out = [];
  const prov = db.get('businesses', p.businessId);
  if (prov) out.push({ side: 'provider', businessId: prov.id, name: prov.name, kind: prov.kind || 'personal', color: prov.brandColor });
  const c = db.get('clients', p.clientId);
  if (c) {
    const org = c.linkedBusinessId ? db.get('businesses', c.linkedBusinessId) : null;
    out.push({ side: 'client', businessId: org?.id || null, clientId: c.id, name: org?.name || c.company || c.name, kind: org ? org.kind : 'external' });
  }
  db.all('projectOrgs', (x) => x.projectId === p.id).forEach((x) => {
    const org = x.businessId ? db.get('businesses', x.businessId) : null;
    out.push({ id: x.id, side: x.side, businessId: x.businessId || null, name: org?.name || x.name, kind: org ? org.kind : 'external', label: x.label || '' });
  });
  return out;
}
export const partyOf = (p, businessId) => projectParties(p).find((x) => x.businessId && x.businessId === businessId) || null;

export function projectAccess(user, p) {
  if (!user || !p) return null;
  const roles = [];
  let side = null;
  const prov = orgRole(user, p.businessId);
  if (prov) { side = 'provider'; if (IMPLICIT[prov]) roles.push(IMPLICIT[prov]); }
  const explicit = db.find('projectMembers', (m) => m.projectId === p.id && m.userId === user.id && m.status !== 'invited');
  if (explicit) { side = explicit.side || side || 'provider'; roles.push(explicit.role); }
  if (!side || !roles.length) {
    for (const party of projectParties(p)) {
      if (party.side === 'provider' || !party.businessId) continue;
      const r = orgRole(user, party.businessId);
      if (r) { side = side || party.side; if (IMPLICIT[r]) roles.push(IMPLICIT[r]); }
    }
  }
  if (!roles.length) return null;
  const caps = new Set();
  roles.forEach((r) => roleCaps(r).forEach((c) => caps.add(c)));
  const drop = side === 'provider' ? CLIENT_ONLY : PROVIDER_ONLY;
  drop.forEach((c) => caps.delete(c));
  return { side, role: explicit?.role || roles[0], caps, member: explicit || null, orgRole: prov };
}
export const canAccessProject = (user, p) => !!projectAccess(user, p);
export const access = (p) => projectAccess(auth.currentUser(), p);
export const can = (p, cap) => !!access(p)?.caps.has(cap);
export const sideOf = (p) => access(p)?.side || null;

// Default: the delivering side with view access. Client-side reads pass { anySide: true }.
export function requireProject(id, cap = 'project.view', { anySide = false } = {}) {
  const p = db.get('projects', id);
  if (!p) throw new NotFoundError(t('This project could not be found.'));
  const acc = projectAccess(me(), p);
  if (!acc || (!anySide && acc.side !== 'provider')) throw new ForbiddenError(t("You don't have access to this project."));
  if (cap && !acc.caps.has(cap)) throw new ForbiddenError(t("You don't have permission to do this."));
  return p;
}
export function requireOwned(table, id, label = 'item', cap = null) {
  const r = db.get(table, id);
  if (!r) throw new NotFoundError(t('This {label} could not be found.', { label: t(label) }));
  const businessId = r.businessId || (r.projectId && db.get('projects', r.projectId)?.businessId);
  if (businessId !== myBusiness().id) throw new ForbiddenError(t("You don't have access to this {label}.", { label: t(label) }));
  if (cap && r.projectId && !can(db.get('projects', r.projectId), cap)) throw new ForbiddenError(t("You don't have access to this {label}.", { label: t(label) }));
  return r;
}

// Client portal access: the project id plus its secret portal token. Signed-in
// members of the client organization reach it without a token.
export function portalProject(projectId, token) {
  const p = db.get('projects', projectId);
  const signedIn = p && !token && projectAccess(auth.currentUser(), p)?.side === 'client';
  if (!p || (!signedIn && (!token || !p.portalToken || p.portalToken !== String(token)))) {
    throw new ForbiddenError(t('This client link is not valid. Please ask your freelancer for a new link.'));
  }
  if (p.portalDisabled && !signedIn) throw new ForbiddenError(t('This client portal has been turned off by the freelancer.'));
  return p;
}
// Actions taken from the client side. Guests with the link act as the client;
// signed-in client-side members need the matching capability.
export function portalGuard(p, cap) {
  const acc = projectAccess(auth.currentUser(), p);
  if (acc?.side === 'client' && cap && !acc.caps.has(cap)) throw new ForbiddenError(t("You don't have permission to do this."));
  return acc;
}

// Language the client reads the portal, documents and emails in.
export function clientLang(projectOrClient) {
  if (projectOrClient?.clientId && ['ar', 'en'].includes(projectOrClient.language)) return projectOrClient.language;
  const c = projectOrClient?.clientId ? db.get('clients', projectOrClient.clientId) : projectOrClient;
  return c?.language === 'ar' ? 'ar' : 'en';
}

export function freelancerActor() {
  const u = me();
  const b = currentWorkspace(u);
  return { type: 'freelancer', name: u.name, userId: u.id, org: b?.name || '' };
}
export function clientActor(project, name) {
  const c = db.get('clients', project.clientId);
  const u = auth.currentUser();
  const acc = u && projectAccess(u, project);
  const party = projectParties(project).find((x) => x.side === 'client');
  if (acc?.side === 'client') return { type: 'client', name: u.name, userId: u.id, org: party?.name || '' };
  return { type: 'client', name: name || c?.name || 'Client', org: party?.name || c?.company || '' };
}
export const systemActor = () => ({ type: 'system', name: 'Scopewise', org: '' });

// Template variables ending in "_t" are themselves translatable (e.g. folder names).
export function localVars(vars, lng) {
  if (!vars) return vars;
  const out = {};
  const l = lng || lang();
  Object.entries(vars).forEach(([k, v]) => {
    if (k.endsWith('_t') && typeof v === 'string') out[k] = lng ? tl(lng, v) : t(v);
    // Arabic reads amounts with grouping and the local currency label (e.g. 3,750 ر.ق).
    else if (l === 'ar' && k === 'currency') out[k] = currencyLabel(v, 'ar');
    else if (l === 'ar' && k === 'amount' && typeof v === 'number') out[k] = fmtNumber(v, 'ar');
    else out[k] = v;
  });
  return out;
}

// Activity is stored as a template + variables so it reads in any language.
export function logActivity(project, actor, action, tpl, vars = {}, meta = {}) {
  return db.insert('activityLogs', {
    projectId: project.id, businessId: project.businessId,
    actorType: actor.type, actorName: actor.name, actorUserId: actor.userId || null, actorOrg: actor.org || '', action,
    message: tl('en', tpl, localVars(vars, 'en')), tpl, vars, meta,
  });
}
export const activityText = (a) => (a.tpl ? t(a.tpl, localVars(a.vars)) : a.message);

// ---------- Notifications ----------
// category: 'message' (someone wrote), 'activity' (something happened),
// 'reminder' (something will happen), 'action' (something waits for you).
const TYPE_CATEGORY = { message: 'message', deadline: 'reminder', followup: 'reminder', stale: 'reminder', task: 'reminder', meeting: 'reminder', payment: 'action', approval: 'action', revision: 'action', action: 'action', client_action: 'activity', activity: 'activity' };
const TYPE_CAP = { payment: 'finance.view', revision: 'revisions.view', approval: 'approvals.view', stale: 'proposal.edit', followup: 'proposal.edit', message: 'messages', task: 'tasks.view' };

// Everyone who can see a project, optionally limited to one side and one capability.
export function audience(p, { side = null, cap = 'project.view' } = {}) {
  const ids = new Set();
  const add = (id) => id && ids.add(id);
  const orgIds = projectParties(p).map((x) => x.businessId).filter(Boolean);
  db.all('workspaceMembers', (m) => m.status === 'active' && orgIds.includes(m.businessId)).forEach((m) => add(m.userId));
  db.all('projectMembers', (m) => m.projectId === p.id && m.status !== 'invited').forEach((m) => add(m.userId));
  orgIds.forEach((id) => add(db.get('businesses', id)?.ownerId));
  return [...ids].filter((id) => {
    const acc = projectAccess(db.get('users', id), p);
    return acc && (!side || acc.side === side) && (!cap || acc.caps.has(cap));
  });
}

export function notify(p, { type = 'activity', title, body = '', vars = {}, link = '', key = null, side = 'provider', cap, category, users } = {}) {
  if (!p) return;
  const b = db.get('businesses', p.businessId);
  const settings = (side === 'provider' && b?.notificationSettings) || {};
  if (settings[type] === false) return;
  const targets = users || audience(p, { side, cap: cap || TYPE_CAP[type] || 'project.view' });
  targets.forEach((userId) => {
    if (key && db.find('notifications', (n) => n.key === key && n.userId === userId)) return;
    const l = link || (p.id ? `/projects/${p.id}` : '/notifications');
    db.insert('notifications', { userId, businessId: p.businessId, projectId: p.id || null, type, category: category || TYPE_CATEGORY[type] || 'activity', title, body, vars, link: l, key, readAt: null });
  });
}
// Kept for existing call sites: something the delivering team should know.
export function notifyOwner(project, payload) {
  if (!project?.businessId) return;
  if (!project.id) {
    // Workspace-level notice (no project): the workspace owner and admins.
    const users = db.all('workspaceMembers', (m) => m.businessId === project.businessId && m.status === 'active' && ['owner', 'admin'].includes(m.role)).map((m) => m.userId);
    const owner = db.get('businesses', project.businessId)?.ownerId;
    if (owner && !users.includes(owner)) users.push(owner);
    notify({ id: null, businessId: project.businessId }, { ...payload, users });
    return;
  }
  notify(db.get('projects', project.id) || project, { ...payload, side: 'provider' });
}
// Something the client organization's signed-in members should see.
export function notifyClientSide(p, payload) {
  notify(p, { ...payload, side: 'client', link: payload.link || `/projects/${p.id}/${payload.section || ''}` });
}
export const notificationText = (n) => ({ title: t(n.title, localVars(n.vars)), body: t(n.body || '', localVars(n.vars)) });

export function touchClient(clientId) {
  if (clientId && db.get('clients', clientId)) db.update('clients', clientId, { lastContactAt: nowISO() });
}
