"""ANC danger-sign rules. EVERY clinical threshold lives in this file.

Sources (Government of India, MoHFW / NHM):
  [SBA]  MoHFW, "Guidelines for Antenatal Care and Skilled Attendance at Birth by
         ANMs/LHVs/SNs" (2010) — ANC examination, PIH, anaemia and referral sections.
  [MCP]  MoHFW, Mother and Child Protection (MCP) Card — "danger signs during
         pregnancy, go to hospital immediately" panel.
  [ASHA] NHM, ASHA Module 6 / "Home Based Newborn Care" & ASHA Module 7 — danger
         signs in pregnancy that ASHA must refer.
  [AMB]  MoHFW, Anemia Mukt Bharat Intensified NIPI Operational Guidelines (2018).
  [PMSMA] MoHFW, Pradhan Mantri Surakshit Matritva Abhiyan — high-risk pregnancy
         (HRP) identification criteria.

These rules support, not replace, clinical judgement. Thresholds should be reviewed
by the district's medical officer before field deployment.
"""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from .schemas import Alert, VisitFields

# ----------------------------------------------------------------- thresholds
# [SBA] PIH section: BP >= 140/90 mmHg at ANC = hypertension in pregnancy -> refer to MO.
BP_HIGH_SYSTOLIC = 140
BP_HIGH_DIASTOLIC = 90
# [SBA] / [PMSMA]: BP >= 160/110 mmHg = severe hypertension -> urgent referral to FRU.
BP_SEVERE_SYSTOLIC = 160
BP_SEVERE_DIASTOLIC = 110
# [AMB] / [SBA]: Hb < 11 g/dL = anaemia in pregnancy; Hb < 7 g/dL = severe anaemia.
HB_ANAEMIA = 11.0
HB_SEVERE_ANAEMIA = 7.0
# [SBA]: quickening is felt from ~20 weeks (5th month); [MCP] reduced/absent fetal
# movement after that is a danger sign.
FETAL_MOVEMENT_FROM_MONTH = 5
# [MCP] "high fever" is a danger sign; fever = temperature >= 38 °C (100.4 °F) [SBA].
FEVER_F = 100.4
# [AMB]: 180 IFA tablets in pregnancy, 1 daily starting from the 2nd trimester (4th month).
IFA_START_MONTH = 4

# (Hindi, English) referral actions.
EMERGENCY = ("तुरंत 108 एम्बुलेंस बुलाएँ / FRU रेफ़र करें", "Call 108 ambulance / refer to FRU now")
REFER = ("आज ही PHC / मेडिकल ऑफिसर के पास रेफ़र करें", "Refer to PHC / medical officer today")
WATCH = ("ANM को बताएं, अगली विज़िट में दोबारा जाँचें", "Inform the ANM and recheck at the next visit")
ASK_AGAIN = ("दोबारा नापें / पूछें और दर्ज करें", "Measure / ask again and record it")

# "Spoken but not understood" alerts: they ask for a value again rather than flag a risk.
CLARIFY_CODES = frozenset({"bp_unclear", "fetal_movement_unclear"})

Why = tuple[str, str]  # (English reason, Hindi reason) — both include measured values


@dataclass(frozen=True)
class Rule:
    code: str
    severity: str
    title_hi: str
    title_en: str
    action: tuple[str, str]  # (Hindi, English)
    source: str
    check: Callable[[VisitFields], Why | None]  # returns WHY (en, hi) when fired


def _has(f: VisitFields, *codes: str) -> bool:
    return any(c in f.symptoms for c in codes)


def _bp(f: VisitFields) -> str:
    return f"{f.bp_systolic or '?'}/{f.bp_diastolic or '?'}"


def _severe_htn(f: VisitFields) -> Why | None:
    if (f.bp_systolic or 0) >= BP_SEVERE_SYSTOLIC or (f.bp_diastolic or 0) >= BP_SEVERE_DIASTOLIC:
        limit = f"{BP_SEVERE_SYSTOLIC}/{BP_SEVERE_DIASTOLIC}"
        return f"BP {_bp(f)} mmHg ≥ {limit}", f"बीपी {_bp(f)} — सीमा {limit} या ज़्यादा"
    return None


def _htn(f: VisitFields) -> Why | None:
    if _severe_htn(f):
        return None  # reported by the severe rule instead
    if (f.bp_systolic or 0) >= BP_HIGH_SYSTOLIC or (f.bp_diastolic or 0) >= BP_HIGH_DIASTOLIC:
        limit = f"{BP_HIGH_SYSTOLIC}/{BP_HIGH_DIASTOLIC}"
        return f"BP {_bp(f)} mmHg ≥ {limit}", f"बीपी {_bp(f)} — सीमा {limit} या ज़्यादा"
    return None


