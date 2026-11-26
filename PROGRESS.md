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
