// Signed-cookie sessions, PIN hashing and a small in-memory rate limiter.
// No third-party auth: the help desk shares one password (HELPDESK_PASSWORD)
// and each doctor has a PIN for their own page, set by the help desk.

import crypto from 'node:crypto';

// Separate cookies so a doctor signing in on the help desk PC does not sign the desk out.
export const HELPDESK_COOKIE = 'rmc_hd';
export const DOCTOR_COOKIE = 'rmc_dr';

let secret = process.env.SESSION_SECRET;
if (!secret) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET must be set in production (any long random string).');
  }
  secret = crypto.randomBytes(32).toString('hex');
  console.warn('[auth] SESSION_SECRET not set — using a random one; logins reset on restart.');
}

const b64 = (buf) => Buffer.from(buf).toString('base64url');
const mac = (data) => crypto.createHmac('sha256', secret).update(data).digest('base64url');

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function signSession(payload, maxAgeSeconds) {
  const body = b64(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + maxAgeSeconds }));
  return `${body}.${mac(body)}`;
}

export function readSession(req, cookie) {
  const raw = parseCookies(req.headers.cookie)[cookie];
  if (!raw) return null;
  const [body, sig] = raw.split('.');
  if (!body || !sig || !safeEqual(sig, mac(body))) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return data.exp > Date.now() / 1000 ? data : null;
  } catch {
    return null;
  }
}

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function setSessionCookie(req, res, cookie, token, maxAgeSeconds) {
  const secure = req.secure || process.env.NODE_ENV === 'production';
  res.append('Set-Cookie',
    `${cookie}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure ? '; Secure' : ''}`);
}

export function clearSessionCookie(res, cookie) {
  res.append('Set-Cookie', `${cookie}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

// ---------------------------------------------------------------- passwords / PINs

/** Short fingerprint embedded in sessions so changing a password/PIN logs old sessions out. */
export const fingerprint = (value) => mac(`fp:${value}`).slice(0, 12);

export function checkHelpdeskPassword(password) {
  const expected = process.env.HELPDESK_PASSWORD;
  if (!expected) return false;
  return safeEqual(mac(`pw:${password}`), mac(`pw:${expected}`));
}

export const helpdeskFingerprint = () => fingerprint(process.env.HELPDESK_PASSWORD || '');

export function hashPin(pin) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pin, salt, 32);
  return `scrypt$${b64(salt)}$${b64(hash)}`;
}

export function verifyPin(pin, stored) {
  if (!stored) return false;
  const [, salt, hash] = stored.split('$');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const actual = crypto.scryptSync(pin, Buffer.from(salt, 'base64url'), 32);
  return expected.length === actual.length && crypto.timingSafeEqual(actual, expected);
}

// ---------------------------------------------------------------- rate limiting

const hits = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
}, 60_000).unref();

/** Express middleware: at most `limit` requests per `windowMs` per client IP for this bucket. */
export function rateLimit(bucket, limit, windowMs) {
  return (req, res, next) => {
    const key = `${bucket}:${req.ip}`;
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.reset < now) {
      entry = { count: 0, reset: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > limit) {
      res.set('Retry-After', String(Math.ceil((entry.reset - now) / 1000)));
      return res.status(429).json({ error: 'Too many attempts. Please wait a few minutes and try again.' });
    }
    next();
  };
}
