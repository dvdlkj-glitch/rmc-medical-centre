// End-to-end check of the booking flow against a throwaway local database:
// patient books → slot is held → help desk confirms → doctor page shows it.
// Run with: npm test

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { bookableDays, clinicNow } from '../src/slots.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 18000 + Math.floor(Math.random() * 1000);
const BASE = `http://127.0.0.1:${PORT}`;
const PASSWORD = 'test-helpdesk-pw';
let server;
let dbDir;

async function call(pathname, { method = 'GET', body, cookie } = {}) {
  const res = await fetch(BASE + pathname, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-RMC': '1', ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data, cookie: res.headers.get('set-cookie')?.split(';')[0] };
}

before(async () => {
  dbDir = await mkdtemp(path.join(tmpdir(), 'rmc-test-'));
  server = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env, DATABASE_URL: '', LOCAL_DB_DIR: dbDir, PORT: String(PORT),
      HELPDESK_PASSWORD: PASSWORD, SESSION_SECRET: 'test-secret', MIN_NOTICE_MINUTES: '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  server.stdout.on('data', (d) => { log += d; });
  server.stderr.on('data', (d) => { log += d; });
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${BASE}/healthz`)).ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`server did not start:\n${log}`);
});

after(async () => {
  server?.kill();
  await new Promise((r) => setTimeout(r, 300));
  await rm(dbDir, { recursive: true, force: true }).catch(() => {});
});

test('slot generation respects the notice period and taken slots', () => {
  const sessions = [{ weekday: 1, start_time: '09:00', end_time: '10:30', slot_minutes: 30 }];
  const now = { date: '2026-10-19', minutes: 9 * 60 + 10 }; // Monday 09:10
  const days = bookableDays({
    sessions, offDates: new Set(['2026-10-26']), taken: new Set(['2026-11-02 09:30']),
    from: '2026-10-19', days: 15, now, leadMinutes: 30,
  });
  assert.deepEqual(days.map((d) => d.date), ['2026-10-19', '2026-11-02']); // 26 Oct is leave
  assert.deepEqual(days[0].slots.map((s) => s.time), ['10:00']);           // 09:00/09:30 too soon
  assert.deepEqual(days[1].slots.map((s) => s.status), ['open', 'taken', 'open']);
  assert.match(clinicNow().date, /^\d{4}-\d{2}-\d{2}$/);
});

test('full flow: book → help desk confirms → doctor sees it', async () => {
  // Public list shows the seeded doctors with availability for the two published clinics.
  const list = await call('/api/doctors');
  assert.equal(list.status, 200);
  assert.equal(list.data.doctors.length, 32);
  const deenish = list.data.doctors.find((d) => d.slug === 'deenish-muniandy');
  assert.ok(deenish.next_open, 'Sunday paediatric clinic should have open slots');

  const avail = await call('/api/doctors/deenish-muniandy/availability');
  const day = avail.data.days[0];
  const slot = day.slots.find((s) => s.status === 'open');

  // Patient books.
  const booking = { doctor: 'deenish-muniandy', date: day.date, time: slot.time, name: 'Test Patient', phone: '+60 12-345 6789', notes: 'Fever', consent: true };
  const made = await call('/api/bookings', { method: 'POST', body: booking });
  assert.equal(made.status, 201, JSON.stringify(made.data));
  assert.match(made.data.ref_code, /^RMC-[A-Z0-9]{6}$/);
  assert.equal(made.data.status, 'pending');
  assert.equal(made.data.phone, '0123456789');

  // The same slot cannot be taken twice; it now shows as taken.
  const dup = await call('/api/bookings', { method: 'POST', body: { ...booking, phone: '0198765432', name: 'Someone Else' } });
  assert.equal(dup.status, 409);
  const again = await call('/api/doctors/deenish-muniandy/availability');
  assert.equal(again.data.days.find((d) => d.date === day.date).slots.find((s) => s.time === slot.time).status, 'taken');

  // Validation and CSRF guard.
  assert.equal((await call('/api/bookings', { method: 'POST', body: { ...booking, time: '23:55' } })).status, 400);
  assert.equal((await call('/api/bookings', { method: 'POST', body: { ...booking, consent: false } })).status, 400);
  const noHeader = await fetch(`${BASE}/api/bookings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(booking) });
  assert.equal(noHeader.status, 400);

  // Patient can look up the status.
  const look = await call(`/api/bookings/lookup?ref=${made.data.ref_code}&phone=012-3456789`);
  assert.equal(look.data.status, 'pending');

  // Help desk endpoints need a session.
  assert.equal((await call('/api/helpdesk/appointments')).status, 401);
  assert.equal((await call('/api/helpdesk/login', { method: 'POST', body: { name: 'Aisyah', password: 'wrong' } })).status, 401);
  const login = await call('/api/helpdesk/login', { method: 'POST', body: { name: 'Aisyah', password: PASSWORD } });
  assert.equal(login.status, 200);
  const hd = login.cookie;

  const pending = await call('/api/helpdesk/appointments?status=pending', { cookie: hd });
  const appt = pending.data.appointments.find((a) => a.ref_code === made.data.ref_code);
  assert.equal(appt.patient_name, 'Test Patient');

  // Set the doctor's PIN; before confirmation the doctor page shows nothing.
  const doctors = await call('/api/helpdesk/doctors', { cookie: hd });
  const docId = doctors.data.doctors.find((d) => d.slug === 'deenish-muniandy').id;
  assert.equal((await call(`/api/helpdesk/doctors/${docId}/pin`, { method: 'POST', body: { pin: '2468' }, cookie: hd })).status, 200);
  assert.equal((await call('/api/doctor/deenish-muniandy/login', { method: 'POST', body: { pin: '0000' } })).status, 401);
  const drLogin = await call('/api/doctor/deenish-muniandy/login', { method: 'POST', body: { pin: '2468' } });
  assert.equal(drLogin.status, 200);
  const dr = drLogin.cookie;
  let mine = await call('/api/doctor/deenish-muniandy/appointments', { cookie: dr });
  assert.equal(mine.data.confirmed.length, 0);
  assert.equal(mine.data.pending_count, 1);

  // A doctor's session does not open another doctor's page.
  assert.equal((await call('/api/doctor/rajesh-kumar-muniandy/appointments', { cookie: dr })).status, 401);

  // Help desk logs a missed call, then confirms.
  const na = await call(`/api/helpdesk/appointments/${appt.id}/no-answer`, { method: 'POST', body: {}, cookie: hd });
  assert.equal(na.data.call_attempts, 1);
  const conf = await call(`/api/helpdesk/appointments/${appt.id}/confirm`, { method: 'POST', body: {}, cookie: hd });
  assert.equal(conf.data.status, 'confirmed');
  assert.equal((await call(`/api/helpdesk/appointments/${appt.id}/confirm`, { method: 'POST', body: {}, cookie: hd })).status, 409);

  // Doctor now sees the confirmed appointment — without the phone number.
  mine = await call('/api/doctor/deenish-muniandy/appointments', { cookie: dr });
  assert.equal(mine.data.confirmed.length, 1);
  assert.equal(mine.data.confirmed[0].patient_name, 'Test Patient');
  assert.equal(mine.data.confirmed[0].confirmed_by, 'Aisyah');
  assert.equal(mine.data.confirmed[0].phone, undefined);
  assert.equal(mine.data.pending_count, 0);

  // Changing the PIN signs the old session out.
  await call(`/api/helpdesk/doctors/${docId}/pin`, { method: 'POST', body: { pin: '1357' }, cookie: hd });
  assert.equal((await call('/api/doctor/deenish-muniandy/appointments', { cookie: dr })).status, 401);

  // Cancelling frees the slot; the doctor sees it under "recently cancelled".
  const cancel = await call(`/api/helpdesk/appointments/${appt.id}/cancel`, { method: 'POST', body: { reason: 'Patient unwell' }, cookie: hd });
  assert.equal(cancel.data.status, 'cancelled');
  const freed = await call('/api/doctors/deenish-muniandy/availability');
  assert.equal(freed.data.days.find((d) => d.date === day.date).slots.find((s) => s.time === slot.time).status, 'open');
  mine = await call('/api/doctor/deenish-muniandy/appointments', { cookie: hd }); // help desk may view doctor pages
  assert.equal(mine.data.viewer, 'helpdesk');
  assert.equal(mine.data.cancelled.length, 1);

  // Phone booking by the help desk is confirmed immediately, even outside session times.
  const phoneBooking = await call('/api/helpdesk/appointments', {
    method: 'POST', cookie: hd,
    body: { doctor_id: docId, date: day.date, time: '15:00', name: 'Walk In', phone: '0112345678' },
  });
  assert.equal(phoneBooking.status, 201);
  assert.equal(phoneBooking.data.status, 'confirmed');
  const sheet = await call(`/api/helpdesk/appointments?date=${day.date}`, { cookie: hd });
  assert.equal(sheet.data.appointments.length, 2);
});

