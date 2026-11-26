"""Read-back text (spoken by browser TTS) and an English gloss, both built only from
the extracted fields (no API key, no extra service) and always match what will be saved."""
from __future__ import annotations

from datetime import date

from .rules import CLARIFY_CODES
from .schemas import SYMPTOM_LABELS, Alert, VisitFields

HINDI_MONTHS = ("जनवरी", "फ़रवरी", "मार्च", "अप्रैल", "मई", "जून", "जुलाई", "अगस्त", "सितंबर",
                "अक्टूबर", "नवंबर", "दिसंबर")
EN_MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")

QUESTION_HI = "क्या यह सही है? हाँ या नहीं बोलिए।"
QUESTION_EN = "Is this correct? Say yes or no."
# When something was spoken but not understood we ask for it, never guess it.
BP_UNCLEAR_HI = "बीपी समझ नहीं आया, दोबारा बोलिए"
BP_UNCLEAR_EN = "BP not clear, please say again"
MOVEMENT_UNCLEAR_HI = "बच्चे की हलचल साफ़ समझ नहीं आई — कम है या ठीक? दोबारा बताइए"
MOVEMENT_UNCLEAR_EN = "Baby movement not clear — reduced or normal? Please say again"
CLARIFY_HI = "अभी दोबारा बोलिए, या 'हाँ' बोलकर ऐसे ही सेव करें।"
CLARIFY_EN = "Say it again now, or say 'yes' to save it as it is."


def _needs_clarifying(f: VisitFields) -> bool:
    return f.bp_unclear or f.fetal_movement == "unclear"


def _risk_alerts(alerts: list[Alert]) -> list[Alert]:
    return [a for a in alerts if a.code not in CLARIFY_CODES]  # asked for separately


def hindi_date(d: date, today: date) -> str:
    relative = {0: "आज", 1: "कल", 2: "परसों"}.get((d - today).days)
    absolute = f"{d.day} {HINDI_MONTHS[d.month - 1]}"
    return f"{relative}, {absolute}" if relative else absolute


def english_date(d: date, today: date) -> str:
    relative = {0: "today", 1: "tomorrow", 2: "the day after tomorrow"}.get((d - today).days)
    absolute = f"{d.day} {EN_MONTHS[d.month - 1]}"
    return f"{relative}, {absolute}" if relative else absolute


def _unknown_woman_hi(f: VisitFields, suggested: list[dict]) -> str:
    if suggested:
        return f"क्या आपका मतलब {suggested[0]['name_hi']} है? सूची से चुनें"
    if f.beneficiary_name_heard:
        return f"{f.beneficiary_name_heard} — यह नाम सूची में नहीं है। नई लाभार्थी जोड़ें या सूची से चुनें"
    return "लाभार्थी का नाम नहीं मिला, कृपया सूची से चुनें"


def _unknown_woman_en(f: VisitFields, suggested: list[dict]) -> str:
    if suggested:
        return f"Did you mean {suggested[0]['name_en']}? Pick from the list"
    if f.beneficiary_name_heard:
        return f"{f.beneficiary_name_heard} is not on the list. Add as a new woman, or pick from the list"
    return "Beneficiary not recognised, please pick from the list"


