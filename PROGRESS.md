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

## Citation verification (done 2026-11-27)
Every threshold and danger sign in `rules.py` was checked against the actual government PDFs: [SBA] the 2010 ANC/SBA guideline, [CHO] the 2021 NHSRC CHO manual, [MCP] the 2018 MCP card, and [AMB] the June 2026 Anemia Mukt Bharat guideline. Each rule now cites the document, PDF page and URL in code and in the README table (with #page links).
- [x] 140/90 hypertension ✅ (SBA p.31, CHO p.45)
- [x] **Fixed** severe BP: was ≥160/110 → now **diastolic > 110** only (SBA p.31, CHO p.22/29; no systolic cut-off in MoHFW docs)
- [x] **Fixed** anaemia: was <11 throughout → now **<10.5 in the 2nd trimester**, <11 otherwise (AMB 2026 p.56, WHO 2024); severe <7 ✅
- [x] **Fixed** fever: ≥38 °C → **>38 °C** (SBA Box 7 p.43)
- [x] **Fixed** referral levels to match SBA Box 7 (FRU vs 24-h PHC); breathlessness split into its own rule
- [x] IFA 180 tablets from the 2nd trimester ✅ (AMB p.50); quickening 18–22 weeks → month 5 ✅ (SBA p.36)
- [x] Dropped as sources: PMSMA (no numbers), ASHA Module 7 (child health); ASHA Module 6 host unreachable
- [x] Tests updated/added (trimester Hb, BP boundaries, fever boundary, Box 7 levels, every rule cites [TAG] p.N with a URL) → 208 pytest pass in Docker

## Live deploy (done 2026-11-27)
- [x] Live at **https://asha-saathi-0csj.onrender.com** (Render free web service built from the repo's Dockerfile, HTTPS, offline mode, no keys, auto-deploys on push to main, health check `/api/health`)
- [x] Free instance hours checked: 3.95 of 750 used this month and 22 of 25 services; hours reset on 1 Dec → no risk to staying up until 2 Dec; no other service needs suspending
- [x] Verified on the live URL: health check and status OK; Try sample → transcript, English gloss, red alerts, Hindi read-back, Yes → saved, and the Due count rose from 2 to 3
- [x] README links the live demo at the top (notes the free-tier cold start and temporary disk)

## Live-site phone bug (2026-11-27)
Reported on a phone: transcript "Sunita Sahu सात महीने BP 150 बाय 100 पैरों में सूजन है, बेबी मूवमेंट कम है, अगले हफ्ते फिर आऊंगी" → app said "समझ नहीं आया".
- [x] Backend ruled out: parser + /api/extract (local and live) extract it fully (month 7, BP 150/100, swelling, reduced movement, next visit +7)
- [x] Root cause: the confirm step. On a phone the mic hears the app's own read-back (speaker next to mic; Android may skip TTS onend, so listening could start mid-speech). That "answer" had no yes/no and nothing new → "समझ नहीं आया"
- [x] speak() resolves only when speechSynthesis is really silent, plus a 0.5 s gap; echo of the read-back is detected and re-listened instead of answered
- [x] A non-empty answer never gets "समझ नहीं आया": it always runs extraction → save / correction / edit / echo / "nothing new — say yes"
- [x] Mobile recognition: interim-only results kept, Android cumulative repeats collapsed, early session end mid-sentence auto-restarts, errors before onend don't drop text, stop() always reports within 1.5 s; dictation falls back to on-screen text
- [x] Render cold start: 75 s timeout + one retry on network error / 502 / 503 / 504; "Waking up the server…" hint after 6 s; "Try again" re-runs extraction on the same transcript
- [x] Tests with the exact phone text: backend parser + API (211 pytest), fake mobile engines (speech.test.js), API retry (api.test.js), component tests (no final result, echo, nothing-new, retry) → 55 vitest; all in Docker; mobile viewport (Android UA, 375 px) checked

## TTS abbreviation fix (2026-11-27)
- [x] The hi-IN voice read "FRU" as "फ्लू". All spoken text now goes through `forSpeech()` (frontend/src/spokenText.js), applied only to speech; the screen is unchanged
- [x] Hindi: FRU → "एफ़-आर-यू यानी बड़े अस्पताल", PHC → "पी-एच-सी", ANM/IFA/Td/BP spelled out, " / " → "या"; English: FRU → "F-R-U, the first referral hospital", P-H-C, B-P "150 over 100", Hb → haemoglobin, units spoken in full, " / " → "or"
- [x] Tests: spokenText.test.js (real rule/read-back strings; no Latin abbreviation left in Hindi speech) + component test (speech spelled out, screen still shows FRU) → 61 vitest + 211 pytest in Docker

## Thinking pauses in dictation (2026-11-27)
- [x] Dictation now ends only after ~3.5 s of silence (was 2.5 s); a phone that ends the session at each pause, or before speech starts, is restarted (up to 20 times) and the text appended
- [x] Clear "सुन रही हूँ… / Listening…" indicator (blinking red dot, hint) and a big red **बस ✓ / Done** button to finish early
- [x] Finish by voice: "बस" / "bas" / "done" at the end of a phrase, or "हो गया" / "ho gaya" said on its own after a pause ("टीका हो गया" mid-sentence does not end it); the command is removed before extraction
- [x] Tests: speech.test.js (3 s pause kept, restart + append on every pause, early give-up restarted), dictation.test.js (commands, false positives, stripping, pause detection), component tests (Done button, "हो गया") → 72 vitest + 211 pytest in Docker

## Real-world hardening (2026-11-27)
- [x] **Honesty:** "offline mode" wording replaced everywhere (UI badge + footer, README, .env.example, compose, logs, API note) with: "No API keys needed; speech uses the browser's built-in recognition (needs internet); extraction and danger rules run fully on our server."
- [x] **Offline save queue:** a confirmed visit that can't reach the server is kept on the phone (localStorage) and synced on reconnect / every 30 s, with a header badge; rejected items are kept, never dropped. Un-extracted words are kept as a draft that survives a refresh and auto-retries when online. A service worker + manifest let the app open with no network
- [x] **Unsupported browsers:** "इस ब्राउज़र में आवाज़ नहीं चलती - Chrome खोलें / Voice not supported here - use Chrome" + type-in box + Try sample
- [x] **Mic denied / network mid-speech:** bilingual guidance (🔒 → allow mic), type-in opens; heard words always kept; fixed: "no speech" no longer overwrites mic guidance
- [x] **New vs existing woman:** fuzzy matching across scripts/spellings with an ambiguity margin; never guesses — "क्या आपका मतलब…? / Did you mean…?" chips and "नई लाभार्थी जोड़ें? / Add as new woman?" with the spoken name; POST /api/beneficiaries (no duplicates)
- [x] **Dates:** नरसों (+3), X महीने बाद, more weekday spellings (बृहस्पतिवार, इतवार, somwar…)
- [x] **Dialect + noise:** Chhattisgarhi/Bhojpuri swelling, headache, bleeding, fever, fetal-movement words and negations (नइ, नइखे); fillers dropped, repeated fragments collapsed
- [x] Tests: test_hardening.py, syncQueue/draft/honesty tests, RecordView.hardening.test.jsx → 263 pytest + 86 vitest, all in Docker; checked in a 375 px viewport

## BP after keyword in every language mode (2026-11-27)
- [x] Bug: EN toggle, STT "…बीपी 150/100…" marked "BP not clear". Root cause: phone STT inserts invisible direction/joiner marks (LRM/RLM/ZWSP) and look-alike slashes (⁄ ∕ ／) inside "150/100"; the pair didn't match and the single-number fallback reported "heard 150"
- [x] Fix: all text is NFKC-normalised, invisible marks removed and slash look-alikes unified before parsing; a plausible pair right after "BP"/"बीपी" (any short separator, or none) always wins over every other guard; implausible values still ask again and dates are still not BP
- [x] Tests: exact text in all 3 modes (backend parametrised + frontend हिं + EN / हिं / EN: text unchanged, correct STT language, BP 150/100 shown), 12 invisible-mark/separator variants, guards unchanged → 280 pytest + 89 vitest in Docker

## Try sample: all samples listed (2026-11-27)
- [x] The rotating single "Try sample" button is replaced by a compact 2×2 list of bilingual chips under "▶ नमूना चलाएँ / Try sample": खतरे के संकेत · Danger signs, खून की कमी · Anaemia, खून आना · Bleeding, बीपी साफ़ नहीं · Unclear BP (real STT); any one can be picked directly
- [x] Tests: component test (all 4 chips with Hindi + English labels; tapping "Unclear BP · real STT" runs exactly that text); 90 vitest + 280 pytest in Docker; checked at 375 px

## Final polish (27 Nov 2026) — cold-judge review → fixes

Full findings and fix log: [JUDGE_REVIEW.md](JUDGE_REVIEW.md).

- [x] Cold judge: fresh clone + `docker compose up` (25 s to first page), 360 px phone walkthrough (all 4 sample chips, Yes/No, tabs, 3 language modes, reset), live site incl. cold start (23 s)
- [x] Reset demo data clears the visit screen and returns to a fresh home screen
- [x] No console errors / warnings on any screen; touch targets ≥ 44 px; WCAG AA contrast; no cut-off text at 360 px
- [x] Friendly bilingual states for: nothing understood, mic unavailable on the confirm step, body too large
- [x] Voice flow identical in all 3 modes (recognition always hi-IN; only the read-back voice changes)
- [x] Screen readers get "हिंदी / English" instead of glued words
- [x] API: 64 KB body limit (bilingual 413), symptom codes validated, list sizes capped
- [x] Dependencies upgraded to supported versions with no known vulnerabilities (FastAPI 0.165 / Starlette 1.10; ESLint 10, Vite 7, Vitest 4); `npm audit` and `pip-audit` clean
- [x] ruff lint + format (type hints enforced in app code), ESLint 10 + Prettier; sanity ranges named in parser.py
- [x] Multi-stage Dockerfile: all lint + tests in the build; slim non-root runtime without test tools; healthcheck
- [x] GitHub Actions CI + badge; MIT LICENSE; gitleaks: no secrets in the repo or history
- [x] README rewritten for a 30-second read; deck, app, README and video description checked for the same facts
- [x] Tests: 284 pytest + 96 vitest, all in Docker
