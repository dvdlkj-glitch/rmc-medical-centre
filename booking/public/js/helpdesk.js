import {
  $, WEEKDAYS_LONG, addDays, api, fmtDate, fmtPhone, fmtSessions, fmtStamp, fmtTime, h, relDay, toast, waLink,
} from './common.js';

const state = { me: null, today: null, tab: 'pending', doctors: [], openDoctors: new Set() };
const REFRESH_MS = 30_000;

// ---------------------------------------------------------------- auth

async function start() {
  try {
    state.me = await api('/api/helpdesk/me');
  } catch (err) {
    if (err.status === 401) return showLogin();
    throw err;
  }
  state.today = state.me.today;
  $('#login').hidden = true;
  $('#app').hidden = false;
  $('#who').hidden = false;
  $('#staff-name').textContent = `Signed in as ${state.me.name}`;
  $('#sheet-date').value = state.today;
  $('#n-date').value = state.today;
  await loadDoctors();
  switchTab(state.tab);
}

function showLogin() {
  $('#app').hidden = true;
  $('#who').hidden = true;
  $('#login').hidden = false;
  $('#lg-name').value = localStorage.getItem('rmc-staff-name') || '';
  ($('#lg-name').value ? $('#lg-pw') : $('#lg-name')).focus();
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#login-error');
  err.hidden = true;
  try {
    const name = $('#lg-name').value.trim();
    await api('/api/helpdesk/login', { method: 'POST', body: { name, password: $('#lg-pw').value } });
    try { localStorage.setItem('rmc-staff-name', name); } catch { /* private mode */ }
    $('#lg-pw').value = '';
    await start();
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
  }
});

$('#logout').addEventListener('click', async () => {
  await api('/api/helpdesk/logout', { method: 'POST' });
  showLogin();
});

/** Wrap an API call: on an expired session go back to the sign-in screen. */
async function guarded(fn) {
  try {
    return await fn();
  } catch (err) {
    if (err.status === 401) { showLogin(); return null; }
    toast(err.message);
    throw err;
  }
}

// ---------------------------------------------------------------- tabs

const loaders = {
  pending: loadPending,
  sheet: loadSheet,
  new: loadNewSlots,
  doctors: renderDoctorAdmin,
  search: runSearch,
};

function switchTab(tab) {
  state.tab = tab;
  for (const t of document.querySelectorAll('.tab')) t.setAttribute('aria-selected', String(t.dataset.tab === tab));
  for (const p of document.querySelectorAll('[data-panel]')) p.hidden = p.dataset.panel !== tab;
  loaders[tab]?.();
}
for (const t of document.querySelectorAll('.tab')) t.addEventListener('click', () => switchTab(t.dataset.tab));

// ---------------------------------------------------------------- appointment card

function whatsappText(a) {
  return `Hello ${a.patient_name}, this is Rafflesia Medical Centre regarding your appointment request ` +
    `(${a.ref_code}) with ${a.doctor_name} on ${fmtDate(a.appt_date, { long: true })} at ${fmtTime(a.appt_time)}. ` +
    'Please reply or call us at 010-968 1216 to confirm. Thank you.';
}

function apptCard(a, { showDoctor = true } = {}) {
  const overdue = a.status === 'pending' && a.appt_date < state.today;
  const log = [];
  if (a.call_attempts) log.push(`No answer ×${a.call_attempts} (last ${fmtStamp(a.last_call_at)})`);
  if (a.confirmed_at) log.push(`Confirmed by ${a.confirmed_by || '—'} · ${fmtStamp(a.confirmed_at)}`);
  if (a.cancelled_at) log.push(`Cancelled by ${a.cancelled_by || '—'} · ${fmtStamp(a.cancelled_at)}${a.cancel_reason ? ` — ${a.cancel_reason}` : ''}`);

  return h('article', { class: `appt ${a.status}` },
    h('div', { class: 'top' },
      h('div', null,
        h('div', { class: 'when' }, `${fmtDate(a.appt_date)} · ${fmtTime(a.appt_time)}`,
          h('small', { class: overdue ? 'overdue' : '' }, overdue ? 'date has passed' : relDay(state.today, a.appt_date))),
        showDoctor && h('div', { class: 'doc' }, `${a.doctor_name} — ${a.doctor_specialty}`)),
      h('span', { class: 'spacer' }),
      h('span', { class: `status ${a.status}` }, a.status)),
    h('div', null,
      h('div', { class: 'patient' }, a.patient_name),
      h('div', { class: 'meta' },
        h('span', { class: 'phone' }, h('a', { href: `tel:${a.phone}` }, `📞 ${fmtPhone(a.phone)}`)),
        h('a', { href: `${waLink(a.phone)}?text=${encodeURIComponent(whatsappText(a))}`, target: '_blank', rel: 'noopener' }, '💬 WhatsApp'),
        a.mrn && h('span', null, 'RMC no. ', h('b', null, a.mrn)),
        h('span', null, 'Ref ', h('b', null, a.ref_code)),
        h('span', null, `${a.source === 'helpdesk' ? 'Entered by help desk' : 'Requested online'} ${fmtStamp(a.created_at)}`))),
    a.notes && h('div', { class: 'notes' }, a.notes),
    log.length > 0 && h('div', { class: 'log' }, log.join(' · ')),
    h('div', { class: 'actions' }, actionButtons(a)));
}

