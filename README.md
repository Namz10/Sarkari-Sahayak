# Sarkari Sahayak (सरकारी सहायक)

**Bolo. Dikhao. Suno.** Speak, show, listen. Your government benefits, explained in your own voice and language.

A voice-first web app. Describe your situation in any Indian language, for example *"I drive for Rapido, earn about 15k, have two kids, and my mother is 68."* The app then:

1. **Speaks → text** with Sarvam **Saaras v4**.
2. **Understands** you with **Sarvam-105B**, which turns the transcript into an editable profile.
3. **Finds relevant schemes** from the supplied 4,670-record government-scheme CSV. Sarvam extracts only stated needs; deterministic state, topic, event, and explicitly supported eligibility checks filter and rank matches. Criteria the engine cannot interpret stay marked for confirmation.
4. **Reads documents** with **Sarvam Vision**, so a photo of a document flips "missing document" flags.
5. **Speaks the verdict back** in your language with **Bulbul v4 Flash**.

Original product proposal: [`SPEC.md`](SPEC.md). Current implementation and production notes: [`docs/betterments.md`](docs/betterments.md).

## Quick start

Requirements: Python 3.10+, Node.js 20.19+ (or 22.12+), and a Sarvam API key from <https://dashboard.sarvam.ai>.

```bash
# 1. Add your key (this file is git-ignored; never commit it)
cp .env.example .env          # Windows: copy .env.example .env
#    then set SARVAM_API_KEY=... in .env

# 2. Backend deps
py -m pip install -r backend/requirements-dev.txt # includes test tooling; production uses requirements.txt

# 3. Frontend deps and build (the backend serves frontend/dist)
cd frontend && npm install && npm run build && cd ..

# 4. Run everything on http://localhost:8000 (from the repository root)
py -m uvicorn app.main:app --app-dir backend --port 8000
```

Open <http://localhost:8000>. The browser needs HTTPS or `localhost` for microphone access.

### Development mode (hot reload)

```bash
# terminal 1: API (run from the repository root)
py -m uvicorn app.main:app --app-dir backend --reload --port 8000
# terminal 2: UI on http://localhost:5173 (proxies /api to :8000)
cd frontend && npm run dev
```

### Try it on your phone
Mic access needs HTTPS, so tunnel the app: `cloudflared tunnel --url http://localhost:8000`.

## Production deploy

The root `vercel.json` routes `/api/*` to the FastAPI backend service and all other paths to the Vite frontend service. Set Vercel’s repository Root Directory to `.` so the root `vercel.json` can configure both services. Set `SARVAM_API_KEY` and `SPEND_CAP_INR` in the backend service environment before deploying. The catalogue is stored at `backend/schemes.csv`, inside that service's root, so it is included in its deployment bundle. The backend pins its Python runtime to 3.12; Vite's supported Node versions are declared in `frontend/package.json`.

Run the local checks before pushing:

```bash
cd frontend && npm ci && npm run build && cd ..
py -m pytest backend -q
```

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
backend/schemes.csv             Supplied government scheme catalogue (4,670 records)
backend/tests/             Engine tests
frontend/                  React + Vite + TypeScript + Tailwind + Framer Motion
scripts/smoke.py           Live end-to-end check
SPEC.md                    Original v1 product and engineering proposal
docs/betterments.md        Recent feature, matching, PDF, and responsive UI updates
```

## Notes and limits

- Results are **indicative**, not an official decision. The final decision is made by the department.
- Scheme data comes from the supplied `backend/schemes.csv`; official source/reference links are included when available. Some explicit criteria are evaluated deterministically. Unrecognized or missing criteria remain "confirm"; results are guidance and never an official decision.
- User content is not written to a database or disk cache. API response caching is process-local, LRU-evicted, capped at 256 items / 48 MiB, and disappears when the backend process exits. The Sarvam spend counter is also process-local; `SPEND_CAP_INR` is a per-instance guard, not a global account-wide spending limit.
- Sarvam-105B reasoning tokens count toward `max_tokens` and are billed as output. The backend pads the budget for this.
- One full session costs roughly Rs 1.3 of Sarvam credits.

See [docs/betterments.md](docs/betterments.md) for the recent implementation and deployment-readiness updates.
