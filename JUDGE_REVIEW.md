# Cold-judge review (27 Nov 2026)

How I tested, acting as a judge who has never seen the project:

1. Fresh `git clone` of the public repo into an empty folder, no `.env`, no keys, then `docker compose up` exactly as the README says.
2. A scripted phone walkthrough at **360 × 740 px** (Android user agent, speech replaced by a silent stand-in so it runs without a mic):
   - read the first screen
   - tap all 4 sample chips, answering with **हाँ / Yes** and **नहीं / No** alternately
   - open the Women, Due and High-risk tabs
   - switch **हिं + EN → हिं → EN**
   - tap **Reset demo data** while a visit is on screen

   It recorded every console message, page error, failed request, cut-off text, touch target under 44 px and text contrast under WCAG AA.
3. The same walkthrough on the live site **https://asha-saathi-0csj.onrender.com**, starting from a sleeping (cold) instance.
4. Direct API probes: empty, nonsense and oversized input, unknown symptom codes, unknown routes.
5. Repo read-through as a judge: README first screen, code layout, Dockerfile, dependency health.

## What worked first time

- **Local start:** `docker compose up` on a fresh clone built and served the app in **25 s** (base images already cached). The terminal prints `open http://localhost:8000` and says it is in no-key mode. Frontend lint + 90 tests and backend ruff ran inside the build.
- **Live site:** a cold start took **23 s** to the first page (Render free tier). After that, the main screen with samples loaded in about 10 s.
- **Samples:** all 4 chips work locally and live.
  - Danger signs and Bleeding raise red alerts with reasons and page citations.
  - Anaemia gives an amber alert.
  - Unclear BP marks the BP "not clear (heard 15/100)" and asks again; it never guesses.
- **Walkthrough checks:**
  - No console errors, no page errors, no failed requests, no horizontal scrolling and no cut-off text, on any screen, in any language mode.
  - Empty and invalid API input gets a friendly bilingual 422; unknown API routes get a bilingual 404; unknown page URLs load the app.

## Findings (all fixed — see the table at the end)

| # | Area | Finding |
|---|---|---|
| 1 | App | **Reset demo data does not clear the visit screen.** The old visit stays on screen with Yes/No buttons, and is still in localStorage, so a refresh brings it back. |
| 2 | App | **Small touch targets:** the language toggle buttons are 36 px tall, the "Reset demo data" link is 26–35 px, and some text links are similar. Phone targets should be ≥ 44 px. |
| 3 | App | **Contrast just under WCAG AA (4.5 : 1):** the tab-bar English labels ("Visit", "Women"…) at 4.46, and the red alert subtitles ("Danger sign", "Refer now") at 4.49. |
| 4 | App | **Nonsense input becomes a "new woman".** Typing "hello" extracts no visit details, yet offers to add a woman called "hello" and reads back an empty visit. It should say that no visit details were found and what to say. |
| 5 | App | **Language modes are not the same voice flow.** In EN mode, speech recognition switched to `en-IN`, so a Hindi/Hinglish visit was recognised with an English model. The brief says only the read-back language should change. |
| 6 | App | **On the voice confirm step, a blocked or missing mic shows the full "allow the microphone" guidance,** even though the big Yes/No buttons are right there. A judge who only tapped a sample sees an error that reads like a failure. |
| 7 | App | **Screen-reader names glue the two languages together** ("जानकारी निकालेंExtract"), because the Hindi and English lines have no separator. |
| 8 | App | On a 360 px phone the Hindi label of the "Unclear BP · real STT" chip wraps so that "STT" sits alone on a line. |
| 9 | API | **No overall request-size limit:** a 3 MB JSON body is read in full before validation rejects it. Symptom codes are not checked against the known list, and list fields have no length limit. |
| 10 | Build | `npm ci` prints **"eslint@9.17.0 is no longer supported"**, and `npm audit` reports **7 vulnerabilities in dev tools** (Vite, Vitest, esbuild; 2 critical). Runtime dependencies had 0. |
| 11 | Docker | **pytest and ruff ship inside the runtime image**, and backend tests run only on request, not on every build. |
| 12 | Repo | **No CI, no LICENSE, no formatter check.** Judges look for a green badge and a license. |
| 13 | README | **The first screen is long** (hosting caveats before the pitch), with no demo video link, no screenshots, and no 3-line "judge quickstart". |
| 14 | GitHub | The repo has no description, website or topics. |
| 15 | Note | The build log shows "buildx plugin not found: falling back to the classic builder". This comes from *this* machine's Colima Docker CLI, not from the repo; Docker Desktop includes buildx. No repo change needed. |

## Fix log

| # | Fix |
|---|---|
| 1 | Reset now clears the visit screen, the saved pending visit and draft, and returns to a fresh home screen. |
| 2 | Language toggle, links and all buttons are now at least 44 px tall (checked at 360 px). |
| 3 | Darker text colours for the tab labels and alert subtitles: every text now passes 4.5 : 1. |
| 4 | If nothing about a visit is understood, the app says so in Hindi + English and lists what to say. No fake woman, no empty read-back. |
| 5 | Speech recognition is always `hi-IN` (it handles Hindi, Hinglish and English words); only the read-back voice follows the language toggle. |
| 6 | On the confirm step a blocked or missing mic now shows a short "mic not available — tap हाँ / नहीं" note instead of the full mic error. |
| 7 | A hidden " / " separator gives screen readers "हिंदी / English". |
| 8 | Chip label shortened so it fits on one line. |
| 9 | 64 KB body limit on every JSON endpoint (bilingual 413), symptom codes validated, list lengths capped. |
| 10 | Dev tools upgraded to supported versions (ESLint 9.39, Vite 7, Vitest 4, jsdom 27); `npm audit` now reports 0. |
| 11 | Multi-stage Dockerfile: lint + all tests run in build stages; the runtime image has no test tools. |
| 12 | GitHub Actions CI (lint, format check, all tests, Docker build), MIT LICENSE, Prettier + `ruff format`. |
| 13 | README top rewritten: pitch, 3 links, judge quickstart, screenshots. |
| 14 | Description, website and topics set with `gh`. |
