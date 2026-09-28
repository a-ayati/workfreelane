// Authentication: accounts, password hashing (PBKDF2-SHA256 via WebCrypto),
// sessions, email verification, password reset and login rate limiting.
import { db } from './store.js';
import { mailer, appLink } from './mailer.js';
import { UserError, AuthError, email as vEmail, req, randomToken, clock, nowISO } from './util.js';
import { t, tl, uiLang } from './i18n.js';

const SESSION_KEY = 'sw.session';
const SESSION_DAYS = 30;
const PBKDF2_ITER = 210000;
const MAX_FAILS = 5;
const WINDOW_MIN = 15;

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function hashPassword(password, saltB64) {
  const salt = saltB64 ? unb64(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITER }, key, 256);
  return { hash: b64(bits), salt: b64(salt) };
}
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
function validatePassword(pw) {
  if (!pw || pw.length < 8) throw new UserError(t('Use at least 8 characters for your password.'), 'password');
  if (pw.length > 200) throw new UserError(t('That password is too long.'), 'password');
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) throw new UserError(t('Use a mix of letters and numbers in your password.'), 'password');
}

// Rate limiting: count recent attempts per key+kind.
function recentAttempts(key, kind) {
  const since = Date.now() - WINDOW_MIN * 60000;
  return db.all('authAttempts', (a) => a.key === key && a.kind === kind && new Date(a.createdAt) >= since);
}
function guard(key, kind, max, message) {
  if (recentAttempts(key, kind).length >= max) throw new UserError(message);
}
const recordAttempt = (key, kind) => db.insert('authAttempts', { key, kind });

function issueEmailToken(userId, type, hours) {
  const token = randomToken();
  db.insert('emailTokens', { userId, type, token, expiresAt: new Date(Date.now() + hours * 3600000).toISOString(), usedAt: null });
  return token;
}
function consumeEmailToken(token, type) {
  const tok = db.find('emailTokens', (r) => r.type === type && safeEqual(r.token, String(token || '')));
  if (!tok || tok.usedAt) throw new UserError(t('This link is invalid or has already been used.'));
  if (new Date(tok.expiresAt) < new Date()) throw new UserError(t('This link has expired. Please request a new one.'));
  db.update('emailTokens', tok.id, { usedAt: nowISO() });
  return tok;
}

function startSession(userId) {
  const token = randomToken(32);
  db.insert('sessions', { userId, token, expiresAt: new Date(Date.now() + SESSION_DAYS * 86400000).toISOString() });
  try { localStorage.setItem(SESSION_KEY, token); } catch { /* storage blocked: session lasts this page */ }
  memToken = token;
  return token;
}
let memToken = null;
const storedToken = () => { try { return localStorage.getItem(SESSION_KEY) || memToken; } catch { return memToken; } };

export function sendVerification(user) {
  const token = issueEmailToken(user.id, 'verify', 48);
  const L = user.lang || uiLang();
  return mailer.send({
    to: user.email, kind: 'verify', subject: tl(L, 'Verify your email address'),
    body: tl(L, 'Hi {name},\n\nConfirm your email address to secure your Scopewise account.', { name: user.name }),
    link: appLink(`/verify?token=${token}`), linkLabel: tl(L, 'Verify email'),
  });
}

export const auth = {
  currentUser() {
    const token = storedToken();
    if (!token) return null;
    const s = db.find('sessions', (r) => safeEqual(r.token, token));
    if (!s || new Date(s.expiresAt) < new Date()) return null;
    return db.get('users', s.userId);
  },
  requireUser() {
    const u = auth.currentUser();
    if (!u) throw new AuthError();
    return u;
  },
  async signup({ name, email, password, role = 'freelancer' }) {
    name = req(name, 'Name', 'name', 120);
    email = vEmail(email);
    validatePassword(password);
    if (db.find('users', (u) => u.email === email)) throw new UserError(t('An account with this email already exists. Try signing in instead.'), 'email');
    if (!['freelancer'].includes(role)) throw new UserError(t('Only freelancer accounts can be created right now.'));
    const { hash, salt } = await hashPassword(password);
    const user = db.insert('users', { name, email, passwordHash: hash, salt, role, emailVerified: false, onboarded: false, lang: uiLang() });
    sendVerification(user);
    startSession(user.id);
    return user;
  },
  async login({ email, password }) {
    email = vEmail(email);
    guard(email, 'login-fail', MAX_FAILS, t('Too many sign-in attempts. Please wait {n} minutes and try again.', { n: WINDOW_MIN }));
    const user = db.find('users', (u) => u.email === email);
    const { hash } = await hashPassword(String(password || ''), user?.salt);
    if (!user || !safeEqual(hash, user.passwordHash)) {
      recordAttempt(email, 'login-fail');
      throw new UserError(t('That email and password combination is not correct.'));
    }
    startSession(user.id);
    return user;
  },
  logout() {
    const token = storedToken();
    const s = token && db.find('sessions', (r) => r.token === token);
    if (s) db.remove('sessions', s.id);
    try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
    memToken = null;
  },
  requestPasswordReset(emailAddr) {
    const e = vEmail(emailAddr);
    guard(e, 'reset', 3, t('Too many reset requests. Please wait a few minutes and try again.'));
    recordAttempt(e, 'reset');
    const user = db.find('users', (u) => u.email === e);
    if (user) {
      const token = issueEmailToken(user.id, 'reset', 1);
      const L = user.lang || uiLang();
      mailer.send({
        to: user.email, kind: 'reset', subject: tl(L, 'Reset your password'),
        body: tl(L, "Hi {name},\n\nWe received a request to reset your password. This link expires in 1 hour. If you didn't ask for this, you can ignore this email.", { name: user.name }),
        link: appLink(`/reset?token=${token}`), linkLabel: tl(L, 'Choose a new password'),
      });
    }
    // Same response whether or not the account exists.
  },
  async resetPassword(token, password) {
    validatePassword(password);
    const tok = consumeEmailToken(token, 'reset');
    const { hash, salt } = await hashPassword(password);
    db.update('users', tok.userId, { passwordHash: hash, salt });
    db.all('sessions', (s) => s.userId === tok.userId).forEach((s) => db.remove('sessions', s.id));
  },
  verifyEmail(token) {
    const tok = consumeEmailToken(token, 'verify');
    return db.update('users', tok.userId, { emailVerified: true });
  },
  async changePassword(current, next) {
    const user = auth.requireUser();
    const { hash } = await hashPassword(String(current || ''), user.salt);
    if (!safeEqual(hash, user.passwordHash)) throw new UserError(t('Your current password is not correct.'), 'current');
    validatePassword(next);
    const h = await hashPassword(next);
    db.update('users', user.id, { passwordHash: h.hash, salt: h.salt });
  },
  updateUser(patch) {
    const user = auth.requireUser();
    const clean = {};
    if ('name' in patch) clean.name = req(patch.name, 'Name', 'name', 120);
    if ('email' in patch) {
      const e = vEmail(patch.email);
      if (e !== user.email) {
        if (db.find('users', (u) => u.email === e)) throw new UserError(t('That email is already in use.'), 'email');
        clean.email = e;
        clean.emailVerified = false;
      }
    }
    if ('onboarded' in patch) clean.onboarded = !!patch.onboarded;
    if ('lang' in patch) clean.lang = patch.lang === 'ar' ? 'ar' : 'en';
    const u = db.update('users', user.id, clean);
    if (clean.email) sendVerification(u);
    return u;
  },
};
