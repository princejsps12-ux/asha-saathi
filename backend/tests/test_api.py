"""API tests: full pipeline, persistence, lists, and graceful key-less / API-failure behaviour."""

from __future__ import annotations

import httpx
from fastapi.testclient import TestClient

from app import integrations
from app.main import create_app
from app.seed import SAMPLES
from tests.conftest import make_settings


def test_health_and_no_key_status(client):
    assert client.get("/api/health").json() == {"ok": True}
    status = client.get("/api/status").json()
    assert status["offline_mode"] is True and status["stt"] == "browser" and status["extraction"] == "rules"


def test_seed_creates_five_beneficiaries_and_due_tomorrow(client):
    people = client.get("/api/beneficiaries").json()
    assert len(people) == 5 and all(p["name_hi"] and p["village"] for p in people)
    due = client.get("/api/due").json()
    assert len(due["tomorrow"]) >= 1
    assert any(p["risk"] == "red" for p in client.get("/api/high-risk").json())


def test_extract_sample_flags_danger_with_reason(client):
    res = client.post("/api/extract", json={"transcript": SAMPLES[0]["text"]}).json()
    assert res["fields"]["beneficiary_name"] == "रेखा वर्मा"
    assert res["risk"] == "red" and res["engine"] == "rules"
    codes = {a["code"] for a in res["alerts"]}
    assert {"hypertension", "preeclampsia_signs"} <= codes
    assert all(a["reason"] and a["source"] for a in res["alerts"])
    assert "क्या यह सही है" in res["summary_hi"]


def test_save_visit_updates_due_tomorrow_and_high_risk(client):
    analysis = client.post("/api/extract", json={"transcript": SAMPLES[0]["text"]}).json()
    bid = analysis["fields"]["beneficiary_id"]
    saved = client.post("/api/visits", json={"transcript": SAMPLES[0]["text"], "fields": analysis["fields"]})
    assert saved.status_code == 201 and saved.json()["visit"]["risk"] == "red"
    assert bid in {p["id"] for p in client.get("/api/due").json()["tomorrow"]}
    assert bid in {p["id"] for p in client.get("/api/high-risk").json()}
    history = client.get(f"/api/beneficiaries/{bid}").json()["visits"]
    assert history[0]["transcript"] == SAMPLES[0]["text"] and len(history) == 2


def test_server_recomputes_alerts_ignoring_client(client):
    fields = {"beneficiary_id": 1, "bp_systolic": 170, "bp_diastolic": 112}
    visit = client.post("/api/visits", json={"fields": fields}).json()["visit"]
    assert visit["alerts"][0]["code"] == "severe_hypertension"


def test_edit_then_evaluate_changes_alerts(client):
    res = client.post("/api/evaluate", json={"fields": {"beneficiary_id": 2, "hb": 6.5}}).json()
    assert res["alerts"][0]["code"] == "severe_anaemia" and res["fields"]["beneficiary_name"] == "गीता यादव"


def test_validation_errors(client):
    assert client.post("/api/visits", json={"fields": {"hb": 9}}).status_code == 422
    assert client.post("/api/extract", json={"transcript": ""}).status_code == 422
    assert client.post("/api/evaluate", json={"fields": {"bp_systolic": 999}}).status_code == 422
    assert client.get("/api/beneficiaries/999").status_code == 404
    assert client.post("/api/evaluate", json={"fields": {"beneficiary_id": 999}}).status_code == 404


def test_intent_endpoint(client):
    assert client.post("/api/intent", json={"text": "हाँ जी"}).json() == {"intent": "yes"}
    assert client.post("/api/intent", json={"text": "nahi"}).json() == {"intent": "no"}


def test_stt_without_key_is_503_not_crash(client):
    res = client.post("/api/stt", files={"audio": ("a.webm", b"123", "audio/webm")})
    assert res.status_code == 503 and "SARVAM_API_KEY" in res.json()["detail"]


def test_gemini_failure_falls_back_to_parser(tmp_path, monkeypatch):
    def boom(*_a, **_k):
        raise httpx.ConnectTimeout("down")

    monkeypatch.setattr(integrations.httpx, "post", boom)
    client = TestClient(create_app(make_settings(tmp_path, gemini_api_key="fake")))
    res = client.post("/api/extract", json={"transcript": SAMPLES[1]["text"]}).json()
    assert res["engine"] == "rules" and "built-in parser" in res["engine_note"]
    assert res["fields"]["hb"] == 9.5


