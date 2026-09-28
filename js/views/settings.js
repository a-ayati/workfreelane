// Settings.
import { themeSwitch } from './shell.js';
import { html, raw, icon, href, pageHead, field, onAction, onForm, go, toast, confirmDialog, tabs, comingSoon, parseHash } from '../ui.js';
import { db, resetAll, flush } from '../core/store.js';
import { auth } from '../core/auth.js';
import { t, lang, setUiLang } from '../core/i18n.js';
import { aiConfig, CLAUDE_MODEL } from '../core/ai.js';
import { PLANS } from '../core/plans.js';
import { UserError, lines } from '../core/util.js';
import { me, myBusiness, subscription } from '../services/context.js';
import { updateBusiness, myProfile, updateProfile, contractTemplateFor } from '../services/core.js';
import { CURRENCIES, DISCIPLINES, NOTIFICATION_TYPES, TEMPLATES, DEFAULT_CONTRACT_SECTIONS, DEFAULT_CONTRACT_SECTIONS_AR, CONTRACT_DISCLAIMER } from '../services/constants.js';
import { resizeImage } from './onboarding.js';

const SECTIONS = [['profile', 'Profile'], ['language', 'Language'], ['appearance', 'Appearance'], ['business', 'Business'], ['brand', 'Brand'], ['currency', 'Currency'], ['notifications', 'Notifications'], ['templates', 'Templates'], ['invoices', 'Invoice Settings'], ['proposals', 'Proposal Settings'], ['contracts', 'Contract Templates'], ['ai', 'AI'], ['security', 'Security'], ['subscription', 'Subscription']];

