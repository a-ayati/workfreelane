// Shared helpers: ids, clock, errors, formatting, validation.
import { t, lang, locale } from './i18n.js';

export const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36));

export function randomToken(bytes = 24) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

// Clock with an optional override so demo seeding can write realistic history.
let clockOverride = null;
export const clock = {
  set(date) { clockOverride = date ? new Date(date) : null; },
  now() { return clockOverride ? new Date(clockOverride) : new Date(); },
  iso() { return clock.now().toISOString(); },
};
export const nowISO = () => clock.iso();
export const todayISO = () => clock.iso().slice(0, 10);
export function addDays(dateLike, days) {
  const d = new Date(dateLike);
  d.setDate(d.getDate() + days);
  return d;
}
export const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

// Errors
export class UserError extends Error {
  constructor(message, field) { super(message); this.name = 'UserError'; this.field = field; this.userFacing = true; }
}
export class AuthError extends UserError { constructor(m = t('Please sign in to continue.')) { super(m); this.name = 'AuthError'; } }
export class ForbiddenError extends UserError { constructor(m = t("You don't have access to this.")) { super(m); this.name = 'ForbiddenError'; } }
export class NotFoundError extends UserError { constructor(m = t("We couldn't find what you were looking for.")) { super(m); this.name = 'NotFoundError'; } }
export class PlanLimitError extends UserError { constructor(m) { super(m); this.name = 'PlanLimitError'; } }

export function humanError(err, fallback = t('Something went wrong. Please try again.')) {
  if (err && err.userFacing) return err.message;
  console.error(err);
  return fallback;
}

// Validation
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export function req(value, label, field, max = 500) {
  const v = String(value ?? '').trim();
  if (!v) throw new UserError(t('{label} is required.', { label: t(label) }), field);
  if (v.length > max) throw new UserError(t('{label} is too long (max {max} characters).', { label: t(label), max }), field);
  return v;
}
export function opt(value, max = 5000) {
  const v = String(value ?? '').trim();
  if (v.length > max) throw new UserError(t('Text is too long (max {max} characters).', { max }));
  return v;
}
export function email(value, field = 'email', required = true) {
  const v = String(value ?? '').trim().toLowerCase();
  if (!v && !required) return '';
  if (!EMAIL_RE.test(v)) throw new UserError(t('Please enter a valid email address.'), field);
  return v;
}
export function money(value, label = 'Amount', field, { allowZero = true } = {}) {
  const n = Number(String(value ?? '').replace(/,/g, ''));
  if (!Number.isFinite(n) || n < 0 || (!allowZero && n === 0)) throw new UserError(t('{label} must be a valid positive number.', { label: t(label) }), field);
  if (n > 1e9) throw new UserError(t('{label} is too large.', { label: t(label) }), field);
  return Math.round(n * 100) / 100;
}
export function int(value, label, field, min = 0, max = 1000) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new UserError(t('{label} must be a whole number between {min} and {max}.', { label: t(label), min, max }), field);
  return n;
}
export function dateStr(value, label, field, required = false) {
  const v = String(value ?? '').trim();
  if (!v) { if (required) throw new UserError(t('{label} is required.', { label: t(label) }), field); return ''; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(new Date(v))) throw new UserError(t('{label} must be a valid date.', { label: t(label) }), field);
  return v;
}
export const lines = (text) => String(text ?? '').split('\n').map((s) => s.trim()).filter(Boolean);

// Formatting (locale-aware; pass `lng` to force a language, e.g. for documents)
const AR_CURRENCY = { QAR: 'ر.ق', AED: 'د.إ', SAR: 'ر.س', KWD: 'د.ك', BHD: 'د.ب', OMR: 'ر.ع', EGP: 'ج.م', MAD: 'د.م', USD: 'دولار', EUR: 'يورو', GBP: 'جنيه إسترليني' };
export const currencyLabel = (currency, lng = lang()) => (lng === 'ar' && AR_CURRENCY[currency]) || currency;
export function fmtNumber(n, lng = lang()) {
  n = Number(n) || 0;
  return n.toLocaleString(locale(lng), { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
}
export function fmtMoney(amount, currency = 'USD', lng = lang()) {
  const s = fmtNumber(amount, lng);
  return currency ? `${s} ${currencyLabel(currency, lng)}` : s;
}
export function fmtDate(d, opts = { month: 'short', day: 'numeric', year: 'numeric' }, lng = lang()) {
  if (!d) return '—';
  const date = new Date(d.length === 10 ? d + 'T00:00:00' : d);
  if (isNaN(date)) return '—';
  return date.toLocaleDateString(locale(lng), opts);
}
export const fmtShortDate = (d, lng) => fmtDate(d, { month: 'short', day: 'numeric' }, lng);
export function fmtDateTime(d, lng = lang()) {
  if (!d) return '—';
  return new Date(d).toLocaleString(locale(lng), { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
export function fmtRelative(d) {
  if (!d) return '';
  const diff = (clock.now() - new Date(d)) / 1000;
  if (diff < 60) return t('just now');
  if (diff < 3600) return t('{n}m ago', { n: Math.floor(diff / 60) });
  if (diff < 86400) return t('{n}h ago', { n: Math.floor(diff / 3600) });
  if (diff < 86400 * 7) return t('{n}d ago', { n: Math.floor(diff / 86400) });
  return fmtShortDate(d);
}
export function fmtBytes(b) {
  if (!b) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return `${b.toFixed(i ? 1 : 0)} ${u[i]}`;
}
export function fmtTimecode(sec) {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
export const initials = (name) => String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const sum = (arr, f = (x) => x) => round2(arr.reduce((a, x) => a + (Number(f(x)) || 0), 0));
export const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
