// Landing page, authentication pages and the development mailbox.
import { html, icon, href, field, onAction, onForm, go, toast, pageHead, empty } from '../ui.js';
import { auth, sendVerification } from '../core/auth.js';
import { db } from '../core/store.js';
import { t, setUiLang } from '../core/i18n.js';
import { fmtDateTime } from '../core/util.js';
import { seedDemo, DEMO } from '../seed.js';
import { langSwitch } from './shell.js';

export function landing() {
  const user = auth.currentUser();
  const features = [
    ['Smart Briefs', 'Structured briefs your clients can fill in — or paste a message and let the assistant draft one.', true],
    ['Scope Protection', 'Clear included / not-included lists, locked after signing. Extra work becomes a change order.', true],
    ['Client Portal', 'One link for your client: proposal, contract, files, feedback, approvals and invoices. Works on any phone.', true],
    ['Revision Management', 'Every round counted against the allowance. “Revision 3 of 2” turns into a change order — never silent work.', true],
    ['Approvals', 'Final sign-off recorded with name, date, time and version. A permanent record.', false],
    ['Project Management', 'Every project shows its status, its deadline and the one next step to take.', false],
    ['Proposals & Contracts', 'Professional proposals that become contracts in one click when accepted.', false],
    ['Invoicing', 'Deposit and final invoices created from the project. Track paid, partial and overdue.', false],
    ['Client CRM', 'Revenue, outstanding balance and history per client, with follow-up reminders.', false],
    ['Portfolio', 'Turn a completed project into a case study with the files you already delivered.', false],
    ['AI Assistant', 'Briefs, follow-ups, feedback summaries and scope-risk checks — always for you to review.', false],
    ['Arabic & English', 'Work in Arabic or English, and give every client a portal and documents in their own language.', false],
  ];
  return html`<div class="lp">
    <header class="lp-nav">
      <a class="brand" href="${href('/')}" style="padding:0"><img src="assets/icon.svg" alt="">Scopewise</a>
      <nav>
        ${langSwitch()}
        <a class="btn btn-ghost hide-sm" href="#how">${t('How it works')}</a>
        ${user ? html`<a class="btn btn-primary" href="${href('/dashboard')}">${t('Open dashboard')}</a>` : html`<a class="btn btn-ghost" href="${href('/login')}">${t('Sign in')}</a><a class="btn btn-primary" href="${href('/signup')}">${t('Start Free')}</a>`}
      </nav>
    </header>
    <section class="lp-hero">
      <div class="lp-kicker">${t('For creative freelancers')}</div>
      <h1>${t('Run your freelance business in one place.')}</h1>
      <p>${t('Manage clients, projects, proposals, feedback, approvals and payments — from brief to delivery.')}</p>
      <div class="btn-row">
        <a class="btn btn-primary btn-lg" href="${href('/signup')}">${t('Start Free')} ${icon('arrow', 16)}</a>
        <a class="btn btn-secondary btn-lg" href="#how">${t('See How It Works')}</a>
      </div>
      <div class="lp-mock" aria-hidden="true">
        <div>
          <div class="eyebrow">${t('Restaurant Campaign · ABC Restaurant')}</div>
          <div class="serif" style="font-size:34px;line-height:1.1">${t('Revision 1 of 2 requested')}</div>
          <p class="muted" style="margin-top:8px">${t('“Please replace the shot at 00:17 and make the logo end card longer.”')}</p>
          <div class="progress" style="max-width:320px"><span style="width:65%"></span></div>
        </div>
        <div class="stack" style="gap:10px">
          <div class="notice"><b>${t('Next step')}</b><br>${t('Upload revised version')}</div>
          <div class="notice notice-ok">${t('✓ Deposit received · 3,750 QAR')}</div>
          <div class="notice">${t('Change order: Additional video · +800 QAR · awaiting client')}</div>
        </div>
      </div>
    </section>
    <section class="lp-section">
      <div class="lp-kicker">${t('The problem')}</div>
      <h2>${t("Freelancers shouldn't have to run their business across ten different tools.")}</h2>
      <div class="tools">${['WhatsApp', 'Email', 'Google Drive', 'PDFs', 'Spreadsheets', 'Payment tools'].map((x) => html`<span>${t(x)}</span>`)}</div>
      <p class="serif" style="font-size:32px">${t('Bring it all together.')}</p>
    </section>
    <section class="lp-section" id="how">
      <div class="lp-kicker">${t('How it works')}</div>
      <h2>${t('One workflow, from the first brief to the final payment.')}</h2>
      <div class="lp-flow">
        ${[['Brief', 'Capture what the client needs.'], ['Proposal', 'Scope, timeline and price.'], ['Contract', 'Generated when accepted.'], ['Project', 'Drafts, feedback, revisions.'], ['Approval', 'Recorded sign-off.'], ['Payment', 'Deposit and final invoice.']].map(([b, s]) => html`<div><b>${t(b)}</b><span>${t(s)}</span></div>`)}
      </div>
    </section>
    <section class="lp-section">
      <div class="lp-kicker">${t('Features')}</div>
      <h2>${t('Built around the relationship between you and your client.')}</h2>
      <div class="lp-features">${features.map(([x, d, key]) => html`<div class="${key ? 'key' : ''}"><b>${t(x)}</b><p>${t(d)}</p></div>`)}</div>
    </section>
    <section class="lp-section lp-cta">
      <h2>${t('Start managing your freelance business professionally.')}</h2>
      <div class="btn-row" style="margin-top:28px"><a class="btn btn-primary btn-lg" href="${href('/signup')}">${t('Start Free')}</a><button class="btn btn-secondary btn-lg" data-action="demo-login">${t('Explore the demo')}</button></div>
    </section>
    <footer class="lp-foot"><span>© ${new Date().getFullYear()} Scopewise</span><span>${t('Local-first MVP · your data stays in this browser until cloud sync is connected.')}</span></footer>
  </div>`;
}