export function settingsView(params) {
  const section = SECTIONS.some(([id]) => id === params.section) ? params.section : 'profile';
  const b = myBusiness();
  const u = me();
  const pr = myProfile();
  const save = html`<div class="form-actions full"><button class="btn btn-primary" type="submit">${t('Save changes')}</button></div>`;
  const views = {
    profile: () => html`<form class="card form-grid" data-form="settings-profile">
      ${field({ label: t('Full name'), name: 'name', value: u.name, required: true })}
      ${field({ label: t('Email'), name: 'email', type: 'email', value: u.email, required: true, hint: u.emailVerified ? t('Verified') : t('Not verified yet'), attrs: 'dir="ltr"' })}
      ${field({ label: t('Title'), name: 'title', value: pr?.title, placeholder: t('e.g. Creative Director') })}
      ${field({ label: t('Phone'), name: 'phone', value: pr?.phone, attrs: 'dir="ltr"' })}
      <fieldset class="full field" style="border:0;padding:0;margin:0"><legend style="padding:0;margin-bottom:8px">${t('What kind of freelancer are you?')}</legend><div class="chips">${DISCIPLINES.map((d) => html`<label class="chip"><input type="checkbox" name="disciplines[]" value="${d}"${pr?.disciplines?.includes(d) ? raw(' checked') : ''}><span>${t(d)}</span></label>`)}</div></fieldset>
      ${field({ label: t('Services (one per line)'), name: 'services', type: 'textarea', rows: 4, value: (pr?.services || []).join('\n'), full: true })}
      ${field({ label: t('Short bio'), name: 'bio', type: 'textarea', rows: 3, value: pr?.bio, full: true })}${save}</form>`,
    language: () => html`<form class="card form-stack" data-form="settings-language">
      ${field({ label: t('App language'), name: 'lang', type: 'select', value: lang(), options: [['en', 'English'], ['ar', 'العربية']], hint: t('The language of your workspace.') })}
      <div class="notice small">${t('Each client has their own language, set on the client profile. Their portal, proposals, contracts, invoices and emails use it — so you can work in one language while a client reads another.')}</div>
      <div class="form-actions"><button class="btn btn-primary" type="submit">${t('Save')}</button></div></form>`,
    appearance: () => html`<div class="card form-stack">
      <div><h2>${t('Appearance')}</h2><p class="small muted" style="margin:4px 0 0">${t('Auto follows your device setting. Saved on this device.')}</p></div>
      ${themeSwitch()}</div>`,
    business: () => html`<form class="card form-grid" data-form="settings-business">
      ${field({ label: t('Business name'), name: 'name', value: b.name, required: true, full: true })}
      ${field({ label: t('Address (shown on invoices)'), name: 'address', type: 'textarea', rows: 3, value: b.address, full: true })}${save}</form>`,
    brand: () => html`<form class="card form-grid" data-form="settings-business">
      <div class="full btn-row">${b.logo ? html`<img class="logo-preview" src="${b.logo}" alt="${t('Logo')}">` : html`<div class="logo-preview"></div>`}
        <label class="btn btn-secondary">${t('Upload logo')}<input type="file" accept="image/*" class="sr-only" data-change="settings-logo"></label>
        ${b.logo ? html`<button type="button" class="btn btn-ghost" data-action="settings-logo-clear">${t('Remove')}</button>` : ''}</div>
      ${field({ label: t('Brand color'), name: 'brandColor', type: 'color', value: b.brandColor || '#17150F', hint: t('Used on your client portal header.') })}
      <div class="full notice small">${t('White-label client portal')} ${comingSoon()} (${t('Studio plan')}).</div>${save}</form>`,
    currency: () => html`<form class="card form-grid" data-form="settings-business">
      ${field({ label: t('Default currency'), name: 'currency', type: 'select', value: b.currency, options: CURRENCIES, hint: t('Used for new projects. Existing projects keep their currency.') })}${save}</form>`,
    notifications: () => { const s = b.notificationSettings || {}; return html`<form class="card form-stack" data-form="settings-notifications">
      <p class="muted" style="margin:0">${t('Choose which in-app notifications you receive.')} ${t('Email notifications')} ${comingSoon()}.</p>
      ${Object.entries(NOTIFICATION_TYPES).map(([k, l]) => html`<label class="check"><input type="checkbox" name="${k}" data-bool${s[k] !== false ? raw(' checked') : ''}> ${t(l)}</label>`)}
      <div class="form-actions"><button class="btn btn-primary" type="submit">${t('Save')}</button></div></form>`; },
    templates: () => html`<div class="card"><p class="muted">${t('Project templates available when creating a project.')} ${t('Custom templates')} ${comingSoon()}.</p>
      <div class="list" style="margin-top:12px">${Object.values(TEMPLATES).map((tp) => html`<div class="list-row" style="grid-template-columns:minmax(0,1fr) auto"><div><div class="cell-title">${t(tp.name)}</div><div class="cell-sub">${tp.deliverables.map(([d, n]) => `${n} × ${t(d)}`).join(' · ')}</div></div><span class="cell-sub">${t('{n} rounds · {d}% deposit', { n: tp.revisions, d: tp.deposit })}</span></div>`)}</div></div>`,
    invoices: () => html`<form class="card form-grid" data-form="settings-business">
      ${field({ label: t('Invoice number prefix'), name: 'invoicePrefix', value: b.invoicePrefix, attrs: 'dir="ltr"' })}
      ${field({ label: t('Next invoice number'), name: 'nextInvoiceNumber', type: 'number', value: b.nextInvoiceNumber })}
      ${field({ label: t('Payment due (days)'), name: 'defaultDueDays', type: 'number', value: b.defaultDueDays })}
      ${field({ label: t('Default deposit %'), name: 'defaultDepositPercent', type: 'number', value: b.defaultDepositPercent })}
      ${field({ label: t('Tax label'), name: 'taxLabel', value: b.taxLabel })}
      ${field({ label: t('Default tax rate %'), name: 'taxRate', type: 'number', value: b.taxRate, attrs: 'step="0.01"' })}
      ${field({ label: t('Payment instructions'), name: 'paymentInstructions', type: 'textarea', rows: 3, value: b.paymentInstructions, full: true, hint: t('Shown on every invoice and in the client portal.') })}${save}</form>`,
    proposals: () => html`<form class="card form-grid" data-form="settings-business">
      ${field({ label: t('Default introduction'), name: 'proposalIntro', type: 'textarea', rows: 3, value: b.proposalIntro, full: true })}
      ${field({ label: t('Default payment terms'), name: 'defaultPaymentTerms', type: 'textarea', rows: 2, value: b.defaultPaymentTerms, full: true })}
      ${field({ label: t('Proposal valid for (days)'), name: 'proposalValidityDays', type: 'number', value: b.proposalValidityDays })}
      ${field({ label: t('Default revision rounds'), name: 'defaultRevisions', type: 'number', value: b.defaultRevisions })}
      <p class="full small muted" style="margin:0">${t("If you keep the default texts, clients see them in their own language automatically.")}</p>${save}</form>`,
    contracts: () => {
      const q = parseHash().query.tpl; const tl = q === 'ar' || q === 'en' ? q : lang();
      const secs = contractTemplateFor(b, tl);
      return html`<div class="notice notice-warn" style="margin-bottom:16px">${t(CONTRACT_DISCLAIMER)}</div>
      <nav class="filters" aria-label="${t('Template language')}"><a href="${href('/settings/contracts?tpl=en')}" class="${tl === 'en' ? 'active' : ''}">English</a><a href="${href('/settings/contracts?tpl=ar')}" class="${tl === 'ar' ? 'active' : ''}">العربية</a></nav>
      <p class="small muted">${t('Clients receive the contract in their own language. Edit each language version here.')}</p>
      <form class="stack" data-form="settings-contract" dir="${tl === 'ar' ? 'rtl' : 'ltr'}" lang="${tl}"><input type="hidden" name="tpl" value="${tl}">
        <p class="small muted" style="margin:0" dir="ltr">${'{{project}} {{client}} {{freelancer}} {{deliverables}} {{deadline}} {{total}} {{paymentTerms}} {{depositPercent}} {{depositAmount}} {{revisions}}'}</p>
        ${secs.map((s, i) => html`<div class="card" style="padding:14px"><input name="sections.${i}.title" value="${s.title}" aria-label="${t('Section title')}" style="font-weight:600;margin-bottom:8px"><textarea name="sections.${i}.body" rows="3" aria-label="${s.title}">${s.body}</textarea></div>`)}
        <div class="form-actions" style="justify-content:space-between"><button type="button" class="btn btn-ghost" data-action="contract-template-reset" data-tpl="${tl}">${t('Restore default')}</button><button class="btn btn-primary" type="submit">${t('Save template')}</button></div></form>`;
    },
    ai: () => html`<form class="card form-stack" data-form="settings-ai">
      <p style="margin:0">${t('The assistant works out of the box with a built-in, rule-based helper that runs on your device. For better results, connect Claude with your own Anthropic API key.')}</p>
      ${field({ label: t('Anthropic API key'), name: 'key', type: 'password', value: aiConfig.getKey(), placeholder: 'sk-ant-…', hint: t("Stored only in this browser and sent only to Anthropic's API. Model: {model}. Leave empty to use the local assistant.", { model: CLAUDE_MODEL }), attrs: 'dir="ltr"' })}
      <div class="notice small">${t('Whichever you use, AI output is always a suggestion for you to review. It never sends messages, changes scope, charges clients, approves work or signs contracts.')}</div>
      <div class="form-actions"><button class="btn btn-primary" type="submit">${t('Save')}</button></div></form>`,
    security: () => html`<form class="card form-grid" data-form="settings-password">
      <div class="full"><h2>${t('Change password')}</h2></div>
      ${field({ label: t('Current password'), name: 'current', type: 'password', required: true, attrs: 'autocomplete="current-password"' })}
      ${field({ label: t('New password'), name: 'next', type: 'password', required: true, attrs: 'autocomplete="new-password"' })}
      <div class="form-actions full"><button class="btn btn-primary" type="submit">${t('Update password')}</button></div></form>
      <div class="card"><h2 style="margin-bottom:8px">${t('Your data')}</h2>
        <p class="muted small">${t('This MVP stores everything in this browser (IndexedDB). Anyone with access to this device and browser profile can open it — use a device you trust.')} ${t('Cloud sync and two-factor sign-in')} ${comingSoon()}.</p>
        <div class="btn-row"><button class="btn btn-secondary btn-sm" data-action="data-export">${icon('download', 14)} ${t('Export data (JSON)')}</button><button class="btn btn-ghost btn-sm" style="color:var(--red)" data-action="data-reset">${t('Erase all data on this device')}</button></div></div>`,
    subscription: () => { const cur = subscription()?.plan || 'free'; return html`<div class="plans">${Object.values(PLANS).map((pl) => html`<div class="plan${pl.id === cur ? ' current' : ''}"><div class="eyebrow">${t(pl.tagline)}</div><h2>${t(pl.name)}</h2><div class="price">${pl.price ? `$${pl.price}` : t('Free')}<span class="small muted" style="font-family:var(--sans)">${pl.price ? ` / ${t('month')}` : ''}</span></div>
        <ul>${pl.highlights.map((h) => html`<li>${t(h)}</li>`)}</ul>
        ${pl.id === cur ? html`<span class="pill pill-green"><span class="dot"></span>${t('Current plan')}</span>` : html`<button class="btn btn-secondary" data-action="plan-switch" data-plan="${pl.id}">${t('Switch to {plan}', { plan: t(pl.name) })}</button>`}</div>`)}</div>
      <p class="small muted" style="margin-top:16px">${t('Billing is not connected in this MVP')} ${comingSoon()}. ${t('Switching plans applies immediately and free of charge so you can try each tier.')}</p>`; },
  };
  return html`${pageHead({ title: t('Settings') })}${tabs(SECTIONS.map(([id, l]) => [id, t(l), `/settings/${id}`]), section)}<div style="max-width:820px">${views[section]()}</div>`;
}

