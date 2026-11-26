"""Pydantic models shared by the parser, the rules engine and the API."""
from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

# Symptom codes the parser can emit -> (Hindi label, English label).
SYMPTOM_LABELS: dict[str, tuple[str, str]] = {
    "swelling": ("पैरों में सूजन", "Swelling (feet)"),
    "swelling_face_hands": ("चेहरे/हाथों पर सूजन", "Swelling of face/hands"),
    "headache": ("सिर दर्द", "Headache"),
    "blurred_vision": ("धुंधला दिखना", "Blurred vision"),
    "bleeding": ("खून आना", "Vaginal bleeding"),
    "convulsions": ("दौरे / झटके", "Convulsions / fits"),
    "breathlessness": ("सांस फूलना", "Breathlessness"),
    "pallor_weakness": ("कमज़ोरी / पीलापन", "Weakness / pallor"),
    "abdominal_pain": ("पेट में दर्द", "Abdominal pain"),
    "fever": ("बुखार", "Fever"),
}


class VisitFields(BaseModel):
    """Structured ANC home-visit register entry."""

    beneficiary_id: int | None = None
    beneficiary_name: str | None = None
    beneficiary_name_en: str | None = None
    # No confident match: the name as spoken (offer "add as new woman?") and close candidates.
    beneficiary_name_heard: str | None = Field(None, max_length=80)
    beneficiary_suggestions: list[int] = Field(default_factory=list)
    pregnancy_month: int | None = Field(None, ge=1, le=10)
    bp_systolic: int | None = Field(None, ge=50, le=260)
    bp_diastolic: int | None = Field(None, ge=30, le=180)
    # A BP was spoken but could not be read as a valid pair (e.g. STT gave "15 बाय 100").
    # Values stay empty — we never guess — and the app asks for the BP again.
    bp_unclear: bool = False
    bp_heard: str | None = Field(None, max_length=20, description="What was heard, e.g. '15/100'")
    hb: float | None = Field(None, ge=2, le=20, description="Haemoglobin g/dL")
    weight_kg: float | None = Field(None, ge=25, le=150)
    temperature_f: float | None = Field(None, ge=90, le=110)
    symptoms: list[str] = Field(default_factory=list)
    # "unclear": movement was mentioned but neither reduced nor normal wording was heard.
    fetal_movement: Literal["normal", "reduced", "unclear"] | None = None
    ifa_taking: bool | None = None
    ifa_tablets: int | None = Field(None, ge=0, le=400)
    td_dose: int | None = Field(None, ge=1, le=3, description="1, 2 or 3 (=booster)")
    vaccine_given: bool | None = None
    next_visit_date: date | None = None


class Alert(BaseModel):
    code: str
    severity: Literal["red", "amber"]
    title_hi: str
    title_en: str
    reason: str  # human-readable WHY in English, includes the measured values
    reason_hi: str = ""  # same WHY in Hindi
    action_hi: str
    action_en: str = ""
    source: str  # guideline citation


class ExtractRequest(BaseModel):
    transcript: str = Field(..., min_length=1, max_length=4000)
    # When set, the transcript is a spoken *correction* ("BP 150 by 100") merged into this entry.
    base: VisitFields | None = None


class EvaluateRequest(BaseModel):
    fields: VisitFields


class Analysis(BaseModel):
    fields: VisitFields
    alerts: list[Alert]
    risk: Literal["red", "amber", "normal"]
    summary_hi: str  # Hindi read-back, ends with the yes/no question
    summary_en: str  # English read-back, ends with the yes/no question
    gloss_en: str  # English gloss of the extracted visit (no question) for the transcript card
    engine: Literal["rules", "gemini+rules"] = "rules"
    engine_note: str | None = None
    unclear: list[str] = Field(default_factory=list)  # fields to ask again: "bp", "fetal_movement"
    suggestions: list[dict] = Field(default_factory=list)  # [{id, name_hi, name_en, …}] for "did you mean…?"
    changed: bool = True  # for a correction: did it add or change anything?


class VisitCreate(BaseModel):
    transcript: str = Field("", max_length=4000)
    fields: VisitFields


class IntentRequest(BaseModel):
    text: str = Field(..., max_length=500)


class BeneficiaryCreate(BaseModel):
    """A new woman added from the visit screen ("नई लाभार्थी जोड़ें?")."""
    name: str = Field(..., min_length=2, max_length=60)
    village: str = Field("", max_length=60)
