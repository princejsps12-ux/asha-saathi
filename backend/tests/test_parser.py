"""Unit tests for the built-in (no API key) Hindi / Hinglish / English parser — one block per rule."""

from __future__ import annotations

from datetime import date, timedelta

import pytest

from app.numbers import normalize_numbers
from app.parser import classify_confirmation, parse_visit
from app.seed import SAMPLES
from tests.conftest import PEOPLE, TODAY


def p(text: str):
    return parse_visit(text, TODAY, PEOPLE)


# ------------------------------------------------------------------ numbers
@pytest.mark.parametrize(
    "text,expected",
    [
        ("बीपी एक सौ चालीस बटा नब्बे", "बीपी 140 बटा 90"),
        ("ek sau pachas by sau", "150 by 100"),
        ("१४० बटा ९०", "140 बटा 90"),
        ("साढ़े नौ", "9.5"),
        ("goli do", "goli do"),  # "do" = give, not 2
        ("do hafte baad", "2 hafte baad"),  # "do" before a unit = 2
    ],
)
def test_normalize_numbers(text, expected):
    assert normalize_numbers(text) == expected


# ----------------------------------------------------------------------- BP
@pytest.mark.parametrize(
    "text,bp",
    [
        ("BP 140/90 hai", (140, 90)),
        ("bp 140 by 90", (140, 90)),
        ("बीपी 150 बटा 100", (150, 100)),
        ("बीपी एक सौ चालीस बाय नब्बे", (140, 90)),
        ("BP upar 140 neeche 90", (140, 90)),
        ("bp 160 upar 110 neeche", (160, 110)),
        ("ऊपर का 130 नीचे का 85", (130, 85)),
    ],
)
def test_bp_formats(text, bp):
    f = p(text)
    assert (f.bp_systolic, f.bp_diastolic) == bp


def test_bp_rejects_implausible_pairs():
    f = p("7 महीने, 15 तारीख को 2 गोली")
    assert f.bp_systolic is None and f.bp_diastolic is None


# ---------------------------------------------------------- pregnancy month
@pytest.mark.parametrize(
    "text,month",
    [
        ("सात महीने की गर्भवती", 7),
        ("7 mahine ki pregnant", 7),
        ("सातवां महीना चल रहा है", 7),
        ("she is 6 months pregnant", 6),
        ("28 हफ्ते की गर्भवती", 7),
        ("paanchva mahina", 5),
    ],
)
def test_pregnancy_month(text, month):
    assert p(text).pregnancy_month == month


def test_months_later_is_a_date_not_pregnancy_month():
    assert p("2 mahine baad aana").pregnancy_month is None


# ----------------------------------------------------------------- symptoms
def test_hindi_swelling_and_headache():
    assert set(p("पैरों में सूजन और सिर दर्द है").symptoms) == {"swelling", "headache"}


def test_hinglish_symptoms():
    assert set(p("sujan hai, sar dard bhi hai, aankhon ke aage dhundhla").symptoms) >= {
        "swelling",
        "headache",
        "blurred_vision",
    }


def test_face_swelling_detected_separately():
    assert p("चेहरे पर सूजन है").symptoms == ["swelling_face_hands"]


@pytest.mark.parametrize("text", ["सूजन नहीं है", "koi sujan nahi", "no swelling, no headache"])
def test_negated_symptoms_ignored(text):
    assert p(text).symptoms == []


def test_bleeding_vs_anaemia_vs_blood_test():
    assert p("खून आ रहा है").symptoms == ["bleeding"]
    assert p("some bleeding since morning").symptoms == ["bleeding"]
    assert p("खून की कमी है").symptoms == ["pallor_weakness"]
    assert p("खून की जांच हुई").symptoms == []


def test_breathlessness_and_fever():
    assert set(p("सांस फूलती है, बुखार भी है").symptoms) == {"breathlessness", "fever"}


# ------------------------------------------------------------ fetal movement
@pytest.mark.parametrize(
    "text,value",
    [
        ("बच्चे की हलचल कम है", "reduced"),
        ("baby movement kam hai", "reduced"),
        ("bachcha hil nahi raha", "reduced"),
        ("baby movement theek hai", "normal"),
        ("हलचल कम नहीं है, ठीक है", "normal"),
    ],
)
def test_fetal_movement(text, value):
    assert p(text).fetal_movement == value


# --------------------------------------------------------------- IFA / Td
def test_ifa_taking_and_not_taking():
    assert p("आयरन की गोली रोज़ ले रही है").ifa_taking is True
    assert p("iron tablet nahi le rahi").ifa_taking is False
    f = p("IFA ki 30 goli di")
    assert f.ifa_taking is True and f.ifa_tablets == 30


