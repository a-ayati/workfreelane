// Shared helpers: ids, clock, errors, formatting, validation.

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
export class AuthError extends UserError { constructor(m = 'Please sign in to continue.') { super(m); this.name = 'AuthError'; } }
export class ForbiddenError extends UserError { constructor(m = "You don't have access to this.") { super(m); this.name = 'ForbiddenError'; } }
export class NotFoundError extends UserError { constructor(m = "We couldn't find what you were looking for.") { super(m); this.name = 'NotFoundError'; } }
export class PlanLimitError extends UserError { constructor(m) { super(m); this.name = 'PlanLimitError'; } }

export function humanError(err, fallback = 'Something went wrong. Please try again.') {
  if (err && err.userFacing) return err.message;
  console.error(err);
  return fallback;
}

// Validation
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export function req(value, label, field, max = 500) {
  const v = String(value ?? '').trim();
  if (!v) throw new UserError(`${label} is required.`, field);
  if (v.length > max) throw new UserError(`${label} is too long (max ${max} characters).`, field);
  return v;
}
export function opt(value, max = 5000) {
  const v = String(value ?? '').trim();
  if (v.length > max) throw new UserError(`Text is too long (max ${max} characters).`);
  return v;
}
export function email(value, field = 'email', required = true) {
  const v = String(value ?? '').trim().toLowerCase();
  if (!v && !required) return '';
  if (!EMAIL_RE.test(v)) throw new UserError('Please enter a valid email address.', field);
  return v;
}
export function money(value, label = 'Amount', field, { allowZero = true } = {}) {
  const n = Number(String(value ?? '').replace(/,/g, ''));
  if (!Number.isFinite(n) || n < 0 || (!allowZero && n === 0)) throw new UserError(`${label} must be a valid positive number.`, field);
  if (n > 1e9) throw new UserError(`${label} is too large.`, field);
  return Math.round(n * 100) / 100;
}
export function int(value, label, field, min = 0, max = 1000) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new UserError(`${label} must be a whole number between ${min} and ${max}.`, field);
  return n;
}
export function dateStr(value, label, field, required = false) {
  const v = String(value ?? '').trim();
  if (!v) { if (required) throw new UserError(`${label} is required.`, field); return ''; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(new Date(v))) throw new UserError(`${label} must be a valid date.`, field);
  return v;
}
export const lines = (text) => String(text ?? '').split('\n').map((s) => s.trim()).filter(Boolean);

// Formatting
export function fmtMoney(amount, currency = 'USD') {
  const n = Number(amount) || 0;
  const s = n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
  return `${s} ${currency}`;
}
export function fmtDate(d, opts = { month: 'short', day: 'numeric', year: 'numeric' }) {
  if (!d) return '—';
  const date = new Date(d.length === 10 ? d + 'T00:00:00' : d);
  if (isNaN(date)) return '—';
  return date.toLocaleDateString('en-US', opts);
}
export const fmtShortDate = (d) => fmtDate(d, { month: 'short', day: 'numeric' });
export function fmtDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
export function fmtRelative(d) {
  if (!d) return '';
  const diff = (clock.now() - new Date(d)) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
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