function actionButtons(a, { small = false } = {}) {
  const cls = small ? ' btn-sm' : '';
  const out = [];
  if (a.status === 'pending') {
    out.push(h('button', { type: 'button', class: `btn btn-teal${cls}`, onclick: (e) => act(e, a, 'confirm') }, '✅ Confirm'));
    out.push(h('button', { type: 'button', class: `btn btn-ghost${cls}`, onclick: (e) => act(e, a, 'no-answer') }, '📵 No answer'));
  }
  if (a.status !== 'cancelled') {
    out.push(h('button', { type: 'button', class: `btn btn-danger${cls}`, onclick: (e) => act(e, a, 'cancel') }, '✖ Cancel'));
  }
  return out;
}

async function act(e, a, action) {
  let body = {};
  if (action === 'cancel') {
    const reason = window.prompt(`Cancel ${a.patient_name}'s appointment on ${fmtDate(a.appt_date)} at ${fmtTime(a.appt_time)}?\n\nReason (optional):`, '');
    if (reason === null) return;
    body = { reason };
  }
  e.currentTarget.disabled = true;
  try {
    await guarded(() => api(`/api/helpdesk/appointments/${a.id}/${action}`, { method: 'POST', body }));
    toast({
      confirm: `Confirmed — now showing on ${a.doctor_name}'s page`,
      'no-answer': 'Call attempt logged',
      cancel: 'Appointment cancelled — the slot is open again',
    }[action]);
  } finally {
    loaders[state.tab]?.();
    refreshCount();
  }
}

// ---------------------------------------------------------------- to call

async function loadPending() {
  const data = await guarded(() => api('/api/helpdesk/appointments?status=pending'));
  if (!data) return;
  state.today = data.today;
  const list = $('#pending-list');
  list.replaceChildren();
  if (!data.appointments.length) {
    list.append(h('div', { class: 'card empty' }, '🎉 No requests waiting. New online requests appear here automatically.'));
  }
  for (const a of data.appointments) list.append(apptCard(a));
  setCount(data.appointments.length);
  $('#pending-updated').textContent = `Updated ${new Date().toLocaleTimeString('en-MY', { hour: 'numeric', minute: '2-digit' })}`;
}

function setCount(n) {
  const badge = $('#pending-count');
  badge.textContent = n;
  badge.hidden = !n;
  document.title = `${n ? `(${n}) ` : ''}Help Desk · RMC Appointments`;
}

async function refreshCount() {
  try {
    const c = await api('/api/helpdesk/counts');
    setCount(c.pending);
  } catch { /* shown on next action */ }
}

$('#refresh-pending').addEventListener('click', loadPending);

setInterval(() => {
  if (document.hidden || $('#app').hidden) return;
  if (state.tab === 'pending') loadPending();
  else refreshCount();
}, REFRESH_MS);

// ---------------------------------------------------------------- day sheet

