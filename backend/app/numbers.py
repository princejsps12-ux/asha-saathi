"""Hindi / Hinglish number words -> digits.

Speech recognisers return numbers inconsistently: "140", "१४०", "एक सौ चालीस",
"ek sau chalis", "साढ़े आठ". `normalize_numbers` rewrites all of them to ASCII
digits so the field parser only ever has to deal with one representation.
"""

from __future__ import annotations

import re
import unicodedata


def fold(text: str) -> str:
    """Canonical Devanagari: drop nukta (ज़ -> ज, ढ़ -> ढ) and map chandrabindu to anusvara
    (हाँ -> हां), so spelling variants from different speech engines compare equal."""
    text = unicodedata.normalize("NFD", text).replace("़", "")
    return unicodedata.normalize("NFC", text).replace("ँ", "ं")


# Hand-packed word lists: easier to scan than one word per line.
# fmt: off
# Devanagari 1..99 in order (index + 1 = value). Hindi numbers are irregular,
# so a lookup table is the only reliable approach.
_DEVANAGARI_1_99 = (
    "एक दो तीन चार पांच छह सात आठ नौ दस "
    "ग्यारह बारह तेरह चौदह पंद्रह सोलह सत्रह अठारह उन्नीस बीस "
    "इक्कीस बाईस तेईस चौबीस पच्चीस छब्बीस सत्ताईस अट्ठाईस उनतीस तीस "
    "इकतीस बत्तीस तैंतीस चौंतीस पैंतीस छत्तीस सैंतीस अड़तीस उनतालीस चालीस "
    "इकतालीस बयालीस तैंतालीस चौवालीस पैंतालीस छियालीस सैंतालीस अड़तालीस उनचास पचास "
    "इक्यावन बावन तिरपन चौवन पचपन छप्पन सत्तावन अट्ठावन उनसठ साठ "
    "इकसठ बासठ तिरसठ चौंसठ पैंसठ छियासठ सड़सठ अड़सठ उनहत्तर सत्तर "
    "इकहत्तर बहत्तर तिहत्तर चौहत्तर पचहत्तर छिहत्तर सतहत्तर अठहत्तर उन्यासी अस्सी "
    "इक्यासी बयासी तिरासी चौरासी पचासी छियासी सत्तासी अठासी नवासी नब्बे "
    "इक्यानवे बानवे तिरानवे चौरानवे पचानवे छियानवे सत्तानवे अट्ठानवे निन्यानवे"
).split()

# Romanised (Hinglish) 1..99, same order.
_ROMAN_1_99 = (
    "ek do teen char paanch chhah saat aath nau das "
    "gyarah barah terah chaudah pandrah solah satrah atharah unnis bees "
    "ikkis bais teis chaubis pachchis chhabbis sattais atthais untis tees "
    "ikattis battis taintis chauntis paintis chhattis saintis adtis untalis chalis "
    "iktalis bayalis taintalis chauvalis paintalis chhiyalis saintalis adtalis unchas pachas "
    "ikyavan bavan tirpan chauvan pachpan chhappan sattavan atthavan unsath saath "
    "iksath basath tirsath chaunsath painsath chhiyasath sadsath adsath unhattar sattar "
    "ikhattar bahattar tihattar chauhattar pachhattar chhihattar sathattar athhattar unasi assi "
    "ikyasi bayasi tirasi chaurasi pachasi chhiyasi sattasi athasi navasi nabbe "
    "ikyanve banve tiranve chauranve pachanve chhiyanve sattanve atthanve ninyanve"
).split()

assert len(_DEVANAGARI_1_99) == 99 and len(_ROMAN_1_99) == 99

NUMBER_WORDS: dict[str, int] = {}
for _i, (_dev, _rom) in enumerate(zip(_DEVANAGARI_1_99, _ROMAN_1_99, strict=False), start=1):
    NUMBER_WORDS[_dev] = _i
    NUMBER_WORDS[_rom] = _i

