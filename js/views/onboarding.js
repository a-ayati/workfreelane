import { html, raw, icon, field, onAction, onForm, go, href, checkBadge } from '../ui.js';
import { auth } from '../core/auth.js';
import { t } from '../core/i18n.js';
import { UserError } from '../core/util.js';
import { completeOnboarding, MANAGE_OPTIONS } from '../services/core.js';
import { DISCIPLINES, CURRENCIES } from '../services/constants.js';
import { langSwitch } from './shell.js';

const state = { step: 1, disciplines: [], manage: [...MANAGE_OPTIONS], services: '', currency: 'QAR', businessName: '', logo: '' };
const TOTAL = 7;

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
  if (!state.businessName) state.businessName = t('{name} Studio', { name: u.name });
  const s = state.step;
  const steps = html`<div class="onb-steps" aria-label="${t('Step {n} of {total}', { n: s, total: TOTAL })}">${Array.from({ length: TOTAL }, (_, i) => html`<span class="${i < s ? 'on' : ''}"></span>`)}</div>`;
  const nav = (next = t('Continue'), skip = false) => html`<div class="form-actions" style="justify-content:space-between">
    ${s > 1 ? html`<button type="button" class="btn btn-ghost" data-action="onb-back">${t('Back')}</button>` : html`<span></span>`}
    <span class="btn-row">${skip ? html`<button type="button" class="btn btn-ghost" data-action="onb-skip">${t('Skip for now')}</button>` : ''}<button class="btn btn-primary" type="submit">${next}</button></span></div>`;
  // One decision per screen, large type, tiles instead of dense forms.
  const tiles = (name, type, options, selected, label) => html`<div class="tiles" role="${type === 'radio' ? 'radiogroup' : 'group'}" aria-label="${label}">${options.map(([v, l], i) => html`<label class="tile" style="animation-delay:${i * 30}ms"><input type="${type}" name="${name}" value="${v}"${selected.includes(v) ? raw(' checked') : ''}><span>${l}</span></label>`)}</div>`;
  let body;
  if (s === 1) body = html`<h1>${t('What do you do?')}</h1><p class="muted">${t('Choose all that apply.')}</p>
    <form data-form="onb" class="form-stack">${tiles('disciplines[]', 'checkbox', DISCIPLINES.map((d) => [d, t(d)]), state.disciplines, t('Freelancer type'))}${nav()}</form>`;
  if (s === 2) body = html`<h1>${t('What do you want to manage?')}</h1><p class="muted">${t('Everything is included — this just tells us where to start.')}</p>
    <form data-form="onb" class="form-stack">${tiles('manage[]', 'checkbox', MANAGE_OPTIONS.map((m) => [m, t(m)]), state.manage, t('What do you want to manage?'))}${nav()}</form>`;
  if (s === 3) body = html`<h1>${t('What services do you offer?')}</h1><p class="muted">${t('One per line. These help pre-fill proposals.')}</p>
    <form data-form="onb" class="form-stack">${field({ label: t('Services'), name: 'services', type: 'textarea', rows: 6, value: state.services, placeholder: t('Brand identity\nSocial media content\nPromotional videos') })}${nav(t('Continue'), true)}</form>`;
  if (s === 4) body = html`<h1>${t('Which currency do you invoice in?')}</h1><p class="muted">${t('You can change this later in Settings.')}</p>
    <form data-form="onb" class="form-stack">${tiles('currency', 'radio', CURRENCIES.map((c) => [c, c]), [state.currency], t('Currency'))}${nav()}</form>`;
  if (s === 5) body = html`<h1>${t("What's your business called?")}</h1><p class="muted">${t('Shown on proposals, contracts, invoices and your client portal.')}</p>
    <form data-form="onb" class="form-stack">${field({ label: t('Business name'), name: 'businessName', value: state.businessName, required: true })}${nav()}</form>`;
  if (s === 6) body = html`<h1>${t('Add a profile photo or logo')}</h1><p class="muted">${t('Optional. Square images work best.')}</p>
    <form data-form="onb" class="form-stack">
      <div class="btn-row">${state.logo ? html`<img class="logo-preview" src="${state.logo}" alt="${t('Logo preview')}">` : html`<div class="logo-preview" aria-hidden="true"></div>`}
      <label class="btn btn-secondary">${t('Choose image')}<input type="file" accept="image/*" data-change="onb-logo" class="sr-only"></label>
      ${state.logo ? html`<button type="button" class="btn btn-ghost" data-action="onb-logo-clear">${t('Remove')}</button>` : ''}</div>
      ${nav(t('Finish setup'), true)}</form>`;
  if (s === 7) body = html`<div class="onb-done">${checkBadge()}<h1>${t("Let's create your first project.")}</h1><p class="muted">${t('Your workspace is ready. A project holds the brief, proposal, contract, files, feedback and invoices in one place.')}</p>
    <div class="form-actions" style="justify-content:flex-start;margin-top:28px"><a class="btn btn-primary btn-lg" href="${href('/projects/new')}">${t('Create Project')} ${icon('arrow', 18)}</a><a class="btn btn-ghost btn-lg" href="${href('/dashboard')}">${t('Skip for now')}</a></div></div>`;
  return html`<div class="onb"><div class="btn-row" style="justify-content:space-between;padding-bottom:32px"><a class="brand" href="${href('/')}" style="padding:0"><img src="assets/icon.svg" alt="">Scopewise</a>${langSwitch()}</div>${steps}${body}</div>`;
}

function advance(values) {
  const s = state.step;
  if (s === 1) { state.disciplines = values.disciplines || []; if (!state.disciplines.length) throw new UserError(t('Choose at least one option.')); }
  if (s === 2) { state.manage = values.manage || []; if (!state.manage.length) throw new UserError(t('Choose at least one option.')); }
  if (s === 3) state.services = values.services || '';
  if (s === 4) state.currency = values.currency || state.currency;
  if (s === 5) { state.businessName = (values.businessName || '').trim(); if (!state.businessName) throw new UserError(t('Business name is required.'), 'businessName'); }
  if (s === 6) completeOnboarding(state);
  state.step = Math.min(TOTAL, s + 1);
}

onForm({ onb: (v) => advance(v) });
onAction({
  'onb-back': () => { state.step = Math.max(1, state.step - 1); },
  'onb-skip': () => advance({ services: '' }),
  async 'onb-logo'(el) { const f = el.files?.[0]; if (f) state.logo = await resizeImage(f); },
  'onb-logo-clear': () => { state.logo = ''; },
});
export const onboardingDone = () => state.step === TOTAL;
export { go };
