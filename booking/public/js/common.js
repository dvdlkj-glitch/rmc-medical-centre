// Shared helpers for the booking, help desk and doctor pages.

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-RMC': '1' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status}).`);
    err.status = res.status;
    throw err;
  }
  return data;
}

/**
 * Tiny element builder. Strings become text nodes, so user-entered values
 * (patient names, notes) can never inject HTML.
 *   h('div', { class: 'x', onclick: fn }, 'text', child)
 */
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const parts = (date) => {
  const [y, m, d] = date.split('-').map(Number);
  return { y, m, d, wd: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
};

export function fmtDate(date, { long = false, year = false } = {}) {
  const { y, m, d, wd } = parts(date);
  return `${long ? WEEKDAYS_LONG[wd] : WEEKDAYS[wd]}, ${d} ${MONTHS[m - 1]}${year ? ` ${y}` : ''}`;
}

export function datePieces(date) {
  const { m, d, wd } = parts(date);
  return { wd: WEEKDAYS[wd], d, mon: MONTHS[m - 1] };
}

export function fmtTime(t) {
  const [hh, mm] = t.split(':').map(Number);
  const suffix = hh < 12 ? 'AM' : 'PM';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${suffix}`;
}

export function fmtSessions(sessions) {
  if (!sessions?.length) return '';
  return sessions.map((s) => `${WEEKDAYS[s.weekday]} ${fmtTime(s.start_time)}–${fmtTime(s.end_time)}`).join(' · ');
}

export function fmtStamp(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  });
}

export function addDays(date, n) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export function relDay(today, date) {
  const n = daysBetween(today, date);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

export function fmtPhone(p) {
  if (!p) return '';
  if (p.startsWith('+')) return p;
  // 0123456789 -> 012-345 6789 ; 01123456789 -> 011-2345 6789
  if (/^01\d{8,9}$/.test(p)) return `${p.slice(0, 3)}-${p.slice(3, p.length - 4)} ${p.slice(-4)}`;
  return p;
}

export function waLink(p) {
  const intl = p.startsWith('+') ? p.slice(1) : `60${p.slice(1)}`;
  return `https://wa.me/${intl}`;
}

export function initials(name) {
  const clean = name.replace(/\(.*?\)/g, '')
    .replace(/\b(Datuk|Datin|Dr|Assoc|Prof|MA|A\/L|Bin|Binti)\b\.?/gi, '')
    .trim().split(/\s+/).filter(Boolean);
  return ((clean[0]?.[0] || '') + (clean[1]?.[0] || '')).toUpperCase() || '+';
}

let toastTimer;
export function toast(message) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(el);
  }
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

export const $ = (sel, root = document) => root.querySelector(sel);
