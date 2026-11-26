# ASHA Saathi — Build Progress

Resume rule: if work is interrupted, read this file first and continue from the first unchecked item.

## Setup
- [x] Docker (Colima) installed and running, `brew services start colima`
- [x] docker-compose plugin installed, `docker compose up` verified
- [x] gh logged in
- [x] Public GitHub repo `asha-saathi` created, `.gitignore`, `.env.example`

## Backend
- [x] FastAPI + SQLite app structure
- [x] Rule-based Hindi/Hinglish/English parser (numbers, months, BP, symptoms, IFA, TT/Td, next visit date)
- [x] Danger-sign rules file with guideline citations, alert explains WHY
- [x] Optional Sarvam STT + Gemini extraction, graceful "offline mode" when keys missing
- [x] Seed data: 5 beneficiaries with Hindi names, villages, due dates
- [x] API: extract, evaluate, save visit, beneficiaries, history, due tomorrow, high risk, status

## Tests
- [x] pytest: parser rules (Hinglish, Hindi number words), danger rules, API tests — 25+ cases
- [x] All tests pass inside Docker

## Frontend
- [x] Big mic button, live transcript (Web Speech API hi-IN)
- [x] Extracted fields card, editable by tap
- [x] Hindi read-back (hi-IN TTS) + voice confirm (haan/nahi) + buttons
- [x] Red alert with reasons
- [x] Beneficiary list, visit history, due tomorrow, high-risk lists
- [x] "Try sample" button
- [x] Offline-mode badge, Hindi-first labels, mobile-first

## Delivery
- [x] Dockerfile + docker-compose.yml, one command, prints URL
- [x] README (problem, demo steps, mermaid diagram, offline vs key mode, fallbacks, rules table, run)
- [x] Strict self-review + fixes
- [x] Fresh clone → docker compose up → app works → tests pass
- [x] Final report (repo URL, run steps, line count, demo script)

## Self-review log
- Fresh clone with no `.env`: compose uses `${VAR:-}` defaults, so it starts in offline mode
- Fixed: stale beneficiary name kept when no woman selected → cleared server-side (+test)
- Fixed: `/api/stt` unbounded upload read → bounded to 10 MB
- Fixed: demo due-dates went stale on later days → untouched demo data auto-refreshes; real data never touched (+test)
- Fixed: TTS could hang in browsers with no voice → per-sentence safety timeout
- Fixed: fixed image name in compose made separate clones reuse one image → removed
- Clarified: parser plausibility ranges are input checks; clinical thresholds live only in rules.py
- Clarified: abdominal pain alert worded honestly (deliberate over-alert)
- Verified: no secrets in tracked files; non-root container; healthcheck; SPA path-traversal guard

## Fresh-clone verification (2026-11-27)
- Cleared local images, volumes and build cache, then `git clone` into a temp folder with no `.env`
- `docker compose up` → built from scratch, container healthy, logs print `open http://localhost:8000`, offline mode
- UI: Try sample → fields + red alert with reasons → Hindi read-back → save → due-tomorrow and risk counts update
- `docker compose run --rm app pytest` → 111 passed

## Language (added 2026-11-27, revised same day)
- [x] Default view on first open is always bilingual **हिं + EN**: Hindi main text, smaller English line under every label, button, alert and the read-back summary (no browser-language guessing)
- [x] Header toggle with 3 options: **हिं + EN** (default) · **हिं** · **EN**, remembered in localStorage (safe when storage is blocked)
- [x] EN mode: all UI, alerts and read-back in English; speech recognition and TTS switch to en-IN
- [x] Register fields and danger alerts keep an English line under the Hindi even in Hindi-only mode
- [x] Transcript card shows an English gloss built from the extracted fields (works offline)
- [x] Backend: alerts carry Hindi + English reason and action; English read-back + gloss (`summary_en`, `gloss_en`)
- [x] Tests: 116 pytest (bilingual output, English spoken visit, yes/no in Devanagari) + 16 vitest (modes, default, persistence, key parity); vitest runs in the Docker build
- [x] README demo steps updated with the toggle

## Final quality pass (2026-11-27)
| Area | Result | Evidence |
|---|---|---|
| Fresh clone, one `docker compose up`, no keys | ✅ | Fresh-clone run below; offline-mode badge; no `.env` needed |
| Zero-typing voice flow + Try sample | ✅ | Mic → read-back → "haan" → save; tap-buttons for corrections; sample verified in browser |
| Parser (Hindi, Hinglish, English, number words, BP, dates) | ✅ | `test_corpus.py`: 35 realistic sentences; fixed "30 आयरन की गोलियां", "साढ़े सात महीने", "sooj gaya" |
| Danger rules cited, show WHY, no magic numbers | ✅ | All thresholds are named constants in `rules.py` with [SBA]/[MCP]/[AMB]/[PMSMA]/[ASHA] citations; WHY in Hindi + English |
| Clean code, linted | ✅ | `ruff check` + ESLint `--max-warnings 0` enforced in the Docker build; unused i18n keys removed; vulture scan clean (only framework false positives) |
| Tests in Docker | ✅ | 154 pytest (parser, corpus, rules, API, errors) + 16 vitest (language toggle) |
| Friendly bilingual errors, never crash | ✅ | Bilingual API errors + validation handler; UI maps every failure to an i18n key; React ErrorBoundary |
| Bilingual default UI, judge-readable in 5 s, mobile | ✅ | Default हिं + EN; 3-step intro card with "no mic? Try sample"; 375 px layout checked |
| README complete | ✅ | Demo with toggle, architecture, offline/key modes, fallbacks, rules table, tests, lint, error handling |
| No secrets, `.env.example` | ✅ | Secret scan of tracked files clean |
