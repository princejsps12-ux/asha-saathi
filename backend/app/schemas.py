"""Pydantic models shared by the parser, the rules engine and the API."""
from __future__ import annotations

from datetime import date
from typing import Literal, Optional

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

    beneficiary_id: Optional[int] = None
    beneficiary_name: Optional[str] = None
    beneficiary_name_en: Optional[str] = None
    pregnancy_month: Optional[int] = Field(None, ge=1, le=10)
    bp_systolic: Optional[int] = Field(None, ge=50, le=260)
    bp_diastolic: Optional[int] = Field(None, ge=30, le=180)
    hb: Optional[float] = Field(None, ge=2, le=20, description="Haemoglobin g/dL")
    weight_kg: Optional[float] = Field(None, ge=25, le=150)
    temperature_f: Optional[float] = Field(None, ge=90, le=110)
    symptoms: list[str] = Field(default_factory=list)
    fetal_movement: Optional[Literal["normal", "reduced"]] = None
    ifa_taking: Optional[bool] = None
    ifa_tablets: Optional[int] = Field(None, ge=0, le=400)
    td_dose: Optional[int] = Field(None, ge=1, le=3, description="1, 2 or 3 (=booster)")
    vaccine_given: Optional[bool] = None
    next_visit_date: Optional[date] = None


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
    engine_note: Optional[str] = None


class VisitCreate(BaseModel):
    transcript: str = Field("", max_length=4000)
    fields: VisitFields


class IntentRequest(BaseModel):
    text: str = Field(..., max_length=500)