async function loadSheet() {
  const date = $('#sheet-date').value || state.today;
  $('#sheet-title').textContent = `${fmtDate(date, { long: true, year: true })} — ${relDay(state.today, date)}`;
  const data = await guarded(() => api(`/api/helpdesk/appointments?date=${date}`));
  if (!data) return;
  const body = $('#sheet-body');
  body.replaceChildren();
  if (!data.appointments.length) {
    body.append(h('div', { class: 'card empty' }, 'No appointments on this day.'));
    return;
  }
  const byDoctor = new Map();
  for (const a of data.appointments) byDoctor.set(a.doctor_name, [...(byDoctor.get(a.doctor_name) || []), a]);
  const headers = ['Time', 'Patient', 'Phone', 'RMC no.', 'Status', 'Notes', ''];
  for (const [doctor, rows] of byDoctor) {
    const live = rows.filter((r) => r.status !== 'cancelled').length;
    const table = h('table', { class: 'sheet' },
      h('thead', null, h('tr', null, headers.map((t) => h('th', null, t)))),
      h('tbody', null, rows.map(sheetRow)));
    body.append(h('section', { class: 'sheet-doc' },
      h('h3', null, doctor, ' ', h('small', null, `${rows[0].doctor_specialty} · ${live} booked`)),
      h('div', { class: 'table-scroll' }, table)));
  }
}

function sheetRow(a) {
  return h('tr', { class: a.status },
    h('td', { class: 't' }, fmtTime(a.appt_time)),
    h('td', null, a.patient_name),
    h('td', null, h('a', { href: `tel:${a.phone}` }, fmtPhone(a.phone))),
    h('td', null, a.mrn || ''),
    h('td', null, h('span', { class: `status ${a.status}` }, a.status)),
    h('td', null, a.notes || ''),
    h('td', { class: 'actions' },
      h('div', { class: 'row', style: 'flex-wrap:nowrap' }, actionButtons(a, { small: true }))));
}

$('#sheet-date').addEventListener('change', loadSheet);
$('#sheet-prev').addEventListener('click', () => { $('#sheet-date').value = addDays($('#sheet-date').value || state.today, -1); loadSheet(); });
$('#sheet-next').addEventListener('click', () => { $('#sheet-date').value = addDays($('#sheet-date').value || state.today, 1); loadSheet(); });
$('#sheet-today').addEventListener('click', () => { $('#sheet-date').value = state.today; loadSheet(); });
$('#sheet-print').addEventListener('click', () => window.print());

// ---------------------------------------------------------------- phone booking

async function loadDoctors() {
  const data = await guarded(() => api('/api/helpdesk/doctors'));
  if (!data) return;
  state.doctors = data.doctors;
  const sel = $('#n-doctor');
  const current = sel.value;
  sel.replaceChildren(h('option', { value: '' }, 'Choose a doctor…'),
    ...state.doctors.map((d) => h('option', { value: d.id }, `${d.name} — ${d.specialty}${d.active ? '' : ' (hidden)'}`)));
  sel.value = current;
}

let slotsRequest = 0;

async function loadNewSlots() {
  // Doctor and date can change quickly; only the latest request may draw the slots.
  const request = ++slotsRequest;
  const box = $('#n-slots');
  const id = $('#n-doctor').value;
  const date = $('#n-date').value;
  if (!id || !date) {
    box.replaceChildren(h('span', { class: 'fine' }, 'Choose a doctor and date to see their session times.'));
    return;
  }
  const data = await guarded(() => api(`/api/helpdesk/doctors/${id}/day?date=${date}`));
  if (!data || request !== slotsRequest) return;
  box.replaceChildren();
  if (data.off) box.append(h('div', { class: 'notice warn', style: 'grid-column:1/-1' }, `Doctor is away this day${data.off.reason ? ` (${data.off.reason})` : ''}.`));
  if (!data.slots.length && !data.off) {
    box.append(h('span', { class: 'fine', style: 'grid-column:1/-1' }, 'No clinic session on this day — enter a time below if the doctor agreed to see the patient.'));
  }
  for (const s of data.slots) {
    box.append(h('button', {
      type: 'button', class: 'slot', disabled: s.status !== 'open',
      'aria-pressed': String($('#n-time').value === s.time),
      onclick: () => { $('#n-time').value = s.time; loadNewSlots(); },
    }, fmtTime(s.time), s.status !== 'open' && h('small', null, 'Booked')));
  }
}

$('#n-doctor').addEventListener('change', () => { $('#n-time').value = ''; loadNewSlots(); });
$('#n-date').addEventListener('change', () => { $('#n-time').value = ''; loadNewSlots(); });
$('#n-time').addEventListener('change', loadNewSlots);

