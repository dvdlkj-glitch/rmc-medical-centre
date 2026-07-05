# -*- coding: utf-8 -*-
"""Rafflesia Medical Centre (RMC) — promotional web page.

Content follows the Malaysian healthcare-advertising compliance checklist:
factual wording, no superlatives or cure claims, no testimonials, modest
doctor information, package pricing with terms, and a publication date.
"""

import base64
from pathlib import Path

import streamlit as st

st.set_page_config(
    page_title="Rafflesia Medical Centre (RMC) — Kota Kinabalu, Sabah",
    page_icon="🌺",
    layout="wide",
    initial_sidebar_state="collapsed",
)

ASSETS = Path(__file__).parent / "assets"

PINK = "#D6336C"
PINK_D = "#B02458"
TEAL = "#00857C"
TEAL_D = "#046B64"
NAVY = "#173A56"
INK = "#2B3A46"
CREAM = "#FBF8F4"

PHONE_DISPLAY = "010-968 1216"
WHATSAPP_URL = "https://wa.me/60109681216"
TEL_URL = "tel:+60109681216"
FACEBOOK_URL = "https://www.facebook.com/rafflesiamedicalcentre/"
ADDRESS = ("Lot 4-8, Lot 9 (Ground Floor), Millennium Commercial Centre, "
           "Jalan Lintas, Kepayan, 88200 Kota Kinabalu, Sabah, Malaysia")
MAP_EMBED = ("https://maps.google.com/maps?q=Rafflesia%20Medical%20Centre%20"
             "Millennium%20Commercial%20Centre%20Kepayan%20Kota%20Kinabalu&z=16&output=embed")


@st.cache_data
def img_b64(name: str) -> str:
    return base64.b64encode((ASSETS / name).read_bytes()).decode()


