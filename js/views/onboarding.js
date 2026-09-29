import { html, raw, icon, field, onAction, onForm, go, href, checkBadge } from '../ui.js';
import { auth } from '../core/auth.js';
import { t } from '../core/i18n.js';
import { UserError } from '../core/util.js';
import { completeOnboarding, MANAGE_OPTIONS } from '../services/core.js';
import { DISCIPLINES, CURRENCIES } from '../services/constants.js';
import { ORG_TYPES } from '../services/context.js';
import { langSwitch } from './shell.js';

const state = { i: 0, kind: 'personal', orgType: 'Production company', disciplines: [], manage: [...MANAGE_OPTIONS], services: '', currency: 'QAR', businessName: '', logo: '' };
// One decision per screen. Organizations get one extra question.
const stepsFor = () => ['kind', ...(state.kind === 'organization' ? ['orgType'] : []), 'disciplines', 'manage', 'services', 'currency', 'name', 'logo', 'done'];
const stepId = () => stepsFor()[Math.min(state.i, stepsFor().length - 1)];

export function resizeImage(file, max = 256) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) return reject(new UserError(t('Please choose an image file (PNG, JPG or SVG).')));
    if (file.size > 8 * 1024 * 1024) return reject(new UserError(t('That image is larger than 8 MB.')));
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s) || max; c.height = Math.round(img.height * s) || max;
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new UserError(t('We could not read that image. Try another file.'))); };
    img.src = url;
  });
}