def test_gemini_success_merges_with_parser(tmp_path, monkeypatch):
    llm_json = '{"hb": 9.0, "weight_kg": 54, "symptoms": ["fever", "made_up"], "beneficiary_id": 77}'

    def fake_post(*_a, **_k):
        return httpx.Response(
            200,
            json={"candidates": [{"content": {"parts": [{"text": llm_json}]}}]},
            request=httpx.Request("POST", "https://x"),
        )

    monkeypatch.setattr(integrations.httpx, "post", fake_post)
    client = TestClient(create_app(make_settings(tmp_path, gemini_api_key="fake")))
    res = client.post("/api/extract", json={"transcript": SAMPLES[1]["text"]}).json()
    f = res["fields"]
    assert res["engine"] == "gemini+rules"
    assert f["hb"] == 9.0 and f["weight_kg"] == 54  # LLM wins where present
    assert f["symptoms"] == ["fever"]  # unknown codes dropped
    assert f["beneficiary_id"] == 1  # unknown id ignored, parser match kept
    assert f["ifa_taking"] is True and f["pregnancy_month"] == 7  # parser fills the gaps


def test_unselected_beneficiary_never_keeps_stale_name(client):
    res = client.post("/api/evaluate", json={"fields": {"beneficiary_name": "पुराना नाम"}}).json()
    assert res["fields"]["beneficiary_name"] is None and "लाभार्थी का नाम नहीं मिला" in res["summary_hi"]


def test_stale_demo_data_is_refreshed_but_real_data_is_kept(tmp_path, settings):
    app = create_app(settings)
    app.state.db.set_meta("seeded_on", "2000-01-01")
    create_app(settings)  # restart on a "later day" with only demo data -> fresh seed
    assert app.state.db.get_meta("seeded_on") == settings.today().isoformat()

    TestClient(app).post("/api/visits", json={"fields": {"beneficiary_id": 1}})  # real visit
    app.state.db.set_meta("seeded_on", "2000-01-01")
    create_app(settings)
    assert app.state.db.get_meta("seeded_on") == "2000-01-01"  # untouched
    assert app.state.db.count_user_visits() == 1


def test_demo_reset_restores_seed(client):
    client.post("/api/visits", json={"fields": {"beneficiary_id": 1}})
    assert client.post("/api/demo/reset").json()["beneficiaries"] == 5
    assert all(p["visit_count"] >= 1 for p in client.get("/api/beneficiaries").json())


def test_bilingual_analysis_english_gloss_and_readback(client):
    res = client.post("/api/extract", json={"transcript": SAMPLES[0]["text"]}).json()
    assert res["fields"]["beneficiary_name_en"] == "Rekha Verma"
    gloss = res["gloss_en"]
    for part in (
        "Rekha Verma",
        "5 months pregnant",
        "BP 142/92",
        "swelling (feet)",
        "headache",
        "Taking IFA tablets",
        "Td 2nd dose given",
        "Next visit tomorrow",
        "Danger sign: High BP",
    ):
        assert part in gloss
    assert "?" not in gloss  # gloss is a statement; the question is only in the read-back
    assert res["summary_en"].startswith(gloss) and res["summary_en"].endswith("Say yes or no.")
    assert all(any("ऀ" <= ch <= "ॿ" for ch in s) for s in (res["summary_hi"],))
    alert = res["alerts"][0]
    assert alert["reason"] and alert["reason_hi"] and alert["action_en"] and alert["action_hi"]


def test_english_spoken_visit_end_to_end(client):
    text = "Geeta Yadav, 8 months pregnant, BP 150 over 100, baby is not moving much, bleeding since morning"
    res = client.post("/api/extract", json={"transcript": text}).json()
    codes = {a["code"] for a in res["alerts"]}
    assert {"hypertension", "reduced_fetal_movement", "bleeding"} <= codes
    assert "Geeta Yadav" in res["gloss_en"]


def test_errors_are_bilingual_and_friendly(client):
    bad = client.post("/api/evaluate", json={"fields": {"bp_systolic": 999}})
    assert bad.status_code == 422
    body = bad.json()
    assert "/" in body["detail"] and "please check" in body["detail"] and body["fields"] == ["fields.bp_systolic"]
    missing = client.get("/api/beneficiaries/999").json()["detail"]
    assert "लाभार्थी नहीं मिला" in missing and "Beneficiary not found" in missing
    no_woman = client.post("/api/visits", json={"fields": {"hb": 9}}).json()["detail"]
    assert "पहले लाभार्थी चुनें" in no_woman


