# Rafflesia Medical Centre (RMC) — Promotional Web Page

A single-page Streamlit site promoting Rafflesia Medical Centre, Kepayan,
Kota Kinabalu, Sabah. Content is drafted within the Malaysian
healthcare-advertising rules (MOH / MAB): factual wording, no superlatives or
cure claims, no testimonials, modest doctor information, package pricing with
terms, and a publication date in the footer.

## Run locally

```bash
pip install -r requirements.txt
streamlit run streamlit_app.py
```

## Deploy on Streamlit Community Cloud

1. Go to <https://share.streamlit.io> and sign in with GitHub.
2. **New app** → pick this repository, branch `main`, main file `streamlit_app.py`.
3. Deploy — no secrets or extra configuration required.

## Compliance notes (before public launch)

- BrandLaureate award: verified by the client (July 2026) — award strip may
  be used with the exact title, category and year.
- Treat the page as a healthcare advertisement: submit to the MOH / MAB / LIU
  approval channel where required; add the KKLIU number once issued.
- Re-confirm the RM88 flu fee, clinic days/hours and doctor registration
  details against current records.
- See `RMC_Brochure_Compliance_Scorecard.pdf` (internal) for the full review.