$('#new-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#new-error');
  err.hidden = true;
  const body = {
    doctor_id: Number($('#n-doctor').value),
    date: $('#n-date').value,
    time: $('#n-time').value,
    name: $('#n-name').value,
    phone: $('#n-phone').value,
    mrn: $('#n-mrn').value,
    notes: $('#n-notes').value,
  };
  if (!body.doctor_id || !body.date || !body.time) {
    err.textContent = 'Choose a doctor, date and time.';
    err.hidden = false;
    return;
  }
  try {
    const res = await api('/api/helpdesk/appointments', { method: 'POST', body });
    toast(`Saved and confirmed · ${res.ref_code}`);
    for (const id of ['#n-name', '#n-phone', '#n-mrn', '#n-notes', '#n-time']) $(id).value = '';
    loadNewSlots();
  } catch (ex) {
    if (ex.status === 401) return showLogin();
    err.textContent = ex.message;
    err.hidden = false;
  }
});

// ---------------------------------------------------------------- doctors & schedules

function doctorPageUrl(d) {
  return `${location.origin}/doctor/${d.slug}`;
}

function renderDoctorAdmin() {
  const filter = $('#doc-filter').value.trim().toLowerCase();
  const box = $('#doctor-admin');
  box.replaceChildren();
  for (const d of state.doctors) {
    if (filter && !`${d.name} ${d.specialty}`.toLowerCase().includes(filter)) continue;
    const det = h('details', { open: state.openDoctors.has(d.id) },
      h('summary', null,
        h('span', { class: 'who' },
          h('b', null, d.name), ' ',
          !d.active && h('span', { class: 'badge' }, 'Hidden'),
          h('div', { class: 'spec' }, d.specialty, d.sessions.length ? ` · ${fmtSessions(d.sessions)}` : '')),
        d.sessions.length
          ? h('span', { class: 'badge resident' }, `${d.sessions.length} session${d.sessions.length > 1 ? 's' : ''}`)
          : h('span', { class: 'badge visiting' }, 'No sessions'),
        h('span', { class: `badge${d.pin_set ? ' resident' : ''}` }, d.pin_set ? 'PIN set' : 'No PIN')),
      h('div', { class: 'body' },
        sessionsEditor(d),
        timeOffEditor(d),
        doctorPageEditor(d)));
    det.addEventListener('toggle', () => {
      if (det.open) state.openDoctors.add(d.id); else state.openDoctors.delete(d.id);
    });
    box.append(det);
  }
}

$('#doc-filter').addEventListener('input', renderDoctorAdmin);

async function adminCall(path, opts, message) {
  await guarded(() => api(path, opts));
  if (message) toast(message);
  await loadDoctors();
  renderDoctorAdmin();
}

function timeInput(id, value) {
  return h('input', { type: 'time', id, value, step: '300', required: true });
}

function sessionsEditor(d) {
  const ids = { wd: `wd-${d.id}`, st: `st-${d.id}`, en: `en-${d.id}`, sl: `sl-${d.id}` };
  return h('div', null,
    h('h4', null, 'Weekly clinic sessions'),
    h('div', { class: 'chips', style: 'margin-bottom:8px' },
      d.sessions.length ? d.sessions.map((s) => h('span', { class: 'chip' },
        `${WEEKDAYS_LONG[s.weekday]} ${fmtTime(s.start_time)}–${fmtTime(s.end_time)} · ${s.slot_minutes} min slots`,
        h('button', {
          type: 'button', 'aria-label': 'Remove session',
          onclick: () => window.confirm('Remove this weekly session? Existing appointments are kept.') &&
            adminCall(`/api/helpdesk/sessions/${s.id}`, { method: 'DELETE' }, 'Session removed'),
        }, '×'))) : h('span', { class: 'fine' }, 'None yet — patients cannot book this doctor online.')),
    h('form', {
      class: 'inline-form',
      onsubmit: (e) => {
        e.preventDefault();
        adminCall(`/api/helpdesk/doctors/${d.id}/sessions`, {
          method: 'POST',
          body: {
            weekday: Number($(`#${ids.wd}`).value), start_time: $(`#${ids.st}`).value,
            end_time: $(`#${ids.en}`).value, slot_minutes: Number($(`#${ids.sl}`).value),
          },
        }, 'Session added');
      },
    },
    h('select', { id: ids.wd, 'aria-label': 'Day' }, WEEKDAYS_LONG.map((w, i) => h('option', { value: i }, w))),
    timeInput(ids.st, '09:00'), h('span', { class: 'fine' }, 'to'), timeInput(ids.en, '12:00'),
    h('select', { id: ids.sl, 'aria-label': 'Slot length' },
      [10, 15, 20, 30, 45, 60].map((m) => h('option', { value: m, selected: m === 30 }, `${m} min`))),
    h('button', { type: 'submit', class: 'btn btn-teal btn-sm' }, 'Add session')));
}

