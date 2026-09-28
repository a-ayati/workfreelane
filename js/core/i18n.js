// Internationalisation: English source strings are the keys; translations live
// in js/i18n/<lang>.js. Missing translations fall back to English.
//
//   t('Due {date}', { date })          → active language
//   tl('ar', 'Invoice {number}', {...}) → explicit language (emails, documents)
//
// The "active" language is chosen per render: the freelancer's UI language in
// the app, the client's language in the client portal.
import AR from '../i18n/ar.js';

export const LANGS = { en: { label: 'English', dir: 'ltr', locale: 'en-US' }, ar: { label: 'العربية', dir: 'rtl', locale: 'ar-u-nu-latn' } };
const DICTS = { en: null, ar: AR };
const UI_KEY = 'sw.lang';

let active = 'en';

function fill(str, vars) {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (m, k) => (k in vars && vars[k] != null ? String(vars[k]) : m));
}

export function tl(lang, str, vars) {
  const dict = DICTS[lang];
  const s = dict && Object.prototype.hasOwnProperty.call(dict, str) ? dict[str] : str;
  return fill(s, vars);
}
export const t = (str, vars) => tl(active, str, vars);
// Plural helper: pick one of two source strings by count.
export const tn = (n, one, many, vars = {}) => t(n === 1 ? one : many, { n, ...vars });

export const lang = () => active;
export const isRTL = (l = active) => LANGS[l]?.dir === 'rtl';
export const locale = (l = active) => LANGS[l]?.locale || 'en-US';
export const normLang = (l) => (LANGS[l] ? l : 'en');

export function setActiveLang(l) {
  active = normLang(l);
  const root = document.documentElement;
  if (root.lang !== active) root.lang = active;
  const dir = LANGS[active].dir;
  if (root.dir !== dir) root.dir = dir;
}

// Freelancer UI language (per browser; also saved on the user record).
export function uiLang() {
  try { const v = localStorage.getItem(UI_KEY); if (v) return normLang(v); } catch { /* ignore */ }
  const nav = (navigator.language || 'en').slice(0, 2);
  return normLang(nav);
}
export function setUiLang(l) {
  try { localStorage.setItem(UI_KEY, normLang(l)); } catch { /* ignore */ }
}

// Mark translatable text defined at module load (constants); resolved on use.
export const tx = (s) => s;
