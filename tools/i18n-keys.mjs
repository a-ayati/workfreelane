// Lists every translatable English source string and reports keys missing
// from js/i18n/ar.js. Usage: node tools/i18n-keys.mjs [--missing]
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../js/', import.meta.url).pathname;
const files = [];
(function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) { if (!p.endsWith('i18n')) walk(p); } else if (p.endsWith('.js')) files.push(p); } })(root);

const STR = String.raw`'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"`;
const unq = (m) => { const s = m[1] ?? m[2]; return s.replace(/\\n/g, '\n').replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, '\\'); };
const keys = new Set();
const add = (s) => { if (s && /[A-Za-z]/.test(s)) keys.add(s); };
const patterns = [
  new RegExp(String.raw`\b[tT]\(\s*(?:${STR})`, 'g'),
  new RegExp(String.raw`\btl\([^,]+,\s*(?:${STR})`, 'g'),
  new RegExp(String.raw`\blineText\([^,]+,\s*(?:${STR})`, 'g'),
  new RegExp(String.raw`\b(?:title|body|subject|linkLabel|label|placeholder|detail|tagline|name):\s*(?:${STR})`, 'g'),
  new RegExp(String.raw`logActivity\([^,]+,[^,]+,\s*'[^']*',\s*(?:${STR})`, 'g'),
  new RegExp(String.raw`\b(?:req|money|int|dateStr)\([^,]+,\s*(?:${STR})`, 'g'),
  new RegExp(String.raw`requireOwned\([^,]+,[^,]+,\s*(?:${STR})`, 'g'),
  new RegExp(String.raw`requireFeature\([^,]+,\s*(?:${STR})`, 'g'),
  new RegExp(String.raw`\bt\(\s*[^)]*?\?\s*(?:${STR})\s*:\s*(?:${STR})`, 'g'),
];
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  for (const re of patterns) for (const m of src.matchAll(re)) {
    // ternary pattern captures two strings
    const vals = [m[1] ?? m[2], m[3] ?? m[4]].filter((x) => x != null);
    vals.forEach((v) => add(unq([null, v])));
  }
}
// Strings that reach t() through data structures (constants, arrays, maps).
const LISTS = String.raw`(?:\[\s*|,\s*)(?:${STR})`;
for (const f of ['services/constants.js', 'core/plans.js', 'core/payments.js', 'core/ai.js', 'views/shell.js', 'views/public.js', 'views/projects.js', 'views/portal.js', 'views/growth.js', 'views/settings.js', 'views/documents.js', 'views/project-work.js', 'views/dashboard.js']) {
  const src = readFileSync(join(root, f), 'utf8');
  if (f === 'services/constants.js') {
    const body = src.split('export const DEFAULT_CONTRACT_SECTIONS =')[0] + src.split('export const CONTRACT_DISCLAIMER')[1];
    for (const m of body.matchAll(new RegExp(STR, 'g'))) { const s = unq(m); if (/[A-Z]/.test(s[0] || '') || / /.test(s)) add(s); }
    add(src.match(/CONTRACT_DISCLAIMER = '([^']+)'/)[1]);
    continue;
  }
  for (const m of src.matchAll(new RegExp(LISTS, 'g'))) { const s = unq([null, m[1], m[2]]); if (/^[A-Z]/.test(s) && !/^[A-Z_]+$/.test(s) && !s.includes('/') ) add(s); }
}
const list = [...keys].sort();
if (process.argv.includes('--missing')) {
  const { default: AR } = await import(new URL('../js/i18n/ar.js', import.meta.url));
  const missing = list.filter((k) => !(k in AR));
  const unused = Object.keys(AR).filter((k) => !keys.has(k));
  console.log(JSON.stringify({ total: list.length, missing: missing.length, unused: unused.length }, null, 0));
  missing.forEach((k) => console.log(JSON.stringify(k)));
  if (process.argv.includes('--unused')) unused.forEach((k) => console.log('UNUSED', JSON.stringify(k)));
} else list.forEach((k) => console.log(JSON.stringify(k)));
