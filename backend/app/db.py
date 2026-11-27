"""SQLite storage (stdlib only). One small file DB, mounted as a Docker volume."""

from __future__ import annotations

import json
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import date
from pathlib import Path

from .parser import KnownBeneficiary
from .schemas import Alert, VisitFields

SCHEMA = """
CREATE TABLE IF NOT EXISTS beneficiaries (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name_hi     TEXT NOT NULL,
    name_en     TEXT NOT NULL,
    husband_hi  TEXT NOT NULL DEFAULT '',
    village     TEXT NOT NULL,
    village_en  TEXT NOT NULL DEFAULT '',
    age         INTEGER,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS visits (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    beneficiary_id  INTEGER NOT NULL REFERENCES beneficiaries(id) ON DELETE CASCADE,
    visit_date      TEXT NOT NULL,
    transcript      TEXT NOT NULL DEFAULT '',
    fields_json     TEXT NOT NULL,
    alerts_json     TEXT NOT NULL,
    risk            TEXT NOT NULL CHECK (risk IN ('red', 'amber', 'normal')),
    next_visit_date TEXT,
    is_demo         INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_visits_beneficiary ON visits(beneficiary_id, visit_date);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
"""

# Latest visit per beneficiary (ties broken by id) drives the list, due dates and risk.
_LIST_SQL = """
SELECT b.*, v.risk, v.next_visit_date, v.visit_date AS last_visit_date, v.fields_json, v.alerts_json,
       (SELECT COUNT(*) FROM visits c WHERE c.beneficiary_id = b.id) AS visit_count
FROM beneficiaries b
LEFT JOIN visits v ON v.id = (
    SELECT id FROM visits x WHERE x.beneficiary_id = b.id ORDER BY visit_date DESC, id DESC LIMIT 1)
"""


class Database:
    def __init__(self, path: Path) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as conn:
            conn.executescript(SCHEMA)
            columns = {row["name"] for row in conn.execute("PRAGMA table_info(visits)")}
            if "is_demo" not in columns:  # migrate DBs created by an earlier version
                conn.execute("ALTER TABLE visits ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0")

    def get_meta(self, key: str) -> str | None:
        with self.connect() as conn:
            row = conn.execute("SELECT value FROM meta WHERE key = ?", (key,)).fetchone()
        return row["value"] if row else None

    def set_meta(self, key: str, value: str) -> None:
        with self.connect() as conn:
            conn.execute(
                "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (key, value),
            )

    def count_user_visits(self) -> int:
        with self.connect() as conn:
            return conn.execute("SELECT COUNT(*) FROM visits WHERE is_demo = 0").fetchone()[0]

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    # ----------------------------------------------------------- beneficiaries
    def add_beneficiary(
        self,
        name_hi: str,
        name_en: str,
        village: str,
        village_en: str = "",
        husband_hi: str = "",
        age: int | None = None,
    ) -> int:
        with self.connect() as conn:
            cur = conn.execute(
                "INSERT INTO beneficiaries (name_hi, name_en, husband_hi, village, village_en, age) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (name_hi, name_en, husband_hi, village, village_en, age),
            )
            return int(cur.lastrowid)

    def count_beneficiaries(self) -> int:
        with self.connect() as conn:
            return conn.execute("SELECT COUNT(*) FROM beneficiaries").fetchone()[0]

    def known_people(self) -> list[KnownBeneficiary]:
        with self.connect() as conn:
            rows = conn.execute("SELECT id, name_hi, name_en FROM beneficiaries").fetchall()
        return [KnownBeneficiary(r["id"], r["name_hi"], r["name_en"]) for r in rows]

    def list_beneficiaries(self, where: str = "", params: tuple = ()) -> list[dict]:
        with self.connect() as conn:
            rows = conn.execute(f"{_LIST_SQL} {where} ORDER BY b.name_en", params).fetchall()
        return [_beneficiary_row(r) for r in rows]

    def get_beneficiary(self, beneficiary_id: int) -> dict | None:
        rows = self.list_beneficiaries("WHERE b.id = ?", (beneficiary_id,))
        if not rows:
            return None
        person = rows[0]
        person["visits"] = self.visits_for(beneficiary_id)
        return person

    def due_on(self, day: date) -> list[dict]:
        return self.list_beneficiaries("WHERE v.next_visit_date = ?", (day.isoformat(),))

    def overdue(self, today: date) -> list[dict]:
        return self.list_beneficiaries("WHERE v.next_visit_date < ?", (today.isoformat(),))

    def high_risk(self) -> list[dict]:
        rows = self.list_beneficiaries("WHERE v.risk IN ('red', 'amber')")
        return sorted(rows, key=lambda r: r["risk"] != "red")

    # ------------------------------------------------------------------ visits
    def add_visit(
        self,
        beneficiary_id: int,
        visit_date: date,
        transcript: str,
        fields: VisitFields,
        alerts: list[Alert],
        risk: str,
        is_demo: bool = False,
    ) -> int:
        with self.connect() as conn:
            cur = conn.execute(
                "INSERT INTO visits (beneficiary_id, visit_date, transcript, fields_json, alerts_json, risk, "
                "next_visit_date, is_demo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    beneficiary_id,
                    visit_date.isoformat(),
                    transcript,
                    fields.model_dump_json(),
                    json.dumps([a.model_dump() for a in alerts], ensure_ascii=False),
                    risk,
                    fields.next_visit_date.isoformat() if fields.next_visit_date else None,
                    int(is_demo),
                ),
            )
            return int(cur.lastrowid)

    def visits_for(self, beneficiary_id: int) -> list[dict]:
        with self.connect() as conn:
            rows = conn.execute(
                "SELECT * FROM visits WHERE beneficiary_id = ? ORDER BY visit_date DESC, id DESC", (beneficiary_id,)
            ).fetchall()
        return [_visit_row(r) for r in rows]

    def get_visit(self, visit_id: int) -> dict | None:
        with self.connect() as conn:
            row = conn.execute("SELECT * FROM visits WHERE id = ?", (visit_id,)).fetchone()
        return _visit_row(row) if row else None

    def wipe(self) -> None:
        with self.connect() as conn:
            conn.execute("DELETE FROM visits")
            conn.execute("DELETE FROM beneficiaries")
            conn.execute("DELETE FROM meta")
            conn.execute("DELETE FROM sqlite_sequence WHERE name IN ('visits', 'beneficiaries')")


def _visit_row(r: sqlite3.Row) -> dict:
    return {
        "id": r["id"],
        "beneficiary_id": r["beneficiary_id"],
        "visit_date": r["visit_date"],
        "transcript": r["transcript"],
        "fields": json.loads(r["fields_json"]),
        "alerts": json.loads(r["alerts_json"]),
        "risk": r["risk"],
        "next_visit_date": r["next_visit_date"],
    }


def _beneficiary_row(r: sqlite3.Row) -> dict:
    fields = json.loads(r["fields_json"]) if r["fields_json"] else {}
    return {
        "id": r["id"],
        "name_hi": r["name_hi"],
        "name_en": r["name_en"],
        "husband_hi": r["husband_hi"],
        "village": r["village"],
        "village_en": r["village_en"],
        "age": r["age"],
        "risk": r["risk"] or "normal",
        "next_visit_date": r["next_visit_date"],
        "last_visit_date": r["last_visit_date"],
        "pregnancy_month": fields.get("pregnancy_month"),
        "alerts": json.loads(r["alerts_json"]) if r["alerts_json"] else [],
        "visit_count": r["visit_count"],
    }
