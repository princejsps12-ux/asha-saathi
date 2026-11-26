"""Rule-based extractor: spoken Hindi / Hinglish / English visit note -> VisitFields.

Needs no API key: plain Python running on our server. Design notes:
* Speech engines mix scripts ("बीपी 140 by 90, sujan hai"), so every vocabulary
  list carries Devanagari and romanised forms.
* Devanagari vowel signs are not regex "word" characters, so Devanagari terms
  are matched as substrings while Latin terms use word boundaries.
* Symptoms are negation-aware per clause: "सूजन नहीं है" does not raise swelling.
"""
from __future__ import annotations

import difflib
import re
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import NamedTuple

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


# Includes dialect negations: Chhattisgarhi "नइ", Bhojpuri "नइखे" / "ना".
NEGATIONS = ("नहीं", "नही", "मत", "नइ", "नइखे", "नइहे", "nahi", "nahin", "nhi", "nai", "naikhe", "no", "not", "never",
             "without")
# Browser speech-to-text usually returns NO punctuation, so we also end a clause after a
# sentence-final verb ("सूजन है | बेबी मूवमेंट कम है"); otherwise one "नहीं" would negate
# every symptom in the whole visit note.
_CLAUSE_SPLIT = re.compile(
    r"[,।;!?\n]+|\.(?!\d)|\s(?:और|लेकिन|मगर|aur|lekin|magar|but|and)\s"
    r"|(?<=\sहै)\s|(?<=\sहैं)\s|(?<=\sथा)\s|(?<=\sथी)\s|(?<=\shai)\s|(?<=\shain)\s"
    r"|(?<=\sबा)\s|(?<=\sहे)\s|(?<=\sba)\s"  # Bhojpuri "बा", Chhattisgarhi "हे" = "है"
)


def split_clauses(text: str) -> list[str]:
    return [c.strip() for c in _CLAUSE_SPLIT.split(text) if c and c.strip()]


# Hesitation fillers carry no information and can split a phrase ("बीपी 150 उम्म बाय 100").
FILLERS = frozenset({"अं", "अम्म", "उम", "उम्म", "हम्म", "मतलब", "यानी", "um", "umm", "uh", "uhh", "hmm", "hmmm",
                     "matlab", "yani", "yaani"})
MAX_REPEAT_WORDS = 4  # "बीपी बीपी 150 बाय 100 150 बाय 100" -> collapse repeats of up to 4 words


def _drop_noise(words: list[str]) -> list[str]:
    """Remove filler words and immediately repeated fragments (speech engines and people both
    repeat themselves: "सुनीता सुनीता साहू", "सात सात महीने")."""
    words = [w for w in words if w.strip(".,!?।") not in FILLERS]
    for size in range(MAX_REPEAT_WORDS, 0, -1):
        i = 0
        while i + 2 * size <= len(words):
            keys = [w.strip(".,!?।") for w in words[i:i + 2 * size]]
            if keys[:size] == keys[size:]:
                del words[i + size:i + 2 * size]
            else:
                i += 1
    return words


def _preprocess(text: str) -> str:
    text = normalize_numbers(text).lower()  # also folds nukta / chandrabindu
    # "8 point 5" / "8 पॉइंट 5" -> 8.5
    text = re.sub(r"(\d+)\s*(?:point|पॉइंट|पॉइन्ट|दशमलव)\s*(\d)", r"\1.\2", text)
    return " ".join(_drop_noise(text.split()))


# --------------------------------------------------------------------------- vocab