# ---------------------------------------------------------------- global CSS
st.markdown(f"""
<style>
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Caveat:wght@600&display=swap');

html, body, [class*="css"], .stMarkdown {{
    font-family: 'Plus Jakarta Sans', 'Segoe UI', sans-serif;
}}
.stApp {{ background: {CREAM}; }}
#MainMenu, footer, header {{ visibility: hidden; }}
.block-container {{ padding: 0 1.2rem 3rem; max-width: 1120px; }}

/* ---------- hero ---------- */
.rmc-hero {{
    position: relative; border-radius: 22px; overflow: hidden;
    margin-top: .8rem;
    background:
      linear-gradient(100deg, rgba(9,42,60,.88) 0%, rgba(9,42,60,.62) 46%, rgba(9,42,60,.18) 100%),
      url(data:image/jpeg;base64,{img_b64("building.jpg")}) center 62%/cover no-repeat;
    padding: 4.6rem 3.2rem;
    color: #fff;
}}
.rmc-hero .eyebrow {{
    display:inline-flex; align-items:center; gap:.5rem;
    background: rgba(255,255,255,.14); backdrop-filter: blur(4px);
    border: 1px solid rgba(255,255,255,.25);
    padding: .35rem 1rem; border-radius: 999px;
    font-size: .8rem; font-weight: 600; letter-spacing: .12em;
}}
.rmc-hero h1 {{
    font-size: clamp(2.1rem, 4.6vw, 3.4rem); font-weight: 800;
    line-height: 1.08; margin: 1.1rem 0 .4rem; color:#fff;
}}
.rmc-hero h1 .pink {{ color: #FF7BA9; }}
.rmc-hero .tagline {{
    font-family: 'Caveat', cursive; font-size: 1.7rem; color: #8FE3DA;
    margin: 0 0 1rem;
}}
.rmc-hero p.lead {{ max-width: 560px; font-size: 1.02rem; line-height: 1.65; color: #E8F1F5; }}
.chip-row {{ display:flex; flex-wrap:wrap; gap:.5rem; margin: 1.3rem 0 1.7rem; }}
.chip {{
    background: rgba(255,255,255,.13); border:1px solid rgba(255,255,255,.28);
    color:#fff; padding:.38rem .95rem; border-radius:999px;
    font-size:.82rem; font-weight:600;
}}
.btn-row {{ display:flex; flex-wrap:wrap; gap:.8rem; }}
.rmc-btn {{
    display:inline-block; text-decoration:none !important; font-weight:700;
    padding:.78rem 1.7rem; border-radius:999px; font-size:.95rem;
    transition: transform .15s ease, box-shadow .15s ease;
}}
.rmc-btn:hover {{ transform: translateY(-2px); box-shadow: 0 10px 24px rgba(0,0,0,.25); }}
.rmc-btn.primary {{ background:{PINK}; color:#fff !important; }}
.rmc-btn.ghost {{ background:rgba(255,255,255,.92); color:{NAVY} !important; }}

/* ---------- section headers ---------- */
.sec {{ margin-top: 3.2rem; }}
.sec .kicker {{
    color:{PINK}; font-weight:700; letter-spacing:.14em; font-size:.78rem;
    text-transform: uppercase;
}}
.sec h2 {{
    color:{NAVY}; font-weight:800; font-size: clamp(1.5rem, 3vw, 2.1rem);
    margin:.2rem 0 .4rem;
}}
.sec .sub {{ color:#5F6E78; font-size:.95rem; max-width: 640px; }}

/* ---------- cards ---------- */
.card-grid {{ display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:1rem; margin-top:1.4rem; }}
.svc-card {{
    background:#fff; border:1px solid #EDE6DB; border-radius:16px;
    padding:1.4rem 1.3rem; transition: transform .18s ease, box-shadow .18s ease;
}}
.svc-card:hover {{ transform: translateY(-4px); box-shadow: 0 14px 30px rgba(23,58,86,.10); }}
.svc-card .ico {{
    width:46px; height:46px; border-radius:13px; display:flex; align-items:center;
    justify-content:center; font-size:1.35rem; margin-bottom:.8rem;
}}
.svc-card h4 {{ color:{NAVY}; font-size:1.02rem; font-weight:700; margin:0 0 .35rem; }}
.svc-card p {{ color:#5F6E78; font-size:.86rem; line-height:1.55; margin:0; }}

/* ---------- clinic schedule ---------- */
.clinic-card {{
    background:#fff; border-radius:18px; padding:1.5rem 1.6rem;
    border:1px solid #EDE6DB; border-top:5px solid {TEAL};
}}
.clinic-card.pink {{ border-top-color:{PINK}; }}
.clinic-card .day {{
    display:inline-block; background:{TEAL}; color:#fff; font-weight:700;
    font-size:.78rem; padding:.28rem .85rem; border-radius:999px; letter-spacing:.06em;
}}
.clinic-card.pink .day {{ background:{PINK}; }}
.clinic-card h4 {{ color:{NAVY}; margin:.7rem 0 .2rem; font-size:1.15rem; font-weight:800; }}
.clinic-card .doc {{ color:{TEAL_D}; font-weight:600; font-size:.92rem; }}
.clinic-card.pink .doc {{ color:{PINK_D}; }}
.clinic-card p {{ color:#5F6E78; font-size:.88rem; margin:.5rem 0 0; line-height:1.6; }}

/* ---------- highlight panels ---------- */
.hl-panel {{
    border-radius:18px; padding:1.6rem 1.7rem; height:100%;
    border:1px solid #E3EFED; background:#EAF5F4;
}}
.hl-panel.pink {{ background:#FCEEF3; border-color:#F4DCE6; }}
.hl-panel h3 {{ color:{TEAL_D}; font-size:1.25rem; font-weight:800; margin:0 0 .6rem; }}
.hl-panel.pink h3 {{ color:{PINK_D}; }}
.price-chip {{
    display:inline-block; background:{PINK}; color:#fff; font-weight:800;
    padding:.35rem 1.1rem; border-radius:999px; font-size:.95rem; margin-bottom:.7rem;
}}
.hl-panel ul {{ margin:.4rem 0 0 1.1rem; padding:0; }}
.hl-panel li {{ color:{INK}; font-size:.88rem; margin-bottom:.32rem; line-height:1.5; }}
.hl-panel .fine, .fine {{ color:#8A97A0; font-size:.75rem; font-style:italic; margin-top:.8rem; }}
.pkg-table {{ width:100%; border-collapse:collapse; margin-top:.6rem; background:#fff; border-radius:10px; overflow:hidden; }}
.pkg-table th {{ background:{NAVY}; color:#fff; text-align:left; padding:.5rem .8rem; font-size:.8rem; }}
.pkg-table td {{ padding:.48rem .8rem; font-size:.83rem; color:{INK}; border-bottom:1px solid #F1EBE2; }}
.pkg-table tr:last-child td {{ border-bottom:none; }}
.pkg-table td:first-child {{ font-weight:600; color:{NAVY}; white-space:nowrap; }}

/* ---------- encourage band ---------- */
.encourage {{
    margin-top:3rem; background:linear-gradient(120deg, #FCEEF3, #EAF5F4);
    border:1px solid #F2DFE8; border-radius:20px; padding:2rem 2.4rem;
    display:flex; align-items:center; gap:1.6rem; flex-wrap:wrap;
}}
.encourage .sunny {{ font-size:2.6rem; }}
.encourage h3 {{ color:{PINK_D}; margin:0 0 .3rem; font-weight:800; font-size:1.3rem; }}
.encourage p {{ color:{INK}; margin:0; font-size:.95rem; max-width:640px; line-height:1.6; }}

/* ---------- award ---------- */
.award-strip {{
    margin-top:3rem; background:#fff; border:1px solid #E9DFC8; border-radius:18px;
    padding:1.4rem 1.8rem; display:flex; align-items:center; gap:1.6rem; flex-wrap:wrap;
}}
.award-strip img {{ height:86px; }}
.award-strip .t {{ color:#A98B3F; font-weight:700; letter-spacing:.12em; font-size:.75rem; }}
.award-strip p {{ color:{INK}; margin:.25rem 0 0; font-size:.9rem; max-width:640px; line-height:1.55; }}

/* ---------- gallery ---------- */
.poster-img img {{ border-radius:14px; border:1px solid #EDE6DB; }}

/* ---------- visit ---------- */
.visit-card {{
    background:#fff; border:1px solid #EDE6DB; border-radius:18px; padding:1.6rem 1.7rem;
}}
.visit-card h4 {{ color:{NAVY}; font-weight:800; margin:0 0 .6rem; }}
.visit-card p {{ color:#5F6E78; font-size:.92rem; line-height:1.65; }}
.visit-card .phone {{ color:{PINK_D}; font-size:1.5rem; font-weight:800; margin:.2rem 0; }}
.map-frame {{ border-radius:18px; overflow:hidden; border:1px solid #EDE6DB; }}

/* ---------- footer ---------- */
.rmc-footer {{
    margin-top:3.4rem; background:{NAVY}; border-radius:20px; color:#B9CFDC;
    padding:2.2rem 2.4rem; font-size:.8rem; line-height:1.7;
}}
.rmc-footer .brand {{ color:#fff; font-weight:800; font-size:1.05rem; }}
.rmc-footer a {{ color:#8FE3DA; text-decoration:none; font-weight:600; }}
.rmc-footer .divider {{ border-top:1px solid rgba(255,255,255,.15); margin:1.1rem 0; }}

/* ---------- floating WhatsApp ---------- */
.wa-fab {{
    position:fixed; right:26px; bottom:26px; z-index:999;
    background:#25D366; color:#fff !important; width:58px; height:58px;
    border-radius:50%; display:flex; align-items:center; justify-content:center;
    font-size:1.8rem; text-decoration:none !important;
    box-shadow:0 10px 26px rgba(37,211,102,.45);
    transition: transform .15s ease;
}}
.wa-fab:hover {{ transform:scale(1.08); }}

@media (max-width: 700px) {{
    .rmc-hero {{ padding: 2.6rem 1.4rem; }}
    .block-container {{ padding: 0 .8rem 3rem; }}
}}
</style>
""", unsafe_allow_html=True)

