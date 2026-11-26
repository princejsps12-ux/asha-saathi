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

## Real-mic bug fixes (2026-11-27)
Reported from a real recording; Chrome hi-IN STT gave
`सुनीता साहू 7 महीने बीपी 15 बाय 100 पैरों में सूजन है बेबी मूवमेंट काम है अगले हफ्ते फिर आऊंगी`.
- [x] BP "15 बाय 100" was silently dropped → now **BP unclear**: no value guessed, amber field shows "heard 15/100", amber "BP not clear" alert, read-back says "बीपी समझ नहीं आया, दोबारा बोलिए / BP not clear, please say again". Same for dropped zeros, reversed and half-heard BP; dates like 28/11 are not mistaken for BP
- [x] "बेबी मूवमेंट काम है" was read as NORMAL → काम next to movement words means कम (reduced); movement mentioned with no clear state is **unclear** and asked again, never defaulted to normal
- [x] Found while fixing: STT has no punctuation, so one "नहीं" could negate every symptom → clauses also end at sentence-final है/hai
- [x] A bare mention of iron tablets is no longer assumed "taking"
- [x] Voice correction: after the read-back she can just say "बीपी 150 बाय 100"; it is merged into the same entry and read back again
- [x] The exact STT sentence is a Try sample ("Real speech-to-text — unclear BP")
- [x] Tests: `test_stt_mishearings.py` (exact STT text + dropped zeros, काम/कम, सूजन spellings, बाय/बाई/ओवर/upar-neeche, run-on negation, corrections) + API tests → 201 pytest + 16 vitest, all passing in Docker

## Confirm-step bug fixes (2026-11-27)
Reported from a real mic test: a pause after "क्या यह सही है?" ended listening, and the next mic tap reset the whole visit.
- [x] A pending visit is never lost: while it waits for confirmation, a mic tap listens **only** for the answer (haan / nahi / a correction like "बीपी 150 बाय 100") and keeps all fields; only **New visit** (with a confirm prompt) or a save clears it; Try sample is hidden while a visit is pending
- [x] Longer answer window (~9 s before speech starts) plus one automatic retry on silence; bilingual hint "माइक दबाकर हाँ या नहीं बोलें / Tap mic and say yes or no"; the answer being heard is shown live
- [x] Big **हाँ ✓ Yes / नहीं ✗ No** buttons always visible while a visit is pending
- [x] Pending visit kept in localStorage (24 h, safe with blocked storage); a refresh restores it with a "not saved yet" notice
- [x] Found during browser verification: restoring before the server date loaded crashed the next-visit chips → fixed, regression-tested
- [x] Tests: component tests (pause then tap mic → fields kept; correction after timeout; refresh restores pending visit; Yes/No; New visit) + unit tests for confirmFlow and pendingVisit — 36 vitest + 201 pytest, all passing in Docker; mutation-checked (re-introducing the bug fails 4 tests)

## IN PROGRESS — citation verification + live deploy (started 2026-11-27)
Resume here. Official PDFs were downloaded to the session scratchpad (`cite/pdf/`); text is extracted in `cite/*.txt`; `cite/find.py <txt> <regex>` prints PDF page numbers.

**Verified so far** in MoHFW Maternal Health Division, *Guidelines for Antenatal Care and Skilled Attendance at Birth by ANMs/LHVs/SNs* (April 2010), https://nhm.gov.in/images/pdf/programmes/maternal-health/guidelines/sba_guidelines_for_skilled_attendance_at_birth.pdf (PDF page numbers):
- [x] Hypertension: systolic ≥140 and/or diastolic ≥90 mmHg (p31); refer to MO if ≥140/90 with urine protein (p32) → our 140/90 ✅
- [ ] **Severe BP: this document only says diastolic >110 mmHg is a danger sign (p31); it has NO 160 systolic.** → change `BP_SEVERE_SYSTOLIC=160` (needs another source, e.g. the NHSRC CHO manual 2021) or keep diastolic-only and cite p31
- [x] Hb: <11 g/dl = anaemia, 7–11 moderate, <7 severe (p37) ✅
- [x] Quickening at 18–22 weeks; decreased foetal movements = possible foetal distress (p36); listed as a danger sign (p28, Box 7 p42) ✅ (our month 5 ≈ 18–22 weeks)
- [ ] IFA: the 2010 guideline says "at least 100 tablets" (p21); Anemia Mukt Bharat (2018 / revised June 2026, https://www.nhm.gov.in/New-Update-2025-26/Nutrition/AMB-guidelines/AMB-Abhiyaan-Guidelines.pdf) gives 180 — check `cite/amb2026.txt` for the page
- [ ] Still to check: fever threshold, face/hand swelling, bleeding and breathlessness in Box 7 (p42–43), the MCP card 2018 (`cite/mcp2018.txt`), the NHSRC CHO manual 2021 (`cite/cho2021.txt`), ASHA Module 7 (`cite/asha7.txt`)
- [ ] PMSMA documents list HRP categories (severe anaemia, PIH) but give NO numeric cut-offs → drop PMSMA as the source of numbers
- [ ] Then: update rules.py comments (doc, page, URL), fix the severe-BP rule, update the README rules table, re-run all tests in Docker

**Deploy (not started):** no HF/Render/Fly CLIs or tokens on this machine. Plan: Render "New Web Service → public Git repo → Docker → Free" via the user's browser login, or Hugging Face Spaces (Docker, `app_port`). First make the Dockerfile HEALTHCHECK use `$PORT` (Render sets PORT). Then put the live link at the top of the README, run Try sample on it, and notify.