SYMPTOM_PATTERNS: dict[str, re.Pattern[str]] = {
    # "sujan"/"soojan" (noun) and "sooj gaya"/"suje" (verb: became swollen)
    # Dialect: "सूजल" (Bhojpuri), "गोड़ / पैर फूल गइल" (feet swollen; but "सांस फूलना" is breathlessness).
    "swelling": _pattern(r"सूजन|सुजन|सूझन|सोजन|सूजल|सुजल|सूज",
                         r"(?:पैर|पांव|गोड|हाथ|मुंह|चेहर|देह)\S*\s+(?:\S+\s+)?(?:फूल|फुल)",
                         r"(?<![a-z])(?:s[ou]{1,2}j(?:aa?n|a|e|i|al)?|swelling|swollen|o?edema)(?![a-z])",
                         r"(?<![a-z])(?:pair|paon|paanv|god|haath|hath|munh|chehr)\w*\s+(?:\w+\s+)?(?:phool|phul|ful)"),
    # Dialect: "मूड़ पिरात" (Bhojpuri), "मुड़ी पीरा" (Chhattisgarhi), "माथा दुखत", "कपार दरद".
    "headache": _pattern(r"(?:सिर|सर)\s*(?:में\s*)?(?:बहुत\s*|तेज\s*)?दर्द",
                         r"(?:मूड|मुडी|मुंडी|माथा|माथे|कपार)\s*(?:में\s*)?(?:\S+\s*)?(?:पिरा|पीरा|दुख|दर्द|दरद)",
                         r"(?<![a-z])(?:sir|sar)\s*(?:me|mein|main)?\s*(?:bahut\s*|tez\s*)?dard",
                         r"(?<![a-z])(?:mood|mud|mudi|mundi|matha|mathe|kapar)\s*(?:me\s*)?(?:\w+\s*)?"
                         r"(?:pira|peera|dukh|dard|darad)",
                         r"head\s*ache"),
    "blurred_vision": _pattern(r"धुंधला|धुंधलापन|आंखों के आगे अंधेरा|कम दिख",
                               r"dhundh?la|blurr?(?:ed|y)|ankhon ke aage andhera|kam dikh"),
    # Dialect: "लहू / रकत" (blood) with "आवत / गिरत / जात" (comes / falls / goes).
    "bleeding": _pattern(r"ब्लीडिंग|रक्तस्राव|स्पॉटिंग",
                         r"(?:खून|लहू|लहु|रकत)\s*(?:का\s*)?(?:आ|बह|गिर|निकल|जा रह|जात)",
                         r"(?<![a-z])(?:bleeding|spotting|(?:khoon|khun|lahu|lahoo|rakat)\s*(?:ka\s*)?"
                         r"(?:aa|beh|bah|gir|nikal|ja rah|jat))"),
    "convulsions": _pattern(r"दौरा पड|दौरे पड|दौरे आ|झटके|ऐंठन|मिर्गी",
                            r"(?<![a-z])(?:fits?|convulsions?|seizures?|daura pad|daure|jhatke)(?![a-z])"),
    "breathlessness": _pattern(r"सांस\s*(?:फूल|फुल|की तकलीफ|लेने में)",
                               r"saa?ns\s*(?:phool|fool|ki taklee?f|lene me)|breathless|short(?:ness)? of breath"),
    "pallor_weakness": _pattern(r"कमजोरी|थकान|थकावट|चक्कर|पीलापन|खून की कमी|एनीमिया",
                                r"(?<![a-z])(?:kamz?j?ori|thakaa?n|chakk?ar|weakness|weak|tired|fatigue|pale|dizz\w*"
                                r"|(?:khoon|khun) ki kami|ana?emia)(?![a-z])"),
    "abdominal_pain": _pattern(r"पेट\s*(?:में\s*)?(?:बहुत\s*|तेज\s*)?दर्द",
                               r"(?<![a-z])pet\s*(?:me|mein)?\s*(?:bahut\s*|tez\s*)?dard|abdominal pain|stomach pain"),
    # Dialect: "बोखार" (Bhojpuri), "जर" (Chhattisgarhi), "ज्वर" (formal Hindi).
    "fever": _pattern(r"बुखार|बोखार|ताप|ज्वर", r"(?<![\u0900-\u097F])जर(?![\u0900-\u097F])",
                      r"(?<![a-z])(?:bukh?aa?r|bokhar|jwar|jvar|fever)(?![a-z])"),
}
FACE_HAND_TERMS = ("चेहर", "मुंह", "हाथ", "हाथों", "आंख", "face", "hands", "hand", "haath", "chehra",
                   "chehre", "munh")

FETAL_TERMS = ("हलचल", "हिल", "हिलना", "हिलता", "हिलती", "हरकत", "मूवमेंट", "किक", "फड़क", "movement",
               "movements", "moment", "moving", "kicking", "halchal", "hil", "hilna", "hilta", "hilti", "harkat",
               "kick", "kicks",
               # dialect: "हिलत / डोलत" (Bhojpuri, Chhattisgarhi)
               "हिलत", "हिलथे", "डोलत", "डोलना", "hilat", "dolat")
