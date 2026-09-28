// End-to-end workflow test (spec §54). Run a static server on the repo root, then:
//   BASE=http://localhost:5173/ node tests/e2e.mjs
// Uses Playwright's Chromium. Exits non-zero on the first failed check.
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:5173/';
const SHOTS = process.env.SHOTS || '';
const results = [];
const check = (name, ok, extra = '') => { results.push([ok ? 'PASS' : 'FAIL', name, extra]); console.log(ok ? '✓' : '✗', name, extra); if (!ok) throw new Error(`Check failed: ${name} ${extra}`); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const app = await ctx.newPage();
const errors = [];
const watch = (p, label) => {
  p.on('pageerror', (e) => errors.push(`${label} pageerror: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts\.g/.test(m.text() + (m.location()?.url || ''))) errors.push(`${label} console: ${m.text()}`); });
};
watch(app, 'app');
const nav = async (p, h) => { await p.evaluate((x) => { location.hash = x; }, h); await p.waitForTimeout(120); };
const toastText = async (p) => (await p.locator('#toast-root').textContent()) || '';
const shot = async (p, name) => { if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }); } };
const hash = (p) => p.evaluate(() => location.hash);
const tinyPng = (label) => ({ name: `${label}.svg`, mimeType: 'image/svg+xml', buffer: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="#334"/><text x="40" y="260" font-size="60" fill="#fff">${label}</text></svg>`) });

try {
  // 1. Register
  await app.goto(BASE + '#/signup');
  await app.fill('input[name=name]', 'Lina Haddad');
  await app.fill('input[name=email]', 'lina@example.com');
  await app.fill('input[name=password]', 'short');
  await app.click('button[type=submit]');
  await app.waitForTimeout(400);
  check('weak password rejected', (await toastText(app)).includes('8 characters'));
  await app.fill('input[name=password]', 'Studio2026!');
  await app.click('button[type=submit]');
  await app.waitForFunction(() => location.hash === '#/onboarding', null, { timeout: 15000 }); await app.waitForTimeout(200);
  check('freelancer can register', true);

  // Onboarding (6 steps)
  await app.click('.chip:has-text("Video Editor")'); await app.click('.chip:has-text("Photographer")');
  await app.click('button:has-text("Continue")');
  await app.fill('textarea[name=services]', 'Video editing\nProduct photography');
  await app.click('button:has-text("Continue")');
  await app.click('.chip:has-text("QAR")'); await app.click('button:has-text("Continue")');
  await app.fill('input[name=businessName]', 'Lina Visuals'); await app.click('button:has-text("Continue")');
  await app.click('button:has-text("Finish setup")');
  await app.waitForSelector('text=You\'re set up.');
  check('onboarding completes', true);
  await app.click('a:has-text("Skip for now")');
  await app.waitForSelector('.metrics');
  await shot(app, '01-empty-dashboard');
  check('empty dashboard shows CTA', await app.locator('text=+ Create Your First Project').count() > 0);

  // Email verification via dev mailbox
  await nav(app, '/mailbox');
  const verifyHref = await app.locator('a:has-text("Verify email")').first().getAttribute('href');
  await app.goto(verifyHref);
  await app.waitForSelector('h1:has-text("Email verified")');
  check('email verification works', true);

  // 2. Create client
  await nav(app, '/clients');
  await app.click('button:has-text("Add Client")');
  await app.fill('.modal input[name=name]', 'ABC Restaurant');
  await app.fill('.modal input[name=company]', 'ABC Restaurant Group');
  await app.fill('.modal input[name=email]', 'omar@abc.example');
  await app.click('.modal button:has-text("Save client")');
  await app.waitForFunction(() => location.hash.startsWith('#/clients/')); await app.waitForTimeout(200);
  check('client can be created', (await app.locator('main h1').textContent()) === 'ABC Restaurant');

  // 3. Create project from template
  await nav(app, '/projects/new');
  await app.click('button:has-text("Video Editing")');
  await app.fill('input[name=name]', 'Restaurant Campaign');
  await app.fill('input[name=budget]', '7500');
  await app.click('button:has-text("Create project")');
  await app.waitForFunction(() => /#\/projects\/[^/]+\/brief/.test(location.hash)); await app.waitForTimeout(200);
  const projectId = (await hash(app)).split('/')[2];
  check('project can be created', !!projectId);

  // 4. Brief (with AI assistant review → apply)
  await app.fill('textarea[name=text]', 'I need a 30-second promotional video for my restaurant on Instagram and TikTok. Premium feel.');
  await app.click('button:has-text("Draft brief")');
  await app.waitForSelector('.modal h2:has-text("Review the suggested brief")');
  check('AI brief suggestion shown for review (not auto-applied)', (await app.locator('main textarea[name=objective]').inputValue()) === '');
  await app.click('.modal button:has-text("Apply to brief")');
  await app.waitForTimeout(200);
  check('brief can be created', (await app.locator('main textarea[name=objective]').inputValue()).length > 0);

  // 5. Proposal
  await nav(app, `/projects/${projectId}/proposal`);
  await app.click('button:has-text("Create proposal")');
  await app.waitForFunction(() => location.hash.startsWith('#/proposals/')); await app.waitForTimeout(200);
  await app.fill('input[name="items.0.unitPrice"]', '7500');
  await app.fill('input[name="deliverables.0.title"]', 'Reels (30s)');
  await app.fill('input[name="deliverables.0.quantity"]', '3');
  await app.click('button:has-text("Save & send to client")');
  await app.waitForTimeout(400);
  check('proposal can be created and sent', (await app.locator('.pill:has-text("Sent")').count()) > 0, await toastText(app));
  await shot(app, '02-proposal');

  // Portal link
  const token = await app.evaluate(async (pid) => {
    const req = indexedDB.open('scopewise');
    const idb = await new Promise((r) => { req.onsuccess = () => r(req.result); });
    const rows = await new Promise((r) => { const g = idb.transaction('tables').objectStore('tables').get('projects'); g.onsuccess = () => r(g.result); });
    return rows.find((p) => p.id === pid).portalToken;
  }, projectId);
  check('portal token exists', token && token.length > 20);

  // Security: wrong token is refused
  const client = await ctx.newPage();
  watch(client, 'client');
  await client.goto(`${BASE}#/client/${projectId}?t=wrong-token`);
  await client.waitForTimeout(300);
  check('invalid client link is refused', (await client.locator('text=This client link is not valid').count()) > 0);

  // 6. Client views & accepts proposal (mobile viewport)
  await client.setViewportSize({ width: 390, height: 844 });
  await client.goto(`${BASE}#/client/${projectId}/proposal?t=${token}`);
  await client.waitForSelector('text=Accept Proposal');
  check('client can view the proposal', (await client.locator('.doc h1').textContent()).includes('Restaurant Campaign'));
  await shot(client, '03-portal-proposal-mobile');
  await client.fill('input[name=name]', 'Omar Haddad');
  await client.click('button:has-text("Accept Proposal")');
  await client.waitForFunction(() => location.hash.includes('/contract')); await client.waitForTimeout(200);
  check('client can accept the proposal', true);

  // Contract
  await client.waitForSelector('text=Accept Contract');
  await client.check('input[name=agree]');
  await client.fill('input[name=name]', 'Omar Haddad');
  await client.click('button:has-text("Accept Contract")');
  await client.waitForTimeout(500);
  check('client can accept the contract', (await toastText(client)).includes('Contract accepted'));

  // Freelancer sees awaiting deposit, records payment
  await app.bringToFront();
  await nav(app, `/projects/${projectId}`);
  await app.waitForTimeout(400);
  await nav(app, `/projects/${projectId}/overview`);
  check('project awaits deposit', (await app.locator('.proj-head .pill').first().textContent()).includes('Awaiting Deposit'));
  await nav(app, `/projects/${projectId}/invoices`);
  await app.click('a.list-row:has-text("Deposit")');
  await app.click('button:has-text("Record payment")');
  await app.click('.modal button:has-text("Record payment")');
  await app.waitForTimeout(300);
  await nav(app, `/projects/${projectId}/overview`);
  check('deposit payment tracked → project active', (await app.locator('.proj-head .pill').first().textContent()).includes('Active'));
  check('scope can be tracked', (await app.locator('.pay-grid:has-text("✓ Deposit received")').count()) > 0);

  // 7. Files: upload draft, send for review
  await nav(app, `/projects/${projectId}/files`);
  await app.setInputFiles('input[name=files]', tinyPng('Hero_Cut'));
  await app.click('form[data-form=files-upload] button[type=submit]');
  await app.waitForSelector('.file-row');
  check('files can be uploaded', (await app.locator('.file-row .ver:has-text("v01")').count()) === 1);
  await app.click('button:has-text("Send for review")');
  await app.waitForTimeout(300);

  // 8. Client feedback (pinned on image) + revision request
  await client.bringToFront();
  await client.goto(`${BASE}#/client/${projectId}/files?t=${token}`);
  await client.waitForSelector('button:has-text("Review")');
  await client.click('button:has-text("Review")');
  await client.waitForSelector('#viewer-media');
  await client.click('#viewer-media', { position: { x: 40, y: 40 } });
  await client.fill('.modal input[name=name]', 'Omar Haddad');
  await client.fill('.modal textarea[name=comment]', 'Please replace this shot.');
  await client.click('.modal button:has-text("Add comment")');
  await client.waitForTimeout(300);
  check('feedback can be created (pinned)', (await client.locator('.modal .comment:has-text("Please replace this shot.")').count()) === 1);
  await client.click('.modal [data-action=modal-close] >> nth=0');
  await client.goto(`${BASE}#/client/${projectId}/revisions?t=${token}`);
  await client.fill('textarea[name=summary]', 'Replace the plating shot and extend the end card.');
  await client.click('button:has-text("Request revision")');
  await client.waitForTimeout(300);
  check('revision can be requested', (await client.locator('.big-figure').textContent()).includes('1 / 2'));

  // Freelancer uploads v02, requests approval
  await app.bringToFront();
  await nav(app, `/projects/${projectId}/revisions`);
  check('revisions are tracked', (await app.locator('text=Revision 1 / 2').count()) > 0);
  await nav(app, `/projects/${projectId}/files`);
  await app.click('[data-action=file-menu]');
  await app.setInputFiles('.modal input[name=files]', tinyPng('Hero_Cut_v2'));
  await app.click('.modal button:has-text("Upload version")');
  await app.waitForTimeout(500);
  check('new version recorded (v02)', (await app.locator('.file-row .ver:has-text("v02")').count()) === 1);
  await nav(app, `/projects/${projectId}/approvals`);
  await app.click('button:has-text("Send for approval")');
  await app.waitForTimeout(300);
  check('approval requested', (await app.locator('.pill:has-text("Awaiting client")').count()) === 1);

  // 9. Client approves
  await client.bringToFront();
  await client.goto(`${BASE}#/client/${projectId}/approval?t=${token}`);
  await client.waitForSelector('text=Final Approval Required');
  await shot(client, '04-portal-approval-mobile');
  await client.fill('input[name=name]', 'Omar Haddad');
  await client.click('button:has-text("Approve") >> nth=0');
  await client.click('.modal button:has-text("Approve")');
  await client.waitForTimeout(400);
  check('final work can be approved', (await client.locator('text=✓ Approved').count()) > 0);

  // Freelancer: approval record, deliver, final invoice
  await app.bringToFront();
  await nav(app, `/projects/${projectId}/approvals`);
  await app.waitForTimeout(300);
  await nav(app, `/projects/${projectId}/approvals?x=1`);
  check('approval recorded with client + version', (await app.locator('.notice-ok:has-text("Omar Haddad")').count()) === 1 && (await app.locator('.notice-ok:has-text("v02")').count()) === 1);
  await nav(app, `/projects/${projectId}/files?folder=deliverables`);
  await app.setInputFiles('form[data-form=files-upload] input[name=files]', tinyPng('Final_Master'));
  await app.click('form[data-form=files-upload] button[type=submit]');
  await app.waitForTimeout(500);
  await app.click('button:has-text("Deliver final files")');
  await app.click('.modal button:has-text("Deliver")');
  await app.waitForTimeout(400);
  check('final invoice drafted on delivery', (await toastText(app)).includes('Final invoice'));
  await nav(app, `/projects/${projectId}/invoices`);
  await app.click('a.list-row:has-text("Final payment")');
  await app.click('button:has-text("Save & send")');
  await app.waitForTimeout(300);
  check('invoice can be created and sent', (await app.locator('.pill:has-text("Sent")').count()) > 0);

  // Client reports payment; freelancer confirms
  await client.bringToFront();
  await client.goto(`${BASE}#/client/${projectId}/invoice?t=${token}`);
  await client.waitForSelector('button:has-text("I\'ve sent the payment")');
  await client.click('button:has-text("I\'ve sent the payment")');
  await client.waitForTimeout(300);
  await app.bringToFront();
  await nav(app, '/dashboard');
  await app.waitForTimeout(300);
  await nav(app, '/invoices');
  await app.click('a.list-row:has-text("Final payment")');
  await app.click('button:has-text("Confirm received")');
  await app.waitForTimeout(300);
  check('payment status can be tracked (paid)', (await app.locator('.pill:has-text("Paid")').count()) > 0);

  // Complete → portfolio
  await nav(app, `/projects/${projectId}/overview`);
  await app.click('button:has-text("Mark as completed")');
  await app.waitForTimeout(300);
  check('project can be completed', (await app.locator('.proj-head .pill').first().textContent()).includes('Completed'));
  await app.click('a:has-text("Add to portfolio")');
  await app.waitForSelector('form[data-form=pf-save]');
  await app.click('form[data-form=pf-save] button[type=submit]');
  await app.waitForTimeout(300);
  await nav(app, '/portfolio');
  check('project can become a portfolio item', (await app.locator('.pf-card:has-text("Restaurant Campaign")').count()) === 1);

  // Activity log + search + analytics gate
  await nav(app, `/projects/${projectId}/activity`);
  const log = await app.locator('.timeline').textContent();
  check('activity log records workflow', ['Proposal', 'accepted', 'Contract accepted', 'Deposit received', 'approved by Omar Haddad', 'completed'].every((s) => log.includes(s)));
  await nav(app, '/search?q=restaurant');
  check('global search finds project + client', (await app.locator('.tag:has-text("Project")').count()) > 0 && (await app.locator('.tag:has-text("Client")').count()) > 0);
  await nav(app, '/analytics');
  check('analytics gated on Free plan', (await app.locator('text=Analytics is on Pro').count()) === 1);

  // Security: this project's token must not open another project
  const other = await app.evaluate(async () => {
    const { createProject } = await import('./js/services/core.js');
    const { listClients } = await import('./js/services/core.js');
    return createProject({ name: 'Other', clientId: listClients()[0].id }).id;
  });
  await client.goto(`${BASE}#/client/${other}?t=${token}`);
  await client.waitForTimeout(300);
  check("a client link can't open another project", (await client.locator('text=This client link is not valid').count()) > 0);

  // Sign out → protected routes redirect
  await app.click('[data-action=logout]');
  await nav(app, '/projects');
  await app.waitForTimeout(200);
  check('protected routes require sign-in', (await hash(app)) === '#/login');

  check('no unexpected console errors', errors.length === 0, errors.join(' | '));
} catch (e) {
  console.error(e.message);
  console.error('Console errors:', errors);
  process.exitCode = 1;
} finally {
  writeFileSync(new URL('./e2e-results.txt', import.meta.url), results.map((r) => r.join('  ')).join('\n') + '\n');
  await browser.close();
}
