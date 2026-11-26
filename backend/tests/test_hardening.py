"""Real-world hardening: fuzzy names / new women, more date phrases, dialect words, noisy speech."""
from __future__ import annotations

from datetime import date, timedelta

import pytest

from app.parser import KnownBeneficiary, heard_name, match_beneficiary, parse_visit
from tests.conftest import PEOPLE, TODAY  # TODAY = Friday 27 Nov 2026

PEOPLE_FULL = [*PEOPLE, KnownBeneficiary(5, "कमला ध्रुव", "Kamla Dhruw")]


def p(text):
    return parse_visit(text, TODAY, PEOPLE_FULL)


# ------------------------------------------------------- 4. new vs existing woman
@pytest.mark.parametrize("text,bid", [
    ("सुनिता साहु सात महीने", 1),     # short vowels instead of long (सुनीता साहू)
    ("Sunitaa Sahoo 7 mahine", 1),   # doubled / variant Roman spelling
    ("Geetha Yadav bp 120/80", 2),   # th vs t
    ("Kamla Dhruv aath mahine", 5),  # Dhruv vs Dhruw
    ("कमला ध्रुव के घर", 5),
])
def test_fuzzy_name_matches_small_spelling_differences(text, bid):
    assert p(text).beneficiary_id == bid


@pytest.mark.parametrize("text,heard", [
    ("Anita Devi 6 mahine BP 120 by 80", "Anita Devi"),
    ("अनीता देवी के घर गई, सात महीने", "अनीता देवी"),
    ("श्रीमती पार्वती मरकाम, आठ महीने", "पार्वती मरकाम"),
])
def test_unknown_woman_is_not_guessed_and_her_name_is_offered(text, heard):
    f = p(text)
    assert f.beneficiary_id is None
    assert f.beneficiary_name_heard == heard


def test_close_but_unsure_name_becomes_a_suggestion_not_a_match():
    result = match_beneficiary("rekhaa varma ji", [KnownBeneficiary(3, "रेखा वर्मा", "Rekha Verma"),
                                                   KnownBeneficiary(9, "रेखा वर्मन", "Rekha Varman")])
    assert result.person is None  # two plausible Rekhas: ask, don't guess
    assert set(result.suggestions) == {3, 9}


def test_two_women_with_the_same_first_name_are_not_guessed():
    people = [KnownBeneficiary(1, "सुनीता साहू", "Sunita Sahu"), KnownBeneficiary(7, "सुनीता नेताम", "Sunita Netam")]
    assert match_beneficiary("sunita 7 mahine", people).person is None


def test_heard_name_stops_at_numbers_particles_and_punctuation():
    assert heard_name("Anita 7 mahine") == "Anita"
    assert heard_name("सीमा का बीपी 120/80") == "सीमा"
    assert heard_name("7 mahine ki pregnant") is None


# --------------------------------------------------------------- 5. date phrases
@pytest.mark.parametrize("text,delta", [
    ("parso aaungi", 2),
    ("नरसों आऊंगी", 3),
    ("narso visit", 3),
    ("agle mahine aaungi", 30),
    ("अगले महीने फिर से", 30),
    ("2 mahine baad checkup", 60),
    ("aath din baad dobara visit", 8),
    ("10 दिन बाद आऊंगी", 10),
])
def test_more_relative_dates(text, delta):
    assert p(text).next_visit_date == TODAY + timedelta(days=delta)


@pytest.mark.parametrize("text,expected", [
    ("अगली विज़िट सोमवार", date(2026, 11, 30)),
    ("next visit on Tuesday", date(2026, 12, 1)),
    ("budhwar ko aaungi", date(2026, 12, 2)),
    ("गुरुवार को दोबारा", date(2026, 12, 3)),
    ("बृहस्पतिवार को दोबारा", date(2026, 12, 3)),
    ("shukravar ko visit", date(2026, 12, 4)),   # today is Friday -> next Friday
    ("shaniwar ko aaungi", date(2026, 11, 28)),
    ("इतवार को आऊंगी", date(2026, 11, 29)),
    ("5 tarikh ko aaungi", date(2026, 12, 5)),
    ("अगली विज़िट 30 तारीख", date(2026, 11, 30)),
])
def test_weekdays_and_dates_in_hindi_and_english(text, expected):
    assert p(text).next_visit_date == expected