FETAL_REDUCED = ("कम", "नहीं", "नही", "बंद", "धीमा", "kam", "nahi", "nahin", "band", "less", "reduced",
                 "decreased", "no", "not", "slow", "नइ", "नइखे", "कमती", "naikhe", "kamti")
FETAL_NOT_REDUCED = ("कम नहीं", "kam nahi", "not less", "not reduced")
# Explicit "it's fine" wording. Movement is only "normal" when one of these is said;
# a mention with neither reduced nor normal wording is "unclear" and gets asked again.
FETAL_NORMAL = ("ठीक", "अच्छ", "सामान्य", "नॉर्मल", "सही", "बराबर", "हिल रहा", "हिल रही", "हिलता है", "हिलती है",
                "theek", "thik", "achh", "achchh", "normal", "fine", "good", "well", "sahi", "ok", "okay", "regular",
                "hil raha", "hil rahi", "moving", "kicking")
# Speech engines often write काम ("work") for कम ("less"); next to a movement word it means कम.
_KAAM_AS_KAM = re.compile(r"(?<![\u0900-\u097F])काम(?![\u0900-\u097F])|(?<![a-z])kaam(?![a-z])")

IFA_TERMS = ("आयरन", "आइरन", "आईएफए", "फोलिक", "लाल गोली", "खून की गोली", "iron", "ifa", "folic",
             "lal goli", "khoon ki goli")
IFA_NEGATIVE = NEGATIONS + ("बंद", "छोड़", "band", "chhod", "stopped", "skip")
# Only these count as "taking / given"; a bare mention of iron tablets is left blank, not assumed.
IFA_POSITIVE = ("ले रही", "लेती", "खा रही", "खाती", "रोज", "दी", "दीं", "दिया", "दिए", "मिली", "चल रही",
                "le rahi", "leti", "kha rahi", "khati", "roz", "daily", "di", "diya", "diye", "taking", "takes",
                "given", "gave", "started", "chal rahi")

TD_TERMS = ("टीटी", "टीडी", "टिटनेस", "टेटनस", "tt", "td", "tetanus")
VACCINE_TERMS = ("टीका", "टीके", "इंजेक्शन", "वैक्सीन", "teeka", "tika", "injection", "vaccine")
DOSE_ORDINALS = {
    "पहला": 1, "पहली": 1, "pehla": 1, "pahla": 1, "pehli": 1, "first": 1, "1st": 1,
    "दूसरा": 2, "दूसरी": 2, "दूसरे": 2, "doosra": 2, "dusra": 2, "doosri": 2, "second": 2, "2nd": 2,
    "बूस्टर": 3, "booster": 3,
}

DAYS_PER_MONTH = 30  # "agle mahine" / "2 mahine baad" -> 30 days per month for scheduling
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
               "check up", "milenge", "aana", "aayenge", "आबो", "आइब", "aabo", "aaib")
WEEKDAYS = {
    0: ("सोमवार", "somvar", "somwar", "monday"),
    1: ("मंगलवार", "mangalvar", "mangalwar", "tuesday"),
    2: ("बुधवार", "budhvar", "budhwar", "wednesday"),
    3: ("गुरुवार", "बृहस्पतिवार", "वीरवार", "guruvar", "guruwar", "brihaspativar", "veervar", "thursday"),
    4: ("शुक्रवार", "shukravar", "shukrawar", "friday"),
    5: ("शनिवार", "shanivar", "shaniwar", "saturday"),
    6: ("रविवार", "इतवार", "ravivar", "raviwar", "itwar", "itvar", "itvaar", "sunday"),
}

# Devanagari "यस"/"ओके"/"नो" are what a hi-IN recogniser writes for spoken English yes/ok/no.
YES_TERMS = ("हां", "हा", "हान", "जी", "सही", "ठीक", "सेव", "बिल्कुल", "यस", "ओके", "haan", "han", "ha", "haa", "ji",
             "sahi", "theek", "thik", "yes", "yeah", "ok", "okay", "save", "correct", "bilkul")
NO_TERMS = ("नहीं", "नही", "ना", "नो", "गलत", "मत", "रद्द", "nahi", "nahin", "nhi", "na", "no", "galat", "mat",
            "cancel", "wrong")


# --------------------------------------------------------------------------- field parsers