def _preeclampsia(f: VisitFields) -> Why | None:
    if _has(f, "swelling", "swelling_face_hands") and _has(f, "headache", "blurred_vision"):
        return ("Swelling + headache/blurred vision together (pre-eclampsia warning)",
                "सूजन के साथ सिर दर्द / धुंधला दिखना")
    return None


def _face_swelling(f: VisitFields) -> Why | None:
    if _has(f, "swelling_face_hands") and not _preeclampsia(f):
        return "Swelling of face/hands reported", "चेहरे / हाथों पर सूजन बताई गई"
    return None


def _headache_vision(f: VisitFields) -> Why | None:
    if _has(f, "headache") and _has(f, "blurred_vision") and not _preeclampsia(f):
        return "Severe headache with blurred vision", "सिर दर्द के साथ धुंधला दिखना"
    return None


def _convulsions(f: VisitFields) -> Why | None:
    if _has(f, "convulsions"):
        return "Convulsions / fits reported (possible eclampsia)", "दौरे / झटके बताए गए"
    return None


def _bleeding(f: VisitFields) -> Why | None:
    if _has(f, "bleeding"):
        return "Vaginal bleeding reported — any bleeding in pregnancy", "गर्भावस्था में खून आना"
    return None


def _fetal_movement(f: VisitFields) -> Why | None:
    if f.fetal_movement != "reduced":
        return None
    if f.pregnancy_month is not None and f.pregnancy_month < FETAL_MOVEMENT_FROM_MONTH:
        return None
    month_en = f"month {f.pregnancy_month}" if f.pregnancy_month else "month not recorded"
    month_hi = f"{f.pregnancy_month}वाँ महीना" if f.pregnancy_month else "महीना दर्ज नहीं"
    return (f"Baby movement reduced/absent ({month_en}, expected from month {FETAL_MOVEMENT_FROM_MONTH})",
            f"बच्चे की हलचल कम / नहीं ({month_hi}; {FETAL_MOVEMENT_FROM_MONTH}वें महीने से हलचल होनी चाहिए)")


def _severe_anaemia(f: VisitFields) -> Why | None:
    if f.hb is not None and f.hb < HB_SEVERE_ANAEMIA:
        return f"Hb {f.hb} g/dL < {HB_SEVERE_ANAEMIA}", f"हीमोग्लोबिन {f.hb} — {HB_SEVERE_ANAEMIA} से कम"
    if _has(f, "breathlessness"):
        return "Breathlessness reported (sign of severe anaemia)", "सांस फूलना (गंभीर खून की कमी का संकेत)"
    return None


def _anaemia(f: VisitFields) -> Why | None:
    if f.hb is not None and HB_SEVERE_ANAEMIA <= f.hb < HB_ANAEMIA:
        return f"Hb {f.hb} g/dL < {HB_ANAEMIA}", f"हीमोग्लोबिन {f.hb} — {HB_ANAEMIA} से कम"
    if f.hb is None and _has(f, "pallor_weakness") and not _severe_anaemia(f):
        return ("Weakness/pallor reported, Hb not measured — get Hb test",
                "कमज़ोरी / पीलापन, हीमोग्लोबिन जाँच नहीं हुई — जाँच कराएँ")
    return None


def _abdominal_pain(f: VisitFields) -> Why | None:
    # Over-alerting is deliberate: an ASHA cannot grade pain severity at home.
    if _has(f, "abdominal_pain"):
        return "Abdominal pain reported — needs examination", "पेट में दर्द — जाँच ज़रूरी"
    return None


def _high_fever(f: VisitFields) -> Why | None:
    if f.temperature_f is not None and f.temperature_f >= FEVER_F:
        return (f"Temperature {f.temperature_f} °F ≥ {FEVER_F} °F",
                f"तापमान {f.temperature_f} °F — {FEVER_F} °F या ज़्यादा")
    return None


def _fever_reported(f: VisitFields) -> Why | None:
    if _has(f, "fever") and f.temperature_f is None:
        return "Fever reported, temperature not measured", "बुखार बताया, तापमान नहीं नापा"
    return None


def _no_ifa(f: VisitFields) -> Why | None:
    if f.ifa_taking is False and (f.pregnancy_month or IFA_START_MONTH) >= IFA_START_MONTH:
        return (f"Not taking IFA tablets (180 tablets advised from month {IFA_START_MONTH})",
                f"आयरन की गोली नहीं ले रही ({IFA_START_MONTH}वें महीने से 180 गोली ज़रूरी)")
    return None


def _bp_unclear(f: VisitFields) -> Why | None:
    # Never guess a BP from a mis-heard number: ask for it again.
    if f.bp_unclear:
        heard = f" '{f.bp_heard}'" if f.bp_heard else ""
        return (f"BP heard as{heard} — not a valid reading; re-measure or say it again",
                f"बीपी{heard} सुना — यह सही रीडिंग नहीं; दोबारा नापें या बोलें")
    return None


