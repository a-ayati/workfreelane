// App entry: storage init, routes, guards and rendering.
import { initStore, onRemoteChange } from './core/store.js';
import { auth } from './core/auth.js';
import { humanError } from './core/util.js';
import { t, setActiveLang, uiLang } from './core/i18n.js';
import { html, route, match, parseHash, setRenderer, installDelegation, rerender, go, href, isDirty, toast, empty, closeModal, animateCounts } from './ui.js';
import './views/command.js';
import { maybeBusiness } from './services/context.js';
import { migrate, acceptInvites } from './services/org.js';
import { appShell } from './views/shell.js';
import * as pub from './views/public.js';
import { onboarding, onboardingDone } from './views/onboarding.js';
import { dashboard } from './views/dashboard.js';
import { projectsList, projectNew, workspace } from './views/projects.js';
import { proposalsList, proposalDetail, contractsList, invoicesList, invoiceDetail, paymentsList } from './views/documents.js';
import { clientsList, clientDetail } from './views/clients.js';
import { portfolioList, portfolioEdit, portfolioPreview, analyticsView, aiView, filesIndex, searchView, notificationsView } from './views/growth.js';
import { settingsView } from './views/settings.js';
import { portal, portalLang } from './views/portal.js';
import { hydrateBlobs } from './views/viewer.js';

// layout: public | auth (signed-out only) | onboarding | app (signed-in + onboarded) | portal
const R = (pattern, layout, view, nav, title) => route(pattern, { layout, view, nav, title });
R('/', 'public', pub.landing, null, 'Run your freelance business in one place');
R('/login', 'auth', pub.login, null, 'Sign in');
R('/signup', 'auth', pub.signup, null, 'Create account');
R('/forgot', 'auth', pub.forgot, null, 'Reset password');
R('/reset', 'public', pub.reset, null, 'Choose a new password');
R('/verify', 'public', pub.verify, null, 'Verify email');
R('/mailbox', 'public', pub.mailbox, null, 'Development mailbox');
R('/onboarding', 'onboarding', onboarding, null, 'Set up your workspace');
R('/dashboard', 'app', dashboard, 'dashboard', 'Dashboard');
R('/projects', 'app', projectsList, 'projects', 'Projects');
R('/projects/new', 'app', projectNew, 'projects', 'New project');
R('/projects/:id/:tab?', 'app', workspace, 'projects', 'Project');
R('/clients', 'app', clientsList, 'clients', 'Clients');
R('/clients/:id', 'app', clientDetail, 'clients', 'Client');
R('/proposals', 'app', proposalsList, 'proposals', 'Proposals');
R('/proposals/:id', 'app', proposalDetail, 'proposals', 'Proposal');
R('/contracts', 'app', contractsList, 'contracts', 'Contracts');
R('/invoices', 'app', invoicesList, 'invoices', 'Invoices');
R('/invoices/:id', 'app', invoiceDetail, 'invoices', 'Invoice');
R('/payments', 'app', paymentsList, 'payments', 'Payments');
R('/files', 'app', filesIndex, 'files', 'Files::nav');
R('/portfolio', 'app', portfolioList, 'portfolio', 'Portfolio');
R('/portfolio/preview', 'app', portfolioPreview, 'portfolio', 'Portfolio preview');
R('/portfolio/:id', 'app', portfolioEdit, 'portfolio', 'Portfolio item');
R('/analytics', 'app', analyticsView, 'analytics', 'Analytics');
R('/ai', 'app', aiView, 'ai', 'AI Assistant');
R('/search', 'app', searchView, null, 'Search');
R('/notifications', 'app', notificationsView, null, 'Notifications');
R('/settings/:section?', 'app', settingsView, 'settings', 'Settings');
R('/client/:pid/:section?', 'portal', portal, null, 'Client portal');

const root = document.getElementById('app');
let lastPath = null;

function errorPage(err, inApp) {
  const body = empty({ title: err?.name === 'ForbiddenError' ? t('No access') : err?.name === 'NotFoundError' ? t('Not found') : t('Something went wrong'), body: humanError(err, t('Something went wrong while loading this page. Please try again.')), cta: html`<div class="btn-row" style="justify-content:center"><button class="btn btn-primary" data-action="retry">${t('Try Again')}</button><a class="btn btn-secondary" href="${href(inApp ? '/dashboard' : '/')}">${inApp ? t('Go to dashboard') : t('Go home')}</a></div>` });
  return inApp ? body : html`<main style="max-width:560px;margin:10vh auto;padding:0 16px">${body}</main>`;
}

function render() {
  const { path, query } = parseHash();
  const m = match(path);
  let user = auth.currentUser();
  if (user && acceptInvites(user)) user = auth.currentUser();
  setActiveLang(m?.handler.layout === 'portal' ? portalLang(m.params.pid) : uiLang());
  if (!m) { root.innerHTML = String(errorPage({ name: 'NotFoundError', userFacing: true, message: t("This page doesn't exist.") }, !!user)); return; }
  const { layout, view, nav, title } = m.handler;

  // Guards
  if (layout === 'auth' && user) return go(user.onboarded ? '/dashboard' : '/onboarding');
  if ((layout === 'app' || layout === 'onboarding') && !user) return go('/login');
  if (layout === 'app' && !maybeBusiness()) return go('/onboarding');
  if (layout === 'onboarding' && user.onboarded && maybeBusiness() && !onboardingDone()) return go('/dashboard');

  if (path !== lastPath) { closeModal(); }
  document.title = `${t(title)} — Scopewise`;
  let out;
  try {
    const body = view(m.params, query);
    out = layout === 'app' ? appShell(body, nav) : body;
  } catch (err) {
    out = layout === 'app' ? appShell(errorPage(err, true), nav) : errorPage(err, false);
  }
  root.innerHTML = String(out);
  const skip = document.querySelector('.skip-link'); if (skip) skip.textContent = t('Skip to content');
  hydrateBlobs(root);
  animateCounts(root);
  if (path !== lastPath) {
    document.getElementById('main')?.classList.add('enter');
    window.scrollTo(0, 0);
    document.getElementById('main')?.focus({ preventScroll: true });
    lastPath = path;
  }
}

async function boot() {
  try {
    await initStore();
    migrate();
  } catch (e) {
    console.error(e);
    root.innerHTML = `<p style="padding:24px">${t('Scopewise could not open its local storage. Please reload the page, or try another browser.')}</p>`;
    return;
  }
  setActiveLang(uiLang());
  setRenderer(render);
  installDelegation();
  window.addEventListener('hashchange', render);
  // Keep tabs in sync (e.g. freelancer app + client portal preview in another tab).
  onRemoteChange(() => {
    if (isDirty() || document.querySelector('#modal-root .modal')) { toast(t('New activity arrived — it will show when you continue.')); return; }
    rerender();
  });
  render();
}
boot();