# Plausibility ranges below are *input sanity checks* (reject "15 तारीख पर 2" as a BP),
# not clinical thresholds — those live only in rules.py.
SYSTOLIC_RANGE, DIASTOLIC_RANGE = (70, 260), (40, 160)
BP_WORD_REACH = 2  # words after "BP" (same clause) within which spoken numbers are taken as the BP

_BP_WORD = r"(?:(?<![a-z])b\.?\s?p(?![a-z])|बीपी|बी पी|ब्लड प्रेशर|blood pressure|pressure|प्रेशर|रक्तचाप)"
_BP_SEP = r"(?:/|by|बाय|बाई|बटा|बटे|बट्टा|over|ओवर|पर|ऑन)"
_UP, _DOWN = r"(?:ऊपर|upar|uper|upper)", r"(?:नीचे|niche|neeche|lower)"
# Number pairs that look like a BP. \d{1,3} on purpose: a mis-heard "15 बाय 100" must still be
# *seen* (and reported as unclear), never silently dropped.
_BP_PAIRS = (
    re.compile(rf"(\d{{1,3}})\s*{_BP_SEP}\s*(\d{{1,3}})(?!\d)"),
    re.compile(rf"{_UP}\D{{0,8}}?(\d{{1,3}})\D{{0,20}}?{_DOWN}\D{{0,8}}?(\d{{1,3}})"),
    re.compile(rf"(\d{{1,3}})\s*{_UP}\D{{0,12}}?(\d{{1,3}})\s*{_DOWN}"),
)
# "बीपी 150" — a BP word followed by a single number (the other half was lost).
_BP_SINGLE = re.compile(rf"{_BP_WORD}\s*(?:का|ka|है|hai|:|-)?\s*(\d{{1,3}})(?!\d|\s*(?:/|by|बाय|बाई|बटा))")


class BpReading(NamedTuple):
    systolic: int | None
    diastolic: int | None
    heard: str | None  # set when a BP was spoken but is not a plausible reading


def _plausible(systolic: int, diastolic: int) -> bool:
    return (SYSTOLIC_RANGE[0] <= systolic <= SYSTOLIC_RANGE[1] and DIASTOLIC_RANGE[0] <= diastolic <= DIASTOLIC_RANGE[1]
            and systolic > diastolic)


def _right_after(text: str, word_end: int, start: int) -> bool:
    """True if `start` follows the BP word closely: same clause, at most BP_WORD_REACH words between."""
    gap = text[word_end:start]
    return start >= word_end and not re.search(r"[,।;!?]|\.(?!\d)", gap) and len(gap.split()) <= BP_WORD_REACH


def parse_bp(text: str) -> BpReading:
    """A plausible pair -> the reading. A BP that was spoken but is implausible ("15 बाय 100",
    "90 by 140", "बीपी 150") -> no values, `heard` set, so the app asks again. Never guesses."""
    matches = [(i, m) for i, pat in enumerate(_BP_PAIRS) for m in pat.finditer(text)]
    for _, m in matches:
        if _plausible(int(m.group(1)), int(m.group(2))):
            return BpReading(int(m.group(1)), int(m.group(2)), None)
    # An implausible pair only counts as "BP unclear" when it is clearly about BP: it uses
    # upar/neeche, or starts within a few words after "BP" (so "28/11" as a date doesn't).
    bp_word_ends = [w.end() for w in re.finditer(_BP_WORD, text)]
    for i, m in matches:
        if i > 0 or any(_right_after(text, end, m.start()) for end in bp_word_ends):
            return BpReading(None, None, f"{m.group(1)}/{m.group(2)}")
    single = _BP_SINGLE.search(text)
    if single:
        return BpReading(None, None, single.group(1))
    return BpReading(None, None, None)


def parse_pregnancy_month(text: str) -> int | None:
    # "(?:\.5)?" accepts "साढ़े सात महीने" (normalised to 7.5): month 7, not the "5".
    m = re.search(rf"(?<![\d.])(\d{{1,2}})(?:\.5)?\s*(?:वां|वा|वें|th|st|nd|rd)?\s*{MONTH_WORDS}"
                  rf"(?![a-z]*\s*{LATER_WORDS})", text)
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


def _first_number(pattern: str, text: str, lo: float, hi: float) -> float | None:
    for m in re.finditer(pattern, text):
        value = float(m.group(1))
        if lo <= value <= hi:
            return value
    return None