# Common spelling variants produced by speech engines / ASHA typing habits.
NUMBER_WORDS.update({
    "पाँच": 5, "छः": 6, "छे": 6, "छ": 6, "सत्रा": 17,
    "chaar": 4, "panch": 5, "paanch": 5, "chhe": 6, "che": 6, "chah": 6, "sat": 7,
    "aath": 8, "aat": 8, "dus": 10, "gyara": 11, "bara": 12, "pandra": 15,
    "chalees": 40, "pachaas": 50, "sathh": 60, "assee": 80, "nabbe": 90, "nabbey": 90,
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7,
    "eight": 8, "nine": 9, "ten": 10,
})
NUMBER_WORDS = {fold(k): v for k, v in NUMBER_WORDS.items()}

HUNDRED_WORDS = {"सौ", "sau", "so", "hundred"}
STANDALONE_HUNDRED = {"सौ", "sau", "hundred"}  # not "so": that is also English "so"
HALF_PLUS_WORDS = {fold("साढ़े"), "sadhe", "saadhe", "sade"}  # "साढ़े आठ" = 8.5

# Words that are also ordinary Hinglish/English words ("do" = give, "saath" = with,
# "sat", "one", "chah" = wants). We only treat them as
# numbers when the *next* token is a number word or a unit.
AMBIGUOUS = {"do", "दो", "saath", "sat", "che", "chah", "one", "aat"}
UNIT_WORDS = {
    "महीने", "महीना", "माह", "हफ्ते", "हफ्ता", "सप्ताह", "दिन", "साल", "गोली", "गोलियां",
    "टैबलेट", "किलो", "तारीख", "बजे",
    "mahine", "mahina", "month", "months", "hafte", "hafta", "week", "weeks", "din", "days",
    "day", "saal", "goli", "goliyan", "tablet", "tablets", "kilo", "kg", "tarikh", "baje",
}
# fmt: on

_DEVANAGARI_DIGITS = str.maketrans("०१२३४५६७८९", "0123456789")
_TOKEN_RE = re.compile(r"\S+")
_STRIP = ".,!?।;:\"'()"


def _clean(tok: str) -> str:
    return tok.strip(_STRIP).lower()


def _is_number_start(tokens: list[str], i: int) -> bool:
    word = _clean(tokens[i])
    if word not in NUMBER_WORDS:
        return False
    if word not in AMBIGUOUS:
        return True
    nxt = _clean(tokens[i + 1]) if i + 1 < len(tokens) else ""
    return nxt in UNIT_WORDS or nxt in NUMBER_WORDS or nxt in HUNDRED_WORDS


def normalize_numbers(text: str) -> str:
    """Convert Devanagari digits and Hindi/Hinglish number words to ASCII digits.

    >>> normalize_numbers("बीपी एक सौ चालीस बटा नब्बे")
    'बीपी 140 बटा 90'
    """
    text = fold(text).translate(_DEVANAGARI_DIGITS)
    tokens = _TOKEN_RE.findall(text)
    out: list[str] = []
    i = 0
    while i < len(tokens):
        word = _clean(tokens[i])
        half = False
        if word in HALF_PLUS_WORDS and i + 1 < len(tokens) and _clean(tokens[i + 1]) in NUMBER_WORDS:
            half, i = True, i + 1
            word = _clean(tokens[i])
        if word in STANDALONE_HUNDRED:  # "बटा सौ" -> 100
            out.append("100" + tokens[i][len(tokens[i].rstrip(_STRIP)) :])
            i += 1
            continue
        if not (half or _is_number_start(tokens, i)):
            out.append(tokens[i])
            i += 1
            continue
        value = NUMBER_WORDS[word]
        trailing = tokens[i][len(tokens[i].rstrip(_STRIP)) :]
        i += 1
        # "एक सौ चालीस" -> 1 * 100 + 40
        if i < len(tokens) and _clean(tokens[i]) in HUNDRED_WORDS:
            value *= 100
            trailing = tokens[i][len(tokens[i].rstrip(_STRIP)) :]
            i += 1
            if i < len(tokens) and _clean(tokens[i]) in NUMBER_WORDS:
                value += NUMBER_WORDS[_clean(tokens[i])]
                trailing = tokens[i][len(tokens[i].rstrip(_STRIP)) :]
                i += 1
        out.append((f"{value}.5" if half else str(value)) + trailing)
    return " ".join(out)
