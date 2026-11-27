from __future__ import annotations

from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.parser import KnownBeneficiary

TODAY = date(2026, 11, 27)  # a Friday

PEOPLE = [
    KnownBeneficiary(1, "सुनीता साहू", "Sunita Sahu"),
    KnownBeneficiary(2, "गीता यादव", "Geeta Yadav"),
    KnownBeneficiary(3, "रेखा वर्मा", "Rekha Verma"),
]


def make_settings(tmp_path, **overrides) -> Settings:
    base = dict(db_path=tmp_path / "test.db", static_dir=tmp_path / "no-static", sarvam_api_key="", gemini_api_key="")
    base.update(overrides)
    return Settings(**base)


@pytest.fixture
def settings(tmp_path) -> Settings:
    return make_settings(tmp_path)


@pytest.fixture
def client(settings) -> TestClient:
    return TestClient(create_app(settings))
