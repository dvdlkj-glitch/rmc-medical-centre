// Clinic-time helpers and slot availability.
// Dates are 'YYYY-MM-DD' strings and times 'HH:MM' strings in clinic local
// time (Asia/Kuala_Lumpur, no daylight saving), matching how the front desk
// writes appointments in the handbook.

export const CLINIC_TZ = process.env.CLINIC_TZ || 'Asia/Kuala_Lumpur';

const partsFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: CLINIC_TZ,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

export function clinicNow(at = new Date()) {
  const p = Object.fromEntries(partsFmt.formatToParts(at).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

export function isDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function isTime(s) {
  return typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

export function addDays(date, n) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function weekdayOf(date) {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export const toMinutes = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
export const fromMinutes = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Slot start times for one weekly session; the last slot must finish by end_time. */
export function sessionSlots({ start_time, end_time, slot_minutes }) {
  const out = [];
  const end = toMinutes(end_time);
  for (let m = toMinutes(start_time); m + slot_minutes <= end; m += slot_minutes) out.push(fromMinutes(m));
  return out;
}

/**
 * Bookable days for one doctor.
 * @param sessions   rows {weekday, start_time, end_time, slot_minutes}
 * @param offDates   Set of 'YYYY-MM-DD' the doctor is away
 * @param taken      Set of 'YYYY-MM-DD HH:MM' already held (pending or confirmed)
 * @param from/days  window start date and length
 * @param now        clinicNow() result
 * @param leadMinutes minimum notice so the help desk can call before the visit
 * Returns [{date, slots:[{time, status:'open'|'taken'}]}] — days with no
 * remaining slots, and slots inside the notice period, are left out.
 */
export function bookableDays({ sessions, offDates, taken, from, days, now, leadMinutes }) {
  const byWeekday = new Map();
  for (const s of sessions) {
    const list = byWeekday.get(s.weekday) || new Set();
    for (const t of sessionSlots(s)) list.add(t);
    byWeekday.set(s.weekday, list);
  }

  const cutoffDayOffset = Math.floor((now.minutes + leadMinutes) / (24 * 60));
  const cutoffDate = addDays(now.date, cutoffDayOffset);
  const cutoffMinutes = (now.minutes + leadMinutes) % (24 * 60);

  const result = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(from, i);
    if (date < cutoffDate || offDates.has(date)) continue;
    const times = byWeekday.get(weekdayOf(date));
    if (!times) continue;
    const slots = [...times].sort()
      .filter((t) => date > cutoffDate || toMinutes(t) >= cutoffMinutes)
      .map((t) => ({ time: t, status: taken.has(`${date} ${t}`) ? 'taken' : 'open' }));
    if (slots.length) result.push({ date, slots });
  }
  return result;
}
