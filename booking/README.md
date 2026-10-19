# RMC Specialist Appointment Booking

Online appointment requests for Rafflesia Medical Centre, replacing the hand-written
appointment book. Runs on **Railway**, stores data in **Supabase** (Postgres), and is
embedded in the RMC Streamlit web page.

| Page | Who | What it does |
|---|---|---|
| `/` (and `/?embed=1` inside the website) | Patients | See each doctor's open slots, pick a time, leave name + phone. Request is **pending**. |
| `/helpdesk` | Help desk staff | "To call" list → call the patient → **Confirm** / No answer / Cancel. Day sheet (like the handbook), phone/walk-in bookings, doctor schedules, PINs. |
| `/doctor/<name>` | Each doctor | PIN-protected list of their **confirmed** appointments. Refreshes every 30 s; newly confirmed ones are tagged NEW. |

## How a booking flows

1. Patient picks a doctor and an open slot → enters name, mobile, optional RMC number and reason.
2. The slot is held immediately (nobody else can take it) and the request appears under **To call** on the help desk page, with tap-to-call and a pre-filled WhatsApp message.
3. Help desk calls the patient and presses **✅ Confirm** (their name is recorded) — or logs **No answer** and tries again, or **Cancel** (frees the slot).
4. The appointment appears on the doctor's own page as confirmed.

Patients can check their status with the reference code (e.g. `RMC-7K3Q9P`) + phone number.

## Doctor schedules

The 32 doctors from *RMC_Medical_Specialist_List 2026.pdf* are loaded automatically.
Only two have weekly sessions pre-filled (from the existing web page):

- Dr. Deenish Muniandy — Sunday 8:00 AM – 1:00 PM
- Dr. Rajesh Kumar — Saturday 10:00 AM – 2:00 PM

For every other doctor, open **Help Desk → Doctors & schedules**, add their weekly sessions
(day, start, end, slot length) and any leave days. Doctors without sessions still appear on the
booking page with "call to arrange". Use **Show this doctor on the online booking page** to hide one.

To give a doctor their page: in the same panel, **Set PIN**, then **Copy link** and send both to the
doctor privately (e.g. `https://<your-app>.up.railway.app/doctor/deenish-muniandy`).

## Deploy

### 1. Supabase (database)

Use a Supabase project for RMC. The tables (`rmc_doctors`, `rmc_doctor_sessions`,
`rmc_doctor_time_off`, `rmc_appointments`) are created automatically the first time the server
starts — or run the SQL in `db/migrations/` in the Supabase SQL editor.

Copy the connection string: **Project Settings → Database → Connection string → Session pooler**
(port 5432, IPv4-compatible) and put your database password in it.

Row Level Security is on with no policies, so the public `anon` key (used by the Streamlit
interest counter) **cannot** read patient data. Only this server can.

### 2. Railway (this server)

1. Push this repository to GitHub (it already is: `rmc-medical-centre`).
2. Railway → **New Project → Deploy from GitHub repo** → pick `rmc-medical-centre`.
3. Service **Settings → Root Directory** = `booking`.
4. **Variables** — add (see `.env.example`):
   - `DATABASE_URL` — the Supabase session-pooler string
   - `HELPDESK_PASSWORD` — the help desk password
   - `SESSION_SECRET` — a long random string
   - `NODE_ENV` = `production`
5. **Settings → Networking → Generate Domain**. Open `https://<domain>/healthz` → `{"ok":true}`.

### 3. RMC web page (Streamlit Cloud)

In the Streamlit app's **Settings → Secrets**, add:

```toml
[booking]
url = "https://<your-railway-domain>"
```

The page then shows the booking section (with a **Book an Appointment** button in the hero, and
**Book online →** links on the Sunday / Saturday clinic cards).

## Run locally

```bash
cd booking
npm install
cp .env.example .env      # then set LOCAL_DB_DIR=./.localdb (or DATABASE_URL), HELPDESK_PASSWORD
npm run dev               # http://localhost:8080 , /helpdesk , /doctor/deenish-muniandy
npm test                  # end-to-end test on a throwaway local database
```

## Settings

| Variable | Default | Meaning |
|---|---|---|
| `BOOKING_WINDOW_DAYS` | 30 | How far ahead patients can book |
| `MIN_NOTICE_MINUTES` | 120 | Slots sooner than this are hidden online (help desk can still book them) |
| `MAX_ACTIVE_PER_PHONE` | 3 | Upcoming requests allowed per phone number |
| `CLINIC_PHONE` / `CLINIC_WHATSAPP` | 010-968 1216 / 60109681216 | Shown on the pages |
| `AUTO_MIGRATE` | true | Create/update tables on start-up |

## Privacy & security notes

- Patient details are only returned to signed-in help desk staff; doctor pages show name, RMC number
  and notes, not phone numbers.
- Booking form asks for consent to be contacted; a hidden honeypot field and rate limits deter spam.
- Login cookies are HttpOnly, signed, and expire (help desk 12 h, doctor 30 days). Changing the help
  desk password or a doctor's PIN signs existing sessions out.
- Staff pages cannot be embedded in other sites; only the public booking page can.
- Malaysia's PDPA applies to the patient data collected — keep the help desk password private and
  give each doctor their own PIN.
