"""FastAPI app: JSON API under /api, built React app served from /."""
from __future__ import annotations

import logging
from datetime import timedelta
from pathlib import Path

from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .config import Settings, get_settings
from .db import Database
from .integrations import IntegrationError, gemini_extract, merge_fields, sarvam_transcribe
from .parser import classify_confirmation, merge_correction, parse_visit, unclear_fields
from .rules import evaluate, risk_level
from .schemas import (
    SYMPTOM_LABELS,
    Analysis,
    BeneficiaryCreate,
    EvaluateRequest,
    ExtractRequest,
    IntentRequest,
    VisitCreate,
    VisitFields,
)
from .seed import SAMPLES, refresh_stale_demo, seed
from .summary import build_gloss_en, build_summary, build_summary_en

log = logging.getLogger("asha")
# Honest description of the no-key mode, shown in the UI and logs.
MODE_NOTE = ("No API keys needed; speech uses the browser's built-in recognition (needs internet); "
             "extraction and danger rules run fully on our server.")
MAX_AUDIO_BYTES = 10 * 1024 * 1024  # ~10 MB is several minutes of compressed speech

# Every error the UI can see is bilingual ("Hindi / English") and says what to do next.
MSG_NOT_FOUND = "लाभार्थी नहीं मिला / Beneficiary not found"
MSG_INVALID = "कुछ जानकारी सही नहीं लगती, जाँचकर दोबारा डालें / Some values look wrong — please check them"
MSG_INTERNAL = "कुछ गड़बड़ हुई, दोबारा कोशिश करें / Something went wrong — please try again"
MSG_SELECT_FIRST = "पहले लाभार्थी चुनें / Select a beneficiary before saving"
MSG_NO_SARVAM = ("ऑनलाइन आवाज़ सेवा चालू नहीं, ब्राउज़र आवाज़ पहचान इस्तेमाल करें / "
                 "SARVAM_API_KEY not set — use browser speech recognition")