# ---------------------------------------------------------------- hero
st.markdown(f"""
<div class="rmc-hero">
  <span class="eyebrow">🌺 RAFFLESIA MEDICAL CENTRE · KOTA KINABALU</span>
  <h1>Caring for you and your family,<br><span class="pink">close to home.</span></h1>
  <div class="tagline">Your Affordable Quality Health Care Centre</div>
  <p class="lead">Rafflesia Medical Centre (RMC) is a private healthcare centre in Kepayan,
  Kota Kinabalu, providing appointment-based consultation, selected specialist clinics,
  vaccination services, allergy testing and health screening for the whole family.</p>
  <div class="chip-row">
    <span class="chip">🩺 Specialist Clinics</span>
    <span class="chip">💉 Vaccination</span>
    <span class="chip">🌼 Allergy Testing</span>
    <span class="chip">✅ Health Screening</span>
    <span class="chip">💬 Consultation</span>
  </div>
  <div class="btn-row">
    <a class="rmc-btn primary" href="{WHATSAPP_URL}" target="_blank">💬 WhatsApp {PHONE_DISPLAY}</a>
    <a class="rmc-btn ghost" href="{TEL_URL}">📞 Call Customer Service</a>
  </div>
</div>
""", unsafe_allow_html=True)

# ---------------------------------------------------------------- encouragement
st.markdown("""
<div class="encourage">
  <div class="sunny">☀️</div>
  <div>
    <h3>It's okay to just come and ask!</h3>
    <p>You don't have to feel unwell to visit — a relaxed chat or a simple check-up gives you
    early answers and peace of mind. Our team is happy to see you at any stage, and weekend
    clinic sessions mean you don't need to take leave. 💗</p>
  </div>
</div>
""", unsafe_allow_html=True)

