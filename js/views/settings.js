// Settings.
import { html, raw, icon, href, pageHead, field, onAction, onForm, go, toast, confirmDialog, tabs, comingSoon } from '../ui.js';
import { db, resetAll, flush } from '../core/store.js';
import { auth } from '../core/auth.js';
import { aiConfig, CLAUDE_MODEL } from '../core/ai.js';
import { PLANS } from '../core/plans.js';
import { UserError, lines } from '../core/util.js';
import { me, myBusiness, subscription } from '../services/context.js';
import { updateBusiness, myProfile, updateProfile } from '../services/core.js';
import { CURRENCIES, DISCIPLINES, NOTIFICATION_TYPES, TEMPLATES, DEFAULT_CONTRACT_SECTIONS, CONTRACT_DISCLAIMER } from '../services/constants.js';
import { resizeImage } from './onboarding.js';

const SECTIONS = [['profile', 'Profile'], ['business', 'Business'], ['brand', 'Brand'], ['currency', 'Currency'], ['notifications', 'Notifications'], ['templates', 'Templates'], ['invoices', 'Invoice Settings'], ['proposals', 'Proposal Settings'], ['contracts', 'Contract Templates'], ['ai', 'AI'], ['security', 'Security'], ['subscription', 'Subscription']];

export function settingsView(params) {
  const section = SECTIONS.some(([id]) => id === params.section) ? params.section : 'profile';
  const b = myBusiness();
  const u = me();
  const pr = myProfile();
  const save = html`<div class="form-actions full"><button class="btn btn-primary" type="submit">Save changes</button></div>`;
  const views = {
    profile: () => html`<form class="card form-grid" data-form="settings-profile">
      ${field({ label: 'Full name', name: 'name', value: u.name, required: true })}
      ${field({ label: 'Email', name: 'email', type: 'email', value: u.email, required: true, hint: u.emailVerified ? 'Verified' : 'Not verified yet' })}
      ${field({ label: 'Title', name: 'title', value: pr?.title, placeholder: 'e.g. Creative Director' })}
      ${field({ label: 'Phone', name: 'phone', value: pr?.phone })}
      <fieldset class="full field" style="border:0;padding:0;margin:0"><legend style="padding:0;margin-bottom:8px">What kind of freelancer are you?</legend><div class="chips">${DISCIPLINES.map((d) => html`<label class="chip"><input type="checkbox" name="disciplines[]" value="${d}"${pr?.disciplines?.includes(d) ? raw(' checked') : ''}><span>${d}</span></label>`)}</div></fieldset>
      ${field({ label: 'Services (one per line)', name: 'services', type: 'textarea', rows: 4, value: (pr?.services || []).join('\n'), full: true })}
      ${field({ label: 'Short bio', name: 'bio', type: 'textarea', rows: 3, value: pr?.bio, full: true })}${save}</form>`,
    business: () => html`<form class="card form-grid" data-form="settings-business">
      ${field({ label: 'Business name', name: 'name', value: b.name, required: true, full: true })}
      ${field({ label: 'Address (shown on invoices)', name: 'address', type: 'textarea', rows: 3, value: b.address, full: true })}${save}</form>`,
    brand: () => html`<form class="card form-grid" data-form="settings-business">
      <div class="full btn-row">${b.logo ? html`<img class="logo-preview" src="${b.logo}" alt="Logo">` : html`<div class="logo-preview"></div>`}
        <label class="btn btn-secondary">Upload logo<input type="file" accept="image/*" class="sr-only" data-change="settings-logo"></label>
        ${b.logo ? html`<button type="button" class="btn btn-ghost" data-action="settings-logo-clear">Remove</button>` : ''}</div>
      ${field({ label: 'Brand color', name: 'brandColor', type: 'color', value: b.brandColor || '#17150F', hint: 'Used on your client portal header.' })}
      <div class="full notice small">White-label client portal ${comingSoon()} (Studio plan).</div>${save}</form>`,
    currency: () => html`<form class="card form-grid" data-form="settings-business">
      ${field({ label: 'Default currency', name: 'currency', type: 'select', value: b.currency, options: CURRENCIES, hint: 'Used for new projects. Existing projects keep their currency.' })}${save}</form>`,
    notifications: () => { const s = b.notificationSettings || {}; return html`<form class="card form-stack" data-form="settings-notifications">
      <p class="muted" style="margin:0">Choose which in-app notifications you receive. Email notifications ${comingSoon()}.</p>
      ${Object.entries(NOTIFICATION_TYPES).map(([k, l]) => html`<label class="check"><input type="checkbox" name="${k}" data-bool${s[k] !== false ? raw(' checked') : ''}> ${l}</label>`)}
      <div class="form-actions"><button class="btn btn-primary" type="submit">Save</button></div></form>`; },
    templates: () => html`<div class="card"><p class="muted">Project templates available when creating a project. Custom templates ${comingSoon()}.</p>
      <div class="list" style="margin-top:12px">${Object.values(TEMPLATES).map((t) => html`<div class="list-row" style="grid-template-columns:minmax(0,1fr) auto"><div><div class="cell-title">${t.name}</div><div class="cell-sub">${t.deliverables.map(([d, n]) => `${n} × ${d}`).join(' · ')}</div></div><span class="cell-sub">${t.revisions} rounds · ${t.deposit}% deposit</span></div>`)}</div></div>`,
    invoices: () => html`<form class="card form-grid" data-form="settings-business">
      ${field({ label: 'Invoice number prefix', name: 'invoicePrefix', value: b.invoicePrefix })}
      ${field({ label: 'Next invoice number', name: 'nextInvoiceNumber', type: 'number', value: b.nextInvoiceNumber })}
      ${field({ label: 'Payment due (days)', name: 'defaultDueDays', type: 'number', value: b.defaultDueDays })}
      ${field({ label: 'Default deposit %', name: 'defaultDepositPercent', type: 'number', value: b.defaultDepositPercent })}
      ${field({ label: 'Tax label', name: 'taxLabel', value: b.taxLabel })}
      ${field({ label: 'Default tax rate %', name: 'taxRate', type: 'number', value: b.taxRate, attrs: 'step="0.01"' })}
      ${field({ label: 'Payment instructions', name: 'paymentInstructions', type: 'textarea', rows: 3, value: b.paymentInstructions, full: true, hint: 'Shown on every invoice and in the client portal.' })}${save}</form>`,
    proposals: () => html`<form class="card form-grid" data-form="settings-business">
      ${field({ label: 'Default introduction', name: 'proposalIntro', type: 'textarea', rows: 3, value: b.proposalIntro, full: true })}
      ${field({ label: 'Default payment terms', name: 'defaultPaymentTerms', type: 'textarea', rows: 2, value: b.defaultPaymentTerms, full: true })}
      ${field({ label: 'Proposal valid for (days)', name: 'proposalValidityDays', type: 'number', value: b.proposalValidityDays })}
      ${field({ label: 'Default revision rounds', name: 'defaultRevisions', type: 'number', value: b.defaultRevisions })}${save}</form>`,
    contracts: () => html`<div class="notice notice-warn" style="margin-bottom:16px">${CONTRACT_DISCLAIMER}</div>
      <form class="stack" data-form="settings-contract">
        <p class="small muted" style="margin:0">Placeholders: ${'{{project}} {{client}} {{freelancer}} {{deliverables}} {{deadline}} {{total}} {{paymentTerms}} {{depositPercent}} {{depositAmount}} {{revisions}}'}</p>
        ${(b.contractSections || []).map((s, i) => html`<div class="card" style="padding:14px"><input name="sections.${i}.title" value="${s.title}" aria-label="Section title" style="font-weight:600;margin-bottom:8px"><textarea name="sections.${i}.body" rows="3" aria-label="${s.title}">${s.body}</textarea></div>`)}
        <div class="form-actions" style="justify-content:space-between"><button type="button" class="btn btn-ghost" data-action="contract-template-reset">Restore default</button><button class="btn btn-primary" type="submit">Save template</button></div></form>`,
    ai: () => html`<form class="card form-stack" data-form="settings-ai">
      <p style="margin:0">The assistant works out of the box with a built-in, rule-based helper that runs on your device. For better results, connect Claude with your own Anthropic API key.</p>
      ${field({ label: 'Anthropic API key', name: 'key', type: 'password', value: aiConfig.getKey(), placeholder: 'sk-ant-…', hint: `Stored only in this browser and sent only to Anthropic's API. Model: ${CLAUDE_MODEL}. Leave empty to use the local assistant.` })}
      <div class="notice small">Whichever you use, AI output is always a suggestion for you to review. It never sends messages, changes scope, charges clients, approves work or signs contracts.</div>
      <div class="form-actions"><button class="btn btn-primary" type="submit">Save</button></div></form>`,
    security: () => html`<form class="card form-grid" data-form="settings-password">
      <div class="full"><h2>Change password</h2></div>
      ${field({ label: 'Current password', name: 'current', type: 'password', required: true, attrs: 'autocomplete="current-password"' })}
      ${field({ label: 'New password', name: 'next', type: 'password', required: true, attrs: 'autocomplete="new-password"' })}
      <div class="form-actions full"><button class="btn btn-primary" type="submit">Update password</button></div></form>
      <div class="card"><h2 style="margin-bottom:8px">Your data</h2>
        <p class="muted small">This MVP stores everything in this browser (IndexedDB). Anyone with access to this device and browser profile can open it — use a device you trust. Cloud sync and two-factor sign-in ${comingSoon()}.</p>
        <div class="btn-row"><button class="btn btn-secondary btn-sm" data-action="data-export">${icon('download', 14)} Export data (JSON)</button><button class="btn btn-ghost btn-sm" style="color:var(--red)" data-action="data-reset">Erase all data on this device</button></div></div>`,
    subscription: () => { const cur = subscription()?.plan || 'free'; return html`<div class="plans">${Object.values(PLANS).map((pl) => html`<div class="plan${pl.id === cur ? ' current' : ''}"><div class="eyebrow">${pl.tagline}</div><h2>${pl.name}</h2><div class="price">${pl.price ? `$${pl.price}` : 'Free'}<span class="small muted" style="font-family:var(--sans)">${pl.price ? ` / ${pl.period}` : ''}</span></div>
        <ul>${pl.highlights.map((h) => html`<li>${h}</li>`)}</ul>
        ${pl.id === cur ? html`<span class="pill pill-green"><span class="dot"></span>Current plan</span>` : html`<button class="btn btn-secondary" data-action="plan-switch" data-plan="${pl.id}">Switch to ${pl.name}</button>`}</div>`)}</div>
      <p class="small muted" style="margin-top:16px">Billing is not connected in this MVP ${comingSoon()}. Switching plans applies immediately and free of charge so you can try each tier.</p>`; },
  };
  return html`${pageHead({ title: 'Settings' })}${tabs(SECTIONS.map(([id, l]) => [id, l, `/settings/${id}`]), section)}<div style="max-width:820px">${views[section]()}</div>`;
}

onForm({
  'settings-profile': (v) => { auth.updateUser({ name: v.name, email: v.email }); updateProfile({ title: v.title, phone: v.phone, disciplines: v.disciplines || [], services: v.services, bio: v.bio }); toast('Profile saved.'); },
  'settings-business': (v) => { updateBusiness(v); toast('Settings saved.'); },
  'settings-notifications': (v) => { updateBusiness({ notificationSettings: Object.fromEntries(Object.keys(NOTIFICATION_TYPES).map((k) => [k, !!v[k]])) }); toast('Notification settings saved.'); },
  'settings-contract': (v) => { updateBusiness({ contractSections: v.sections || [] }); toast('Contract template saved. New contracts will use it.'); },
  'settings-ai': (v) => {
    const k = String(v.key || '').trim();
    if (k && !k.startsWith('sk-ant-')) throw new UserError('That does not look like an Anthropic API key (it should start with sk-ant-).', 'key');
    aiConfig.setKey(k); toast(k ? 'Claude connected.' : 'Using the local assistant.');
  },
  'settings-password': async (v) => { await auth.changePassword(v.current, v.next); toast('Password updated.'); },
});
onAction({
  async 'settings-logo'(el) { const f = el.files?.[0]; if (f) { updateBusiness({ logo: await resizeImage(f) }); toast('Logo updated.'); } },
  'settings-logo-clear': () => { updateBusiness({ logo: '' }); },
  'contract-template-reset': async () => {
    if (!(await confirmDialog({ title: 'Restore default template?', body: 'Your edits to the contract template will be replaced. Existing contracts are not changed.', confirm: 'Restore' }))) return false;
    updateBusiness({ contractSections: DEFAULT_CONTRACT_SECTIONS.map(([title, body]) => ({ title, body })) }); toast('Default template restored.');
  },
  'plan-switch': (el) => { const s = subscription(); db.update('subscriptions', s.id, { plan: el.dataset.plan }); toast(`You're on ${PLANS[el.dataset.plan].name}.`); },
  'data-export': async () => {
    await flush();
    const b = myBusiness();
    const tables = ['clients', 'projects', 'briefs', 'deliverables', 'proposals', 'proposalItems', 'contracts', 'changeOrders', 'files', 'fileVersions', 'feedback', 'revisionRounds', 'approvals', 'invoices', 'invoiceItems', 'payments', 'portfolioItems', 'activityLogs', 'reminders'];
    const pids = new Set(db.all('projects', (p) => p.businessId === b.id).map((p) => p.id));
    const out = { exportedAt: new Date().toISOString(), business: b };
    tables.forEach((t) => { out[t] = db.all(t, (r) => r.businessId === b.id || pids.has(r.projectId) || (r.proposalId && db.get('proposals', r.proposalId)?.businessId === b.id) || (r.invoiceId && db.get('invoices', r.invoiceId)?.businessId === b.id)); });
    const url = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `scopewise-export-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return false;
  },
  'data-reset': async () => {
    if (!(await confirmDialog({ title: 'Erase all data?', body: 'Every account, project and file stored in this browser is permanently deleted.', confirm: 'Erase everything', tone: 'danger', requireText: 'ERASE' }))) return false;
    await resetAll(); auth.logout(); go('/'); location.reload(); return false;
  },
});
export { lines };
