import { $, api, datePieces, fmtDate, fmtPhone, fmtSessions, fmtTime, h, initials } from './common.js';

const state = {
  config: null,
  doctors: [],
  doctor: null,   // selected doctor (with sessions)
  days: [],       // [{date, slots:[{time,status}]}]
  date: null,
  time: null,
};

const sections = {
  1: $('#step-doctor'),
  2: $('#step-time'),
  3: $('#step-details'),
  4: $('#step-done'),
};

function goStep(n) {
  for (const [k, el] of Object.entries(sections)) el.hidden = Number(k) !== n;
  for (const li of document.querySelectorAll('#steps li')) {
    const s = Number(li.dataset.step);
    li.classList.toggle('active', s === n);
    li.classList.toggle('done', s < n);
    if (s === n) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
  }
  $('#steps').hidden = n === 4;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

const callHref = () => `tel:+6${state.config.clinicPhone.replace(/\D/g, '')}`;
const waHref = () => `https://wa.me/${state.config.clinicWhatsapp}`;

// ---------------------------------------------------------------- step 1: doctors

function avatarClass(i) {
  return ['avatar', 'avatar alt', 'avatar alt2'][i % 3];
}

function renderDoctors() {
  const q = $('#q').value.trim().toLowerCase();
  const spec = $('#specialty').value;
  const onlyOpen = $('#only-open').checked;
  // Doctors with online slots first; otherwise keep the specialist-list order.
  const list = state.doctors.filter((d) =>
    (!spec || d.specialty === spec) &&
    (!onlyOpen || d.next_open) &&
    (!q || `${d.name} ${d.specialty} ${d.expertise || ''}`.toLowerCase().includes(q)))
    .sort((a, b) => Number(Boolean(b.next_open)) - Number(Boolean(a.next_open)));

  const box = $('#doc-list');
  box.replaceChildren();
  if (!list.length) {
    box.append(h('p', { class: 'empty' }, 'No doctors match your search.'));
    return;
  }
  list.forEach((d, i) => {
    const avail = d.next_open
      ? h('div', { class: 'avail open' }, `Next available: ${fmtDate(d.next_open)} · ${d.open_slots} open slot${d.open_slots === 1 ? '' : 's'}`)
      : h('div', { class: 'avail none' }, `No online slots — call ${state.config.clinicPhone} to arrange`);
    box.append(h('button', {
      type: 'button', class: 'doc-card', onclick: () => selectDoctor(d.slug),
      'aria-label': `${d.name}, ${d.specialty}`,
    },
    h('span', { class: avatarClass(i), 'aria-hidden': 'true' }, initials(d.name)),
    h('span', { class: 'who' },
      h('h3', null, d.name, ' ', h('span', { class: `badge ${d.doctor_type.toLowerCase()}` }, d.doctor_type)),
      h('div', { class: 'spec' }, d.specialty),
      d.expertise && h('p', { class: 'exp' }, d.expertise),
      avail)));
  });
}

// ---------------------------------------------------------------- step 2: time

async function selectDoctor(slug, { keepDate = false } = {}) {
  const data = await api(`/api/doctors/${encodeURIComponent(slug)}/availability`);
  state.doctor = data.doctor;
  state.days = data.days;
  if (!keepDate || !state.days.some((d) => d.date === state.date)) {
    const firstOpen = state.days.find((d) => d.slots.some((s) => s.status === 'open'));
    state.date = firstOpen?.date ?? null;
  }
  state.time = null;
  renderTime();
  goStep(2);
}

function renderTime() {
  const d = state.doctor;
  const idx = state.doctors.findIndex((x) => x.slug === d.slug);
  $('#picked-doc').replaceChildren(
    h('span', { class: avatarClass(idx), 'aria-hidden': 'true' }, initials(d.name)),
    h('div', { class: 'who' },
      h('h3', null, d.name),
      h('div', { class: 'spec' }, d.specialty),
      d.sessions.length > 0 && h('div', { class: 'sessions-line' }, `Clinic: ${fmtSessions(d.sessions)}`)),
    h('button', { type: 'button', class: 'link-btn', onclick: () => goStep(1) }, 'Change'));

  const body = $('#time-body');
  body.replaceChildren();
  const openDays = state.days.filter((day) => day.slots.some((s) => s.status === 'open'));

  if (!openDays.length) {
    body.append(h('div', { class: 'notice warn', style: 'margin-top:14px' },
      d.sessions.length
        ? 'All online slots for this doctor are taken for the coming weeks. '
        : 'This doctor\'s clinic times are arranged by our help desk. ',
      'Please call or WhatsApp us and we will find a time for you.',
      h('div', { class: 'row', style: 'margin-top:10px' },
        h('a', { class: 'btn btn-primary btn-sm', href: callHref(), target: '_blank', rel: 'noopener' }, `📞 Call ${state.config.clinicPhone}`),
        h('a', { class: 'btn btn-teal btn-sm', href: waHref(), target: '_blank', rel: 'noopener' }, '💬 WhatsApp'))));
    updateContinue();
    return;
  }

  body.append(h('div', { class: 'section-label', id: 'dates-label' }, 'Choose a date'));
  const strip = h('div', { class: 'date-strip', role: 'group', 'aria-labelledby': 'dates-label' });
  for (const day of state.days) {
    const open = day.slots.filter((s) => s.status === 'open').length;
    const p = datePieces(day.date);
    strip.append(h('button', {
      type: 'button', class: `date-pill${open ? '' : ' full'}`,
      'aria-pressed': String(day.date === state.date),
      'aria-label': `${fmtDate(day.date, { long: true })}, ${open ? `${open} open` : 'fully booked'}`,
      disabled: !open,
      onclick: () => { state.date = day.date; state.time = null; renderTime(); },
    },
    h('div', { class: 'dw' }, p.wd), h('div', { class: 'dd' }, p.d), h('div', { class: 'dm' }, p.mon),
    h('div', { class: 'dc' }, open ? `${open} open` : 'Full')));
  }
  body.append(strip);

  const day = state.days.find((x) => x.date === state.date);
  body.append(h('div', { class: 'section-label', id: 'slots-label' }, `Times on ${fmtDate(state.date, { long: true })}`));
  const grid = h('div', { class: 'slot-grid', role: 'group', 'aria-labelledby': 'slots-label' });
  for (const s of day?.slots || []) {
    const taken = s.status !== 'open';
    grid.append(h('button', {
      type: 'button', class: 'slot', disabled: taken,
      'aria-pressed': String(s.time === state.time),
      'aria-label': `${fmtTime(s.time)}${taken ? ', booked' : ''}`,
      onclick: () => { state.time = s.time; renderTime(); },
    }, fmtTime(s.time), taken && h('small', null, 'Booked')));
  }
  body.append(grid);
  body.append(h('div', { class: 'legend' },
    h('span', null, h('i', { style: 'background:#fff;border:1.5px solid #CFE7E4' }), 'Open'),
    h('span', null, h('i', { style: 'background:var(--teal)' }), 'Selected'),
    h('span', null, h('i', { style: 'background:var(--line-2)' }), 'Booked')));

  // Keep the selected date in view on narrow screens.
  strip.querySelector('[aria-pressed=true]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  updateContinue();
}

function updateContinue() {
  const btn = $('#to-details');
  btn.disabled = !state.time;
  btn.textContent = state.time ? `Continue · ${fmtTime(state.time)}` : 'Choose a time';
}

// ---------------------------------------------------------------- step 3: details

function renderSummary() {
  const row = (k, v) => h('div', null, h('dt', null, k), h('dd', null, v));
  $('#summary').replaceChildren(
    row('Doctor', `${state.doctor.name} — ${state.doctor.specialty}`),
    row('Date', fmtDate(state.date, { long: true, year: true })),
    row('Time', fmtTime(state.time)));
}

function showFormError(msg) {
  const el = $('#form-error');
  el.textContent = msg;
  el.hidden = !msg;
}

async function submitBooking(e) {
  e.preventDefault();
  showFormError('');
  const f = e.target;
  const name = f.name.value.trim();
  const phone = f.phone.value.trim();
  if (name.length < 2) { showFormError('Please enter your full name.'); f.name.focus(); return; }
  if (phone.replace(/\D/g, '').length < 9) { showFormError('Please enter a valid mobile number.'); f.phone.focus(); return; }
  if (!f.consent.checked) { showFormError('Please tick the box so our help desk can contact you to confirm.'); return; }

  const btn = $('#submit-btn');
  btn.disabled = true;
  btn.textContent = 'Sending…';
  try {
    const res = await api('/api/bookings', {
      method: 'POST',
      body: {
        doctor: state.doctor.slug, date: state.date, time: state.time,
        name, phone, mrn: f.mrn.value, notes: f.notes.value,
        consent: true, website: f.website.value,
      },
    });
    renderDone(res);
    f.reset();
    goStep(4);
    loadDoctors(); // refresh "next available"
  } catch (err) {
    showFormError(err.message);
    if (err.status === 409 && /taken/i.test(err.message)) {
      // Slot went while the patient was typing — refresh the times.
      await selectDoctor(state.doctor.slug, { keepDate: true });
      $('#time-body').prepend(h('div', { class: 'notice error', style: 'margin-top:14px' }, err.message));
    }
  } finally {
    btn.disabled = false;
    btn.textContent = 'Request appointment';
  }
}

function renderDone(res) {
  $('#done-card').replaceChildren(
    h('div', { class: 'tick', 'aria-hidden': 'true' }, '✓'),
    h('h2', null, 'Request received'),
    h('p', { class: 'muted', style: 'margin:6px 0 0' },
      `${res.doctor.name} · ${fmtDate(res.date, { long: true })} at ${fmtTime(res.time)}`),
    h('div', { class: 'ref-code' }, res.ref_code),
    h('div', { class: 'fine' }, 'Your reference — please keep it (a screenshot is fine).'),
    h('div', { style: 'margin-top:12px' }, h('span', { class: 'status pending' }, 'Pending confirmation')),
    h('ol', { class: 'next-steps' },
      h('li', null, h('b', null, '1'), h('span', null, `Our help desk will call you at ${fmtPhone(res.phone)} to confirm.`)),
      h('li', null, h('b', null, '2'), h('span', null, 'Your appointment is confirmed only after that call.')),
      h('li', null, h('b', null, '3'), h('span', null, 'Please bring your IC or passport when you come.'))),
    h('div', { class: 'row', style: 'justify-content:center; margin-top:18px' },
      h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => { state.time = null; goStep(1); } }, 'Book another appointment')));
}