def _fetal_movement_unclear(f: VisitFields) -> Why | None:
    if f.fetal_movement != "unclear":
        return None
    if f.pregnancy_month is not None and f.pregnancy_month < FETAL_MOVEMENT_FROM_MONTH:
        return None
    return ("Baby movement mentioned but unclear — ask: reduced or normal?",
            "बच्चे की हलचल साफ़ नहीं — पूछें: कम है या ठीक?")


def _swelling_only(f: VisitFields) -> Why | None:
    if _has(f, "swelling") and not (_preeclampsia(f) or _has(f, "swelling_face_hands")):
        return "Swelling of feet — check BP and urine albumin", "पैरों में सूजन — बीपी और पेशाब की जाँच करें"
    return None


def _headache_only(f: VisitFields) -> Why | None:
    if _has(f, "headache") and not (_preeclampsia(f) or _headache_vision(f)):
        return "Headache reported — check BP", "सिर दर्द — बीपी जाँचें"
    return None


RULES: tuple[Rule, ...] = (
    Rule("severe_hypertension", "red", "बहुत ज़्यादा बीपी", "Severe high BP", EMERGENCY,
         "[SBA] PIH; [PMSMA] HRP criteria", _severe_htn),
    Rule("hypertension", "red", "हाई बीपी", "High BP in pregnancy", REFER, "[SBA] PIH: BP ≥140/90", _htn),
    Rule("convulsions", "red", "दौरे / झटके", "Convulsions", EMERGENCY,
         "[MCP] danger signs; [SBA] eclampsia", _convulsions),
    Rule("preeclampsia_signs", "red", "प्री-एक्लेम्पसिया के लक्षण", "Pre-eclampsia warning signs", REFER,
         "[MCP] swelling of face/hands, severe headache, blurred vision", _preeclampsia),
    Rule("face_hand_swelling", "red", "चेहरे/हाथों पर सूजन", "Swelling of face/hands", REFER,
         "[MCP] danger signs", _face_swelling),
    Rule("headache_blurred_vision", "red", "सिर दर्द और धुंधला दिखना", "Headache with blurred vision", REFER,
         "[MCP] danger signs", _headache_vision),
    Rule("bleeding", "red", "खून आना", "Bleeding in pregnancy", EMERGENCY,
         "[MCP] danger signs; [ASHA] Module 7", _bleeding),
    Rule("reduced_fetal_movement", "red", "बच्चे की हलचल कम", "Reduced fetal movement", REFER,
         "[MCP] danger signs; [SBA] fetal movement", _fetal_movement),
    Rule("severe_anaemia", "red", "गंभीर खून की कमी", "Severe anaemia", REFER,
         "[AMB] Hb <7 g/dL; [MCP] breathlessness", _severe_anaemia),
    Rule("abdominal_pain", "red", "पेट में दर्द", "Abdominal pain", REFER, "[MCP] danger signs", _abdominal_pain),
    Rule("high_fever", "red", "तेज़ बुखार", "High fever", REFER, "[MCP] high fever; [SBA] ≥38 °C", _high_fever),
    Rule("anaemia", "amber", "खून की कमी", "Anaemia", WATCH, "[AMB] Hb <11 g/dL in pregnancy", _anaemia),
    Rule("fever_reported", "amber", "बुखार", "Fever (not measured)", WATCH, "[MCP] fever", _fever_reported),
    Rule("swelling_feet", "amber", "पैरों में सूजन", "Swelling of feet", WATCH, "[SBA] oedema with BP check",
         _swelling_only),
    Rule("headache", "amber", "सिर दर्द", "Headache", WATCH, "[SBA] PIH symptom screening", _headache_only),
    Rule("no_ifa", "amber", "आयरन की गोली नहीं ले रही", "Not taking IFA", WATCH,
         "[AMB] 180 IFA tablets in pregnancy", _no_ifa),
    Rule("bp_unclear", "amber", "बीपी साफ़ नहीं सुना", "BP not clear", ASK_AGAIN,
         "[SBA] BP must be recorded at every ANC visit", _bp_unclear),
    Rule("fetal_movement_unclear", "amber", "हलचल साफ़ नहीं", "Baby movement unclear", ASK_AGAIN,
         "[MCP] reduced fetal movement is a danger sign", _fetal_movement_unclear),
)


def evaluate(fields: VisitFields) -> list[Alert]:
    """Run every rule; red alerts first. Each alert says WHY it fired, in English and Hindi."""
    alerts = []
    for rule in RULES:
        why = rule.check(fields)
        if why:
            alerts.append(Alert(code=rule.code, severity=rule.severity, title_hi=rule.title_hi,
                                title_en=rule.title_en, reason=why[0], reason_hi=why[1],
                                action_hi=rule.action[0], action_en=rule.action[1], source=rule.source))
    return sorted(alerts, key=lambda a: a.severity != "red")


def risk_level(alerts: list[Alert]) -> str:
    if any(a.severity == "red" for a in alerts):
        return "red"
    return "amber" if alerts else "normal"
