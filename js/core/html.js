// Tiny auto-escaping template helper. Every interpolated value is HTML-escaped
// unless it was produced by html`` or raw(), which keeps user data inert.
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export class SafeHTML {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
export const raw = (s) => new SafeHTML(String(s ?? ''));

function fmt(v) {
  if (v == null || v === false || v === true) return '';
  if (v instanceof SafeHTML) return v.s;
  if (Array.isArray(v)) return v.map(fmt).join('');
  return esc(v);
}

export function html(strings, ...vals) {
  let out = '';
  strings.forEach((s, i) => {
    out += s;
    if (i < vals.length) out += fmt(vals[i]);
  });
  return new SafeHTML(out);
}

// Attribute helpers
export const attr = (name, on) => (on ? raw(` ${name}`) : '');
export const sel = (a, b) => (a === b ? raw(' selected') : '');
export const chk = (on) => (on ? raw(' checked') : '');
