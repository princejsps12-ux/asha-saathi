"""Real browser speech-to-text output, mistakes included.

Web Speech (hi-IN) returns no punctuation, drops digits ("150" -> "15"), writes काम ("work")
for कम ("less"), and spells English words in Devanagari ("बेबी मूवमेंट", "बाय").
Rule: a mis-heard value is reported as UNCLEAR and asked again — never guessed, never dropped.
"""
from __future__ import annotations

from datetime import timedelta

import pytest

from app.parser import merge_correction, parse_visit, unclear_fields
from app.rules import evaluate
from app.summary import build_summary, build_summary_en
from tests.conftest import PEOPLE, TODAY

# Exact text Chrome's hi-IN recogniser produced for:
# "Sunita Sahu, saat mahine, BP 150 by 100, pairon mein sujan hai, baby movement kam hai, agle hafte phir aaungi"
REAL_STT = "सुनीता साहू 7 महीने बीपी 15 बाय 100 पैरों में सूजन है बेबी मूवमेंट काम है अगले हफ्ते फिर आऊंगी"


def test_real_stt_is_offered_as_a_try_sample():
    from app.seed import SAMPLES
    assert any(sample["text"] == REAL_STT for sample in SAMPLES)


def p(text):
    return parse_visit(text, TODAY, PEOPLE)


def test_real_stt_sentence_end_to_end():
    f = p(REAL_STT)
    assert f.beneficiary_id == 1 and f.pregnancy_month == 7
    assert f.bp_systolic is None and f.bp_diastolic is None  # never guessed
    assert f.bp_unclear is True and f.bp_heard == "15/100"   # never silently dropped
    assert f.fetal_movement == "reduced"                     # काम heard for कम
    assert f.symptoms == ["swelling"]
    assert f.next_visit_date == TODAY + timedelta(days=7)
    assert unclear_fields(f) == ["bp"]


def test_real_stt_read_back_asks_for_bp_again_in_both_languages():
    f = p(REAL_STT)
    alerts = evaluate(f)
    hi, en = build_summary(f, alerts, TODAY), build_summary_en(f, alerts, TODAY)
    assert "बीपी समझ नहीं आया, दोबारा बोलिए" in hi and "BP not clear, please say again" in en
    assert "दोबारा बोलिए" in hi and "say yes or no" not in en.lower()  # asks again, not a plain yes/no
    codes = {a.code for a in alerts}
    assert {"bp_unclear", "reduced_fetal_movement"} <= codes
    bp_alert = next(a for a in alerts if a.code == "bp_unclear")
    assert bp_alert.severity == "amber" and "15/100" in bp_alert.reason and "15/100" in bp_alert.reason_hi


# --------------------------------------------------------------- BP mishearings
@pytest.mark.parametrize("text,heard", [
    ("बीपी 15 बाय 100", "15/100"),    # dropped zero in systolic
    ("बीपी 140 बाय 9", "140/9"),      # dropped zero in diastolic
    ("बीपी 14 बाई 90", "14/90"),
    ("BP 90 by 140", "90/140"),        # reversed: never swapped silently
    ("बीपी ऊपर 15 नीचे 100", "15/100"),
    ("bp upar 150 neeche 10", "150/10"),
    ("बीपी 150 है", "150"),           # other half lost
    ("BP: 150", "150"),
])
def test_implausible_bp_is_unclear_not_guessed(text, heard):
    f = p(text)
    assert (f.bp_systolic, f.bp_diastolic) == (None, None)
    assert f.bp_unclear is True and f.bp_heard == heard


