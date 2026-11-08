# Sarvam Skills Integration & Backend Architecture Optimization

This document outlines the architectural enhancements, performance optimizations, and integration of the official [Sarvam AI Skills](https://github.com/sarvamai/skills) into **Sarkari Sahayak**.

---

## 1. Official Skills Imported (`skills/sarvam/`)

The full skillset from `https://github.com/sarvamai/skills` has been incorporated directly into `skills/sarvam/`:

| Skill Module | Purpose | Code Integration in Sarkari Sahayak |
|---|---|---|
| **`speech-to-text`** | Saaras v4 STT, REST modes, Keyterm Prompting | [`backend/app/main.py`](file:///d:/GitHub%20Repos/Sarvam/backend/app/main.py), [`backend/app/engine/audio.py`](file:///d:/GitHub%20Repos/Sarvam/backend/app/engine/audio.py) |
| **`chat`** | Sarvam-105B / Sarvam-105B-Conversations, reasoning limits | [`backend/app/main.py`](file:///d:/GitHub%20Repos/Sarvam/backend/app/main.py), [`backend/app/engine/llm_parser.py`](file:///d:/GitHub%20Repos/Sarvam/backend/app/engine/llm_parser.py) |
| **`text-to-speech`** | Bulbul v4-flash persona voices, Bulbul v3 fallback | [`backend/app/main.py`](file:///d:/GitHub%20Repos/Sarvam/backend/app/main.py) |
| **`doc-ai`** | Sarvam Vision Document AI job lifecycle & parsing | [`backend/app/main.py`](file:///d:/GitHub%20Repos/Sarvam/backend/app/main.py), [`backend/app/engine/sanitizer.py`](file:///d:/GitHub%20Repos/Sarvam/backend/app/engine/sanitizer.py) |
| **`translate`** | Mayura v1 (colloquial/auto) & Sarvam-Translate v1 (formal) | [`backend/app/main.py`](file:///d:/GitHub%20Repos/Sarvam/backend/app/main.py) (`/api/translate`) |
| **`voice-agents`** | Reference guidelines for real-time conversational agents | Architecture patterns applied to audio pipeline |
| **`sarvam-mcp`** | Model Context Protocol integration reference | Available in `skills/sarvam/sarvam-mcp` |

---

## 2. Robust Techniques Implemented & Edge Cases Solved

### A. Sub-Millisecond Multi-Tier Caching ([`backend/app/engine/cache.py`](file:///d:/GitHub%20Repos/Sarvam/backend/app/engine/cache.py))
* **The Problem:** Repeated audio clips, standard persona clicks (Ramesh, Lakshmi, Sita), and identical narration requests repeatedly triggered slow upstream API calls (3–8s latency each) and burned budget towards the `SPEND_CAP_INR`.
* **The Solution:** A bounded process-local LRU cache partitioned by capability (`stt`, `profile`, `doc`, `narrate`, `tts`, `translate`). User transcripts, profiles, document extraction, and narration are not written to a disk cache.
* **The Impact:** Repeated queries within a warm process reuse results without another upstream call. The cache is capped at 256 items / 48 MiB and disappears when the backend process exits; `GET /api/health` reports cache counts.

### B. Universal Audio Transcoding ([`backend/app/engine/audio.py`](file:///d:/GitHub%20Repos/Sarvam/backend/app/engine/audio.py))
* **The Problem:** The previous code strictly checked `data.startswith(b"RIFF")`, returning HTTP 415 on mobile browsers (Safari recording AAC/MP4, Chrome recording WebM/Opus). Furthermore, duration was calculated using hardcoded byte offsets (`(len(data) - 44) / 32000`), which produced incorrect billing and timestamps for non-16kHz audio.
* **The Solution:** Built a PyAV-powered audio pipeline that dynamically accepts any browser container (WebM, Opus, MP4, AAC, OGG, MP3, WAV) and resamples it into standard 16kHz mono 16-bit PCM WAV while computing exact frame-accurate durations.

### C. Saaras v4 STT Keyterm Prompting with v3 Fallback ([`backend/app/main.py`](file:///d:/GitHub%20Repos/Sarvam/backend/app/main.py))
* **The Problem:** Generic speech recognition often mishears Indian government scheme names, acronyms, and welfare terms (e.g., "e-Shram", "Ayushman Bharat", "PM-JAY", "Ladli Behna", "Aadhaar").
* **The Solution:** Implemented `keyterms` prompting on `saaras:v4` using curated scheme terms (`STT_KEYTERMS`).
* **Resilience:** Per `speech-to-text/SKILL.md`, passing `keyterms` to `saaras:v3` yields a 400 error. The backend detects upstream degradation and seamlessly falls back to `saaras:v3` with keyterms automatically stripped.

### D. Sarvam-105B Reasoning Token Budget & Parser Hardening ([`backend/app/engine/llm_parser.py`](file:///d:/GitHub%20Repos/Sarvam/backend/app/engine/llm_parser.py))
* **The Problem:**
  1. `reasoning_effort`: Passing string `"none"` was invalid. The SDK requires Python `None` to disable thinking or `"low"`/`"medium"`/`"high"`.
  2. The `content=None` gotcha: When reasoning consumes the token budget, the model finishes with `"length"` and `content` is `None`. The old backend crashed with `ValueError`.
  3. Preambles and markdown fences: Conversational intros or ````json ... ```` fences broke naive decoders.
* **The Solution:**
  - Properly sets `reasoning_effort=None` for pure deterministic JSON extraction.
  - Implemented `extract_content_or_reasoning()` to inspect `reasoning_content` if `content` is null or exhausted.
  - Developed `clean_and_parse_json()` to strip `<think>...</think>` tags, peel markdown fences, trim trailing commas, and scan raw decode blocks.

### E. Bulbul v4-Flash Speaker Pairing & Vernacular Routing ([`backend/app/main.py`](file:///d:/GitHub%20Repos/Sarvam/backend/app/main.py))
* **The Problem:** Bulbul v4-flash requires exact `voice_language_style` persona IDs. v3 short names (`shubh`, `priya`) fail on v4, and v4 names fail on v3. Furthermore, Malayalam (`ml-IN`) and Odia (`od-IN`) do not have v4 personas.
* **The Solution:** Verified persona mapping (`TTS_V4_SPEAKERS`) pairing v4 personas for 9 languages (`hi-IN`, `mr-IN`, `ta-IN`, `te-IN`, `bn-IN`, `gu-IN`, `kn-IN`, `pa-IN`, `en-IN`), with automatic routing to `bulbul:v3` with speaker `shubh` for Malayalam and Odia. If v4 ever errors, it safely falls back to v3.

### F. Zero-PII Sanitization ([`backend/app/engine/sanitizer.py`](file:///d:/GitHub%20Repos/Sarvam/backend/app/engine/sanitizer.py))
* **The Problem:** OCR text from identity documents could expose sensitive personal information.
* **The Solution:** Masking filters redact:
  - 12-digit Aadhaar IDs (`XXXX XXXX 1234`)
  - 10-character PAN cards (`XXXXX1234X`)
  - Bank Account Numbers (9–18 digits masked except last 4)
  - Indian mobile numbers (`XXXXX XXX89`)
  - Voter ID / EPIC cards

### G. Concurrency & Lifespan Event Loop Decoupling
* **The Problem:** `_spend_lock = asyncio.Lock()` and `_upstream_limit = asyncio.Semaphore(...)` were previously declared at module import time. In Python 3.10+ on Windows, this bound them to detached or unstarted loops, leading to deadlocks during test runs or worker restarts.
* **The Solution:** Migrated to FastAPI's `@asynccontextmanager lifespan` and lazy accessors (`get_spend_lock()`, `get_upstream_limit()`) ensuring primitives are always bound to the active running loop.

### H. Rate Limiting Middleware ([`backend/app/engine/rate_limiter.py`](file:///d:/GitHub%20Repos/Sarvam/backend/app/engine/rate_limiter.py))
* **The Problem:** Risk of API quota exhaustion and accidental spam.
* **The Solution:** Sliding-window rate limiter enforcing 30 requests/minute per client IP (bypassed with optional `x-demo-passcode`), returning HTTP 429 with `Retry-After` headers.

---

## 3. Verification & Test Suite

All 59 unit and integration tests execute and pass cleanly:
```bash
py -m pytest backend -q
# 59 passed in 0.76s
```

Live end-to-end smoke test verifying STT, Profile extraction, Rules Engine, and Bulbul TTS:
```bash
py scripts/smoke.py
# Status: 200 OK | Audio: 1,020,828 chars WAV | Spend: ₹0.00 (cache hit) | Cache hits: 2
```