def test_unexpected_error_returns_friendly_500_not_a_stack_trace(tmp_path, monkeypatch):
    app = create_app(make_settings(tmp_path))
    monkeypatch.setattr(app.state.db, "list_beneficiaries", lambda *a, **k: 1 / 0)
    res = TestClient(app, raise_server_exceptions=False).get("/api/beneficiaries")
    assert res.status_code == 500 and "Something went wrong" in res.json()["detail"]
    assert "ZeroDivision" not in res.text


def test_misheard_bp_is_asked_again_then_corrected_by_voice(client):
    from tests.test_stt_mishearings import REAL_STT

    first = client.post("/api/extract", json={"transcript": REAL_STT}).json()
    assert first["unclear"] == ["bp"] and first["fields"]["bp_heard"] == "15/100"
    assert first["fields"]["bp_systolic"] is None and first["fields"]["fetal_movement"] == "reduced"
    assert "बीपी समझ नहीं आया, दोबारा बोलिए" in first["summary_hi"]
    assert "BP not clear, please say again" in first["summary_en"]

    # She says just the BP again: it is merged into the same entry.
    fixed = client.post("/api/extract", json={"transcript": "बीपी 150 बाय 100", "base": first["fields"]}).json()
    assert fixed["changed"] is True and fixed["unclear"] == []
    assert (fixed["fields"]["bp_systolic"], fixed["fields"]["bp_diastolic"]) == (150, 100)
    assert fixed["fields"]["beneficiary_id"] == first["fields"]["beneficiary_id"]
    assert {"hypertension", "reduced_fetal_movement"} <= {a["code"] for a in fixed["alerts"]}
    assert "क्या यह सही है" in fixed["summary_hi"]  # nothing unclear any more: plain yes/no

    # A plain "haan" adds nothing, so the UI treats it as a yes instead.
    same = client.post("/api/extract", json={"transcript": "हाँ", "base": fixed["fields"]}).json()
    assert same["changed"] is False


def test_typed_bp_clears_unclear_flag(client):
    res = client.post(
        "/api/evaluate",
        json={"fields": {"bp_unclear": True, "bp_heard": "15/100", "bp_systolic": 150, "bp_diastolic": 100}},
    ).json()
    assert res["fields"]["bp_unclear"] is False and res["unclear"] == []


def test_phone_mixed_script_transcript_via_api(client):
    from tests.test_stt_mishearings import PHONE_STT

    res = client.post("/api/extract", json={"transcript": PHONE_STT})
    assert res.status_code == 200
    body = res.json()
    f = body["fields"]
    assert (f["beneficiary_name"], f["pregnancy_month"]) == ("सुनीता साहू", 7)
    assert (f["bp_systolic"], f["bp_diastolic"]) == (150, 100)
    assert f["fetal_movement"] == "reduced" and f["symptoms"] == ["swelling"] and body["unclear"] == []
    again = client.post("/api/extract", json={"transcript": PHONE_STT, "base": f}).json()
    assert again["changed"] is False


def test_en_mode_stt_bp_via_api(client):
    from tests.test_stt_mishearings import EN_MODE_STT

    for text in (EN_MODE_STT, EN_MODE_STT.replace("150/100", "150‎/‎100")):
        res = client.post("/api/extract", json={"transcript": text}).json()
        assert (res["fields"]["bp_systolic"], res["fields"]["bp_diastolic"]) == (150, 100)
        assert res["unclear"] == [] and "BP not clear" not in res["summary_en"]


# ------------------------------------------------------------------ input limits (judge review)


def test_oversized_json_body_is_rejected_before_reading_it(client):
    res = client.post(
        "/api/extract",
        content=b'{"transcript": "' + b"a" * 70_000 + b'"}',
        headers={"content-type": "application/json"},
    )
    assert res.status_code == 413 and "Too long" in res.json()["detail"] and " / " in res.json()["detail"]


def test_unknown_symptom_code_is_a_friendly_422(client):
    res = client.post("/api/evaluate", json={"fields": {"symptoms": ["bleeding", "zzz"]}})
    assert res.status_code == 422 and res.json()["fields"] == ["fields.symptoms"]


def test_duplicate_symptoms_are_merged(client):
    res = client.post("/api/evaluate", json={"fields": {"symptoms": ["fever", "fever"]}})
    assert res.json()["fields"]["symptoms"] == ["fever"]


def test_list_fields_are_capped(client):
    res = client.post("/api/evaluate", json={"fields": {"beneficiary_suggestions": list(range(50))}})
    assert res.status_code == 422