# ---------------------------------------------------------------- services
st.markdown("""
<div class="sec">
  <div class="kicker">Our Services</div>
  <h2>Available services include</h2>
  <p class="sub">Service availability is subject to clinic schedule and appointment —
  please contact us to confirm before your visit.</p>
</div>
""", unsafe_allow_html=True)

services = [
    ("🩺", "#E3F2F0", "Specialist Clinic Sessions",
     "Scheduled paediatric (baby & child) clinic and pain-management consultation sessions on selected days."),
    ("💉", "#FBE7EF", "Vaccination & Immunisation",
     "Routine and supplementary vaccinations, including seasonal influenza vaccination for eligible groups."),
    ("🌼", "#FFF4DE", "Allergy & Food Intolerance Testing",
     "Blood-based allergy profile test packages and food intolerance panels, with results reviewed by a doctor."),
    ("✅", "#E3F2F0", "Health Screening",
     "Health check-up options for adults. Package scope, tests included and fees are available on enquiry."),
    ("💬", "#FBE7EF", "General Consultation",
     "Appointment-based outpatient consultation for everyday health concerns."),
    ("⭐", "#FFF4DE", "Community Health Education",
     "Health awareness activities such as Men's Health Week and seasonal health campaigns."),
]
cards_html = "".join(
    f'<div class="svc-card"><div class="ico" style="background:{bg}">{ico}</div>'
    f'<h4>{t}</h4><p>{d}</p></div>'
    for ico, bg, t, d in services
)
st.markdown(f'<div class="card-grid">{cards_html}</div>', unsafe_allow_html=True)

# ---------------------------------------------------------------- clinic days
st.markdown("""
<div class="sec">
  <div class="kicker">Specialist Clinic Days</div>
  <h2>Weekend clinics, made for busy families</h2>
</div>
""", unsafe_allow_html=True)

