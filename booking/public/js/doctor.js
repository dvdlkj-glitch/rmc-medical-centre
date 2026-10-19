import { $, addDays, api, fmtDate, fmtSessions, fmtStamp, fmtTime, h, initials, relDay } from './common.js';

const slug = decodeURIComponent(location.pathname.split('/').filter(Boolean)[1] || '');
const SEEN_KEY = `rmc-seen-${slug}`;
const REFRESH_MS = 30_000;

// Appointments confirmed after the doctor's previous visit are marked NEW for this visit.
let seenBefore = '';
try { seenBefore = localStorage.getItem(SEEN_KEY) || ''; } catch { /* private mode */ }
try { localStorage.setItem(SEEN_KEY, new Date().toISOString()); } catch { /* private mode */ }

async function load() {
  let data;
  try {
    data = await api(`/api/doctor/${encodeURIComponent(slug)}/appointments`);
  } catch (err) {
    if (err.status === 401) return showLogin();
    if (err.status === 404) { $('#missing').hidden = false; return; }
    throw err;
  }
  render(data);
}

async function showLogin() {
  $('#app').hidden = true;
  $('#logout').hidden = true;
  let profile;
  try {
    profile = await api(`/api/doctor/${encodeURIComponent(slug)}/profile`);
  } catch {
    $('#missing').hidden = false;
    return;
  }
  $('#login').hidden = false;
  $('#login-name').textContent = profile.name;
  $('#login-spec').textContent = `${profile.specialty} — enter your PIN to see your confirmed appointments.`;
  $('#login-fields').hidden = !profile.pin_set;
  $('#no-pin').hidden = profile.pin_set;
  if (profile.pin_set) $('#pin').focus();
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#login-error');
  err.hidden = true;
  try {
    await api(`/api/doctor/${encodeURIComponent(slug)}/login`, { method: 'POST', body: { pin: $('#pin').value.trim() } });
    $('#pin').value = '';
    $('#login').hidden = true;
    await load();
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
  }
});

$('#logout').addEventListener('click', async () => {
  await api('/api/doctor/logout', { method: 'POST' });
  showLogin();
});

function render(data) {
  const { doctor, today, confirmed, cancelled, pending_count: pending, viewer } = data;
  $('#login').hidden = true;
  $('#app').hidden = false;
  $('#logout').hidden = viewer !== 'doctor';
  $('#viewer-note').hidden = viewer !== 'helpdesk';
  $('#dr-avatar').textContent = initials(doctor.name);
  $('#dr-name').textContent = doctor.name;
  $('#dr-spec').textContent = doctor.specialty;
  $('#dr-sessions').textContent = doctor.sessions.length ? `Clinic sessions: ${fmtSessions(doctor.sessions)}` : '';

  const weekEnd = addDays(today, 6);
  $('#st-today').textContent = confirmed.filter((a) => a.appt_date === today).length;
  $('#st-week').textContent = confirmed.filter((a) => a.appt_date <= weekEnd).length;
  $('#st-pending').textContent = pending;

  const cbox = $('#cancelled');
  cbox.replaceChildren();
  if (cancelled.length) {
    cbox.append(h('div', { class: 'notice warn', style: 'margin-bottom:6px' },
      h('b', null, 'Recently cancelled: '),
      cancelled.map((c) => `${fmtDate(c.appt_date)} ${fmtTime(c.appt_time)} — ${c.patient_name}`).join(' · ')));
  }

  const days = $('#days');
  days.replaceChildren();
  if (!confirmed.length) {
    days.append(h('div', { class: 'card empty', style: 'margin-top:16px' },
      'No confirmed appointments yet. Appointments appear here as soon as the help desk confirms them.'));
  }
  let newCount = 0;
  const byDate = new Map();
  for (const a of confirmed) byDate.set(a.appt_date, [...(byDate.get(a.appt_date) || []), a]);
  for (const [date, rows] of byDate) {
    days.append(h('section', { class: 'day-group' },
      h('h2', null, fmtDate(date, { long: true }),
        date === today ? h('span', { class: 'today' }, 'TODAY') : h('span', { class: 'fine' }, relDay(today, date)),
        h('span', { class: 'fine' }, `· ${rows.length} patient${rows.length > 1 ? 's' : ''}`)),
      rows.map((a) => {
        const isNew = seenBefore && a.confirmed_at && a.confirmed_at > seenBefore;
        if (isNew) newCount += 1;
        return h('article', { class: `dr-appt${isNew ? ' new' : ''}` },
          h('div', { class: 't' }, fmtTime(a.appt_time)),
          h('div', null,
            h('div', { class: 'p' }, a.patient_name, isNew && h('span', { class: 'new-tag' }, 'NEW')),
            h('div', { class: 'm' },
              a.mrn ? `RMC no. ${a.mrn} · ` : '',
              `Confirmed${a.confirmed_by ? ` by ${a.confirmed_by}` : ''} ${fmtStamp(a.confirmed_at)}`),
            a.notes && h('div', { class: 'notes' }, a.notes)));
      })));
  }
  document.title = `${newCount ? `(${newCount} new) ` : ''}${doctor.name} · RMC Appointments`;
  $('#updated').textContent = `Last updated ${new Date().toLocaleTimeString('en-MY', { hour: 'numeric', minute: '2-digit' })}.`;
}

setInterval(() => {
  if (!document.hidden && !$('#app').hidden) load().catch(() => {});
}, REFRESH_MS);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !$('#app').hidden) load().catch(() => {});
});

load().catch((err) => {
  document.querySelector('main').prepend(h('div', { class: 'notice error', style: 'margin-top:16px' }, err.message));
});