function authFrame(content) {
  return html`<div class="auth">
    <aside class="auth-side">
      <a class="brand" href="${href('/')}" style="color:#F3EEE5;padding:0"><img src="assets/icon.svg" alt="">Scopewise</a>
      <div><h2>${t('From brief to payment.')}</h2><p>${t('Scope, approvals and invoices — in one calm place.')}</p></div>
      <p class="small">${t('Built for designers, editors, videographers, photographers and creative directors.')}</p>
    </aside>
    <div class="auth-main"><div class="auth-box"><div style="text-align:end;margin-bottom:16px">${langSwitch()}</div>${content}</div></div>
  </div>`;
}

export const login = () => authFrame(html`
  <h1>${t('Welcome back')}</h1><p class="muted">${t('Sign in to your workspace.')}</p>
  <form class="form-stack" data-form="login" novalidate>
    ${field({ label: t('Email'), name: 'email', type: 'email', required: true, attrs: 'autocomplete="email" dir="ltr"' })}
    ${field({ label: t('Password'), name: 'password', type: 'password', required: true, attrs: 'autocomplete="current-password"' })}
    <button class="btn btn-primary btn-lg btn-block" type="submit">${t('Sign in')}</button>
  </form>
  <p class="auth-alt"><a href="${href('/forgot')}">${t('Forgot password?')}</a> · ${t('New here?')} <a href="${href('/signup')}">${t('Create an account')}</a></p>
  <div class="demo-box"><b>${t('Want to look around first?')}</b><p class="muted" style="margin:4px 0 12px">${t('Open a demo workspace for {name}, Creative Director, with realistic clients and projects.', { name: DEMO.name })}</p><button class="btn btn-secondary btn-block" data-action="demo-login">${t('Explore the demo')}</button></div>`);

export const signup = () => authFrame(html`
  <h1>${t('Create your account')}</h1><p class="muted">${t('Free to start. No card required.')}</p>
  <form class="form-stack" data-form="signup" novalidate>
    ${field({ label: t('Full name'), name: 'name', required: true, attrs: 'autocomplete="name"' })}
    ${field({ label: t('Email'), name: 'email', type: 'email', required: true, attrs: 'autocomplete="email" dir="ltr"' })}
    ${field({ label: t('Password'), name: 'password', type: 'password', required: true, hint: t('At least 8 characters with letters and numbers.'), attrs: 'autocomplete="new-password"' })}
    <fieldset class="field" style="border:0;padding:0;margin:0"><legend style="padding:0;margin-bottom:6px">${t('I am a')}</legend>
      <label class="check"><input type="radio" name="role" value="freelancer" checked> ${t('Freelancer')}</label>
      <span class="muted small">${t('Client, team member and admin accounts are coming later. Clients use a secure project link today.')}</span>
    </fieldset>
    <button class="btn btn-primary btn-lg btn-block" type="submit">${t('Create account')}</button>
  </form>
  <p class="auth-alt">${t('Already have an account?')} <a href="${href('/login')}">${t('Sign in')}</a></p>`);

