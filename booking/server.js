// Rafflesia Medical Centre — specialist appointment booking server.
//
//   /                 public booking page (embeddable: /?embed=1)
//   /helpdesk         help desk: call patients, confirm / cancel, manage schedules
//   /doctor/:slug     each doctor's own page of confirmed appointments
//
// Data lives in Supabase Postgres (DATABASE_URL). Patient details are only
// ever returned to signed-in help desk staff and (without phone numbers) to
// the doctor concerned.

import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as db from './src/db.js';
import {
  DOCTOR_COOKIE, HELPDESK_COOKIE, checkHelpdeskPassword, clearSessionCookie, fingerprint, hashPin, helpdeskFingerprint,
  rateLimit, readSession, setSessionCookie, signSession, verifyPin,
} from './src/auth.js';
import { addDays, bookableDays, clinicNow, isDate, isTime } from './src/slots.js';
import { HttpError, intId, phone as normPhone, refCode, text } from './src/validate.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');

const config = {
  port: Number(process.env.PORT || 8080),
  windowDays: Number(process.env.BOOKING_WINDOW_DAYS || 30),
  noticeMinutes: Number(process.env.MIN_NOTICE_MINUTES || 120),
  maxActivePerPhone: Number(process.env.MAX_ACTIVE_PER_PHONE || 3),
  clinicPhone: process.env.CLINIC_PHONE || '010-968 1216',
  clinicWhatsapp: process.env.CLINIC_WHATSAPP || '60109681216',
};

const HELPDESK_SESSION_SECONDS = 12 * 60 * 60;
const DOCTOR_SESSION_SECONDS = 30 * 24 * 60 * 60;

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1));
app.use(express.json({ limit: '20kb' }));

// ---------------------------------------------------------------- security headers
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'self'",
].join('; ');

app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  // The public booking page may be embedded in the RMC website; staff pages may not.
  const embeddable = req.path === '/' || req.path === '/book' || req.path.startsWith('/assets/') ||
    (req.path.startsWith('/api/') && !req.path.startsWith('/api/helpdesk') && !req.path.startsWith('/api/doctor/'));
  if (embeddable) {
    res.set('Content-Security-Policy', CSP);
  } else {
    res.set('Content-Security-Policy', `${CSP}; frame-ancestors 'none'`);
    res.set('X-Frame-Options', 'DENY');
  }
  if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store');
  next();
});

// CSRF guard: every state-changing API call must carry the X-RMC header, which
// a cross-site form cannot send (and SameSite=Lax cookies are not sent either).
app.use('/api', (req, res, next) => {
  if (req.method !== 'GET' && req.get('X-RMC') !== '1') {
    return res.status(400).json({ error: 'Bad request.' });
  }
  next();
});

// ---------------------------------------------------------------- data helpers

const DOCTOR_PUBLIC_COLS = 'id, slug, name, specialty, qualifications, expertise, doctor_type';

async function loadSessions(doctorId) {
  const rows = await db.many(
    `select id, doctor_id, weekday, to_char(start_time, 'HH24:MI') as start_time,
            to_char(end_time, 'HH24:MI') as end_time, slot_minutes
       from rmc_doctor_sessions ${doctorId ? 'where doctor_id = $1' : ''}
      order by weekday, start_time`, doctorId ? [doctorId] : []);
  return rows.map((r) => ({ ...r, weekday: Number(r.weekday), slot_minutes: Number(r.slot_minutes) }));
}

async function loadTimeOff(fromDate, doctorId) {
  return db.many(
    `select id, doctor_id, off_date::text as off_date, reason
       from rmc_doctor_time_off
      where off_date >= $1 ${doctorId ? 'and doctor_id = $2' : ''}
      order by off_date`, doctorId ? [fromDate, doctorId] : [fromDate]);
}

async function loadTaken(fromDate, toDate, doctorId) {
  return db.many(
    `select doctor_id, appt_date::text as d, to_char(appt_time, 'HH24:MI') as t
       from rmc_appointments
      where status in ('pending', 'confirmed') and appt_date between $1 and $2
        ${doctorId ? 'and doctor_id = $3' : ''}`,
    doctorId ? [fromDate, toDate, doctorId] : [fromDate, toDate]);
}

const groupBy = (rows, key) => rows.reduce((m, r) => m.set(r[key], [...(m.get(r[key]) || []), r]), new Map());