@pytest.mark.parametrize(
    "text,dose",
    [("टीडी का दूसरा टीका लगा", 2), ("TT 1 laga diya", 1), ("pehla teeka lag gaya", 1), ("td booster diya", 3)],
)
def test_td_dose(text, dose):
    f = p(text)
    assert f.td_dose == dose and f.vaccine_given is True


# --------------------------------------------------------------- next visit
@pytest.mark.parametrize(
    "text,delta",
    [
        ("अगली विज़िट कल", 1),
        ("kal phir aaungi", 1),
        ("agle hafte aaungi", 7),
        ("next visit in 2 days", 2),
        ("परसों आऊंगी", 2),
        ("5 din baad dobara visit", 5),
        ("do hafte baad checkup", 14),
    ],
)
def test_next_visit_relative(text, delta):
    assert p(text).next_visit_date == TODAY + timedelta(days=delta)


def test_next_visit_day_of_month_rolls_to_next_month():
    assert p("अगली विज़िट 15 तारीख").next_visit_date == date(2026, 12, 15)


def test_kal_without_visit_context_is_not_a_visit_date():
    assert p("कल से सिर दर्द है").next_visit_date is None


# --------------------------------------------------- vitals: Hb, temp, weight
@pytest.mark.parametrize("text,hb", [("हीमोग्लोबिन साढ़े नौ", 9.5), ("hb 8 point 5", 8.5), ("HB 10.2 hai", 10.2)])
def test_hb(text, hb):
    assert p(text).hb == hb


def test_temperature_f_and_celsius():
    assert p("बुखार 102 डिग्री").temperature_f == 102
    assert p("fever 38.5").temperature_f == 101.3


def test_weight():
    assert p("वजन 52 किलो").weight_kg == 52


# ------------------------------------------------------------- beneficiary
@pytest.mark.parametrize(
    "text,bid", [("सुनीता साहू के घर गई", 1), ("Geeta Yadav 8 months", 2), ("rekha ka bp 120/80", 3), ("anita devi", None)]
)
def test_beneficiary_match(text, bid):
    assert p(text).beneficiary_id == bid


# ------------------------------------------------------------- confirmation
@pytest.mark.parametrize(
    "text,intent",
    [
        ("हाँ", "yes"),
        ("haan sahi hai", "yes"),
        ("हाँ सेव करना", "yes"),
        ("yes", "yes"),
        ("नहीं", "no"),
        ("nahi galat hai", "no"),
        ("सही नहीं है", "no"),
        ("hmm", "unknown"),
        ("यस", "yes"),
        ("ओके सेव", "yes"),
        ("नो", "no"),  # English words as a hi-IN recogniser writes them
    ],
)
def test_confirmation_intent(text, intent):
    assert classify_confirmation(text) == intent


# ---------------------------------------------------------- full sentences
def test_hindi_sample_end_to_end():
    f = p(SAMPLES[0]["text"])
    assert f.beneficiary_id == 3 and f.pregnancy_month == 5
    assert (f.bp_systolic, f.bp_diastolic) == (142, 92)
    assert set(f.symptoms) == {"swelling", "headache"}
    assert f.fetal_movement == "normal" and f.ifa_taking is True and f.td_dose == 2
    assert f.next_visit_date == TODAY + timedelta(days=1)


def test_hindi_face_swelling_vision_and_movement_sentence():
    f = p("सुनीता का बीपी ऊपर 150 नीचे 100, चेहरे पर सूजन, आंखों के आगे धुंधला, बच्चा कम हिल रहा है")
    assert (f.beneficiary_id, f.bp_systolic, f.bp_diastolic) == (1, 150, 100)
    assert f.symptoms == ["swelling_face_hands", "blurred_vision"] and f.fetal_movement == "reduced"


def test_hinglish_fever_weekday_and_stopped_ifa():
    f = p("geeta ko kal se bukhar hai, 101 degree, iron ki goli band kar di, somvar ko dobara visit")
    assert f.beneficiary_id == 2 and f.temperature_f == 101 and f.symptoms == ["fever"]
    assert f.ifa_taking is False
    assert f.next_visit_date == date(2026, 11, 30)  # next Monday, not "kal"


def test_hinglish_sample_end_to_end():
    f = p(SAMPLES[1]["text"])
    assert f.beneficiary_id == 1 and f.pregnancy_month == 7 and f.hb == 9.5
    assert f.symptoms == [] and f.fetal_movement == "normal" and f.ifa_taking is True
    assert f.next_visit_date == TODAY + timedelta(days=7)