export const forgot = () => authFrame(html`
  <h1>${t('Reset your password')}</h1><p class="muted">${t("We'll email you a link to choose a new one.")}</p>
  <form class="form-stack" data-form="forgot" novalidate>
    ${field({ label: t('Email'), name: 'email', type: 'email', required: true, attrs: 'dir="ltr"' })}
    <button class="btn btn-primary btn-lg btn-block" type="submit">${t('Send reset link')}</button>
  </form>
  <p class="auth-alt"><a href="${href('/login')}">${t('Back to sign in')}</a></p>`);

export const reset = (_, q) => authFrame(html`
  <h1>${t('Choose a new password')}</h1>
  <form class="form-stack" data-form="reset" novalidate>
    <input type="hidden" name="token" value="${q.token || ''}">
    ${field({ label: t('New password'), name: 'password', type: 'password', required: true, hint: t('At least 8 characters with letters and numbers.'), attrs: 'autocomplete="new-password"' })}
    <button class="btn btn-primary btn-lg btn-block" type="submit">${t('Update password')}</button>
  </form>`);

export function verify(_, q) {
  let ok = false, msg = '';
  try { auth.verifyEmail(q.token); ok = true; } catch (e) { msg = e.message; }
  return authFrame(html`<h1>${ok ? t('Email verified') : t('Link not valid')}</h1><p class="muted">${ok ? t('Thank you — your email address is confirmed.') : msg}</p>
    <a class="btn btn-primary btn-lg btn-block" href="${href(auth.currentUser() ? '/dashboard' : '/login')}" style="margin-top:20px">${t('Continue')}</a>`);
}

export function mailbox() {
  const mails = db.all('outbox').sort((a, z) => z.createdAt.localeCompare(a.createdAt)).slice(0, 60);
  return html`<div style="max-width:760px;margin:0 auto;padding:40px 20px">
    ${pageHead({ title: t('Development mailbox'), sub: t('Emails are recorded here instead of being delivered, until an email provider is connected. Anyone using this browser can see them.'), back: [auth.currentUser() ? '/dashboard' : '/login', t('Back')] })}
    ${mails.length ? mails.map((m) => html`<article class="mail"><div class="mail-meta"><span>${t('To:')} <span dir="ltr">${m.to}</span></span><span>${fmtDateTime(m.createdAt)}</span></div><h3 style="margin:6px 0">${m.subject}</h3><p class="prose muted">${m.body}</p>${m.link ? html`<a class="btn btn-secondary btn-sm" href="${m.link}">${m.linkLabel || t('Open link')}</a>` : ''}</article>`)
      : empty({ title: t('No emails yet'), body: t('Verification, password reset and client emails will appear here.') })}
  </div>`;
}

function afterLogin(user) { if (user?.lang) setUiLang(user.lang); }
onForm({
  async login(v) { const u = await auth.login(v); afterLogin(u); go('/dashboard'); return false; },
  async signup(v) { await auth.signup(v); toast(t('Account created. We sent a verification email to your dev mailbox.')); go('/onboarding'); return false; },
  forgot(v) { auth.requestPasswordReset(v.email); toast(t('If an account exists for that email, a reset link is on its way.')); go('/mailbox'); return false; },
  async reset(v) { await auth.resetPassword(v.token, v.password); toast(t('Password updated. Please sign in.')); go('/login'); return false; },
});
onAction({
  async 'demo-login'() { await seedDemo(); await auth.login({ email: DEMO.email, password: DEMO.password }); go('/dashboard'); return false; },
  'resend-verification'() { sendVerification(auth.requireUser()); toast(t('Verification email sent to your dev mailbox.')); return false; },
});