@pytest.mark.parametrize("text,bp", [
    ("बीपी 150 बाय 100", (150, 100)),
    ("बीपी 150 बाई 100", (150, 100)),
    ("बीपी 150 बटा 100", (150, 100)),
    ("बीपी 150 ओवर 100", (150, 100)),
    ("bp 150 by 100", (150, 100)),
    ("बीपी ऊपर 150 नीचे 100", (150, 100)),
    ("bp 150 upar 100 neeche", (150, 100)),
    ("ब्लड प्रेशर एक सौ पचास बाय सौ", (150, 100)),
])
def test_bp_separators_as_written_by_hindi_stt(text, bp):
    f = p(text)
    assert (f.bp_systolic, f.bp_diastolic) == bp and f.bp_unclear is False


@pytest.mark.parametrize("text", [
    "बीपी ठीक है",                                  # BP mentioned, no number: nothing to ask
    "7 महीने, 15 तारीख को 2 गोली",                  # numbers, but no BP
    "बीपी नॉर्मल, अगली विज़िट 28/11",                # a date is not a BP
    "वजन 55 किलो",
])
def test_no_false_bp_unclear(text):
    assert p(text).bp_unclear is False


# ----------------------------------------------------- baby movement mishearings
@pytest.mark.parametrize("text,value", [
    ("बेबी मूवमेंट काम है", "reduced"),          # काम written for कम
    ("बच्चे की हलचल काम है", "reduced"),
    ("baby movement kaam hai", "reduced"),
    ("बेबी मूवमेंट कम है", "reduced"),
    ("बेबी मूवमेंट ठीक है", "normal"),
    ("बच्चा हिल रहा है", "normal"),
    ("बेबी मूवमेंट", "unclear"),                 # mentioned, no state: ask, don't assume normal
    ("बच्चे की हलचल के बारे में पूछा", "unclear"),
    ("baby movement hai", "unclear"),
])
def test_fetal_movement_mishearings(text, value):
    assert p(text).fetal_movement == value


def test_kaam_meaning_work_elsewhere_is_left_alone():
    f = p("वो काम पर गई थी, बच्चे की हलचल ठीक है")
    assert f.fetal_movement == "normal"


def test_unclear_movement_is_asked_in_read_back():
    f = p("गीता 8 महीने बेबी मूवमेंट")
    alerts = evaluate(f)
    assert "fetal_movement_unclear" in {a.code for a in alerts}
    assert "हलचल साफ़ समझ नहीं आई" in build_summary(f, alerts, TODAY)
    assert "Baby movement not clear" in build_summary_en(f, alerts, TODAY)


# ------------------------------------------------- swelling and run-on sentences
@pytest.mark.parametrize("word", ["सूजन", "सुजन", "सूझन", "सूज गए", "sujan", "soojan", "sooj gaya"])
def test_swelling_spellings(word):
    assert p(f"पैरों में {word} है").symptoms == ["swelling"]


def test_unpunctuated_negation_stays_in_its_own_clause():
    # No commas (as STT returns it): "नहीं" must only cancel swelling, not the fever after it.
    f = p("सूजन नहीं है बुखार है सिर दर्द भी है")
    assert set(f.symptoms) == {"fever", "headache"}


def test_bare_iron_mention_is_not_assumed_taking():
    assert p("आयरन की गोली").ifa_taking is None
    assert p("आयरन की गोली रोज़ ले रही है").ifa_taking is True


# ----------------------------------------------------------- spoken corrections
def test_spoken_correction_fills_unclear_bp_and_keeps_the_rest():
    base = p(REAL_STT)
    fixed, changed = merge_correction(base, p("बीपी 150 बाय 100"))
    assert changed and (fixed.bp_systolic, fixed.bp_diastolic) == (150, 100) and not fixed.bp_unclear
    assert fixed.beneficiary_id == 1 and fixed.fetal_movement == "reduced" and fixed.symptoms == ["swelling"]


def test_correction_still_unclear_keeps_asking_and_yes_changes_nothing():
    base = p(REAL_STT)
    again, changed = merge_correction(base, p("बीपी 15 बाय 10"))
    assert changed and again.bp_unclear and again.bp_heard == "15/10"
    same, changed = merge_correction(base, p("हाँ"))
    assert not changed and same == base