# -------------------------------------------------------- 6. dialect + noisy speech
@pytest.mark.parametrize("text,symptom", [
    ("गोड़ फूल गइल बा", "swelling"),            # Bhojpuri: feet swollen
    ("पैर फूल गए हैं", "swelling"),
    ("pair phool gaye", "swelling"),
    ("सूजल बा", "swelling"),
    ("मूड़ पिरात बा", "headache"),               # Bhojpuri: head aches
    ("मुड़ी पीरा हे", "headache"),               # Chhattisgarhi
    ("माथा दुखत है", "headache"),
    ("mudi peera hai", "headache"),
    ("लहू गिरत बा", "bleeding"),                # Bhojpuri: blood falling
    ("रकत जात हे", "bleeding"),
    ("lahu aa raha hai", "bleeding"),
    ("जर आवत हे", "fever"),                     # Chhattisgarhi: fever
    ("बोखार बा", "fever"),
    ("ज्वर है", "fever"),
])
def test_dialect_symptom_words(text, symptom):
    assert symptom in p(text).symptoms


def test_breathless_phool_is_not_swelling():
    assert p("सांस फूलत हे").symptoms == ["breathlessness"]


@pytest.mark.parametrize("text,value", [
    ("लइका हिलत नइ हे", "reduced"),     # Chhattisgarhi: baby not moving
    ("बच्चा कम हिलत बा", "reduced"),   # Bhojpuri
])
def test_dialect_fetal_movement(text, value):
    assert p(text).fetal_movement == value


def test_dialect_negation_cancels_symptom():
    assert p("सूजन नइ हे").symptoms == []
    assert p("बोखार नइखे").symptoms == []


def test_fillers_and_repeated_fragments_are_ignored():
    f = p("उम्म सुनीता सुनीता साहू, सात सात महीने, बीपी बीपी 150 उम्म बाय 100, matlab sujan hai sujan hai")
    assert (f.beneficiary_id, f.pregnancy_month) == (1, 7)
    assert (f.bp_systolic, f.bp_diastolic) == (150, 100)
    assert f.symptoms == ["swelling"]


def test_repeated_whole_reading_collapses():
    f = p("BP 150 by 100 BP 150 by 100, hb 9 hb 9")
    assert (f.bp_systolic, f.bp_diastolic, f.hb) == (150, 100, 9)


# ------------------------------------------------------------------- API
def test_unknown_woman_flow_via_api(client):
    res = client.post("/api/extract", json={"transcript": "Anita Devi 6 mahine BP 120 by 80"}).json()
    assert res["fields"]["beneficiary_id"] is None and res["fields"]["beneficiary_name_heard"] == "Anita Devi"
    assert "Anita Devi — यह नाम सूची में नहीं है" in res["summary_hi"]
    assert "Anita Devi is not on the list" in res["summary_en"]
    added = client.post("/api/beneficiaries", json={"name": "Anita Devi", "village": "Kurud"})
    assert added.status_code == 201 and added.json()["created"] is True
    again = client.post("/api/beneficiaries", json={"name": "anita devi"}).json()
    assert again["created"] is False and again["id"] == added.json()["id"]  # no duplicates
    res = client.post("/api/extract", json={"transcript": "Anita Devi 6 mahine"}).json()
    assert res["fields"]["beneficiary_id"] == added.json()["id"]


def test_suggestions_are_returned_with_names(client):
    res = client.post("/api/extract", json={"transcript": "Sunitha Sahni 6 mahine"}).json()
    if res["fields"]["beneficiary_id"] is None:  # close but not certain -> offered, not chosen
        assert all({"id", "name_hi", "name_en"} <= s.keys() for s in res["suggestions"])


def test_status_describes_no_key_mode_honestly(client):
    note = client.get("/api/status").json()["mode_note"]
    assert "No API keys needed" in note and "needs internet" in note and "on our server" in note