test('schedule management opens and closes online slots', async () => {
  const hd = (await call('/api/helpdesk/login', { method: 'POST', body: { name: 'Desk', password: PASSWORD } })).cookie;
  const before = (await call('/api/doctors')).data.doctors.find((d) => d.slug === 'teh-ya-loon');
  assert.equal(before.next_open, null);

  const added = await call(`/api/helpdesk/doctors/${before.id}/sessions`, {
    method: 'POST', cookie: hd, body: { weekday: 3, start_time: '09:00', end_time: '11:00', slot_minutes: 20 },
  });
  assert.equal(added.status, 201);
  const avail = await call('/api/doctors/teh-ya-loon/availability');
  assert.ok(avail.data.days.length >= 4);
  assert.deepEqual(avail.data.days.at(-1).slots.map((s) => s.time), ['09:00', '09:20', '09:40', '10:00', '10:20', '10:40']);

  // Leave closes that date.
  const leaveDate = avail.data.days[0].date;
  await call(`/api/helpdesk/doctors/${before.id}/time-off`, { method: 'POST', cookie: hd, body: { date: leaveDate, reason: 'Conference' } });
  const afterLeave = await call('/api/doctors/teh-ya-loon/availability');
  assert.ok(!afterLeave.data.days.some((d) => d.date === leaveDate));

  // Hidden doctors disappear from the public list.
  await call(`/api/helpdesk/doctors/${before.id}/active`, { method: 'POST', cookie: hd, body: { active: false } });
  assert.ok(!(await call('/api/doctors')).data.doctors.some((d) => d.slug === 'teh-ya-loon'));
  assert.equal((await call('/api/doctors/teh-ya-loon/availability')).status, 404);
});
