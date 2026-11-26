"""Read-back text (spoken by browser TTS) and an English gloss, both built only from
the extracted fields, so they work fully offline and always match what will be saved."""
from __future__ import annotations

from datetime import date

from .schemas import SYMPTOM_LABELS, Alert, VisitFields

HINDI_MONTHS = ("जनवरी", "फ़रवरी", "मार्च", "अप्रैल", "मई", "जून", "जुलाई", "अगस्त", "सितंबर",
                "अक्टूबर", "नवंबर", "दिसंबर")
EN_MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")

QUESTION_HI = "क्या यह सही है? हाँ या नहीं बोलिए।"
QUESTION_EN = "Is this correct? Say yes or no."


def hindi_date(d: date, today: date) -> str:
    relative = {0: "आज", 1: "कल", 2: "परसों"}.get((d - today).days)
    absolute = f"{d.day} {HINDI_MONTHS[d.month - 1]}"
    return f"{relative}, {absolute}" if relative else absolute


def english_date(d: date, today: date) -> str:
    relative = {0: "today", 1: "tomorrow", 2: "the day after tomorrow"}.get((d - today).days)
    absolute = f"{d.day} {EN_MONTHS[d.month - 1]}"
    return f"{relative}, {absolute}" if relative else absolute


def _hindi_parts(f: VisitFields, alerts: list[Alert], today: date) -> list[str]:
    parts = [f.beneficiary_name or "लाभार्थी का नाम नहीं मिला, कृपया सूची से चुनें"]
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
    return parts


def _english_parts(f: VisitFields, alerts: list[Alert], today: date) -> list[str]:
    parts = [f.beneficiary_name_en or f.beneficiary_name or "Beneficiary not recognised, please pick from the list"]
    if f.pregnancy_month:
        parts.append(f"{f.pregnancy_month} months pregnant")
    if f.bp_systolic and f.bp_diastolic:
        parts.append(f"BP {f.bp_systolic}/{f.bp_diastolic}")
    if f.hb is not None:
        parts.append(f"Hb {f.hb:g} g/dL")
    if f.weight_kg is not None:
        parts.append(f"Weight {f.weight_kg:g} kg")
    if f.temperature_f is not None:
        parts.append(f"Temperature {f.temperature_f:g} °F")
    if f.symptoms:
        parts.append("Symptoms: " + ", ".join(SYMPTOM_LABELS[s][1].lower() for s in f.symptoms
                                               if s in SYMPTOM_LABELS))
    else:
        parts.append("No symptoms reported")
    if f.fetal_movement:
        parts.append("Baby movement " + ("reduced" if f.fetal_movement == "reduced" else "normal"))
    if f.ifa_taking is not None:
        parts.append("Taking IFA tablets" if f.ifa_taking else "Not taking IFA tablets")
    if f.td_dose:
        parts.append(f"Td {['1st dose', '2nd dose', 'booster'][f.td_dose - 1]} given")
    elif f.vaccine_given:
        parts.append("Vaccine given")
    if f.next_visit_date:
        parts.append(f"Next visit {english_date(f.next_visit_date, today)}")
    red = [a for a in alerts if a.severity == "red"]
    if red:
        parts.append("Danger sign: " + ", ".join(a.title_en for a in red) + ". " + red[0].action_en)
    elif alerts:
        parts.append("Watch: " + ", ".join(a.title_en for a in alerts))
    return parts


def build_summary(f: VisitFields, alerts: list[Alert], today: date) -> str:
    """Hindi read-back, ending with the yes/no question."""
    return "। ".join(_hindi_parts(f, alerts, today)) + "। " + QUESTION_HI


def build_gloss_en(f: VisitFields, alerts: list[Alert], today: date) -> str:
    """English gloss of the extracted visit, shown under the (Hindi) transcript."""
    return ". ".join(_english_parts(f, alerts, today)) + "."


def build_summary_en(f: VisitFields, alerts: list[Alert], today: date) -> str:
    """English read-back, ending with the yes/no question."""
    return build_gloss_en(f, alerts, today) + " " + QUESTION_EN