export function onboarding() {
  const u = auth.requireUser();
  const org = state.kind === 'organization';
  if (!state.businessName) state.businessName = t('{name} Studio', { name: u.name });
  const all = stepsFor();
  const id = stepId();
  const n = state.i + 1;
  const steps = html`<div class="onb-steps" aria-label="${t('Step {n} of {total}', { n, total: all.length })}">${all.map((_, i) => html`<span class="${i < n ? 'on' : ''}"></span>`)}</div>`;
  const nav = (next = t('Continue'), skip = false) => html`<div class="form-actions" style="justify-content:space-between">
    ${state.i > 0 ? html`<button type="button" class="btn btn-ghost" data-action="onb-back">${t('Back')}</button>` : html`<span></span>`}
    <span class="btn-row">${skip ? html`<button type="button" class="btn btn-ghost" data-action="onb-skip">${t('Skip for now')}</button>` : ''}<button class="btn btn-primary" type="submit">${next}</button></span></div>`;
  // One decision per screen, large type, tiles instead of dense forms.
  const tiles = (name, type, options, selected, label) => html`<div class="tiles" role="${type === 'radio' ? 'radiogroup' : 'group'}" aria-label="${label}">${options.map(([v, l, d], i) => html`<label class="tile${d ? ' tile-lg' : ''}" style="animation-delay:${i * 30}ms"><input type="${type}" name="${name}" value="${v}"${selected.includes(v) ? raw(' checked') : ''}><span>${d ? html`<span class="tile-t"><b>${l}</b><small>${d}</small></span>` : l}</span></label>`)}</div>`;
  const views = {
    kind: () => html`<h1>${t('How will you use Scopewise?')}</h1><p class="muted">${t('You can work on your own and belong to organizations at the same time.')}</p>
      <form data-form="onb" class="form-stack">${tiles('kind', 'radio', [['personal', t('Individual'), t('Freelancer, consultant, creator or independent professional.')], ['organization', t('Organization'), t('Company, agency, studio, production company or TV channel.')]], [state.kind], t('Account type'))}${nav()}</form>`,
    orgType: () => html`<h1>${t('What kind of organization?')}</h1><p class="muted">${t('This helps us set up the right defaults.')}</p>
      <form data-form="onb" class="form-stack">${tiles('orgType', 'radio', ORG_TYPES.map((x) => [x, t(x)]), [state.orgType], t('Organization type'))}${nav()}</form>`,
    disciplines: () => html`<h1>${org ? t('What does your organization do?') : t('What do you do?')}</h1><p class="muted">${t('Choose all that apply.')}</p>
      <form data-form="onb" class="form-stack">${tiles('disciplines[]', 'checkbox', DISCIPLINES.map((d) => [d, t(d)]), state.disciplines, t('Freelancer type'))}${nav()}</form>`,
    manage: () => html`<h1>${t('What do you want to manage?')}</h1><p class="muted">${t('Everything is included — this just tells us where to start.')}</p>
      <form data-form="onb" class="form-stack">${tiles('manage[]', 'checkbox', MANAGE_OPTIONS.map((m) => [m, t(m)]), state.manage, t('What do you want to manage?'))}${nav()}</form>`,
    services: () => html`<h1>${t('What services do you offer?')}</h1><p class="muted">${t('One per line. These help pre-fill proposals.')}</p>
      <form data-form="onb" class="form-stack">${field({ label: t('Services'), name: 'services', type: 'textarea', rows: 6, value: state.services, placeholder: t('Brand identity\nSocial media content\nPromotional videos') })}${nav(t('Continue'), true)}</form>`,
    currency: () => html`<h1>${t('Which currency do you invoice in?')}</h1><p class="muted">${t('You can change this later in Settings.')}</p>
      <form data-form="onb" class="form-stack">${tiles('currency', 'radio', CURRENCIES.map((c) => [c, c]), [state.currency], t('Currency'))}${nav()}</form>`,
    name: () => html`<h1>${org ? t("What's your organization called?") : t("What's your business called?")}</h1><p class="muted">${t('Shown on proposals, contracts, invoices and your client portal.')}</p>
      <form data-form="onb" class="form-stack">${field({ label: org ? t('Organization name') : t('Business name'), name: 'businessName', value: state.businessName, required: true })}${nav()}</form>`,
    logo: () => html`<h1>${org ? t('Add your logo') : t('Add a profile photo or logo')}</h1><p class="muted">${t('Optional. Square images work best.')}</p>
      <form data-form="onb" class="form-stack">
        <div class="btn-row">${state.logo ? html`<img class="logo-preview" src="${state.logo}" alt="${t('Logo preview')}">` : html`<div class="logo-preview" aria-hidden="true"></div>`}
        <label class="btn btn-secondary">${t('Choose image')}<input type="file" accept="image/*" data-change="onb-logo" class="sr-only"></label>
        ${state.logo ? html`<button type="button" class="btn btn-ghost" data-action="onb-logo-clear">${t('Remove')}</button>` : ''}</div>
        ${nav(t('Finish setup'), true)}</form>`,
    done: () => html`<div class="onb-done">${checkBadge()}<h1>${t("Let's create your first project.")}</h1><p class="muted">${org ? t('Your organization is ready. Invite your team from the Organization page, then create a project.') : t('Your workspace is ready. A project holds the brief, proposal, contract, files, feedback and invoices in one place.')}</p>
      <div class="form-actions" style="justify-content:flex-start;margin-top:28px"><a class="btn btn-primary btn-lg" href="${href('/projects/new')}">${t('Create Project')} ${icon('arrow', 18)}</a>${org ? html`<a class="btn btn-secondary btn-lg" href="${href('/organization')}">${t('Invite your team')}</a>` : ''}<a class="btn btn-ghost btn-lg" href="${href('/dashboard')}">${t('Skip for now')}</a></div></div>`,
  };
  return html`<div class="onb"><div class="btn-row" style="justify-content:space-between;padding-bottom:32px"><a class="brand" href="${href('/')}" style="padding:0"><img src="assets/icon.svg" alt="">Scopewise</a>${langSwitch()}</div>${steps}${views[id]()}</div>`;
}

function advance(values) {
  const id = stepId();
  if (id === 'kind') state.kind = values.kind === 'organization' ? 'organization' : 'personal';
  if (id === 'orgType') state.orgType = ORG_TYPES.includes(values.orgType) ? values.orgType : 'Company';
  if (id === 'disciplines') { state.disciplines = values.disciplines || []; if (!state.disciplines.length) throw new UserError(t('Choose at least one option.')); }
  if (id === 'manage') { state.manage = values.manage || []; if (!state.manage.length) throw new UserError(t('Choose at least one option.')); }
  if (id === 'services') state.services = values.services || '';
  if (id === 'currency') state.currency = values.currency || state.currency;
  if (id === 'name') { state.businessName = (values.businessName || '').trim(); if (!state.businessName) throw new UserError(t('Business name is required.'), 'businessName'); }
  if (id === 'logo') completeOnboarding(state);
  state.i = Math.min(stepsFor().length - 1, state.i + 1);
}

onForm({ onb: (v) => advance(v) });
onAction({
  'onb-back': () => { state.i = Math.max(0, state.i - 1); },
  'onb-skip': () => advance({ services: '' }),
  async 'onb-logo'(el) { const f = el.files?.[0]; if (f) state.logo = await resizeImage(f); },
  'onb-logo-clear': () => { state.logo = ''; },
});
export const onboardingDone = () => stepId() === 'done';
export { go };