/** Bookable days for each doctor id in `doctors`, over the public booking window. */
async function availabilityFor(doctors, { from, days, noticeMinutes } = {}) {
  const now = clinicNow();
  const start = from || now.date;
  const span = days || config.windowDays;
  const end = addDays(start, span - 1);
  const singleId = doctors.length === 1 ? doctors[0].id : null;
  const [sessions, off, taken] = await Promise.all([
    loadSessions(singleId), loadTimeOff(start, singleId), loadTaken(start, end, singleId),
  ]);
  const sessionsBy = groupBy(sessions, 'doctor_id');
  const offBy = groupBy(off, 'doctor_id');
  const takenBy = groupBy(taken, 'doctor_id');
  const out = new Map();
  for (const d of doctors) {
    const ds = sessionsBy.get(d.id) || [];
    out.set(d.id, {
      sessions: ds,
      days: bookableDays({
        sessions: ds,
        offDates: new Set((offBy.get(d.id) || []).map((r) => r.off_date)),
        taken: new Set((takenBy.get(d.id) || []).map((r) => `${r.d} ${r.t}`)),
        from: start,
        days: span,
        now,
        leadMinutes: noticeMinutes ?? config.noticeMinutes,
      }),
    });
  }
  return out;
}

const publicSessions = (sessions) => sessions.map(({ weekday, start_time, end_time, slot_minutes }) =>
  ({ weekday, start_time, end_time, slot_minutes }));

const APPT_COLS = `a.id, a.ref_code, a.doctor_id, a.appt_date::text as appt_date,
  to_char(a.appt_time, 'HH24:MI') as appt_time, a.patient_name, a.phone, a.mrn, a.notes,
  a.status, a.source, a.call_attempts, a.last_call_at, a.confirmed_at, a.confirmed_by,
  a.cancelled_at, a.cancelled_by, a.cancel_reason, a.created_at,
  d.name as doctor_name, d.specialty as doctor_specialty, d.slug as doctor_slug`;

async function insertAppointment({ doctorId, date, time, name, phone, mrn, notes, status, source, confirmedBy }) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await db.one(
        `insert into rmc_appointments
           (ref_code, doctor_id, appt_date, appt_time, patient_name, phone, mrn, notes, status, source,
            confirmed_at, confirmed_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                 case when $9 = 'confirmed' then now() end, $11)
         returning id, ref_code, status`,
        [refCode(), doctorId, date, time, name, phone, mrn, notes, status, source, confirmedBy ?? null]);
    } catch (err) {
      if (db.isUniqueViolation(err) && /ref_code/.test(`${err.constraint} ${err.message} ${err.detail}`)) continue;
      if (db.isUniqueViolation(err)) throw new HttpError(409, 'Sorry — that time was just taken. Please choose another slot.');
      throw err;
    }
  }
  throw new Error('Could not generate a unique reference code.');
}

// ---------------------------------------------------------------- public API

app.get('/healthz', async (req, res) => {
  await db.query('select 1');
  res.json({ ok: true });
});

app.get('/api/config', (req, res) => {
  res.json({
    clinicPhone: config.clinicPhone,
    clinicWhatsapp: config.clinicWhatsapp,
    windowDays: config.windowDays,
    noticeMinutes: config.noticeMinutes,
    today: clinicNow().date,
  });
});

app.get('/api/doctors', async (req, res) => {
  const doctors = await db.many(
    `select ${DOCTOR_PUBLIC_COLS} from rmc_doctors where active order by sort_order, name`);
  const avail = await availabilityFor(doctors);
  res.json({
    doctors: doctors.map((d) => {
      const a = avail.get(d.id);
      const openDays = a.days.filter((day) => day.slots.some((s) => s.status === 'open'));
      return {
        ...d,
        sessions: publicSessions(a.sessions),
        next_open: openDays[0]?.date ?? null,
        open_slots: openDays.reduce((n, day) => n + day.slots.filter((s) => s.status === 'open').length, 0),
      };
    }),
  });
});

app.get('/api/doctors/:slug/availability', async (req, res) => {
  const doctor = await db.one(
    `select ${DOCTOR_PUBLIC_COLS} from rmc_doctors where slug = $1 and active`, [req.params.slug]);
  if (!doctor) throw new HttpError(404, 'Doctor not found.');
  const a = (await availabilityFor([doctor])).get(doctor.id);
  res.json({ doctor: { ...doctor, sessions: publicSessions(a.sessions) }, days: a.days });
});

