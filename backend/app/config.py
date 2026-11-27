"""Runtime configuration, read once from environment variables.

Every key is optional. With no keys the app runs in "no-key mode":
browser speech recognition + the built-in rule-based parser.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo


def _env(name: str, default: str = "") -> str:
    return (os.getenv(name) or default).strip()


@dataclass(frozen=True)
class Settings:
    db_path: Path = field(default_factory=lambda: Path(_env("DB_PATH", "/data/asha.db")))
    static_dir: Path = field(
        default_factory=lambda: Path(_env("STATIC_DIR", str(Path(__file__).resolve().parent.parent / "static")))
    )
    tz: str = field(default_factory=lambda: _env("APP_TZ", "Asia/Kolkata"))
    port: int = field(default_factory=lambda: int(_env("PORT", "8000") or 8000))
    sarvam_api_key: str = field(default_factory=lambda: _env("SARVAM_API_KEY"))
    sarvam_model: str = field(default_factory=lambda: _env("SARVAM_STT_MODEL", "saarika:v2.5"))
    gemini_api_key: str = field(default_factory=lambda: _env("GEMINI_API_KEY"))
    gemini_model: str = field(default_factory=lambda: _env("GEMINI_MODEL", "gemini-2.5-flash"))
    # Network timeout for optional paid APIs; on timeout we fall back to the built-in parser.
    api_timeout_s: float = 12.0

    @property
    def sarvam_enabled(self) -> bool:
        return bool(self.sarvam_api_key)

    @property
    def gemini_enabled(self) -> bool:
        return bool(self.gemini_api_key)

    def today(self) -> date:
        return datetime.now(ZoneInfo(self.tz)).date()


def get_settings() -> Settings:
    return Settings()
