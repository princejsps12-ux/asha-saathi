"""ANC danger-sign rules. EVERY clinical threshold lives in this file.

Each threshold and rule cites an official Government of India document by short tag,
PDF page number (as counted by a PDF viewer) and the document's URL. All were checked
against the actual PDFs on 2026-11-27.

  [SBA]  MoHFW Maternal Health Division, "Guidelines for Antenatal Care and Skilled
         Attendance at Birth by ANMs/LHVs/SNs", April 2010.
         https://nhm.gov.in/images/pdf/programmes/maternal-health/guidelines/sba_guidelines_for_skilled_attendance_at_birth.pdf
         Box 7 "Danger signs during pregnancy" (PDF p.42–43) sorts each sign into
         "Visit FRU" or "Visit 24-hour PHC"; our EMERGENCY / REFER actions follow it.
  [CHO]  MoHFW / NHSRC, "Training Manual on Care During Pregnancy and Child Birth for
         Community Health Officer at Ayushman Bharat – Health and Wellness Centres", 2021.
         https://nhsrcindia.org/sites/default/files/2021-12/Care%20During%20Pregnancy%20and%20Childbirth%20Training%20Manual%20for%20CHO%20at%20AB-HWC.pdf
  [MCP]  MoHFW & MoWCD, "Mother and Child Protection Card" (2018 English version).
         https://nhm.gov.in/New_Updates_2018/NHM_Components/Immunization/Guildelines_for_immunization/MCP_Card_English_version.pdf
         PDF p.4: "danger signs, take the pregnant woman to the hospital immediately".
  [AMB]  MoHFW, "Anemia Mukt Bharat Abhiyaan Operational Guidelines", June 2026
         (uses the WHO 2024 haemoglobin cut-offs).
         https://www.nhm.gov.in/New-Update-2025-26/Nutrition/AMB-guidelines/AMB-Abhiyaan-Guidelines.pdf

Not used for numbers: the PMSMA guidelines list high-risk *categories* (severe anaemia,
PIH, …) but give no numeric cut-offs.

These rules support, not replace, clinical judgement. Thresholds should be reviewed
by the district's medical officer before field deployment.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from .schemas import Alert, VisitFields

# ----------------------------------------------------------------- thresholds
# [SBA] PDF p.31: "Hypertension is diagnosed when … systolic … 140 mmHg or more and/or the
# diastolic … 90 mmHg or more". Same in [CHO] PDF p.45. Box 7 (PDF p.42): high BP -> 24-hour PHC.
BP_HIGH_SYSTOLIC = 140
BP_HIGH_DIASTOLIC = 90
# [SBA] PDF p.31: "If the diastolic blood pressure … is above 110 mmHg, it is a danger sign that
# points towards imminent eclampsia" -> FRU immediately. Same in [CHO] PDF p.22 and p.29.
# These MoHFW documents give NO systolic "severe" cut-off (e.g. 160), so none is used here.
BP_SEVERE_DIASTOLIC_ABOVE = 110
# [AMB] PDF p.56 (WHO 2024 cut-offs, pregnant women): anaemia is Hb below 11.0 g/dL in the first
# and third trimesters and below 10.5 g/dL in the second trimester; severe is below 7.0 g/dL.
# [SBA] PDF p.37 (2010) used one cut-off of 11 g/dl for the whole pregnancy.
HB_ANAEMIA = 11.0
HB_ANAEMIA_SECOND_TRIMESTER = 10.5
SECOND_TRIMESTER_MONTHS = range(4, 7)  # months 4–6 (≈ weeks 14–27); unknown month -> 11.0, the stricter cut-off
# [AMB] PDF p.56 and p.62, [SBA] PDF p.37: severe anaemia Hb < 7 g/dL; Box 7 (PDF p.42): Hb < 7 -> FRU.
HB_SEVERE_ANAEMIA = 7.0
# [SBA] PDF p.36: foetal movements ("quickening") "begin at around 18–22 weeks", i.e. month 5;
# "Decreased movements may be an indication of foetal distress". Box 7 (PDF p.42): -> FRU.
FETAL_MOVEMENT_FROM_MONTH = 5
# [SBA] Box 7 (PDF p.43): "Temperature more than 38°C" -> 24-hour PHC. 38 °C = 100.4 °F.
FEVER_ABOVE_F = 100.4
# [AMB] PDF p.50: "Daily one Red-IFA tablet for 180 days starting from the second trimester".
# The second trimester starts in month 4. ([SBA] PDF p.21, from 2010, said "at least 100 tablets".)
IFA_START_MONTH = 4
IFA_TABLETS = 180

# (Hindi, English) referral actions, matching the two columns of [SBA] Box 7 (PDF p.42–43).
EMERGENCY = ("तुरंत 108 एम्बुलेंस बुलाएँ / FRU रेफ़र करें", "Call 108 ambulance / refer to FRU now")
REFER = ("आज ही 24 घंटे वाले PHC / मेडिकल ऑफिसर के पास रेफ़र करें", "Refer to a 24-hour PHC / medical officer today")
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
    source: str  # document tag + PDF page, e.g. "[SBA] p.42 Box 7"
    check: Callable[[VisitFields], Why | None]  # returns WHY (en, hi) when fired


def _has(f: VisitFields, *codes: str) -> bool:
    return any(c in f.symptoms for c in codes)


def _bp(f: VisitFields) -> str:
    return f"{f.bp_systolic or '?'}/{f.bp_diastolic or '?'}"


def anaemia_cutoff(month: int | None) -> float:
    """Hb below which a pregnant woman is anaemic, for her month of pregnancy ([AMB] PDF p.56)."""
    return HB_ANAEMIA_SECOND_TRIMESTER if month in SECOND_TRIMESTER_MONTHS else HB_ANAEMIA


def _severe_htn(f: VisitFields) -> Why | None:
    if (f.bp_diastolic or 0) > BP_SEVERE_DIASTOLIC_ABOVE:
        return (
            f"BP {_bp(f)} mmHg: diastolic above {BP_SEVERE_DIASTOLIC_ABOVE} (imminent eclampsia)",
            f"बीपी {_bp(f)} — नीचे वाला {BP_SEVERE_DIASTOLIC_ABOVE} से ज़्यादा (एक्लेम्पसिया का खतरा)",
        )
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
        return ("Swelling + headache/blurred vision together (pre-eclampsia warning)", "सूजन के साथ सिर दर्द / धुंधला दिखना")
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
    return (
        f"Baby movement reduced/absent ({month_en}, expected from month {FETAL_MOVEMENT_FROM_MONTH})",
        f"बच्चे की हलचल कम / नहीं ({month_hi}; {FETAL_MOVEMENT_FROM_MONTH}वें महीने से हलचल होनी चाहिए)",
    )


def _severe_anaemia(f: VisitFields) -> Why | None:
    if f.hb is not None and f.hb < HB_SEVERE_ANAEMIA:
        return f"Hb {f.hb} g/dL < {HB_SEVERE_ANAEMIA}", f"हीमोग्लोबिन {f.hb} — {HB_SEVERE_ANAEMIA} से कम"
    return None


def _breathlessness(f: VisitFields) -> Why | None:
    if _has(f, "breathlessness"):
        return ("Breathlessness reported (possible severe anaemia)", "सांस फूलना (गंभीर खून की कमी का संकेत हो सकता है)")
    return None


def _anaemia(f: VisitFields) -> Why | None:
    cutoff = anaemia_cutoff(f.pregnancy_month)
    if f.hb is not None and HB_SEVERE_ANAEMIA <= f.hb < cutoff:
        trimester = "2nd trimester" if cutoff == HB_ANAEMIA_SECOND_TRIMESTER else "1st/3rd trimester"
        return (f"Hb {f.hb} g/dL < {cutoff} ({trimester} cut-off)", f"हीमोग्लोबिन {f.hb} — {cutoff} से कम")
    if f.hb is None and _has(f, "pallor_weakness"):
        return (
            "Weakness/pallor reported, Hb not measured — get Hb test",
            "कमज़ोरी / पीलापन, हीमोग्लोबिन जाँच नहीं हुई — जाँच कराएँ",
        )
    return None


def _abdominal_pain(f: VisitFields) -> Why | None:
    # [SBA] Box 7 lists "continuous severe abdominal pain". We alert on any reported abdominal
    # pain on purpose: an ASHA cannot grade pain severity at home.
    if _has(f, "abdominal_pain"):
        return "Abdominal pain reported — needs examination", "पेट में दर्द — जाँच ज़रूरी"
    return None


def _high_fever(f: VisitFields) -> Why | None:
    if f.temperature_f is not None and f.temperature_f > FEVER_ABOVE_F:
        return (
            f"Temperature {f.temperature_f} °F > {FEVER_ABOVE_F} °F (38 °C)",
            f"तापमान {f.temperature_f} °F — {FEVER_ABOVE_F} °F (38 °C) से ज़्यादा",
        )
    return None


def _fever_reported(f: VisitFields) -> Why | None:
    if _has(f, "fever") and f.temperature_f is None:
        return "Fever reported, temperature not measured", "बुखार बताया, तापमान नहीं नापा"
    return None


def _no_ifa(f: VisitFields) -> Why | None:
    if f.ifa_taking is False and (f.pregnancy_month or IFA_START_MONTH) >= IFA_START_MONTH:
        return (
            f"Not taking IFA tablets ({IFA_TABLETS} tablets advised from month {IFA_START_MONTH})",
            f"आयरन की गोली नहीं ले रही ({IFA_START_MONTH}वें महीने से {IFA_TABLETS} गोली ज़रूरी)",
        )
    return None


def _bp_unclear(f: VisitFields) -> Why | None:
    # Never guess a BP from a mis-heard number: ask for it again.
    if f.bp_unclear:
        heard = f" '{f.bp_heard}'" if f.bp_heard else ""
        return (
            f"BP heard as{heard} — not a valid reading; re-measure or say it again",
            f"बीपी{heard} सुना — यह सही रीडिंग नहीं; दोबारा नापें या बोलें",
        )
    return None


def _fetal_movement_unclear(f: VisitFields) -> Why | None:
    if f.fetal_movement != "unclear":
        return None
    if f.pregnancy_month is not None and f.pregnancy_month < FETAL_MOVEMENT_FROM_MONTH:
        return None
    return ("Baby movement mentioned but unclear — ask: reduced or normal?", "बच्चे की हलचल साफ़ नहीं — पूछें: कम है या ठीक?")


def _swelling_only(f: VisitFields) -> Why | None:
    if _has(f, "swelling") and not (_preeclampsia(f) or _has(f, "swelling_face_hands")):
        return "Swelling of feet — check BP and urine albumin", "पैरों में सूजन — बीपी और पेशाब की जाँच करें"
    return None


def _headache_only(f: VisitFields) -> Why | None:
    if _has(f, "headache") and not (_preeclampsia(f) or _headache_vision(f)):
        return "Headache reported — check BP", "सिर दर्द — बीपी जाँचें"
    return None


RULES: tuple[Rule, ...] = (
    # --- [SBA] Box 7 "Visit FRU" column -> EMERGENCY
    Rule(
        "severe_hypertension",
        "red",
        "बहुत ज़्यादा बीपी",
        "Severe high BP (imminent eclampsia)",
        EMERGENCY,
        "[SBA] p.31; [CHO] p.22, p.29",
        _severe_htn,
    ),
    Rule("convulsions", "red", "दौरे / झटके", "Convulsions", EMERGENCY, "[SBA] p.42 Box 7; [MCP] p.4", _convulsions),
    Rule("bleeding", "red", "खून आना", "Bleeding in pregnancy", EMERGENCY, "[SBA] p.42 Box 7; [MCP] p.4", _bleeding),
    Rule(
        "headache_blurred_vision",
        "red",
        "सिर दर्द और धुंधला दिखना",
        "Headache with blurred vision",
        EMERGENCY,
        "[SBA] p.42 Box 7; [MCP] p.4",
        _headache_vision,
    ),
    Rule(
        "reduced_fetal_movement",
        "red",
        "बच्चे की हलचल कम",
        "Reduced fetal movement",
        EMERGENCY,
        "[SBA] p.36, p.42 Box 7",
        _fetal_movement,
    ),
    Rule(
        "severe_anaemia",
        "red",
        "गंभीर खून की कमी",
        "Severe anaemia",
        EMERGENCY,
        "[SBA] p.42 Box 7; [AMB] p.56, p.62",
        _severe_anaemia,
    ),
    # --- refer today: [SBA] Box 7 "Visit 24-hour PHC" column, or "refer immediately" in the text
    Rule("hypertension", "red", "हाई बीपी", "High BP in pregnancy", REFER, "[SBA] p.31, p.42 Box 7; [CHO] p.45", _htn),
    Rule(
        "preeclampsia_signs",
        "red",
        "प्री-एक्लेम्पसिया के लक्षण",
        "Pre-eclampsia warning signs",
        REFER,
        "[SBA] p.43 Box 7; [MCP] p.4",
        _preeclampsia,
    ),
    Rule(
        "face_hand_swelling",
        "red",
        "चेहरे/हाथों पर सूजन",
        "Swelling of face/hands",
        REFER,
        "[SBA] p.31 (oedema)",
        _face_swelling,
    ),
    Rule("breathlessness", "red", "सांस फूलना", "Breathlessness", REFER, "[SBA] p.42 Box 7; [MCP] p.4", _breathlessness),
    Rule("abdominal_pain", "red", "पेट में दर्द", "Abdominal pain", REFER, "[SBA] p.43 Box 7", _abdominal_pain),
    Rule("high_fever", "red", "तेज़ बुखार", "High fever", REFER, "[SBA] p.43 Box 7; [MCP] p.4", _high_fever),
    # --- watch / follow up
    Rule("anaemia", "amber", "खून की कमी", "Anaemia", WATCH, "[AMB] p.56, p.62; [SBA] p.37", _anaemia),
    Rule("fever_reported", "amber", "बुखार", "Fever (not measured)", WATCH, "[MCP] p.4; [SBA] p.43", _fever_reported),
    Rule("swelling_feet", "amber", "पैरों में सूजन", "Swelling of feet", WATCH, "[SBA] p.31 (oedema)", _swelling_only),
    Rule("headache", "amber", "सिर दर्द", "Headache", WATCH, "[SBA] p.31 (measure BP)", _headache_only),
    Rule("no_ifa", "amber", "आयरन की गोली नहीं ले रही", "Not taking IFA", WATCH, "[AMB] p.50", _no_ifa),
    # --- spoken but not understood: ask again
    Rule(
        "bp_unclear",
        "amber",
        "बीपी साफ़ नहीं सुना",
        "BP not clear",
        ASK_AGAIN,
        "[SBA] p.31 (measure BP at every visit)",
        _bp_unclear,
    ),
    Rule(
        "fetal_movement_unclear",
        "amber",
        "हलचल साफ़ नहीं",
        "Baby movement unclear",
        ASK_AGAIN,
        "[SBA] p.36",
        _fetal_movement_unclear,
    ),
)


def evaluate(fields: VisitFields) -> list[Alert]:
    """Run every rule; red alerts first. Each alert says WHY it fired, in English and Hindi."""
    alerts = []
    for rule in RULES:
        why = rule.check(fields)
        if why:
            alerts.append(
                Alert(
                    code=rule.code,
                    severity=rule.severity,
                    title_hi=rule.title_hi,
                    title_en=rule.title_en,
                    reason=why[0],
                    reason_hi=why[1],
                    action_hi=rule.action[0],
                    action_en=rule.action[1],
                    source=rule.source,
                )
            )
    return sorted(alerts, key=lambda a: a.severity != "red")


def risk_level(alerts: list[Alert]) -> str:
    if any(a.severity == "red" for a in alerts):
        return "red"
    return "amber" if alerts else "normal"