app.post('/api/bookings', rateLimit('book', 8, 15 * 60_000), async (req, res) => {
  const b = req.body || {};
  if (b.website) throw new HttpError(400, 'Bad request.'); // honeypot field, hidden from people
  if (b.consent !== true) throw new HttpError(400, 'Please agree to be contacted so we can confirm your appointment.');
  if (!isDate(b.date) || !isTime(b.time)) throw new HttpError(400, 'Please choose a date and time.');

  const name = text(b.name, { field: 'your full name', max: 80, required: true });
  if (name.length < 2) throw new HttpError(400, 'Please enter your full name.');
  const phone = normPhone(b.phone);
  const mrn = text(b.mrn, { field: 'RMC patient number', max: 30 });
  const notes = text(b.notes, { field: 'notes', max: 300, multiline: true });

  const doctor = await db.one(
    `select ${DOCTOR_PUBLIC_COLS} from rmc_doctors where slug = $1 and active`, [String(b.doctor || '')]);
  if (!doctor) throw new HttpError(404, 'Doctor not found.');

  const today = clinicNow().date;
  const lastDay = addDays(today, config.windowDays - 1);
  if (b.date < today || b.date > lastDay) throw new HttpError(400, 'That date is outside the booking window.');

  const day = (await availabilityFor([doctor], { from: b.date, days: 1 })).get(doctor.id).days[0];
  const slot = day?.slots.find((s) => s.time === b.time);
  if (!slot) throw new HttpError(400, 'That time is not available for online booking. Please choose another slot.');
  if (slot.status !== 'open') throw new HttpError(409, 'Sorry — that time was just taken. Please choose another slot.');

  const { n } = await db.one(
    `select count(*)::int as n from rmc_appointments
      where phone = $1 and status in ('pending', 'confirmed') and appt_date >= $2`, [phone, today]);
  if (n >= config.maxActivePerPhone) {
    throw new HttpError(409,
      `This phone number already has ${n} upcoming appointment requests. Please call ${config.clinicPhone} to make changes.`);
  }

  const appt = await insertAppointment({
    doctorId: doctor.id, date: b.date, time: b.time, name, phone, mrn, notes, status: 'pending', source: 'online',
  });
  res.status(201).json({
    ref_code: appt.ref_code,
    status: appt.status,
    doctor: { name: doctor.name, specialty: doctor.specialty },
    date: b.date,
    time: b.time,
    phone,
  });
});

app.get('/api/bookings/lookup', rateLimit('lookup', 20, 15 * 60_000), async (req, res) => {
  const ref = String(req.query.ref || '').trim().toUpperCase();
  let phone;
  try { phone = normPhone(String(req.query.phone || '')); } catch { phone = null; }
  const row = phone && /^RMC-[A-Z0-9]{6}$/.test(ref) ? await db.one(
    `select a.ref_code, a.status, a.appt_date::text as appt_date, to_char(a.appt_time, 'HH24:MI') as appt_time,
            d.name as doctor_name, d.specialty as doctor_specialty
       from rmc_appointments a join rmc_doctors d on d.id = a.doctor_id
      where a.ref_code = $1 and a.phone = $2`, [ref, phone]) : null;
  if (!row) throw new HttpError(404, 'No booking found for that reference and phone number.');
  res.json(row);
});

// ---------------------------------------------------------------- help desk API

function requireHelpdesk(req, res, next) {
  const s = readSession(req, HELPDESK_COOKIE);
  if (s?.r === 'hd' && s.fp === helpdeskFingerprint()) {
    req.staff = s.n;
    return next();
  }
  res.status(401).json({ error: 'Please sign in.' });
}

app.post('/api/helpdesk/login', rateLimit('hd-login', 10, 15 * 60_000), (req, res) => {
  const name = text(req.body?.name, { field: 'your name', max: 40, required: true });
  if (!process.env.HELPDESK_PASSWORD) throw new HttpError(503, 'HELPDESK_PASSWORD is not configured on the server.');
  if (!checkHelpdeskPassword(String(req.body?.password || ''))) throw new HttpError(401, 'Incorrect password.');
  setSessionCookie(req, res, HELPDESK_COOKIE,
    signSession({ r: 'hd', n: name, fp: helpdeskFingerprint() }, HELPDESK_SESSION_SECONDS), HELPDESK_SESSION_SECONDS);
  res.json({ name });
});

app.post('/api/helpdesk/logout', (req, res) => {
  clearSessionCookie(res, HELPDESK_COOKIE);
  res.json({ ok: true });
});