c1, c2 = st.columns(2, gap="medium")
with c1:
    st.markdown(f"""
    <div class="clinic-card">
      <span class="day">EVERY SUNDAY · 8:00 AM – 1:00 PM</span>
      <h4>Sunday Paediatric Clinic 🧸</h4>
      <div class="doc">Dr. Deenish Muniandy — Paediatrician</div>
      <p>Weekend consultation for infants, children and adolescents — including vaccination,
      growth &amp; development review and general paediatric care, in a comfortable,
      child-friendly environment. By appointment: {PHONE_DISPLAY}.</p>
    </div>
    """, unsafe_allow_html=True)
with c2:
    st.markdown(f"""
    <div class="clinic-card pink">
      <span class="day">EVERY SATURDAY · 10:00 AM – 2:00 PM</span>
      <h4>Pain Management Consultation</h4>
      <div class="doc">Dr. Rajesh — Pain Management</div>
      <p>Consultation for back pain and related concerns — common causes include posture,
      muscle strain, ageing and past injuries. Booking via WhatsApp: {PHONE_DISPLAY}.</p>
    </div>
    """, unsafe_allow_html=True)

st.markdown("""
<p class="fine">Doctor information is provided for factual reference only. Consultation sessions
are subject to doctor availability, clinic schedule and appointment confirmation.</p>
""", unsafe_allow_html=True)

# ---------------------------------------------------------------- highlights
st.markdown("""
<div class="sec">
  <div class="kicker">Service Highlights</div>
  <h2>Health information &amp; current programmes</h2>
  <p class="sub">Provided for general health education — please consult our doctors for
  personal medical advice.</p>
</div>
""", unsafe_allow_html=True)

h1, h2 = st.columns(2, gap="medium")
with h1:
    st.markdown(f"""
    <div class="hl-panel">
      <h3>💉 Influenza (Flu) Vaccination</h3>
      <span class="price-chip">RM88 · excludes registration fee*</span>
      <p style="color:{INK}; font-size:.9rem; line-height:1.6;">Influenza can lead to serious
      illness, and vaccination helps reduce these risks. Recommended groups include:</p>
      <ul>
        <li>Adults aged 50 years and above</li>
        <li>Children aged 6 months and above</li>
        <li>Pregnant women</li>
        <li>People with chronic medical conditions</li>
        <li>Healthcare workers &amp; caregivers of high-risk individuals</li>
      </ul>
      <p class="fine">*Terms and conditions apply. Annual vaccination is recommended; protection
      builds about two weeks after vaccination. Subject to doctor's assessment of suitability.</p>
    </div>
    """, unsafe_allow_html=True)
with h2:
    st.markdown("""
    <div class="hl-panel pink">
      <h3>🌼 Allergy Profile Testing</h3>
      <p style="font-size:.9rem; line-height:1.6;">Blood-based testing that may help identify
      possible allergy triggers — food, pets, pollen, dust mites, mould and more.</p>
      <table class="pkg-table">
        <tr><th>Test Package</th><th>Coverage</th></tr>
        <tr><td>Extensive Allergy Test</td><td>107 allergens</td></tr>
        <tr><td>Allergy Test – 54</td><td>54 common allergens</td></tr>
        <tr><td>Malaysian Allergy Panel</td><td>36 locally relevant allergens</td></tr>
        <tr><td>Pediatric 27</td><td>27 allergens for children</td></tr>
        <tr><td>Food Intolerance Test</td><td>Up to 1,650 foods</td></tr>
      </table>
      <p class="fine">Fees and appointment slots on enquiry. Results should be reviewed with a
      doctor; testing does not replace medical consultation, diagnosis or treatment.</p>
    </div>
    """, unsafe_allow_html=True)