function timeOffEditor(d) {
  const dateId = `off-${d.id}`;
  const reasonId = `offr-${d.id}`;
  return h('div', null,
    h('h4', null, 'Leave / days away'),
    h('div', { class: 'chips', style: 'margin-bottom:8px' },
      d.time_off.length ? d.time_off.map((o) => h('span', { class: 'chip off' },
        `${fmtDate(o.off_date)}${o.reason ? ` · ${o.reason}` : ''}`,
        h('button', {
          type: 'button', 'aria-label': 'Remove day off',
          onclick: () => adminCall(`/api/helpdesk/time-off/${o.id}`, { method: 'DELETE' }, 'Day reopened'),
        }, '×'))) : h('span', { class: 'fine' }, 'No upcoming leave.')),
    h('form', {
      class: 'inline-form',
      onsubmit: (e) => {
        e.preventDefault();
        adminCall(`/api/helpdesk/doctors/${d.id}/time-off`, {
          method: 'POST', body: { date: $(`#${dateId}`).value, reason: $(`#${reasonId}`).value },
        }, 'Day closed for online booking');
      },
    },
    h('input', { type: 'date', id: dateId, min: state.today, required: true, 'aria-label': 'Date' }),
    h('input', { type: 'text', id: reasonId, placeholder: 'Reason (optional)', maxlength: 100 }),
    h('button', { type: 'submit', class: 'btn btn-ghost btn-sm' }, 'Close this day')),
    h('p', { class: 'fine', style: 'margin:6px 0 0' }, 'Closing a day does not cancel appointments already booked — check the day sheet.'));
}

function doctorPageEditor(d) {
  const pinId = `pin-${d.id}`;
  const url = doctorPageUrl(d);
  return h('div', null,
    h('h4', null, "Doctor's own page"),
    h('div', { class: 'inline-form', style: 'margin-bottom:8px' },
      h('input', { type: 'text', value: url, readonly: true, 'aria-label': 'Doctor page link', onclick: (e) => e.target.select() }),
      h('button', {
        type: 'button', class: 'btn btn-ghost btn-sm',
        onclick: async () => { try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch { toast('Select the link and copy it'); } },
      }, 'Copy link'),
      h('a', { class: 'btn btn-ghost btn-sm', href: url, target: '_blank', rel: 'noopener' }, 'Open')),
    h('form', {
      class: 'inline-form',
      onsubmit: (e) => {
        e.preventDefault();
        const pin = $(`#${pinId}`).value.trim();
        adminCall(`/api/helpdesk/doctors/${d.id}/pin`, { method: 'POST', body: { pin } },
          'PIN saved — give it to the doctor privately');
      },
    },
    h('input', { type: 'text', id: pinId, inputmode: 'numeric', pattern: '\\d{4,8}', maxlength: 8, placeholder: '4–8 digit PIN', autocomplete: 'off', 'aria-label': 'New PIN', required: true }),
    h('button', { type: 'submit', class: 'btn btn-ghost btn-sm' }, d.pin_set ? 'Change PIN' : 'Set PIN')),
    h('label', { class: 'check', style: 'margin-top:12px' },
      h('input', {
        type: 'checkbox', checked: d.active,
        onchange: (e) => adminCall(`/api/helpdesk/doctors/${d.id}/active`, { method: 'POST', body: { active: e.target.checked } },
          e.target.checked ? 'Shown on booking page' : 'Hidden from booking page'),
      }),
      h('span', null, 'Show this doctor on the online booking page')));
}

// ---------------------------------------------------------------- search

async function runSearch() {
  const q = $('#search-q').value.trim();
  const list = $('#search-list');
  if (q.length < 2) { list.replaceChildren(); $('#search-q').focus(); return; }
  const data = await guarded(() => api(`/api/helpdesk/appointments?q=${encodeURIComponent(q)}`));
  if (!data) return;
  list.replaceChildren();
  if (!data.appointments.length) list.append(h('div', { class: 'card empty' }, 'Nothing found.'));
  for (const a of data.appointments) list.append(apptCard(a));
}

$('#search-form').addEventListener('submit', (e) => { e.preventDefault(); runSearch(); });

start().catch((err) => {
  document.querySelector('main').prepend(h('div', { class: 'notice error', style: 'margin-top:16px' }, err.message));
});
