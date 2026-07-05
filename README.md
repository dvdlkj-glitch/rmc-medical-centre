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

- Verify the BrandLaureate certificate / winner listing and permission to use
  the award visual — remove the award strip if unverified.
- Treat the page as a healthcare advertisement: submit to the MOH / MAB / LIU
  approval channel where required; add the KKLIU number once issued.
- Re-confirm the RM88 flu fee, clinic days/hours and doctor registration
  details against current records.
- See `RMC_Brochure_Compliance_Scorecard.pdf` (internal) for the full review.
