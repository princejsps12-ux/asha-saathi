"""Rule-based extractor: spoken Hindi / Hinglish / English visit note -> VisitFields.

Works fully offline with no API key. Design notes:
* Speech engines mix scripts ("बीपी 140 by 90, sujan hai"), so every vocabulary
  list carries Devanagari and romanised forms.
* Devanagari vowel signs are not regex "word" characters, so Devanagari terms
  are matched as substrings while Latin terms use word boundaries.
* Symptoms are negation-aware per clause: "सूजन नहीं है" does not raise swelling.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Iterable, Optional

from .numbers import fold, normalize_numbers
from .schemas import VisitFields


@dataclass(frozen=True)
class KnownBeneficiary:
    id: int
    name_hi: str
    name_en: str
    aliases: tuple[str, ...] = field(default_factory=tuple)


# --------------------------------------------------------------------------- helpers

def _has_latin(term: str) -> bool:
    return bool(re.search(r"[a-z]", term))


_DEVA = "ऀ-ॿ"


def _term_regex(term: str) -> str:
    """Word-bounded for Latin terms and very short Devanagari terms ("कल", "ना"),
    plain substring for longer Devanagari stems ("सूजन" also matches "सूजन्")."""
    term = fold(term)
    escaped = re.escape(term).replace(r"\ ", r"\s*")
    if _has_latin(term):
        return rf"(?<![a-z]){escaped}(?![a-z])"
    if len(term) <= 3:
        return rf"(?<![{_DEVA}]){escaped}(?![{_DEVA}])"
    return escaped


def _any(text: str, terms: Iterable[str]) -> bool:
    return any(re.search(_term_regex(t), text) for t in terms)


def _pattern(*parts: str) -> re.Pattern[str]:
    return re.compile(fold("|".join(parts)))


NEGATIONS = ("नहीं", "नही", "मत", "nahi", "nahin", "nhi", "nai", "no", "not", "never", "without")
_CLAUSE_SPLIT = re.compile(r"[,।;!?\n]+|\.(?!\d)|\s(?:और|लेकिन|मगर|aur|lekin|magar|but|and)\s")


def split_clauses(text: str) -> list[str]:
    return [c.strip() for c in _CLAUSE_SPLIT.split(text) if c and c.strip()]


def _preprocess(text: str) -> str:
    text = normalize_numbers(text).lower()  # also folds nukta / chandrabindu
    # "8 point 5" / "8 पॉइंट 5" -> 8.5
    text = re.sub(r"(\d+)\s*(?:point|पॉइंट|पॉइन्ट|दशमलव)\s*(\d)", r"\1.\2", text)
    return re.sub(r"\s+", " ", text).strip()


# --------------------------------------------------------------------------- vocab

SYMPTOM_PATTERNS: dict[str, re.Pattern[str]] = {
    "swelling": _pattern(r"सूजन|सुजन|सूज", r"(?<![a-z])(?:s[ou]{1,2}jaa?n|swelling|swollen|o?edema)(?![a-z])"),
    "headache": _pattern(r"(?:सिर|सर)\s*(?:में\s*)?(?:बहुत\s*|तेज\s*)?दर्द",
                         r"(?<![a-z])(?:sir|sar)\s*(?:me|mein|main)?\s*(?:bahut\s*|tez\s*)?dard",
                         r"head\s*ache"),
    "blurred_vision": _pattern(r"धुंधला|धुंधलापन|आंखों के आगे अंधेरा|कम दिख",
                               r"dhundh?la|blurr?(?:ed|y)|ankhon ke aage andhera|kam dikh"),
    "bleeding": _pattern(r"ब्लीडिंग|रक्तस्राव|स्पॉटिंग|खून\s*(?:का\s*)?(?:आ|बह|गिर|निकल|जा रह)",
                         r"(?<![a-z])(?:bleeding|spotting|(?:khoon|khun)\s*(?:ka\s*)?(?:aa|beh|bah|gir|nikal|ja rah))"),
    "convulsions": _pattern(r"दौरा पड|दौरे पड|दौरे आ|झटके|ऐंठन|मिर्गी",
                            r"(?<![a-z])(?:fits?|convulsions?|seizures?|daura pad|daure|jhatke)(?![a-z])"),
    "breathlessness": _pattern(r"सांस\s*(?:फूल|की तकलीफ|लेने में)",
                               r"saa?ns\s*(?:phool|fool|ki taklee?f|lene me)|breathless|short(?:ness)? of breath"),
    "pallor_weakness": _pattern(r"कमजोरी|थकान|चक्कर|पीलापन|खून की कमी|एनीमिया",
                                r"(?<![a-z])(?:kamz?j?ori|thakaa?n|chakk?ar|weakness|weak|tired|fatigue|pale|dizz\w*"
                                r"|(?:khoon|khun) ki kami|ana?emia)(?![a-z])"),
    "abdominal_pain": _pattern(r"पेट\s*(?:में\s*)?(?:बहुत\s*|तेज\s*)?दर्द",
                               r"(?<![a-z])pet\s*(?:me|mein)?\s*(?:bahut\s*|tez\s*)?dard|abdominal pain|stomach pain"),
    "fever": _pattern(r"बुखार|ताप", r"(?<![a-z])(?:bukh?aa?r|fever)(?![a-z])"),
}
FACE_HAND_TERMS = ("चेहर", "मुंह", "हाथ", "हाथों", "आंख", "face", "hands", "hand", "haath", "chehra",
                   "chehre", "munh")

FETAL_TERMS = ("हलचल", "हिल", "हिलना", "हिलता", "हिलती", "हरकत", "मूवमेंट", "किक", "फड़क", "movement",
               "movements", "moment", "halchal", "hil", "hilna", "hilta", "hilti", "harkat", "kick", "kicks")
FETAL_REDUCED = ("कम", "नहीं", "नही", "बंद", "धीमा", "kam", "nahi", "nahin", "band", "less", "reduced",
                 "decreased", "no", "not", "slow")
FETAL_NOT_REDUCED = ("कम नहीं", "kam nahi", "not less", "not reduced")

IFA_TERMS = ("आयरन", "आइरन", "आईएफए", "फोलिक", "लाल गोली", "खून की गोली", "iron", "ifa", "folic",
             "lal goli", "khoon ki goli")
IFA_NEGATIVE = NEGATIONS + ("बंद", "छोड़", "band", "chhod", "stopped", "skip")

TD_TERMS = ("टीटी", "टीडी", "टिटनेस", "टेटनस", "tt", "td", "tetanus")
VACCINE_TERMS = ("टीका", "टीके", "इंजेक्शन", "वैक्सीन", "teeka", "tika", "injection", "vaccine")
DOSE_ORDINALS = {
    "पहला": 1, "पहली": 1, "pehla": 1, "pahla": 1, "pehli": 1, "first": 1, "1st": 1,
    "दूसरा": 2, "दूसरी": 2, "दूसरे": 2, "doosra": 2, "dusra": 2, "doosri": 2, "second": 2, "2nd": 2,
    "बूस्टर": 3, "booster": 3,
}

MONTH_WORDS = r"(?:महीने|महीना|माह|months?|mahine|mahina|maheene|maah)"
WEEK_WORDS = r"(?:हफ्ते|हफ्ता|सप्ताह|weeks?|hafte|hafta)"
LATER_WORDS = r"(?:बाद|baad|bad|later|after|पहले|pehle|ago)"
PREG_ORDINALS = {
    "दूसरा": 2, "दूसरे": 2, "तीसरा": 3, "तीसरे": 3, "चौथा": 4, "चौथे": 4,
    "पांचवां": 5, "पांचवा": 5, "पांचवें": 5, "छठा": 6, "छठे": 6, "छठवां": 6,
    "सातवां": 7, "सातवा": 7, "सातवें": 7, "आठवां": 8, "आठवा": 8, "आठवें": 8,
    "नौवां": 9, "नौवा": 9, "नौवें": 9, "नवां": 9,
    "doosra": 2, "dusra": 2, "teesra": 3, "tisra": 3, "chautha": 4, "paanchva": 5, "panchva": 5,
    "chhatha": 6, "chhata": 6, "saatva": 7, "satva": 7, "satwa": 7, "aathva": 8, "athva": 8,
    "nauva": 9, "nauwa": 9, "second": 2, "third": 3, "fourth": 4, "fifth": 5, "sixth": 6,
    "seventh": 7, "eighth": 8, "ninth": 9,
}

VISIT_TERMS = ("विजिट", "विज़िट", "मुलाकात", "आऊंगी", "आउंगी", "आएंगे", "दोबारा", "फिर से", "अगली", "जांच",
               "चेकअप", "visit", "aaungi", "aungi", "dobara", "phir se", "agli", "next", "checkup",
               "check up", "milenge", "aana", "aayenge")
WEEKDAYS = {
    0: ("सोमवार", "somvar", "monday"), 1: ("मंगलवार", "mangalvar", "tuesday"),
    2: ("बुधवार", "budhvar", "wednesday"), 3: ("गुरुवार", "guruvar", "thursday"),
    4: ("शुक्रवार", "shukravar", "friday"), 5: ("शनिवार", "shanivar", "saturday"),
    6: ("रविवार", "ravivar", "sunday"),
}

YES_TERMS = ("हां", "हा", "हान", "जी", "सही", "ठीक", "सेव", "बिल्कुल", "haan", "han", "ha", "haa", "ji",
             "sahi", "theek", "thik", "yes", "yeah", "ok", "okay", "save", "correct", "bilkul")
NO_TERMS = ("नहीं", "नही", "ना", "गलत", "मत", "रद्द", "nahi", "nahin", "nhi", "na", "no", "galat", "mat",
            "cancel", "wrong")


# --------------------------------------------------------------------------- field parsers

# Plausibility ranges below are *input sanity checks* (reject "15 तारीख पर 2" as a BP),
# not clinical thresholds — those live only in rules.py.
def parse_bp(text: str) -> tuple[Optional[int], Optional[int]]:
    patterns = (
        r"(\d{2,3})\s*(?:/|by|बाय|बाई|बटा|over|पर|ऑन)\s*(\d{2,3})",
        r"(?:ऊपर|upar|uper|upper)\D{0,8}?(\d{2,3})\D{0,20}?(?:नीचे|niche|neeche|lower)\D{0,8}?(\d{2,3})",
        r"(\d{2,3})\s*(?:ऊपर|upar|uper|upper)\D{0,12}?(\d{2,3})\s*(?:नीचे|niche|neeche|lower)",
    )
    for pat in patterns:
        for m in re.finditer(pat, text):
            sys_, dia = int(m.group(1)), int(m.group(2))
            if 70 <= sys_ <= 260 and 40 <= dia <= 160 and sys_ > dia:
                return sys_, dia
    return None, None


def parse_pregnancy_month(text: str) -> Optional[int]:
    m = re.search(rf"(?<!\d)(\d{{1,2}})\s*(?:वां|वा|वें|th|st|nd|rd)?\s*{MONTH_WORDS}(?![a-z]*\s*{LATER_WORDS})",
                  text)
    if m and 1 <= int(m.group(1)) <= 10:
        return int(m.group(1))
    ordinals = "|".join(sorted(map(re.escape, PREG_ORDINALS), key=len, reverse=True))
    m = re.search(rf"({ordinals})\s*{MONTH_WORDS}", text)
    if m:
        return PREG_ORDINALS[m.group(1)]
    m = re.search(rf"(?<!\d)(\d{{1,2}})\s*{WEEK_WORDS}(?![a-z]*\s*{LATER_WORDS})", text)
    if m and 4 <= int(m.group(1)) <= 42:
        # ~4.345 weeks per month; week 28 -> 7th month of pregnancy.
        return min(9, -(-int(m.group(1)) * 1000 // 4345))
    return None


def _first_number(pattern: str, text: str, lo: float, hi: float) -> Optional[float]:
    for m in re.finditer(pattern, text):
        value = float(m.group(1))
        if lo <= value <= hi:
            return value
    return None


def parse_hb(text: str) -> Optional[float]:
    return _first_number(r"(?:hb|h\s?b|एचबी|एच बी|हीमोग्लोबिन|हिमोग्लोबिन|ha?emoglobin)\D{0,12}?(\d{1,2}(?:\.\d)?)",
                         text, 3, 18)


def parse_weight(text: str) -> Optional[float]:
    value = _first_number(r"(?:वजन|weight|wajan|vajan|wazan)\D{0,10}?(\d{2,3}(?:\.\d)?)", text, 25, 150)
    return value or _first_number(r"(\d{2,3}(?:\.\d)?)\s*(?:किलो|केजी|kg|kilo)", text, 25, 150)


def parse_temperature(text: str) -> Optional[float]:
    fever = r"(?:बुखार|तापमान|टेम्परेचर|bukh?aa?r|fever|temperature|temp)"
    value = _first_number(rf"{fever}\D{{0,12}}?(\d{{2,3}}(?:\.\d)?)", text, 34, 108) or \
        _first_number(rf"(\d{{2,3}}(?:\.\d)?)\s*(?:डिग्री|degree)?\s*(?:का\s*|ka\s*)?{fever}", text, 34, 108)
    if value is None:
        return None
    return round(value * 9 / 5 + 32, 1) if value <= 43 else value  # Celsius -> Fahrenheit


def parse_symptoms(clauses: list[str]) -> list[str]:
    found: list[str] = []
    for clause in clauses:
        if _any(clause, NEGATIONS) and not _any(clause, FETAL_TERMS):
            continue  # "सूजन नहीं है", "no bleeding"
        for code, pat in SYMPTOM_PATTERNS.items():
            if not pat.search(clause):
                continue
            if code == "swelling" and _any(clause, FACE_HAND_TERMS):
                code = "swelling_face_hands"
            if code not in found:
                found.append(code)
    return found


def parse_fetal_movement(clauses: list[str]) -> Optional[str]:
    for clause in clauses:
        if _any(clause, FETAL_TERMS):
            if _any(clause, FETAL_NOT_REDUCED):
                return "normal"
            return "reduced" if _any(clause, FETAL_REDUCED) else "normal"
    return None


def parse_ifa(clauses: list[str]) -> tuple[Optional[bool], Optional[int]]:
    for clause in clauses:
        if not _any(clause, IFA_TERMS):
            continue
        m = re.search(r"(\d{1,3})\s*(?:गोली|गोलियां|टैबलेट|tablets?|goli|goliyan)", clause)
        tablets = int(m.group(1)) if m else None
        return (not _any(clause, IFA_NEGATIVE)), tablets
    return None, None


def parse_td(clauses: list[str]) -> tuple[Optional[int], Optional[bool]]:
    for clause in clauses:
        has_td, has_vaccine = _any(clause, TD_TERMS), _any(clause, VACCINE_TERMS)
        if not (has_td or has_vaccine):
            continue
        if _any(clause, NEGATIONS):
            return None, False
        dose = next((v for k, v in DOSE_ORDINALS.items() if re.search(_term_regex(k), clause)), None)
        if dose is None:
            m = re.search(r"(?:tt|td|टीटी|टीडी)\s*-?\s*([123])(?!\d)", clause)
            dose = int(m.group(1)) if m else None
        return dose, True
    return None, None


def _date_in(clause: str, today: date) -> Optional[date]:
    m = re.search(r"(\d{1,2})\s*(?:दिन|din|days?)\s*(?:बाद|baad|bad|में|me|later|after)", clause) or \
        re.search(r"in\s*(\d{1,2})\s*days?", clause)
    if m:
        return today + timedelta(days=int(m.group(1)))
    m = re.search(rf"(\d{{1,2}})\s*{WEEK_WORDS}\s*(?:बाद|baad|bad|में|me|later|after)", clause)
    if m:
        return today + timedelta(weeks=int(m.group(1)))
    m = re.search(r"(\d{1,2})\s*(?:तारीख|tarikh|tareekh|date)", clause)
    if m and 1 <= int(m.group(1)) <= 31:
        day = int(m.group(1))
        year, month = (today.year, today.month) if day > today.day else \
            (today.year + today.month // 12, today.month % 12 + 1)
        for _ in range(3):  # skip months without that day (e.g. 31st)
            try:
                return date(year, month, day)
            except ValueError:
                year, month = year + month // 12, month % 12 + 1
    if _any(clause, ("परसों", "parso", "parson", "day after tomorrow")):
        return today + timedelta(days=2)
    if _any(clause, ("कल", "kal", "tomorrow")):
        return today + timedelta(days=1)
    if _any(clause, ("अगले हफ्ते", "अगले सप्ताह", "agle hafte", "next week")):
        return today + timedelta(weeks=1)
    if _any(clause, ("अगले महीने", "agle mahine", "next month")):
        return today + timedelta(days=30)
    for weekday, names in WEEKDAYS.items():
        if _any(clause, names):
            return today + timedelta(days=(weekday - today.weekday() - 1) % 7 + 1)
    if _any(clause, ("आज", "aaj", "today")):
        return today
    return None


def parse_next_visit(clauses: list[str], today: date) -> Optional[date]:
    for clause in clauses:
        if _any(clause, VISIT_TERMS):
            found = _date_in(clause, today)
            if found:
                return found
    # Unambiguous future phrases count even without the word "visit".
    for clause in clauses:
        if _any(clause, ("अगले हफ्ते", "agle hafte", "next week", "परसों", "parso")) or \
                re.search(r"(?:दिन|din|days?|हफ्ते|hafte|weeks?)\s*(?:बाद|baad|later)", clause):
            return _date_in(clause, today)
    return None


def match_beneficiary(text: str, people: Iterable[KnownBeneficiary]) -> Optional[KnownBeneficiary]:
    best, best_score, tie = None, 0, False
    for person in people:
        score = 0
        for name in (person.name_hi, person.name_en, *person.aliases):
            name = _preprocess(name)
            if not name:
                continue
            if re.search(_term_regex(name), text):
                score = max(score, 3)
            elif re.search(_term_regex(name.split()[0]), text):
                score = max(score, 2)
        if score > best_score:
            best, best_score, tie = person, score, False
        elif score and score == best_score:
            tie = True
    return None if tie else best


# --------------------------------------------------------------------------- public API

def parse_visit(text: str, today: date, people: Iterable[KnownBeneficiary] = ()) -> VisitFields:
    norm = _preprocess(text)
    clauses = split_clauses(norm)
    systolic, diastolic = parse_bp(norm)
    ifa_taking, ifa_tablets = parse_ifa(clauses)
    td_dose, vaccine_given = parse_td(clauses)
    person = match_beneficiary(norm, people)
    return VisitFields(
        beneficiary_id=person.id if person else None,
        beneficiary_name=person.name_hi if person else None,
        pregnancy_month=parse_pregnancy_month(norm),
        bp_systolic=systolic,
        bp_diastolic=diastolic,
        hb=parse_hb(norm),
        weight_kg=parse_weight(norm),
        temperature_f=parse_temperature(norm),
        symptoms=parse_symptoms(clauses),
        fetal_movement=parse_fetal_movement(clauses),
        ifa_taking=ifa_taking,
        ifa_tablets=ifa_tablets,
        td_dose=td_dose,
        vaccine_given=vaccine_given,
        next_visit_date=parse_next_visit(clauses, today),
    )


def classify_confirmation(text: str) -> str:
    """Voice confirm after read-back: 'yes' | 'no' | 'unknown'. Negation wins."""
    norm = _preprocess(text)
    if _any(norm, NO_TERMS):
        return "no"
    if _any(norm, YES_TERMS):
        return "yes"
    return "unknown"
