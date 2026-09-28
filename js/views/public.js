// Landing page, authentication pages and the development mailbox.
import { html, icon, href, field, onAction, onForm, go, toast, pageHead, empty } from '../ui.js';
import { auth, sendVerification } from '../core/auth.js';
import { db } from '../core/store.js';
import { fmtDateTime } from '../core/util.js';
import { seedDemo, DEMO } from '../seed.js';

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
    ['Analytics', 'Revenue, pending and overdue payments, approval time and revisions per project.', false],
  ];
  return html`<div class="lp">
    <header class="lp-nav">
      <a class="brand" href="${href('/')}" style="padding:0"><img src="assets/icon.svg" alt="">Scopewise</a>
      <nav>
        <a class="btn btn-ghost hide-sm" href="#how">How it works</a>
        ${user ? html`<a class="btn btn-primary" href="${href('/dashboard')}">Open dashboard</a>` : html`<a class="btn btn-ghost" href="${href('/login')}">Sign in</a><a class="btn btn-primary" href="${href('/signup')}">Start Free</a>`}
      </nav>
    </header>
    <section class="lp-hero">
      <div class="lp-kicker">For creative freelancers</div>
      <h1>Run your freelance business in one place.</h1>
      <p>Manage clients, projects, proposals, feedback, approvals and payments — from brief to delivery.</p>
      <div class="btn-row">
        <a class="btn btn-primary btn-lg" href="${href('/signup')}">Start Free ${icon('arrow', 16)}</a>
        <a class="btn btn-secondary btn-lg" href="#how">See How It Works</a>
      </div>
      <div class="lp-mock" aria-hidden="true">
        <div>
          <div class="eyebrow">Restaurant Campaign · ABC Restaurant</div>
          <div class="serif" style="font-size:34px;line-height:1.1">Revision 1 of 2 requested</div>
          <p class="muted" style="margin-top:8px">“Please replace the shot at 00:17 and make the logo end card longer.”</p>
          <div class="progress" style="max-width:320px"><span style="width:65%"></span></div>
        </div>
        <div class="stack" style="gap:10px">
          <div class="notice"><b>Next step</b><br>Upload revised version</div>
          <div class="notice notice-ok">✓ Deposit received · 3,750 QAR</div>
          <div class="notice">Change order: Additional video · +800 QAR · <i>awaiting client</i></div>
        </div>
      </div>
    </section>
    <section class="lp-section">
      <div class="lp-kicker">The problem</div>
      <h2>Freelancers shouldn't have to run their business across ten different tools.</h2>
      <div class="tools">${['WhatsApp', 'Email', 'Google Drive', 'PDFs', 'Spreadsheets', 'Payment tools'].map((t) => html`<span>${t}</span>`)}</div>
      <p class="serif" style="font-size:32px">Bring it all together.</p>
    </section>
    <section class="lp-section" id="how">
      <div class="lp-kicker">How it works</div>
      <h2>One workflow, from the first brief to the final payment.</h2>
      <div class="lp-flow">
        ${[['Brief', 'Capture what the client needs.'], ['Proposal', 'Scope, timeline and price.'], ['Contract', 'Generated when accepted.'], ['Project', 'Drafts, feedback, revisions.'], ['Approval', 'Recorded sign-off.'], ['Payment', 'Deposit and final invoice.']].map(([b, s]) => html`<div><b>${b}</b><span>${s}</span></div>`)}
      </div>
    </section>
    <section class="lp-section">
      <div class="lp-kicker">Features</div>
      <h2>Built around the relationship between you and your client.</h2>
      <div class="lp-features">${features.map(([t, d, key]) => html`<div class="${key ? 'key' : ''}"><b>${t}</b><p>${d}</p></div>`)}</div>
    </section>
    <section class="lp-section lp-cta">
      <h2>Start managing your freelance business professionally.</h2>
      <div class="btn-row" style="margin-top:28px"><a class="btn btn-primary btn-lg" href="${href('/signup')}">Start Free</a><button class="btn btn-secondary btn-lg" data-action="demo-login">Explore the demo</button></div>
    </section>
    <footer class="lp-foot"><span>© ${new Date().getFullYear()} Scopewise</span><span>Local-first MVP · your data stays in this browser until cloud sync is connected.</span></footer>
  </div>`;
}

function authFrame(content) {
  return html`<div class="auth">
    <aside class="auth-side">
      <a class="brand" href="${href('/')}" style="color:#F3EEE5;padding:0"><img src="assets/icon.svg" alt="">Scopewise</a>
      <div><h2>From brief to payment.</h2><p>Scope, approvals and invoices — in one calm place.</p></div>
      <p class="small">Built for designers, editors, videographers, photographers and creative directors.</p>
    </aside>
    <div class="auth-main"><div class="auth-box">${content}</div></div>
  </div>`;
}