app.use('/api/helpdesk', requireHelpdesk);

app.get('/api/helpdesk/me', (req, res) => res.json({ name: req.staff, today: clinicNow().date }));

app.get('/api/helpdesk/counts', async (req, res) => {
  const today = clinicNow().date;
  const row = await db.one(
    `select count(*) filter (where status = 'pending')::int as pending,
            count(*) filter (where status = 'confirmed' and appt_date = $1)::int as confirmed_today,
            count(*) filter (where status <> 'cancelled' and appt_date = $1)::int as total_today
       from rmc_appointments where appt_date >= $1 or status = 'pending'`, [today]);
  res.json(row);
});

app.get('/api/helpdesk/appointments', async (req, res) => {
  const { status, date, q } = req.query;
  let rows;
  if (q) {
    const like = `%${String(q).trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const digits = String(q).replace(/\D/g, '');
    rows = await db.many(
      `select ${APPT_COLS} from rmc_appointments a join rmc_doctors d on d.id = a.doctor_id
        where a.patient_name ilike $1 or a.ref_code ilike $1 or a.mrn ilike $1
           or ($2 <> '' and a.phone like '%' || $2 || '%')
        order by a.appt_date desc, a.appt_time desc limit 50`, [like, digits.length >= 4 ? digits : '']);
  } else if (date) {
    if (!isDate(date)) throw new HttpError(400, 'Invalid date.');
    rows = await db.many(
      `select ${APPT_COLS} from rmc_appointments a join rmc_doctors d on d.id = a.doctor_id
        where a.appt_date = $1 order by d.sort_order, d.name, a.appt_time, a.status`, [date]);
  } else {
    const st = ['pending', 'confirmed', 'cancelled'].includes(status) ? status : 'pending';
    const today = clinicNow().date;
    rows = await db.many(
      `select ${APPT_COLS} from rmc_appointments a join rmc_doctors d on d.id = a.doctor_id
        where a.status = $1 and ($1 = 'pending' or a.appt_date >= $2)
        order by a.appt_date, a.appt_time limit 300`, [st, today]);
  }
  res.json({ appointments: rows, today: clinicNow().date });
});

/** Run a guarded UPDATE ... RETURNING; explain why when no row matched. */
async function updateAppointment(id, sql, params) {
  const row = await db.one(sql, [id, ...params]);
  if (row) return row;
  const existing = await db.one('select status from rmc_appointments where id = $1', [id]);
  if (!existing) throw new HttpError(404, 'Appointment not found.');
  throw new HttpError(409, `This appointment is already ${existing.status}. Refresh to see the latest.`);
}

app.post('/api/helpdesk/appointments/:id/confirm', async (req, res) => {
  const row = await updateAppointment(intId(req.params.id),
    `update rmc_appointments set status = 'confirmed', confirmed_at = now(), confirmed_by = $2, updated_at = now()
      where id = $1 and status = 'pending' returning id, status`, [req.staff]);
  res.json(row);
});

app.post('/api/helpdesk/appointments/:id/no-answer', async (req, res) => {
  const row = await updateAppointment(intId(req.params.id),
    `update rmc_appointments set call_attempts = call_attempts + 1, last_call_at = now(), updated_at = now()
      where id = $1 and status = 'pending' returning id, status, call_attempts, last_call_at`, []);
  res.json(row);
});

app.post('/api/helpdesk/appointments/:id/cancel', async (req, res) => {
  const reason = text(req.body?.reason, { field: 'reason', max: 200 });
  const row = await updateAppointment(intId(req.params.id),
    `update rmc_appointments set status = 'cancelled', cancelled_at = now(), cancelled_by = $2,
            cancel_reason = $3, updated_at = now()
      where id = $1 and status in ('pending', 'confirmed') returning id, status`, [req.staff, reason]);
  res.json(row);
});

// Phone / walk-in bookings entered by the help desk are confirmed straight away.
app.post('/api/helpdesk/appointments', async (req, res) => {
  const b = req.body || {};
  if (!isDate(b.date) || !isTime(b.time)) throw new HttpError(400, 'Please choose a date and time.');
  const doctor = await db.one('select id from rmc_doctors where id = $1', [intId(b.doctor_id)]);
  if (!doctor) throw new HttpError(404, 'Doctor not found.');
  const appt = await insertAppointment({
    doctorId: doctor.id,
    date: b.date,
    time: b.time,
    name: text(b.name, { field: "the patient's name", max: 80, required: true }),
    phone: normPhone(b.phone),
    mrn: text(b.mrn, { field: 'RMC patient number', max: 30 }),
    notes: text(b.notes, { field: 'notes', max: 300, multiline: true }),
    status: 'confirmed',
    source: 'helpdesk',
    confirmedBy: req.staff,
  });
  res.status(201).json(appt);
});

app.get('/api/helpdesk/doctors', async (req, res) => {
  const today = clinicNow().date;
  const [doctors, sessions, off] = await Promise.all([
    db.many(`select ${DOCTOR_PUBLIC_COLS}, active, sort_order, (pin_hash is not null) as pin_set
               from rmc_doctors order by sort_order, name`),
    loadSessions(),
    loadTimeOff(today),
  ]);
  const sBy = groupBy(sessions, 'doctor_id');
  const oBy = groupBy(off, 'doctor_id');
  res.json({
    doctors: doctors.map((d) => ({ ...d, sessions: sBy.get(d.id) || [], time_off: oBy.get(d.id) || [] })),
  });
});

// Slots for one doctor on one day, for bookings taken over the phone (no notice period).
app.get('/api/helpdesk/doctors/:id/day', async (req, res) => {
  const date = String(req.query.date || '');
  if (!isDate(date)) throw new HttpError(400, 'Invalid date.');
  const doctor = await db.one('select id from rmc_doctors where id = $1', [intId(req.params.id)]);
  if (!doctor) throw new HttpError(404, 'Doctor not found.');
  const a = (await availabilityFor([doctor], { from: date, days: 1, noticeMinutes: 0 })).get(doctor.id);
  const off = await db.one('select reason from rmc_doctor_time_off where doctor_id = $1 and off_date = $2', [doctor.id, date]);
  res.json({ slots: a.days[0]?.slots || [], off: off ? { reason: off.reason } : null });
});

app.post('/api/helpdesk/doctors/:id/sessions', async (req, res) => {
  const b = req.body || {};
  const weekday = Number(b.weekday);
  const slot = Number(b.slot_minutes || 30);
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) throw new HttpError(400, 'Choose a day of the week.');
  if (!isTime(b.start_time) || !isTime(b.end_time) || b.end_time <= b.start_time) {
    throw new HttpError(400, 'End time must be after start time.');
  }
  if (!Number.isInteger(slot) || slot < 5 || slot > 240) throw new HttpError(400, 'Slot length must be 5–240 minutes.');
  const row = await db.one(
    `insert into rmc_doctor_sessions (doctor_id, weekday, start_time, end_time, slot_minutes)
     values ($1, $2, $3, $4, $5) returning id`,
    [intId(req.params.id), weekday, b.start_time, b.end_time, slot]);
  res.status(201).json(row);
});

app.delete('/api/helpdesk/sessions/:id', async (req, res) => {
  await db.query('delete from rmc_doctor_sessions where id = $1', [intId(req.params.id)]);
  res.json({ ok: true });
});

app.post('/api/helpdesk/doctors/:id/time-off', async (req, res) => {
  if (!isDate(req.body?.date)) throw new HttpError(400, 'Choose a date.');
  const reason = text(req.body?.reason, { field: 'reason', max: 100 });
  await db.query(
    `insert into rmc_doctor_time_off (doctor_id, off_date, reason) values ($1, $2, $3)
     on conflict (doctor_id, off_date) do update set reason = excluded.reason`,
    [intId(req.params.id), req.body.date, reason]);
  res.status(201).json({ ok: true });
});

app.delete('/api/helpdesk/time-off/:id', async (req, res) => {
  await db.query('delete from rmc_doctor_time_off where id = $1', [intId(req.params.id)]);
  res.json({ ok: true });
});

app.post('/api/helpdesk/doctors/:id/pin', async (req, res) => {
  const pin = String(req.body?.pin || '');
  if (!/^\d{4,8}$/.test(pin)) throw new HttpError(400, 'PIN must be 4–8 digits.');
  await db.query('update rmc_doctors set pin_hash = $2 where id = $1', [intId(req.params.id), hashPin(pin)]);
  res.json({ ok: true });
});

app.post('/api/helpdesk/doctors/:id/active', async (req, res) => {
  await db.query('update rmc_doctors set active = $2 where id = $1', [intId(req.params.id), req.body?.active === true]);
  res.json({ ok: true });
});

// ---------------------------------------------------------------- doctor API

async function doctorBySlug(slug) {
  const d = await db.one(`select ${DOCTOR_PUBLIC_COLS}, pin_hash from rmc_doctors where slug = $1`, [slug]);
  if (!d) throw new HttpError(404, 'Doctor not found.');
  return d;
}

app.get('/api/doctor/:slug/profile', async (req, res) => {
  const d = await doctorBySlug(req.params.slug);
  res.json({ name: d.name, specialty: d.specialty, pin_set: Boolean(d.pin_hash) });
});

app.post('/api/doctor/:slug/login', rateLimit('dr-login', 8, 15 * 60_000), async (req, res) => {
  const d = await doctorBySlug(req.params.slug);
  if (!d.pin_hash) throw new HttpError(403, 'No PIN has been set for this page yet. Please ask the help desk.');
  if (!verifyPin(String(req.body?.pin || ''), d.pin_hash)) throw new HttpError(401, 'Incorrect PIN.');
  setSessionCookie(req, res, DOCTOR_COOKIE,
    signSession({ r: 'dr', s: d.slug, fp: fingerprint(d.pin_hash) }, DOCTOR_SESSION_SECONDS), DOCTOR_SESSION_SECONDS);
  res.json({ ok: true });
});

app.post('/api/doctor/logout', (req, res) => {
  clearSessionCookie(res, DOCTOR_COOKIE);
  res.json({ ok: true });
});

app.get('/api/doctor/:slug/appointments', async (req, res) => {
  const d = await doctorBySlug(req.params.slug);
  const dr = readSession(req, DOCTOR_COOKIE);
  const hd = readSession(req, HELPDESK_COOKIE);
  const asDoctor = dr?.r === 'dr' && dr.s === d.slug && d.pin_hash && dr.fp === fingerprint(d.pin_hash);
  const asHelpdesk = hd?.r === 'hd' && hd.fp === helpdeskFingerprint();
  if (!asDoctor && !asHelpdesk) throw new HttpError(401, 'Please enter your PIN.');

  const today = clinicNow().date;
  const until = addDays(today, 60);
  // Doctors see name, RMC number and notes — not phone numbers (the help desk handles calls).
  const [confirmed, cancelled, pending, sessions] = await Promise.all([
    db.many(
      `select id, ref_code, appt_date::text as appt_date, to_char(appt_time, 'HH24:MI') as appt_time,
              patient_name, mrn, notes, source, confirmed_at, confirmed_by
         from rmc_appointments
        where doctor_id = $1 and status = 'confirmed' and appt_date between $2 and $3
        order by appt_date, appt_time`, [d.id, today, until]),
    db.many(
      `select id, appt_date::text as appt_date, to_char(appt_time, 'HH24:MI') as appt_time,
              patient_name, cancelled_at
         from rmc_appointments
        where doctor_id = $1 and status = 'cancelled' and confirmed_at is not null
          and appt_date between $2 and $3 and cancelled_at > now() - interval '7 days'
        order by appt_date, appt_time`, [d.id, today, until]),
    db.one(
      `select count(*)::int as n from rmc_appointments
        where doctor_id = $1 and status = 'pending' and appt_date >= $2`, [d.id, today]),
    loadSessions(d.id),
  ]);
  res.json({
    doctor: { name: d.name, specialty: d.specialty, sessions: publicSessions(sessions) },
    viewer: asDoctor ? 'doctor' : 'helpdesk',
    today,
    confirmed,
    cancelled,
    pending_count: pending.n,
  });
});

// ---------------------------------------------------------------- pages

// No long-lived caching: browsers revalidate (ETag) so a new deploy shows up immediately.
app.use('/assets', express.static(PUBLIC, { index: false }));
const page = (file) => (req, res) => res.sendFile(path.join(PUBLIC, file));
app.get(['/', '/book'], page('index.html'));
app.get('/helpdesk', page('helpdesk.html'));
app.get('/doctor/:slug', page('doctor.html'));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));
app.use((req, res) => res.status(404).type('text').send('Not found'));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Bad request.' });
  console.error('[error]', req.method, req.path, err);
  res.status(500).json({ error: 'Something went wrong. Please try again, or call us.' });
});

// ---------------------------------------------------------------- start

if (process.env.AUTO_MIGRATE !== 'false') await db.migrate();
else await db.connect();

app.listen(config.port, () => {
  const kind = process.env.DATABASE_URL ? 'supabase/postgres' : 'local pglite';
  console.log(`[rmc-booking] listening on :${config.port} (db: ${kind})`);
});
