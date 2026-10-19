import crypto from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Trimmed single-line text, or null when empty. Throws 400 when too long / required and missing. */
export function text(value, { field, max, required = false, multiline = false }) {
  let s = typeof value === 'string' ? value : value == null ? '' : String(value);
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  s = multiline ? s.replace(/\r\n?/g, '\n').trim() : s.replace(/\s+/g, ' ').trim();
  if (!s) {
    if (required) throw new HttpError(400, `Please enter ${field}.`);
    return null;
  }
  if (s.length > max) throw new HttpError(400, `${field[0].toUpperCase()}${field.slice(1)} is too long (max ${max} characters).`);
  return s;
}

/**
 * Normalise a phone number. Malaysian numbers are stored as 0XXXXXXXXX
 * ("+60 12-345 6789" -> "0123456789"); other countries keep their + prefix.
 */
export function phone(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  let digits = raw.replace(/[\s\-().]/g, '');
  if (digits.startsWith('+60')) digits = `0${digits.slice(3)}`;
  else if (/^60\d{9,10}$/.test(digits)) digits = `0${digits.slice(2)}`;
  if (/^0\d{8,10}$/.test(digits)) return digits;
  if (/^\+[1-9]\d{7,14}$/.test(digits)) return digits;
  throw new HttpError(400, 'Please enter a valid phone number, e.g. 012-345 6789.');
}

const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function refCode() {
  const bytes = crypto.randomBytes(6);
  let s = '';
  for (const b of bytes) s += REF_ALPHABET[b % REF_ALPHABET.length];
  return `RMC-${s}`;
}

export function intId(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(404, 'Not found.');
  return n;
}