onForm({
  'settings-profile': (v) => { auth.updateUser({ name: v.name, email: v.email }); updateProfile({ title: v.title, phone: v.phone, disciplines: v.disciplines || [], services: v.services, bio: v.bio }); toast(t('Profile saved.')); },
  'settings-language': (v) => { setUiLang(v.lang); auth.updateUser({ lang: v.lang }); toast(v.lang === 'ar' ? 'تم تحديث لغة التطبيق.' : 'Language saved.'); },
  'settings-business': (v) => { updateBusiness(v); toast(t('Settings saved.')); },
  'settings-notifications': (v) => { updateBusiness({ notificationSettings: Object.fromEntries(Object.keys(NOTIFICATION_TYPES).map((k) => [k, !!v[k]])) }); toast(t('Notification settings saved.')); },
  'settings-contract': (v) => { updateBusiness({ [v.tpl === 'ar' ? 'contractSectionsAr' : 'contractSections']: v.sections || [] }); toast(t('Contract template saved. New contracts will use it.')); },
  'settings-ai': (v) => {
    const k = String(v.key || '').trim();
    if (k && !k.startsWith('sk-ant-')) throw new UserError(t('That does not look like an Anthropic API key (it should start with sk-ant-).'), 'key');
    aiConfig.setKey(k); toast(k ? t('Claude connected.') : t('Using the local assistant.'));
  },
  'settings-password': async (v) => { await auth.changePassword(v.current, v.next); toast(t('Password updated.')); },
});
onAction({
  async 'settings-logo'(el) { const f = el.files?.[0]; if (f) { updateBusiness({ logo: await resizeImage(f) }); toast(t('Logo updated.')); } },
  'settings-logo-clear': () => { updateBusiness({ logo: '' }); },
  'contract-template-reset': async (el) => {
    if (!(await confirmDialog({ title: t('Restore default template?'), body: t('Your edits to the contract template will be replaced. Existing contracts are not changed.'), confirm: t('Restore') }))) return false;
    const ar = el.dataset.tpl === 'ar';
    updateBusiness({ [ar ? 'contractSectionsAr' : 'contractSections']: (ar ? DEFAULT_CONTRACT_SECTIONS_AR : DEFAULT_CONTRACT_SECTIONS).map(([title, body]) => ({ title, body })) }); toast(t('Default template restored.'));
  },
  'plan-switch': (el) => { const s = subscription(); db.update('subscriptions', s.id, { plan: el.dataset.plan }); toast(t("You're on {plan}.", { plan: t(PLANS[el.dataset.plan].name) })); },
  'data-export': async () => {
    await flush();
    const b = myBusiness();
    const tables = ['clients', 'projects', 'briefs', 'deliverables', 'proposals', 'proposalItems', 'contracts', 'changeOrders', 'files', 'fileVersions', 'feedback', 'revisionRounds', 'approvals', 'invoices', 'invoiceItems', 'payments', 'portfolioItems', 'activityLogs', 'reminders'];
    const pids = new Set(db.all('projects', (p) => p.businessId === b.id).map((p) => p.id));
    const out = { exportedAt: new Date().toISOString(), business: b };
    tables.forEach((name) => { out[name] = db.all(name, (r) => r.businessId === b.id || pids.has(r.projectId) || (r.proposalId && db.get('proposals', r.proposalId)?.businessId === b.id) || (r.invoiceId && db.get('invoices', r.invoiceId)?.businessId === b.id)); });
    const url = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `scopewise-export-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return false;
  },
  'data-reset': async () => {
    if (!(await confirmDialog({ title: t('Erase all data?'), body: t('Every account, project and file stored in this browser is permanently deleted.'), confirm: t('Erase everything'), tone: 'danger', requireText: 'ERASE' }))) return false;
    await resetAll(); auth.logout(); go('/'); location.reload(); return false;
  },
});
export { lines };
