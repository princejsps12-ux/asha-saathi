"""Optional paid-API upgrades. Each one is used only if its key is set and
always degrades to the offline path on any error (timeout, quota, outage).
"""
from __future__ import annotations

import json
import logging
from datetime import date
from typing import Any, Optional

import httpx
from pydantic import ValidationError

from .config import Settings
from .parser import KnownBeneficiary
from .schemas import SYMPTOM_LABELS, VisitFields

log = logging.getLogger("asha.integrations")

SARVAM_STT_URL = "https://api.sarvam.ai/speech-to-text"
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


class IntegrationError(RuntimeError):
    """Raised when an optional API is unavailable; callers fall back to offline mode."""


# ------------------------------------------------------------------ Sarvam STT
def sarvam_transcribe(audio: bytes, filename: str, content_type: str, settings: Settings) -> str:
    if not settings.sarvam_enabled:
        raise IntegrationError("SARVAM_API_KEY not set")
    try:
        resp = httpx.post(
            SARVAM_STT_URL,
            headers={"api-subscription-key": settings.sarvam_api_key},
            files={"file": (filename, audio, content_type)},
            data={"model": settings.sarvam_model, "language_code": "hi-IN"},
            timeout=settings.api_timeout_s,
        )
        resp.raise_for_status()
        transcript = resp.json().get("transcript", "").strip()
    except (httpx.HTTPError, ValueError) as exc:
        log.warning("Sarvam STT failed: %s", exc)
        raise IntegrationError(f"Sarvam STT failed: {type(exc).__name__}") from exc
    if not transcript:
        raise IntegrationError("Sarvam returned an empty transcript")
    return transcript


# ------------------------------------------------------------- Gemini extract
def _prompt(transcript: str, people: list[KnownBeneficiary], today: date) -> str:
    roster = "\n".join(f"- id {p.id}: {p.name_hi} ({p.name_en})" for p in people)
    return f"""You extract an Indian ASHA worker's spoken antenatal home-visit note into JSON.
Today is {today.isoformat()} (resolve "kal"/"agle hafte"/"next week" etc. to an ISO date for the NEXT visit).
Known beneficiaries:
{roster}
Return ONLY a JSON object with these keys (null when not mentioned):
beneficiary_id (int from the list), pregnancy_month (1-10), bp_systolic, bp_diastolic (int mmHg),
hb (g/dL), weight_kg, temperature_f (Fahrenheit), symptoms (array of codes from {sorted(SYMPTOM_LABELS)}),
fetal_movement ("normal"|"reduced"), ifa_taking (bool), ifa_tablets (int), td_dose (1, 2 or 3=booster),
vaccine_given (bool), next_visit_date (YYYY-MM-DD).
Only list symptoms that are present; ignore negated ones ("sujan nahi").
Note: {json.dumps(transcript, ensure_ascii=False)}"""


def _clean_llm_fields(raw: dict[str, Any], known_ids: set[int]) -> dict[str, Any]:
    """Keep only keys that individually validate, so one bad value can't sink the rest."""
    clean: dict[str, Any] = {}
    for key, value in raw.items():
        if key not in VisitFields.model_fields or value in (None, "", []):
            continue
        if key == "symptoms":
            value = [s for s in value if s in SYMPTOM_LABELS] if isinstance(value, list) else []
            if not value:
                continue
        if key == "beneficiary_id" and value not in known_ids:
            continue
        try:
            clean[key] = getattr(VisitFields(**{key: value}), key)
        except ValidationError:
            log.info("Dropping invalid LLM field %s=%r", key, value)
    return clean


def gemini_extract(transcript: str, people: list[KnownBeneficiary], today: date,
                   settings: Settings) -> dict[str, Any]:
    if not settings.gemini_enabled:
        raise IntegrationError("GEMINI_API_KEY not set")
    body = {
        "contents": [{"parts": [{"text": _prompt(transcript, people, today)}]}],
        "generationConfig": {"responseMimeType": "application/json", "temperature": 0},
    }
    try:
        resp = httpx.post(GEMINI_URL.format(model=settings.gemini_model), json=body,
                          headers={"x-goog-api-key": settings.gemini_api_key}, timeout=settings.api_timeout_s)
        resp.raise_for_status()
        text = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
        raw = json.loads(text)
        if not isinstance(raw, dict):
            raise ValueError("LLM did not return an object")
    except (httpx.HTTPError, KeyError, IndexError, ValueError) as exc:
        log.warning("Gemini extraction failed: %s", exc)
        raise IntegrationError(f"Gemini failed: {type(exc).__name__}") from exc
    return _clean_llm_fields(raw, {p.id for p in people})


def merge_fields(parsed: VisitFields, llm: Optional[dict[str, Any]]) -> VisitFields:
    """LLM values win where present; the rule-based parse fills every gap."""
    if not llm:
        return parsed
    merged = parsed.model_dump()
    for key, value in llm.items():
        if key == "symptoms":
            merged[key] = list(dict.fromkeys(value + parsed.symptoms))
        else:
            merged[key] = value
    return VisitFields(**merged)