def _hindi_parts(f: VisitFields, alerts: list[Alert], today: date, suggested: list[dict]) -> list[str]:
    parts = [f.beneficiary_name or _unknown_woman_hi(f, suggested)]
    if f.pregnancy_month:
        parts.append(f"{f.pregnancy_month} महीने की गर्भवती")
    if f.bp_systolic and f.bp_diastolic:
        parts.append(f"बीपी {f.bp_systolic} बटा {f.bp_diastolic}")
    elif f.bp_unclear:
        parts.append(BP_UNCLEAR_HI)
    if f.hb is not None:
        parts.append(f"हीमोग्लोबिन {f.hb:g}")
    if f.weight_kg is not None:
        parts.append(f"वज़न {f.weight_kg:g} किलो")
    if f.temperature_f is not None:
        parts.append(f"तापमान {f.temperature_f:g} डिग्री")
    if f.symptoms:
        parts.append("लक्षण: " + ", ".join(SYMPTOM_LABELS[s][0] for s in f.symptoms if s in SYMPTOM_LABELS))
    if f.fetal_movement == "unclear":
        parts.append(MOVEMENT_UNCLEAR_HI)
    elif f.fetal_movement:
        parts.append("बच्चे की हलचल " + ("कम है" if f.fetal_movement == "reduced" else "ठीक है"))
    if f.ifa_taking is not None:
        parts.append("आयरन की गोली " + ("ले रही हैं" if f.ifa_taking else "नहीं ले रही हैं"))
    if f.td_dose:
        parts.append(f"टीडी का {['पहला', 'दूसरा', 'बूस्टर'][f.td_dose - 1]} टीका")
    elif f.vaccine_given:
        parts.append("टीका लगा")
    if f.next_visit_date:
        parts.append(f"अगली विज़िट {hindi_date(f.next_visit_date, today)}")
    alerts = _risk_alerts(alerts)
    red = [a for a in alerts if a.severity == "red"]
    if red:
        parts.append("खतरे का संकेत: " + ", ".join(a.title_hi for a in red) + "। " + red[0].action_hi)
    elif alerts:
        parts.append("ध्यान दें: " + ", ".join(a.title_hi for a in alerts))
    return parts


def _english_parts(f: VisitFields, alerts: list[Alert], today: date, suggested: list[dict]) -> list[str]:
    parts = [f.beneficiary_name_en or f.beneficiary_name or _unknown_woman_en(f, suggested)]
    if f.pregnancy_month:
        parts.append(f"{f.pregnancy_month} months pregnant")
    if f.bp_systolic and f.bp_diastolic:
        parts.append(f"BP {f.bp_systolic}/{f.bp_diastolic}")
    elif f.bp_unclear:
        parts.append(BP_UNCLEAR_EN)
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
    if f.fetal_movement == "unclear":
        parts.append(MOVEMENT_UNCLEAR_EN)
    elif f.fetal_movement:
        parts.append("Baby movement " + ("reduced" if f.fetal_movement == "reduced" else "normal"))
    if f.ifa_taking is not None:
        parts.append("Taking IFA tablets" if f.ifa_taking else "Not taking IFA tablets")
    if f.td_dose:
        parts.append(f"Td {['1st dose', '2nd dose', 'booster'][f.td_dose - 1]} given")
    elif f.vaccine_given:
        parts.append("Vaccine given")
    if f.next_visit_date:
        parts.append(f"Next visit {english_date(f.next_visit_date, today)}")
    alerts = _risk_alerts(alerts)
    red = [a for a in alerts if a.severity == "red"]
    if red:
        parts.append("Danger sign: " + ", ".join(a.title_en for a in red) + ". " + red[0].action_en)
    elif alerts:
        parts.append("Watch: " + ", ".join(a.title_en for a in alerts))
    return parts


def build_summary(f: VisitFields, alerts: list[Alert], today: date, suggested: list[dict] | None = None) -> str:
    """Hindi read-back, ending with the yes/no question."""
    question = CLARIFY_HI if _needs_clarifying(f) else QUESTION_HI
    return "। ".join(_hindi_parts(f, alerts, today, suggested or [])) + "। " + question


def build_gloss_en(f: VisitFields, alerts: list[Alert], today: date, suggested: list[dict] | None = None) -> str:
    """English gloss of the extracted visit, shown under the (Hindi) transcript."""
    return ". ".join(_english_parts(f, alerts, today, suggested or [])) + "."


def build_summary_en(f: VisitFields, alerts: list[Alert], today: date, suggested: list[dict] | None = None) -> str:
    """English read-back, ending with the yes/no question."""
    question = CLARIFY_EN if _needs_clarifying(f) else QUESTION_EN
    return build_gloss_en(f, alerts, today, suggested) + " " + question
