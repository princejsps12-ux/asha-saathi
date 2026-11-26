"""Danger-sign rule tests — one or more cases per rule, including boundaries."""
from __future__ import annotations

import pytest

from app import rules
from app.rules import RULES, evaluate, risk_level
from app.schemas import VisitFields


def codes(**kw) -> list[str]:
    return [a.code for a in evaluate(VisitFields(**kw))]


@pytest.mark.parametrize("sys_,dia,expected", [
    (140, 90, ["hypertension"]),           # [SBA] p.31: "140 mmHg or more and/or … 90 mmHg or more"
    (139, 89, []),
    (120, 92, ["hypertension"]),           # diastolic alone is enough
    (170, 100, ["hypertension"]),          # MoHFW gives no systolic "severe" cut-off: still refer today
    (130, 110, ["hypertension"]),          # [SBA] p.31: severe is diastolic *above* 110
    (130, 112, ["severe_hypertension"]),   # severe replaces plain hypertension
])
def test_bp_thresholds(sys_, dia, expected):
    assert codes(bp_systolic=sys_, bp_diastolic=dia) == expected


def test_alert_reason_contains_measured_values():
    alert = evaluate(VisitFields(bp_systolic=146, bp_diastolic=94))[0]
    assert "146/94" in alert.reason and "140/90" in alert.reason and alert.source
    assert "146/94" in alert.reason_hi and alert.action_en and alert.action_hi  # bilingual


def test_preeclampsia_combo_suppresses_single_symptom_alerts():
    assert codes(symptoms=["swelling", "headache"]) == ["preeclampsia_signs"]


def test_swelling_feet_alone_is_amber():
    alerts = evaluate(VisitFields(symptoms=["swelling"]))
    assert [(a.code, a.severity) for a in alerts] == [("swelling_feet", "amber")]


def test_face_hand_swelling_alone_is_red():
    assert codes(symptoms=["swelling_face_hands"]) == ["face_hand_swelling"]


def test_headache_with_blurred_vision_is_red():
    assert codes(symptoms=["headache", "blurred_vision"]) == ["headache_blurred_vision"]


@pytest.mark.parametrize("symptom,code", [
    ("bleeding", "bleeding"), ("convulsions", "convulsions"), ("abdominal_pain", "abdominal_pain"),
    ("breathlessness", "breathlessness"),
])
def test_single_red_symptoms(symptom, code):
    alerts = evaluate(VisitFields(symptoms=[symptom]))
    assert alerts[0].code == code and alerts[0].severity == "red"


@pytest.mark.parametrize("month,fires", [(7, True), (5, True), (4, False), (None, True)])
def test_reduced_fetal_movement_after_quickening(month, fires):
    assert ("reduced_fetal_movement" in codes(fetal_movement="reduced", pregnancy_month=month)) is fires


@pytest.mark.parametrize("hb,expected", [(6.8, ["severe_anaemia"]), (7.0, ["anaemia"]), (10.9, ["anaemia"]),
                                         (11.0, [])])
def test_hb_thresholds(hb, expected):
    assert codes(hb=hb) == expected


@pytest.mark.parametrize("hb,month,expected", [
    (10.7, 5, []),            # [AMB] p.56 WHO 2024: 2nd trimester anaemia is below 10.5
    (10.4, 5, ["anaemia"]),
    (10.7, 8, ["anaemia"]),   # 3rd trimester: below 11.0
    (10.7, 2, ["anaemia"]),   # 1st trimester: below 11.0
    (10.7, None, ["anaemia"]),  # month unknown: the stricter 11.0
])
def test_hb_cutoff_depends_on_trimester(hb, month, expected):
    assert codes(hb=hb, pregnancy_month=month) == expected


def test_referral_level_follows_sba_box7_columns():
    by_code = {r.code: r for r in RULES}
    for fru in ("bleeding", "convulsions", "severe_anaemia", "reduced_fetal_movement", "headache_blurred_vision"):
        assert by_code[fru].action == rules.EMERGENCY, fru
    for phc in ("hypertension", "breathlessness", "high_fever", "abdominal_pain"):
        assert by_code[phc].action == rules.REFER, phc


def test_weakness_without_hb_asks_for_test():
    assert codes(symptoms=["pallor_weakness"]) == ["anaemia"]


def test_fever_measured_vs_reported():
    assert codes(temperature_f=101.0, symptoms=["fever"]) == ["high_fever"]
    assert codes(temperature_f=99.0) == []
    assert codes(temperature_f=100.4) == []                # [SBA] Box 7: "more than 38°C"
    assert codes(temperature_f=100.5) == ["high_fever"]
    assert codes(symptoms=["fever"]) == ["fever_reported"]


def test_ifa_advice_only_from_second_trimester():
    assert codes(ifa_taking=False, pregnancy_month=6) == ["no_ifa"]
    assert codes(ifa_taking=False, pregnancy_month=2) == []


def test_red_alerts_sorted_before_amber_and_risk_level():
    alerts = evaluate(VisitFields(symptoms=["fever", "bleeding"]))
    assert [a.severity for a in alerts] == ["red", "amber"]
    assert risk_level(alerts) == "red"
    assert risk_level(evaluate(VisitFields(hb=9))) == "amber"
    assert risk_level(evaluate(VisitFields(bp_systolic=110, bp_diastolic=70))) == "normal"


def test_every_rule_cites_a_guideline_page_and_has_unique_code():
    import re
    known = {"SBA", "CHO", "MCP", "AMB"}
    for r in RULES:
        tags = re.findall(r"\[(\w+)\] p\.\d+", r.source)
        assert tags and set(tags) <= known, f"{r.code}: {r.source}"
        for tag in tags:
            assert f"[{tag}]" in rules.__doc__ and "https://" in rules.__doc__  # tag is defined with its URL
    assert len({r.code for r in RULES}) == len(RULES)


def test_thresholds_are_named_constants():
    assert (rules.BP_HIGH_SYSTOLIC, rules.BP_HIGH_DIASTOLIC) == (140, 90)
    assert rules.HB_SEVERE_ANAEMIA < rules.HB_ANAEMIA
