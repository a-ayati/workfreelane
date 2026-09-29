import { chromium } from 'playwright';
const O = process.argv[2]; const lang = process.argv[3] || 'en';
const b = await chromium.launch();
const errs = [];
async function as(email, tag) {
  const ctx = await b.newContext({ viewport: { width: 1360, height: 900 } });
  await ctx.addInitScript(([l]) => { localStorage.setItem('sw.lang', l); localStorage.setItem('sw.theme', 'light'); }, [lang]);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(`${tag} pageerror ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/fonts|ERR_CERT/.test(m.text())) errs.push(`${tag} console ${m.text()}`); });
  await p.goto('http://localhost:5173/#/login'); await p.waitForTimeout(300);
  const t0 = Date.now();
  await p.click(`[data-action=demo-login][data-email="${email}"]`);
  await p.waitForFunction(() => location.hash.startsWith('#/dashboard'), null, { timeout: 60000 });
  await p.waitForTimeout(900);
  console.log(tag, 'login ms', Date.now() - t0);
  return p;
}
const shot = (p, n, full = true) => p.screenshot({ path: `${O}/${n}.png`, fullPage: full });
const go = async (p, h) => { await p.evaluate((x) => { location.hash = x; }, h); await p.waitForTimeout(500); };
const pid = async (p) => p.evaluate(async () => { const m = await import('/js/core/store.js'); return m.db.find('projects', (x) => x.name.startsWith('Program X')).id; });

let p = await as('alex.morgan@demo.scopewise.app', 'alex');
await shot(p, 'alex-dash');
const id = await pid(p);
for (const tab of ['', 'files', 'team', 'tasks', 'messages', 'calendar', 'activity']) { await go(p, `/projects/${id}/${tab}`); await shot(p, `alex-px-${tab || 'overview'}`, tab === '' || tab === 'team'); }
await go(p, '/calendar'); await shot(p, 'alex-calendar');
await go(p, '/organization'); await shot(p, 'alex-org');
await p.click('[data-action=ws-toggle]'); await p.waitForTimeout(300); await shot(p, 'alex-ws', false);
await p.click('[data-action=notif-toggle]').catch(() => {}); await p.waitForTimeout(300); await shot(p, 'alex-notif', false);
await p.close();

p = await as('sarah@xyz-tv.example', 'sarah');
const id2 = await pid(p);
await shot(p, 'sarah-dash');
await go(p, `/projects/${id2}`); await shot(p, 'sarah-px');
await go(p, `/projects/${id2}/approval`); await shot(p, 'sarah-approval');
await go(p, `/projects/${id2}/invoice`); await shot(p, 'sarah-invoice');
await go(p, '/notifications'); await shot(p, 'sarah-notifs');
await p.close();

p = await as('karim@abc-production.example', 'karim');
const id3 = await pid(p);
await shot(p, 'karim-dash');
await go(p, `/projects/${id3}`); await shot(p, 'karim-px');
const tabs = await p.evaluate(() => [...document.querySelectorAll('.tabs .tab')].map((x) => x.textContent.trim()));
console.log('karim tabs', tabs.join(' | '));
await go(p, `/projects/${id3}/invoices`); console.log('karim invoices tab ->', await p.evaluate(() => location.hash + ' ' + (document.querySelector('.tab.active')?.textContent || '')));
await go(p, '/invoices'); console.log('karim /invoices ->', await p.evaluate(() => document.querySelector('main h1, .empty h3')?.textContent));
await p.close();
console.log('ERRORS', JSON.stringify(errs, null, 1));
await b.close();