def parse_hb(text: str) -> float | None:
    return _first_number(r"(?:hb|h\s?b|एचबी|एच बी|हीमोग्लोबिन|हिमोग्लोबिन|ha?emoglobin)\D{0,12}?(\d{1,2}(?:\.\d)?)",
                         text, 3, 18)


def parse_weight(text: str) -> float | None:
    value = _first_number(r"(?:वजन|weight|wajan|vajan|wazan)\D{0,10}?(\d{2,3}(?:\.\d)?)", text, 25, 150)
    return value or _first_number(r"(\d{2,3}(?:\.\d)?)\s*(?:किलो|केजी|kg|kilo)", text, 25, 150)


def parse_temperature(text: str) -> float | None:
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


def parse_fetal_movement(clauses: list[str]) -> str | None:
    """'reduced' | 'normal' | 'unclear' (mentioned, but neither) | None (not mentioned)."""
    for clause in clauses:
        if not _any(clause, FETAL_TERMS):
            continue
        clause = _KAAM_AS_KAM.sub("कम", clause)
        if _any(clause, FETAL_NOT_REDUCED):
            return "normal"
        if _any(clause, FETAL_REDUCED):
            return "reduced"
        return "normal" if _any(clause, FETAL_NORMAL) else "unclear"
    return None


def parse_ifa(clauses: list[str]) -> tuple[bool | None, int | None]:
    for clause in clauses:
        if not _any(clause, IFA_TERMS):
            continue
        # "30 गोली", "30 आयरन की गोलियां", "30 iron tablets": number up to 3 words before the noun
        m = re.search(r"(\d{1,3})\s+(?:\S+\s+){0,3}?(?:गोली|गोलियां|टैबलेट|tablets?|goli|goliyan)", clause)
        tablets = int(m.group(1)) if m else None
        if _any(clause, IFA_NEGATIVE):
            return False, tablets
        return (True if tablets or _any(clause, IFA_POSITIVE) else None), tablets
    return None, None


def parse_td(clauses: list[str]) -> tuple[int | None, bool | None]:
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