export const login = () => authFrame(html`
  <h1>Welcome back</h1><p class="muted">Sign in to your workspace.</p>
  <form class="form-stack" data-form="login" novalidate>
    ${field({ label: 'Email', name: 'email', type: 'email', required: true, attrs: 'autocomplete="email"' })}
    ${field({ label: 'Password', name: 'password', type: 'password', required: true, attrs: 'autocomplete="current-password"' })}
    <button class="btn btn-primary btn-lg btn-block" type="submit">Sign in</button>
  </form>
  <p class="auth-alt"><a href="${href('/forgot')}">Forgot password?</a> · New here? <a href="${href('/signup')}">Create an account</a></p>
  <div class="demo-box"><b>Want to look around first?</b><p class="muted" style="margin:4px 0 12px">Open a demo workspace for ${DEMO.name}, Creative Director, with realistic clients and projects.</p><button class="btn btn-secondary btn-block" data-action="demo-login">Explore the demo</button></div>`);

export const signup = () => authFrame(html`
  <h1>Create your account</h1><p class="muted">Free to start. No card required.</p>
  <form class="form-stack" data-form="signup" novalidate>
    ${field({ label: 'Full name', name: 'name', required: true, attrs: 'autocomplete="name"' })}
    ${field({ label: 'Email', name: 'email', type: 'email', required: true, attrs: 'autocomplete="email"' })}
    ${field({ label: 'Password', name: 'password', type: 'password', required: true, hint: 'At least 8 characters with letters and numbers.', attrs: 'autocomplete="new-password"' })}
    <fieldset class="field" style="border:0;padding:0;margin:0"><legend style="padding:0;margin-bottom:6px">I am a</legend>
      <label class="check"><input type="radio" name="role" value="freelancer" checked> Freelancer</label>
      <span class="muted small">Client, team member and admin accounts are coming later. Clients use a secure project link today.</span>
    </fieldset>
    <button class="btn btn-primary btn-lg btn-block" type="submit">Create account</button>
  </form>
  <p class="auth-alt">Already have an account? <a href="${href('/login')}">Sign in</a></p>`);

export const forgot = () => authFrame(html`
  <h1>Reset your password</h1><p class="muted">We'll email you a link to choose a new one.</p>
  <form class="form-stack" data-form="forgot" novalidate>
    ${field({ label: 'Email', name: 'email', type: 'email', required: true })}
    <button class="btn btn-primary btn-lg btn-block" type="submit">Send reset link</button>
  </form>
  <p class="auth-alt"><a href="${href('/login')}">Back to sign in</a></p>`);

export const reset = (_, q) => authFrame(html`
  <h1>Choose a new password</h1>
  <form class="form-stack" data-form="reset" novalidate>
    <input type="hidden" name="token" value="${q.token || ''}">
    ${field({ label: 'New password', name: 'password', type: 'password', required: true, hint: 'At least 8 characters with letters and numbers.', attrs: 'autocomplete="new-password"' })}
    <button class="btn btn-primary btn-lg btn-block" type="submit">Update password</button>
  </form>`);

export function verify(_, q) {
  let ok = false, msg = '';
  try { auth.verifyEmail(q.token); ok = true; } catch (e) { msg = e.message; }
  return authFrame(html`<h1>${ok ? 'Email verified' : 'Link not valid'}</h1><p class="muted">${ok ? 'Thank you — your email address is confirmed.' : msg}</p>
    <a class="btn btn-primary btn-lg btn-block" href="${href(auth.currentUser() ? '/dashboard' : '/login')}" style="margin-top:20px">Continue</a>`);
}

export function mailbox() {
  const mails = db.all('outbox').sort((a, z) => z.createdAt.localeCompare(a.createdAt)).slice(0, 60);
  return html`<div style="max-width:760px;margin:0 auto;padding:40px 20px">
    ${pageHead({ title: 'Development mailbox', sub: 'Emails are recorded here instead of being delivered, until an email provider is connected. Anyone using this browser can see them.', back: [auth.currentUser() ? '/dashboard' : '/login', 'Back'] })}
    ${mails.length ? mails.map((m) => html`<article class="mail"><div class="mail-meta"><span>To: ${m.to}</span><span>${fmtDateTime(m.createdAt)}</span></div><h3 style="margin:6px 0">${m.subject}</h3><p class="prose muted">${m.body}</p>${m.link ? html`<a class="btn btn-secondary btn-sm" href="${m.link}">${m.linkLabel || 'Open link'}</a>` : ''}</article>`)
      : empty({ title: 'No emails yet', body: 'Verification, password reset and client emails will appear here.' })}
  </div>`;
}

onForm({
  async login(v) { await auth.login(v); go('/dashboard'); return false; },
  async signup(v) { await auth.signup(v); toast('Account created. We sent a verification email to your dev mailbox.'); go('/onboarding'); return false; },
  forgot(v) { auth.requestPasswordReset(v.email); toast('If an account exists for that email, a reset link is on its way.'); go('/mailbox'); return false; },
  async reset(v) { await auth.resetPassword(v.token, v.password); toast('Password updated. Please sign in.'); go('/login'); return false; },
});
onAction({
  async 'demo-login'() { await seedDemo(); await auth.login({ email: DEMO.email, password: DEMO.password }); go('/dashboard'); return false; },
  'resend-verification'() { sendVerification(auth.requireUser()); toast('Verification email sent to your dev mailbox.'); return false; },
});
