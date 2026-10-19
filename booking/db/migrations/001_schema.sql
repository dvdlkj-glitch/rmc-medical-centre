-- RMC appointment booking — core schema.
-- Idempotent: safe to run more than once (the server runs it on start-up).
-- Row Level Security is enabled with NO policies, so the public Supabase
-- anon / authenticated keys cannot read or write patient data. Only the
-- booking server (connecting as the table owner) can.

create table if not exists rmc_doctors (
  id              integer generated always as identity primary key,
  slug            text not null unique,
  name            text not null,
  specialty       text not null,
  qualifications  text,
  expertise       text,
  doctor_type     text not null default 'Sessional'
                  check (doctor_type in ('Resident', 'Sessional', 'Visiting')),
  sort_order      integer not null default 0,
  active          boolean not null default true,
  pin_hash        text,              -- scrypt hash of the doctor's page PIN
  created_at      timestamptz not null default now()
);

-- Weekly clinic sessions: e.g. every Sunday 08:00-13:00 in 30-minute slots.
create table if not exists rmc_doctor_sessions (
  id            integer generated always as identity primary key,
  doctor_id     integer not null references rmc_doctors(id) on delete cascade,
  weekday       smallint not null check (weekday between 0 and 6),  -- 0 = Sunday
  start_time    time not null,
  end_time      time not null,
  slot_minutes  smallint not null default 30 check (slot_minutes between 5 and 240),
  created_at    timestamptz not null default now(),
  check (end_time > start_time)
);
create index if not exists rmc_doctor_sessions_doctor_idx on rmc_doctor_sessions (doctor_id);

-- Leave / days the doctor is not in.
create table if not exists rmc_doctor_time_off (
  id          integer generated always as identity primary key,
  doctor_id   integer not null references rmc_doctors(id) on delete cascade,
  off_date    date not null,
  reason      text,
  created_at  timestamptz not null default now(),
  unique (doctor_id, off_date)
);

create table if not exists rmc_appointments (
  id              integer generated always as identity primary key,
  ref_code        text not null unique,
  doctor_id       integer not null references rmc_doctors(id),
  appt_date       date not null,
  appt_time       time not null,
  patient_name    text not null,
  phone           text not null,
  mrn             text,              -- RMC patient number, if the patient has one
  notes           text,
  status          text not null default 'pending'
                  check (status in ('pending', 'confirmed', 'cancelled')),
  source          text not null default 'online' check (source in ('online', 'helpdesk')),
  call_attempts   integer not null default 0,
  last_call_at    timestamptz,
  confirmed_at    timestamptz,
  confirmed_by    text,
  cancelled_at    timestamptz,
  cancelled_by    text,
  cancel_reason   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- One live booking per doctor per slot. Cancelling frees the slot again.
create unique index if not exists rmc_appointments_live_slot_uniq
  on rmc_appointments (doctor_id, appt_date, appt_time)
  where status in ('pending', 'confirmed');
create index if not exists rmc_appointments_status_date_idx on rmc_appointments (status, appt_date);
create index if not exists rmc_appointments_doctor_date_idx on rmc_appointments (doctor_id, appt_date);
create index if not exists rmc_appointments_phone_idx on rmc_appointments (phone);

alter table rmc_doctors         enable row level security;
alter table rmc_doctor_sessions enable row level security;
alter table rmc_doctor_time_off enable row level security;
alter table rmc_appointments    enable row level security;