# ---------------------------------------------------------------- gallery
st.markdown("""
<div class="sec">
  <div class="kicker">Around the Centre</div>
  <h2>Current programmes at a glance</h2>
</div>
""", unsafe_allow_html=True)
g1, g2, g3 = st.columns(3, gap="medium")
for col, (img, cap) in zip(
    (g1, g2, g3),
    [("poster_pediatric.jpg", "Sunday Paediatric Clinic — every Sunday, 8 AM – 1 PM"),
     ("poster_vaccination.jpg", "Influenza vaccination available at RMC"),
     ("poster_allergy.jpg", "Allergy profile test packages")],
):
    with col:
        st.markdown(
            f'<div class="poster-img"><img src="data:image/jpeg;base64,{img_b64(img)}" '
            f'style="width:100%"></div>'
            f'<p style="color:#5F6E78;font-size:.8rem;margin-top:.45rem">{cap}</p>',
            unsafe_allow_html=True,
        )

# ---------------------------------------------------------------- award
st.markdown(f"""
<div class="award-strip">
  <img src="data:image/jpeg;base64,{img_b64("award.jpg")}" alt="BrandLaureate award">
  <div>
    <div class="t">AWARD RECOGNITION</div>
    <p>Recognised at The BrandLaureate Medical &amp; Healthcare Advancement BestBrands
    Awards 2026, reflecting our commitment to patient-centric values and continuous
    improvement.</p>
  </div>
</div>
""", unsafe_allow_html=True)

# ---------------------------------------------------------------- visit us
st.markdown("""
<div class="sec">
  <div class="kicker">Visit Us</div>
  <h2>We're easy to find 📍</h2>
</div>
""", unsafe_allow_html=True)

v1, v2 = st.columns([1, 1.2], gap="medium")
with v1:
    st.markdown(f"""
    <div class="visit-card">
      <h4>📍 Our Location</h4>
      <p>{ADDRESS}</p>
      <h4 style="margin-top:1.2rem">💬 Appointments &amp; Enquiries</h4>
      <div class="phone">{PHONE_DISPLAY}</div>
      <p>Customer Service — call or WhatsApp for appointments, clinic schedules,
      test packages and fees.</p>
      <div class="btn-row" style="margin-top:.6rem">
        <a class="rmc-btn primary" href="{WHATSAPP_URL}" target="_blank">WhatsApp Us</a>
        <a class="rmc-btn ghost" style="border:1px solid #E4DDD3"
           href="{FACEBOOK_URL}" target="_blank">Follow on Facebook</a>
      </div>
    </div>
    """, unsafe_allow_html=True)
with v2:
    st.markdown(
        f'<div class="map-frame"><iframe src="{MAP_EMBED}" width="100%" height="380" '
        f'style="border:0" loading="lazy" referrerpolicy="no-referrer-when-downgrade">'
        f'</iframe></div>',
        unsafe_allow_html=True,
    )

# ---------------------------------------------------------------- footer
st.markdown(f"""
<div class="rmc-footer">
  <div class="brand">🌺 Rafflesia Medical Centre (RMC) · Rafflesia Medical Centre Sdn Bhd</div>
  <div>Your Affordable Quality Health Care Centre — Kepayan, Kota Kinabalu, Sabah</div>
  <div style="margin-top:.5rem">
    Follow us: <a href="{FACEBOOK_URL}" target="_blank">Facebook</a> ·
    Instagram · TikTok — “Rafflesia Medical Centre”
  </div>
  <div class="divider"></div>
  <div><strong style="color:#DDE9F0">Important information.</strong>
  Publication date: July 2026. All information on this page is correct at the time of
  publication and may change without prior notice. All services, fees, clinic schedules and
  doctor sessions are subject to availability, clinic schedule and appointment confirmation.
  Content is provided for general information and health education only and does not
  constitute medical advice, diagnosis or treatment — please consult a registered medical
  practitioner regarding your health. Award reference is based on official award records.</div>
</div>

<a class="wa-fab" href="{WHATSAPP_URL}" target="_blank" title="WhatsApp us">💬</a>
""", unsafe_allow_html=True)
