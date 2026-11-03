# Sarkari Sahayak (सरकारी सहायक)

**Bolo. Dikhao. Suno.** Speak, show, listen. Your government benefits, explained in your own voice and language.

A voice-first web app. Describe your situation in any Indian language, for example *"I drive for Rapido, earn about 15k, have two kids, and my mother is 68."* The app then:

1. **Speaks → text** with Sarvam **Saaras v4**.
2. **Understands** you with **Sarvam-105B**, which turns the transcript into an editable profile.
3. **Decides eligibility** with a deterministic rules engine over 10 curated schemes. The LLM never decides eligibility.
4. **Reads documents** with **Sarvam Vision**, so a photo of a document flips "missing document" flags.
5. **Speaks the verdict back** in your language with **Bulbul v4 Flash**.

Full design: [`SPEC.md`](SPEC.md).

## Quick start

Requirements: Python 3.10+, Node 18+, and a Sarvam API key from <https://dashboard.sarvam.ai>.

```bash
# 1. Add your key (this file is git-ignored; never commit it)
cp .env.example .env          # Windows: copy .env.example .env
#    then set SARVAM_API_KEY=... in .env

# 2. Backend deps
py -m pip install -r backend/requirements.txt     # macOS/Linux: python3 -m pip ...

# 3. Frontend deps and build (the backend serves frontend/dist)
cd frontend && npm install && npm run build && cd ..

# 4. Run everything on http://localhost:8000
cd backend && py -m uvicorn app.main:app --port 8000
```

Open <http://localhost:8000>. The browser needs HTTPS or `localhost` for microphone access.

### Development mode (hot reload)

```bash
# terminal 1: API
cd backend && py -m uvicorn app.main:app --reload --port 8000
# terminal 2: UI on http://localhost:5173 (proxies /api to :8000)
cd frontend && npm run dev
```

### Try it on your phone
Mic access needs HTTPS, so tunnel the app: `cloudflared tunnel --url http://localhost:8000`.

## Check it works

```bash
py -m pytest backend -q        # rules engine tests (no API calls)
py scripts/smoke.py            # live persona -> profile -> match -> narrate (about Rs 1)
```

No mic? Use the persona buttons on the home screen (Ramesh, Lakshmi, Sita). They skip speech-to-text.

## Configuration (`.env`)

| Variable | Purpose |
|---|---|
| `SARVAM_API_KEY` | Your Sarvam key. Stays on the server and is never sent to the browser. |
| `SPEND_CAP_INR` | Estimated-spend hard stop (default 85). |
| `MODE` | `live` or `fixtures`. |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins for dev. |

## Project layout

```
backend/app/main.py        FastAPI routes + Sarvam calls (STT, LLM, Vision, TTS)
backend/app/engine/        Deterministic rules engine (derive, rules, match)
backend/app/data/schemes.json   10 curated schemes
backend/tests/             Engine tests
frontend/                  React + Vite + TypeScript + Tailwind + Framer Motion
scripts/smoke.py           Live end-to-end check
SPEC.md                    Full product and engineering spec
```

## Notes and limits

- Results are **indicative**, not an official decision. The final decision is made by the department.
- Scheme data: `ignoaps`, `ladli_behna` and `majhi_ladki_bahin` were checked on 2026-11-03. The other seven are marked `unverified` in `schemes.json`. Verify them against official sources before real-world use.
- Nothing is stored. Audio, images and transcripts are processed in memory only.
- Sarvam-105B reasoning tokens count toward `max_tokens` and are billed as output. The backend pads the budget for this.
- One full session costs roughly Rs 1.3 of Sarvam credits.
