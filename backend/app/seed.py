"""Demo data: 5 pregnant women in Chhattisgarh villages, plus sample visit sentences.

Visit dates are relative to *today*, so "due tomorrow" is never empty on a fresh start.
Seed visits are run through the real parser and rules engine, not hand-written alerts.
"""
from __future__ import annotations

from datetime import date, timedelta

from .db import Database
from .parser import parse_visit
from .rules import evaluate, risk_level

# (name_hi, name_en, husband_hi, village_hi, village_en, age, [(days_ago, spoken note, next_visit_in_days)])
BENEFICIARIES = [
    ("सुनीता साहू", "Sunita Sahu", "रमेश साहू", "कुरुद", "Kurud, Dhamtari", 24, [
        (35, "सुनीता साहू, पांच महीने की गर्भवती, बीपी 110 बटा 70, आयरन की गोली ले रही है", None),
        (7, "सुनीता साहू, छह महीने, बीपी 118 बटा 76, हीमोग्लोबिन 10.2, आयरन की गोली ले रही है", 1),
    ]),
    ("गीता यादव", "Geeta Yadav", "संतोष यादव", "अभनपुर", "Abhanpur, Raipur", 28, [
        (5, "गीता यादव, आठ महीने की गर्भवती, बीपी 146 बटा 94, पैरों में सूजन, बच्चे की हलचल ठीक है", 3),
    ]),
    ("रेखा वर्मा", "Rekha Verma", "दिनेश वर्मा", "पाटन", "Patan, Durg", 22, [
        (28, "रेखा वर्मा, चार महीने की गर्भवती, बीपी 112 बटा 72, टीडी का पहला टीका लगा, आयरन की गोली ले रही है",
         6),
    ]),
    ("पूजा नेताम", "Pooja Netam", "मनोज नेताम", "नगरी", "Nagri, Dhamtari", 19, [
        (10, "पूजा नेताम, सात महीने, हीमोग्लोबिन 6.8, बहुत कमजोरी और सांस फूलती है", 2),
    ]),
    ("कमला ध्रुव", "Kamla Dhruw", "राजेश ध्रुव", "आरंग", "Arang, Raipur", 31, [
        (14, "कमला ध्रुव, तीन महीने की गर्भवती, बीपी 120 बटा 80, कोई दिक्कत नहीं", 1),
    ]),
]

# Pre-written visits for the "Try sample" button (judges without a microphone).
SAMPLES = [
    {
        "id": "hindi_red",
        "label": "हिंदी — खतरे के संकेत",
        "text": "रेखा वर्मा के घर गई। पांच महीने की गर्भवती है। बीपी एक सौ बयालीस बटा बानवे है, "
                "पैरों में सूजन और सिर दर्द की शिकायत है। बच्चे की हलचल ठीक है। आयरन की गोली रोज़ ले रही है, "
                "टीडी का दूसरा टीका लगा। अगली विज़िट कल।",
    },
    {
        "id": "hinglish_amber",
        "label": "Hinglish — anaemia",
        "text": "Sunita Sahu, saat mahine ki pregnant hai, BP 120 by 80, koi sujan nahi, baby movement theek hai, "
                "Hb saadhe nau, iron ki goli le rahi hai, agle hafte phir aaungi",
    },
    {
        "id": "english_bleeding",
        "label": "English — bleeding",
        "text": "Kamla Dhruw, 4 months pregnant, BP 150 upar 100 neeche, some bleeding since morning, "
                "not taking iron tablets, next visit in 2 days",
    },
]


def seed(db: Database, today: date) -> None:
    """Insert demo beneficiaries and visits. Idempotent: skips if data exists."""
    if db.count_beneficiaries():
        return
    for name_hi, name_en, husband, village, village_en, age, visits in BENEFICIARIES:
        person_id = db.add_beneficiary(name_hi, name_en, village, village_en, husband, age)
        people = db.known_people()
        for days_ago, note, next_in in visits:
            visit_day = today - timedelta(days=days_ago)
            fields = parse_visit(note, visit_day, people)
            fields.beneficiary_id = person_id
            fields.next_visit_date = today + timedelta(days=next_in) if next_in is not None else \
                visit_day + timedelta(days=28)
            alerts = evaluate(fields)
            db.add_visit(person_id, visit_day, note, fields, alerts, risk_level(alerts), is_demo=True)
    db.set_meta("seeded_on", today.isoformat())


def refresh_stale_demo(db: Database, today: date) -> bool:
    """Re-seed untouched demo data from an earlier day, so 'due tomorrow' stays meaningful.
    Never touches a database that contains any real (non-demo) visit."""
    seeded_on = db.get_meta("seeded_on")
    if seeded_on and seeded_on != today.isoformat() and db.count_user_visits() == 0:
        db.wipe()
        seed(db, today)
        return True
    return False