// ---------------------------------------------------------------- status lookup

async function lookup(e) {
  e.preventDefault();
  const out = $('#lookup-result');
  out.replaceChildren();
  try {
    const r = await api(`/api/bookings/lookup?ref=${encodeURIComponent($('#l-ref').value.trim())}&phone=${encodeURIComponent($('#l-phone').value.trim())}`);
    const label = { pending: 'Pending — we will call you to confirm', confirmed: 'Confirmed', cancelled: 'Cancelled' }[r.status];
    out.append(h('div', { class: 'notice' },
      h('div', null, h('span', { class: `status ${r.status}` }, label)),
      h('div', { style: 'margin-top:6px; color:var(--ink)' },
        `${r.doctor_name} (${r.doctor_specialty}) · ${fmtDate(r.appt_date, { long: true })} at ${fmtTime(r.appt_time)}`)));
  } catch (err) {
    out.append(h('div', { class: 'notice error' }, err.message));
  }
}

// ---------------------------------------------------------------- start

async function loadDoctors() {
  const { doctors } = await api('/api/doctors');
  state.doctors = doctors;
  renderDoctors();
}

async function init() {
  state.config = await api('/api/config');
  const phoneLink = $('#top-call');
  phoneLink.href = callHref();
  phoneLink.textContent = `📞 ${state.config.clinicPhone}`;

  await loadDoctors();
  const specs = [...new Set(state.doctors.map((d) => d.specialty))].sort();
  $('#specialty').append(...specs.map((s) => h('option', { value: s }, s)));

  $('#q').addEventListener('input', renderDoctors);
  $('#specialty').addEventListener('change', renderDoctors);
  $('#only-open').addEventListener('change', renderDoctors);
  $('#to-details').addEventListener('click', () => { renderSummary(); showFormError(''); goStep(3); $('#f-name').focus({ preventScroll: true }); });
  for (const b of document.querySelectorAll('[data-back]')) b.addEventListener('click', () => goStep(Number(b.dataset.back)));
  $('#details-form').addEventListener('submit', submitBooking);
  $('#lookup-form').addEventListener('submit', lookup);

  // Deep link: /?doctor=deenish-muniandy opens that doctor's times directly.
  const preset = new URLSearchParams(location.search).get('doctor');
  if (preset && state.doctors.some((d) => d.slug === preset)) await selectDoctor(preset);
  else goStep(1);
}

init().catch((err) => {
  $('#doc-list').replaceChildren(h('div', { class: 'notice error' },
    `Sorry — the booking system could not be loaded (${err.message}). Please call 010-968 1216.`));
});