MSG_BAD_AUDIO = "रिकॉर्डिंग खाली या बहुत लंबी है / Audio missing or too large"
MSG_STT_FAILED = "ऑनलाइन आवाज़ सेवा नहीं चली / Online speech service failed"


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    db = Database(settings.db_path)
    refresh_stale_demo(db, settings.today())
    seed(db, settings.today())

    app = FastAPI(title="ASHA Saathi API", version="1.0.0")
    app.state.settings, app.state.db = settings, db

    def get_db() -> Database:
        return app.state.db

    def analyse(fields: VisitFields, engine: str = "rules", note: str | None = None,
                changed: bool = True) -> Analysis:
        if fields.bp_systolic and fields.bp_diastolic:  # a real reading (e.g. typed in) clears "unclear"
            fields.bp_unclear, fields.bp_heard = False, None
        if fields.beneficiary_id is not None:
            person = db.get_beneficiary(fields.beneficiary_id)
            if person is None:
                raise HTTPException(404, MSG_NOT_FOUND)
            fields.beneficiary_name, fields.beneficiary_name_en = person["name_hi"], person["name_en"]
            fields.beneficiary_name_heard, fields.beneficiary_suggestions = None, []
        else:  # never show a stale name for an unselected woman
            fields.beneficiary_name = fields.beneficiary_name_en = None
        suggested = [_brief(p) for p in map(db.get_beneficiary, fields.beneficiary_suggestions) if p]
        alerts = evaluate(fields)
        today = settings.today()
        return Analysis(fields=fields, alerts=alerts, risk=risk_level(alerts),
                        summary_hi=build_summary(fields, alerts, today, suggested),
                        summary_en=build_summary_en(fields, alerts, today, suggested),
                        gloss_en=build_gloss_en(fields, alerts, today, suggested), engine=engine, engine_note=note,
                        unclear=unclear_fields(fields), changed=changed, suggestions=suggested)

    @app.exception_handler(Exception)
    async def unhandled(_: Request, exc: Exception) -> JSONResponse:  # never leak a stack trace to the UI
        log.exception("Unhandled error: %s", exc)
        return JSONResponse({"detail": MSG_INTERNAL}, status_code=500)

    @app.exception_handler(RequestValidationError)
    async def invalid(_: Request, exc: RequestValidationError) -> JSONResponse:
        fields = [".".join(str(p) for p in e["loc"][1:]) for e in exc.errors()]
        return JSONResponse({"detail": MSG_INVALID, "fields": fields}, status_code=422)

    # ---------------------------------------------------------------- meta
    @app.get("/api/health")
    def health() -> dict:
        return {"ok": True}

    @app.get("/api/status")
    def status() -> dict:
        return {
            "stt": "sarvam" if settings.sarvam_enabled else "browser",
            "extraction": "gemini+rules" if settings.gemini_enabled else "rules",
            "sarvam_key_set": settings.sarvam_enabled,
            "gemini_key_set": settings.gemini_enabled,
            "offline_mode": not (settings.sarvam_enabled or settings.gemini_enabled),  # = no API keys in use
            "mode_note": MODE_NOTE,
            "today": settings.today().isoformat(),
        }

    @app.get("/api/samples")
    def samples() -> list[dict]:
        return SAMPLES

    @app.get("/api/symptoms")
    def symptoms() -> dict:
        return {code: {"hi": hi, "en": en} for code, (hi, en) in SYMPTOM_LABELS.items()}

    # ------------------------------------------------------------ pipeline
    @app.post("/api/extract", response_model=Analysis)
    def extract(req: ExtractRequest, store: Database = Depends(get_db)) -> Analysis:
        people = store.known_people()
        fields = parse_visit(req.transcript, settings.today(), people)
        engine, note = "rules", None
        if settings.gemini_enabled:
            try:
                fields = merge_fields(fields, gemini_extract(req.transcript, people, settings.today(), settings))
                engine = "gemini+rules"
            except IntegrationError as exc:
                note = f"{exc} — used the built-in parser"
        if req.base is None:
            return analyse(fields, engine=engine, note=note)
        merged, changed = merge_correction(req.base, fields)  # spoken correction, e.g. "BP 150 by 100"
        return analyse(merged, engine=engine, note=note, changed=changed)

    @app.post("/api/evaluate", response_model=Analysis)
    def evaluate_fields(req: EvaluateRequest) -> Analysis:
        return analyse(req.fields)

    @app.post("/api/intent")
    def intent(req: IntentRequest) -> dict:
        return {"intent": classify_confirmation(req.text)}

    @app.post("/api/stt")
    async def stt(audio: UploadFile = File(...)) -> dict:
        if not settings.sarvam_enabled:
            raise HTTPException(503, MSG_NO_SARVAM)
        data = await audio.read(MAX_AUDIO_BYTES + 1)  # bounded read: never buffer a huge upload
        if not data or len(data) > MAX_AUDIO_BYTES:
            raise HTTPException(413 if data else 400, MSG_BAD_AUDIO)
        try:
            text = sarvam_transcribe(data, audio.filename or "visit.webm",
                                     audio.content_type or "audio/webm", settings)
        except IntegrationError as exc:
            raise HTTPException(502, f"{MSG_STT_FAILED} ({exc})") from exc
        return {"transcript": text}

    # -------------------------------------------------------------- records
    @app.post("/api/visits", status_code=201)
    def create_visit(req: VisitCreate, store: Database = Depends(get_db)) -> dict:
        if req.fields.beneficiary_id is None:
            raise HTTPException(422, MSG_SELECT_FIRST)
        result = analyse(req.fields)  # alerts recomputed server-side, never trusted from client
        visit_id = store.add_visit(req.fields.beneficiary_id, settings.today(), req.transcript,
                                   result.fields, result.alerts, result.risk)
        return {"visit": store.get_visit(visit_id), "analysis": result.model_dump(mode="json")}

    @app.post("/api/beneficiaries", status_code=201)
    def add_beneficiary(req: BeneficiaryCreate, store: Database = Depends(get_db)) -> dict:
        """Add a woman who isn't on the list yet (asked, never guessed, from the visit screen)."""
        name = " ".join(req.name.split())
        for person in store.list_beneficiaries():
            if name.lower() in (person["name_hi"].lower(), person["name_en"].lower()):
                return {**person, "created": False}  # already there: never create a duplicate
        village = " ".join(req.village.split()) or "—"
        new_id = store.add_beneficiary(name_hi=name, name_en=name, village=village, village_en=village)
        return {**store.get_beneficiary(new_id), "created": True}

    @app.get("/api/beneficiaries")
    def beneficiaries(store: Database = Depends(get_db)) -> list[dict]:
        return store.list_beneficiaries()

    @app.get("/api/beneficiaries/{beneficiary_id}")
    def beneficiary(beneficiary_id: int, store: Database = Depends(get_db)) -> dict:
        person = store.get_beneficiary(beneficiary_id)
        if person is None:
            raise HTTPException(404, MSG_NOT_FOUND)
        return person

    @app.get("/api/due")
    def due(store: Database = Depends(get_db)) -> dict:
        today = settings.today()
        return {
            "today": store.due_on(today),
            "tomorrow": store.due_on(today + timedelta(days=1)),
            "overdue": store.overdue(today),
            "tomorrow_date": (today + timedelta(days=1)).isoformat(),
        }

    @app.get("/api/high-risk")
    def high_risk(store: Database = Depends(get_db)) -> list[dict]:
        return store.high_risk()

    @app.post("/api/demo/reset")
    def reset_demo(store: Database = Depends(get_db)) -> dict:
        store.wipe()
        seed(store, settings.today())
        return {"ok": True, "beneficiaries": store.count_beneficiaries()}

    _mount_frontend(app, settings.static_dir)
    return app


def _brief(person: dict) -> dict:
    return {k: person[k] for k in ("id", "name_hi", "name_en", "village", "village_en")}


def _mount_frontend(app: FastAPI, static_dir: Path) -> None:
    index = static_dir / "index.html"
    if not index.exists():
        log.warning("Frontend build not found at %s — API only", static_dir)
        return
    if (static_dir / "assets").exists():
        app.mount("/assets", StaticFiles(directory=static_dir / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str) -> FileResponse:
        if path.startswith("api/"):
            raise HTTPException(404, "नहीं मिला / Not found")
        candidate = (static_dir / path).resolve()
        if path and candidate.is_file() and static_dir.resolve() in candidate.parents:
            return FileResponse(candidate)
        return FileResponse(index)
