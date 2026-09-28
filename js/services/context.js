// Access control and shared side effects (activity log, notifications).
import { db } from '../core/store.js';
import { auth } from '../core/auth.js';
import { planOf } from '../core/plans.js';
import { t, tl, lang } from '../core/i18n.js';
import { ForbiddenError, NotFoundError, UserError, PlanLimitError, nowISO, currencyLabel, fmtNumber } from '../core/util.js';
import { ACTIVE_STATUSES } from './constants.js';

export function me() { return auth.requireUser(); }

export function myBusiness() {
  const u = me();
  const b = db.find('businesses', (x) => x.ownerId === u.id);
  if (!b) throw new UserError(t('Finish setting up your business first.'));
  return b;
}
export const maybeBusiness = () => {
  const u = auth.currentUser();
  return u ? db.find('businesses', (x) => x.ownerId === u.id) : null;
};

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

// A freelancer may only access projects of a business they own, or projects
// where they are a member.
export function canAccessProject(user, project) {
  if (!user || !project) return false;
  const b = db.get('businesses', project.businessId);
  if (b?.ownerId === user.id) return true;
  return !!db.find('projectMembers', (m) => m.projectId === project.id && m.userId === user.id);
}
export function requireProject(id) {
  const p = db.get('projects', id);
  if (!p) throw new NotFoundError(t('This project could not be found.'));
  if (!canAccessProject(me(), p)) throw new ForbiddenError(t("You don't have access to this project."));
  return p;
}
export function requireOwned(table, id, label = 'item') {
  const r = db.get(table, id);
  if (!r) throw new NotFoundError(t('This {label} could not be found.', { label: t(label) }));
  const businessId = r.businessId || (r.projectId && db.get('projects', r.projectId)?.businessId);
  if (businessId !== myBusiness().id) throw new ForbiddenError(t("You don't have access to this {label}.", { label: t(label) }));
  return r;
}

// Client portal access: the project id plus its secret portal token.
export function portalProject(projectId, token) {
  const p = db.get('projects', projectId);
  if (!p || !token || !p.portalToken || p.portalToken !== String(token)) {
    throw new ForbiddenError(t('This client link is not valid. Please ask your freelancer for a new link.'));
  }
  if (p.portalDisabled) throw new ForbiddenError(t('This client portal has been turned off by the freelancer.'));
  return p;
}

// Language the client reads the portal, documents and emails in.
export function clientLang(projectOrClient) {
  const c = projectOrClient?.clientId ? db.get('clients', projectOrClient.clientId) : projectOrClient;
  return c?.language === 'ar' ? 'ar' : 'en';
}

export function freelancerActor() {
  const u = me();
  return { type: 'freelancer', name: u.name, userId: u.id };
}
export function clientActor(project, name) {
  const c = db.get('clients', project.clientId);
  return { type: 'client', name: name || c?.name || 'Client' };
}
export const systemActor = () => ({ type: 'system', name: 'Scopewise' });

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
    actorType: actor.type, actorName: actor.name, action,
    message: tl('en', tpl, localVars(vars, 'en')), tpl, vars, meta,
  });
}
export const activityText = (a) => (a.tpl ? t(a.tpl, localVars(a.vars)) : a.message);

export function notifyOwner(project, { type, title, body = '', vars = {}, link = '', key = null }) {
  const b = db.get('businesses', project.businessId || project);
  if (!b) return;
  const settings = b.notificationSettings || {};
  if (settings[type] === false) return;
  if (key && db.find('notifications', (n) => n.key === key)) return;
  db.insert('notifications', { userId: b.ownerId, businessId: b.id, projectId: project.id || null, type, title, body, vars, link, key, readAt: null });
}
export const notificationText = (n) => ({ title: t(n.title, localVars(n.vars)), body: t(n.body || '', localVars(n.vars)) });

export function touchClient(clientId) {
  if (clientId && db.get('clients', clientId)) db.update('clients', clientId, { lastContactAt: nowISO() });
}
