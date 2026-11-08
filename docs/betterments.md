# Betterments

This note summarizes the recent user-facing improvements and deployment hardening in this working branch.

## Scheme data and matching

- Replaced the small, hand-built scheme set with the supplied 4,670-row catalogue at `backend/schemes.csv`, inside the Vercel backend service root.
- Kept deterministic relevance filters for state, stated need, and event-only schemes. Added conservative checks for supported explicit criteria (such as age, BPL status, gender, land ownership, income limits, and existing pension status). Missing or unsupported criteria remain **Confirm**.
- Added a verified happy-path test for Maharashtra's Indira Gandhi National Old Age Pension Scheme, plus regression checks for missing and contradictory pension facts.
- Cleaned document parsing so punctuation inside `i.e.` no longer turns into stray checklist entries.

## Conversation and personal sessions

- The first profile chunk now triggers one personalized follow-up question, shown as text and spoken aloud. Matching waits until the bounded follow-up phase ends (at most two answer turns).
- A user can start a new person's session without refreshing the page; profile and conversation state are reset between people.
- Added high-contrast, larger text for the microphone's “couldn't hear you” error.
- Refined the phone and desktop layouts for touch sizing, safe-area spacing, and narrow screen widths.

## Results and documents

- Scheme results use a compact list that opens into a full detail page with documents, readable application steps, and the official link.
- Required documents render as a spacious checklist that uses two columns on larger screens and one column on phones.
- The empty monetary benefit panel is hidden when no confirmed monetary amount is available.
- PDF reports can include eligible-only or eligible-plus-confirm schemes, print the extracted person's name, and use a clear scheme/document layout with official guidance notes. Bundled Noto fonts for Devanagari, Bengali, Gujarati, Gurmukhi, Odia, Tamil, Telugu, Kannada, and Malayalam avoid relying on a Windows font installation; HarfBuzz shapes Indic text and mixed Latin/Indic runs are preserved.

## Production and repository readiness

- Kept the 4,670-row CSV and bundled PDF fonts inside the backend service root so the separate Vercel service build can package its runtime data.
- Updated `.gitignore` to ignore CSV exports while explicitly allowing the production catalogue.
- Added a Python 3.12 runtime marker and the Vite-supported Node.js engine range.
- Split runtime dependencies from test tooling. PDF generation uses a portable bundled font set and the backend runtime installs ReportLab plus HarfBuzz shaping support.
- Replaced persistent disk caching of transcript/profile/document results with a process-local LRU cache capped at 256 entries and 48 MiB.
- Updated the README with deployment environment settings, local build/test commands, data location, conservative eligibility behavior, and cache behavior.

## Checks run

- `py -m pytest backend -q` — backend unit and API suite.
- `npm run build` — TypeScript type check and production Vite build.
- `git diff --check` — whitespace validation.
- PDF output was rendered locally and visually checked for the printed name, Indic glyphs, currency, and page spacing.

The live Sarvam smoke test is intentionally separate from the offline suite because it calls paid upstream APIs. Set `SARVAM_API_KEY` in Vercel's backend environment and run a controlled live smoke check after deployment if needed. In Vercel, keep the project Root Directory at the repository root (`.`) so the root multi-service configuration is applied. `SPEND_CAP_INR` is enforced per running backend instance; deployments with multiple or frequently recycled instances need an external shared spend ledger before treating it as a global budget.
