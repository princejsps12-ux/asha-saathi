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
- [ ] All tests pass inside Docker

## Frontend
- [ ] Big mic button, live transcript (Web Speech API hi-IN)
- [ ] Extracted fields card, editable by tap
- [ ] Hindi read-back (hi-IN TTS) + voice confirm (haan/nahi) + buttons
- [ ] Red alert with reasons
- [ ] Beneficiary list, visit history, due tomorrow, high-risk lists
- [ ] "Try sample" button
- [ ] Offline-mode badge, Hindi-first labels, mobile-first

## Delivery
- [ ] Dockerfile + docker-compose.yml, one command, prints URL
- [ ] README (problem, demo steps, mermaid diagram, offline vs key mode, fallbacks, rules table, run)
- [ ] Strict self-review + fixes
- [ ] Fresh clone → docker compose up → app works → tests pass
- [ ] Final report (repo URL, run steps, line count, demo script)
