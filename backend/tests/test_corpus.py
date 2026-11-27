"""Realistic visit notes, the way ASHAs actually speak them: Hindi, Hinglish, English and
mixed scripts, number words, many BP and date formats. Each row checks only the fields
the sentence mentions; `symptoms` is compared as an exact set (so false positives fail).
"""

from __future__ import annotations

from datetime import date, timedelta

import pytest

from app.parser import parse_visit
from tests.conftest import PEOPLE, TODAY

D = lambda days: TODAY + timedelta(days=days)  # noqa: E731 — short helper for the table

CORPUS = [
    # --- Hindi (Devanagari)
    (
        "सुनीता साहू, छह महीने की गर्भवती, बीपी 120/80, सब ठीक है, आयरन की गोली ले रही है, अगली विज़िट 15 दिन बाद",
        dict(beneficiary_id=1, pregnancy_month=6, bp=(120, 80), ifa_taking=True, next_visit_date=D(15), symptoms=set()),
    ),
    ("सुनीता को चक्कर आते हैं, बहुत कमज़ोरी है, एचबी साढ़े छह", dict(beneficiary_id=1, hb=6.5, symptoms={"pallor_weakness"})),
    (
        "रेखा का वजन बावन किलो, बीपी एक सौ दस बटा सत्तर, टीडी का पहला टीका लगाया, अगली जांच परसों",
        dict(beneficiary_id=3, weight_kg=52, bp=(110, 70), td_dose=1, next_visit_date=D(2)),
    ),
    ("सुनीता को दौरे पड़ रहे हैं", dict(beneficiary_id=1, symptoms={"convulsions"})),
    (
        "सुनीता, सात महीने, हलचल ठीक है, 30 आयरन की गोलियां दीं, अगली विज़िट सोमवार",
        dict(
            pregnancy_month=7,
            fetal_movement="normal",
            ifa_taking=True,
            ifa_tablets=30,
            next_visit_date=date(2026, 11, 30),
        ),
    ),
    ("रेखा वर्मा, तीसरा महीना, उल्टी और कमजोरी, एचबी 10", dict(pregnancy_month=3, hb=10, symptoms={"pallor_weakness"})),
    ("सुनीता की अगली विज़िट 3 हफ्ते बाद", dict(next_visit_date=D(21), pregnancy_month=None)),
    (
        "बच्चा पेट में हिल नहीं रहा, रेखा आठ महीने की है",
        dict(beneficiary_id=3, fetal_movement="reduced", pregnancy_month=8, symptoms=set()),
    ),
    ("रेखा को खून जा रहा है, पेट में तेज दर्द", dict(symptoms={"bleeding", "abdominal_pain"})),
    ("सुनीता को अगले महीने फिर से देखना है", dict(next_visit_date=D(30), pregnancy_month=None)),
    (
        "रेखा वर्मा, 24 हफ्ते, बीपी 128/84, सूजन नहीं, सिरदर्द नहीं, बच्चे की हलचल अच्छी है",
        dict(pregnancy_month=6, bp=(128, 84), symptoms=set(), fetal_movement="normal"),
    ),
    ("रेखा, साढ़े सात महीने, बीपी 138/88", dict(pregnancy_month=7, bp=(138, 88))),
    (
        "गीता के हाथ पैर सूज गए हैं, आंखों के आगे अंधेरा छा जाता है",
        dict(beneficiary_id=2, symptoms={"swelling_face_hands", "blurred_vision"}),
    ),
    # --- Hinglish (Roman script)
    (
        "Geeta Yadav ka BP 160 by 110 hai, sir mein bahut dard hai aur aankhon ke aage dhundhla dikhta hai",
        dict(beneficiary_id=2, bp=(160, 110), symptoms={"headache", "blurred_vision"}),
    ),
    (
        "rekha 8 mahine ki hai, baby ki movement kal se kam hai, turant hospital bhejna hai",
        dict(beneficiary_id=3, pregnancy_month=8, fetal_movement="reduced", next_visit_date=None),
    ),
    (
        "Sunita Sahu ko 2 din se bukhar hai, 101 degree, pet mein dard bhi hai",
        dict(temperature_f=101, symptoms={"fever", "abdominal_pain"}, next_visit_date=None),
    ),
    (
        "geeta ke pair aur chehra sooj gaya hai, sar dard bhi hai",
        dict(symptoms={"swelling_face_hands", "headache"}),
    ),  # face swelling (red) subsumes feet
    ("Geeta ko saans lene mein dikkat hai, Hb 7.5", dict(hb=7.5, symptoms={"breathlessness"})),
    ("rekha ka bp 140 upar 90 neeche, iron ki goli nahi le rahi", dict(bp=(140, 90), ifa_taking=False)),
    ("rekha ko 12 tarikh ko phir dekhne aaungi", dict(next_visit_date=date(2026, 12, 12))),
    (
        "Geeta pregnant hai, chautha mahina, koi problem nahi, IFA le rahi hai",
        dict(pregnancy_month=4, ifa_taking=True, symptoms=set()),
    ),
    ("sunita ka hemoglobin 9 point 2 hai, khoon ki kami hai", dict(hb=9.2, symptoms={"pallor_weakness"})),
    ("geeta ka bp 145 over 95 aur pairon mein sujan", dict(bp=(145, 95), symptoms={"swelling"})),
    ("Sunita ki tabiyat theek hai, hb gyarah, bp ek sau bees by assi", dict(hb=11, bp=(120, 80), symptoms=set())),
    ("rekha ne iron ki goli band kar di kyunki ulti hoti hai", dict(ifa_taking=False)),
    ("Geeta ka BP 100/60, bahut thakan aur chakkar", dict(bp=(100, 60), symptoms={"pallor_weakness"})),
    ("sunita ko kal visit karna hai, BP 122/82", dict(next_visit_date=D(1), bp=(122, 82))),
    ("geeta ko jhatke aa rahe hain aur BP 165/112", dict(symptoms={"convulsions"}, bp=(165, 112))),
    # --- English
    (
        "Geeta, 32 weeks pregnant, BP 130/85, weight 58 kg, no complaints, next visit next week",
        dict(pregnancy_month=8, bp=(130, 85), weight_kg=58, next_visit_date=D(7), symptoms=set()),
    ),
    ("Rekha, bleeding since morning, BP 150/95", dict(symptoms={"bleeding"}, bp=(150, 95))),
    (
        "Geeta Yadav, 9 months, BP 118/76, baby kicking well, TT booster given, next visit day after tomorrow",
        dict(pregnancy_month=9, fetal_movement="normal", td_dose=3, next_visit_date=D(2)),
    ),
    (
        "Geeta, BP 170/115, severe headache, swelling in hands and face",
        dict(bp=(170, 115), symptoms={"headache", "swelling_face_hands"}),
    ),
    (
        "Sunita: BP 135/88, temperature 98.6, weight 61.5 kg",
        dict(bp=(135, 88), temperature_f=98.6, weight_kg=61.5, symptoms=set()),
    ),
    (
        "Geeta 7th month, no bleeding, no swelling, baby movement normal",
        dict(pregnancy_month=7, symptoms=set(), fetal_movement="normal"),
    ),
    ("Sunita has fever 39 degree, BP normal", dict(temperature_f=102.2, symptoms={"fever"})),
]


@pytest.mark.parametrize("text,expected", CORPUS, ids=[f"s{i:02d}" for i in range(1, len(CORPUS) + 1)])
def test_realistic_sentence(text, expected):
    f = parse_visit(text, TODAY, PEOPLE)
    for key, want in expected.items():
        if key == "bp":
            assert (f.bp_systolic, f.bp_diastolic) == want, text
        elif key == "symptoms":
            assert set(f.symptoms) == want, text
        else:
            assert getattr(f, key) == want, f"{key} in: {text}"


def test_corpus_is_large_enough():
    assert len(CORPUS) >= 30
