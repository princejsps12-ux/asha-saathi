"""Hindi read-back text spoken by the browser's hi-IN text-to-speech."""
from __future__ import annotations

from datetime import date

from .schemas import SYMPTOM_LABELS, Alert, VisitFields

HINDI_MONTHS = ("जनवरी", "फ़रवरी", "मार्च", "अप्रैल", "मई", "जून", "जुलाई", "अगस्त", "सितंबर",
                "अक्टूबर", "नवंबर", "दिसंबर")


def hindi_date(d: date, today: date) -> str:
    relative = {0: "आज", 1: "कल", 2: "परसों"}.get((d - today).days)
    absolute = f"{d.day} {HINDI_MONTHS[d.month - 1]}"
    return f"{relative}, {absolute}" if relative else absolute


def build_summary(f: VisitFields, alerts: list[Alert], today: date) -> str:
    parts: list[str] = []
    parts.append(f.beneficiary_name or "लाभार्थी का नाम नहीं मिला, कृपया सूची से चुनें")
    if f.pregnancy_month:
        parts.append(f"{f.pregnancy_month} महीने की गर्भवती")
    if f.bp_systolic and f.bp_diastolic:
        parts.append(f"बीपी {f.bp_systolic} बटा {f.bp_diastolic}")
    if f.hb is not None:
        parts.append(f"हीमोग्लोबिन {f.hb:g}")
    if f.weight_kg is not None:
        parts.append(f"वज़न {f.weight_kg:g} किलो")
    if f.temperature_f is not None:
        parts.append(f"तापमान {f.temperature_f:g} डिग्री")
    if f.symptoms:
        parts.append("लक्षण: " + ", ".join(SYMPTOM_LABELS[s][0] for s in f.symptoms if s in SYMPTOM_LABELS))
    if f.fetal_movement:
        parts.append("बच्चे की हलचल " + ("कम है" if f.fetal_movement == "reduced" else "ठीक है"))
    if f.ifa_taking is not None:
        parts.append("आयरन की गोली " + ("ले रही हैं" if f.ifa_taking else "नहीं ले रही हैं"))
    if f.td_dose:
        parts.append(f"टीडी का {['पहला', 'दूसरा', 'बूस्टर'][f.td_dose - 1]} टीका")
    elif f.vaccine_given:
        parts.append("टीका लगा")
    if f.next_visit_date:
        parts.append(f"अगली विज़िट {hindi_date(f.next_visit_date, today)}")
    red = [a for a in alerts if a.severity == "red"]
    if red:
        parts.append("खतरे का संकेत: " + ", ".join(a.title_hi for a in red) + "। " + red[0].action_hi)
    elif alerts:
        parts.append("ध्यान दें: " + ", ".join(a.title_hi for a in alerts))
    return "। ".join(parts) + "। क्या यह सही है? हाँ या नहीं बोलिए।"