def _date_in(clause: str, today: date) -> date | None:
    m = re.search(r"(\d{1,2})\s*(?:दिन|din|days?)\s*(?:बाद|baad|bad|में|me|later|after)", clause) or \
        re.search(r"in\s*(\d{1,2})\s*days?", clause)
    if m:
        return today + timedelta(days=int(m.group(1)))
    m = re.search(rf"(\d{{1,2}})\s*{WEEK_WORDS}\s*(?:बाद|baad|bad|में|me|later|after)", clause)
    if m:
        return today + timedelta(weeks=int(m.group(1)))
    m = re.search(rf"(\d{{1,2}})\s*{MONTH_WORDS}\s*(?:बाद|baad|bad|later|after)", clause)
    if m:
        return today + timedelta(days=DAYS_PER_MONTH * int(m.group(1)))
    m = re.search(r"(\d{1,2})\s*(?:तारीख|tarikh|tareekh|tarik|date)", clause)
    if m and 1 <= int(m.group(1)) <= 31:
        day = int(m.group(1))
        year, month = (today.year, today.month) if day > today.day else \
            (today.year + today.month // 12, today.month % 12 + 1)
        for _ in range(3):  # skip months without that day (e.g. 31st)
            try:
                return date(year, month, day)
            except ValueError:
                year, month = year + month // 12, month % 12 + 1
    if _any(clause, ("नरसों", "narso", "narson")):  # the day after the day after tomorrow
        return today + timedelta(days=3)
    if _any(clause, ("परसों", "parso", "parson", "day after tomorrow")):
        return today + timedelta(days=2)
    if _any(clause, ("कल", "kal", "tomorrow")):
        return today + timedelta(days=1)
    if _any(clause, ("अगले हफ्ते", "अगले सप्ताह", "agle hafte", "next week")):
        return today + timedelta(weeks=1)
    if _any(clause, ("अगले महीने", "agle mahine", "next month")):
        return today + timedelta(days=DAYS_PER_MONTH)
    for weekday, names in WEEKDAYS.items():
        if _any(clause, names):
            return today + timedelta(days=(weekday - today.weekday() - 1) % 7 + 1)
    if _any(clause, ("आज", "aaj", "today")):
        return today
    return None


def parse_next_visit(clauses: list[str], today: date) -> date | None:
    for clause in clauses:
        if _any(clause, VISIT_TERMS):
            found = _date_in(clause, today)
            if found:
                return found
    # Unambiguous future phrases count even without the word "visit".
    for clause in clauses:
        if _any(clause, ("अगले हफ्ते", "agle hafte", "next week", "परसों", "parso", "नरसों", "narso",
                         "अगले महीने", "agle mahine")) or \
                re.search(r"(?:दिन|din|days?|हफ्ते|hafte|weeks?|महीने|mahine|months?)\s*(?:बाद|baad|later)", clause):
            return _date_in(clause, today)
    return None


# ---- beneficiary matching: exact, then fuzzy (small spelling / transliteration differences)
CONFIDENT_FULL_NAME = 0.85   # similarity of the whole spoken name to a known name
CONFIDENT_FIRST_NAME = 0.9   # similarity of a first name alone (needs a longer name, see below)
MIN_FIRST_NAME_CHARS = 4     # "Anu" vs "Anju" is too short to trust on a first name alone
SUGGEST_BELOW = 0.72         # below this a name is not even offered as "did you mean…?"
AMBIGUITY_MARGIN = 0.05      # two women this close in score: ask which one, never pick

_LONG_TO_SHORT = str.maketrans({"ी": "ि", "ू": "ु", "ा": "", "ं": "", "ँ": "", "्": ""})
_ROMAN_SOUNDS = (("ee", "i"), ("oo", "u"), ("aa", "a"), ("w", "v"), ("z", "j"), ("ph", "f"), ("sh", "s"),
                 ("q", "k"), ("y", "i"))
_HONORIFICS = frozenset({"श्रीमती", "shrimati", "smt", "mrs", "बहन", "didi", "दीदी", "bai", "बाई"})
_NAME_STOP = frozenset({"के", "का", "की", "को", "ने", "से", "घर", "ka", "ki", "ke", "ko", "ne", "se", "ghar",
                        "आज", "aaj", "मैं", "main", "मैंने", "maine", "गई", "gayi", "gai", "visit", "विजिट", "bp",
                        "बीपी", "pregnant", "गर्भवती", "हां", "haan", "नहीं", "nahi", "is", "the", "went", "to", "home"})


def _skeleton(word: str) -> str:
    """Spelling-insensitive key: सुनिता = सुनीता, Sunitaa = Sunita, Dhruv = Druw."""
    w = fold(word.lower()).strip(".,!?।")
    if re.search(r"[\u0900-\u097f]", w):
        return w.translate(_LONG_TO_SHORT)
    for a, b in _ROMAN_SOUNDS:
        w = w.replace(a, b)
    w = re.sub(r"([bcdfgjklmnpqrstvx])h", r"\1", w)  # aspirates: dh->d, kh->k, bh->b
    return re.sub(r"(.)\1+", r"\1", w)            # doubled letters


def _similar(a: str, b: str) -> float:
    return difflib.SequenceMatcher(None, _skeleton(a), _skeleton(b)).ratio()


def _same_script(a: str, b: str) -> bool:
    return bool(re.search(r"[\u0900-\u097f]", a)) == bool(re.search(r"[\u0900-\u097f]", b))


def _name_score(words: list[str], name: str) -> float:
    """Best similarity between `name` and any run of words in the note (same script only)."""
    parts = name.lower().split()
    if not parts:
        return 0.0
    best = 0.0
    for i in range(len(words)):
        window = words[i:i + len(parts)]
        if len(window) == len(parts) and _same_script(window[0], parts[0]):
            best = max(best, _similar(" ".join(window), " ".join(parts)))
        if len(parts[0]) >= MIN_FIRST_NAME_CHARS and _same_script(words[i], parts[0]):
            first = _similar(words[i], parts[0])
            # a first name alone must be very close to count as much as a full name
            best = max(best, first * (CONFIDENT_FULL_NAME / CONFIDENT_FIRST_NAME))
    return best


@dataclass(frozen=True)
class NameMatch:
    person: KnownBeneficiary | None
    suggestions: tuple[int, ...]  # close but not confident: "did you mean…?"
    heard: str | None             # the spoken name when nobody matched confidently


def heard_name(raw_text: str) -> str | None:
    """The name she most likely said: the first 1–3 name-like words of the note."""
    words = []
    for token in normalize_numbers(raw_text).split():
        word = token.strip(".,!?।:;\"'")
        low = fold(word.lower())
        if not words and low in _HONORIFICS:
            continue
        if not word or any(ch.isdigit() for ch in word) or low in _NAME_STOP or len(words) == 3:
            break
        words.append(word)
        if token.endswith((",", "।", ".")):
            break
    name = " ".join(words)
    return name if len(name) >= 2 else None


def match_beneficiary(text: str, people: Iterable[KnownBeneficiary], raw_text: str = "") -> NameMatch:
    """Exact name -> that woman. Otherwise a confident fuzzy match, else no guess: close names
    become suggestions and the spoken name is returned so the app can offer "add as new"."""
    people = list(people)
    words = [w.strip(".,!?।:;") for w in text.split()]
    scored: list[tuple[float, KnownBeneficiary]] = []
    for person in people:
        score = 0.0
        for name in (person.name_hi, person.name_en, *person.aliases):
            name = _preprocess(name)
            if not name:
                continue
            if re.search(_term_regex(name), text):
                score = max(score, 1.0)
            elif re.search(_term_regex(name.split()[0]), text):
                score = max(score, CONFIDENT_FULL_NAME + 0.1)  # exact first name
            else:
                score = max(score, _name_score(words, name))
        scored.append((score, person))
    scored.sort(key=lambda sp: sp[0], reverse=True)
    best_score, best = scored[0] if scored else (0.0, None)
    tie = len(scored) > 1 and best_score - scored[1][0] < AMBIGUITY_MARGIN
    if best is not None and best_score >= CONFIDENT_FULL_NAME and not tie:
        return NameMatch(best, (), None)
    suggestions = tuple(p.id for score, p in scored if score >= SUGGEST_BELOW)[:3]
    return NameMatch(None, suggestions, heard_name(raw_text or text))


# --------------------------------------------------------------------------- public API

def parse_visit(text: str, today: date, people: Iterable[KnownBeneficiary] = ()) -> VisitFields:
    norm = _preprocess(text)
    clauses = split_clauses(norm)
    bp = parse_bp(norm)
    ifa_taking, ifa_tablets = parse_ifa(clauses)
    td_dose, vaccine_given = parse_td(clauses)
    names = match_beneficiary(norm, people, text)
    person = names.person
    return VisitFields(
        beneficiary_id=person.id if person else None,
        beneficiary_name=person.name_hi if person else None,
        beneficiary_name_heard=None if person else names.heard,
        beneficiary_suggestions=list(names.suggestions),
        pregnancy_month=parse_pregnancy_month(norm),
        bp_systolic=bp.systolic,
        bp_diastolic=bp.diastolic,
        bp_unclear=bp.heard is not None,
        bp_heard=bp.heard,
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


def unclear_fields(f: VisitFields) -> list[str]:
    """Fields that were spoken but not understood, so the read-back asks for them again."""
    return [name for name, unclear in (("bp", f.bp_unclear), ("fetal_movement", f.fetal_movement == "unclear"))
            if unclear]


def merge_correction(base: VisitFields, new: VisitFields) -> tuple[VisitFields, bool]:
    """Merge a spoken correction into an entry. Only what the correction actually says
    changes; symptoms are added; the matched woman is kept unless a new one is named."""
    merged, changed = base.model_dump(), False
    skip = {"beneficiary_name", "beneficiary_name_en", "beneficiary_name_heard", "beneficiary_suggestions",
            "bp_unclear", "bp_heard", "symptoms"}
    for key, value in new.model_dump().items():
        if key in skip or value is None or value == merged[key]:
            continue
        merged[key], changed = value, True
    added = [s for s in new.symptoms if s not in merged["symptoms"]]
    if added:
        merged["symptoms"], changed = merged["symptoms"] + added, True
    if new.bp_systolic and new.bp_diastolic:
        merged.update(bp_unclear=False, bp_heard=None)
    elif new.bp_unclear:  # still not understood: keep asking, show the latest attempt
        changed = changed or new.bp_heard != base.bp_heard
        merged.update(bp_systolic=None, bp_diastolic=None, bp_unclear=True, bp_heard=new.bp_heard)
    return VisitFields(**merged), changed


def classify_confirmation(text: str) -> str:
    """Voice confirm after read-back: 'yes' | 'no' | 'unknown'. Negation wins."""
    norm = _preprocess(text)
    if _any(norm, NO_TERMS):
        return "no"
    if _any(norm, YES_TERMS):
        return "yes"
    return "unknown"
