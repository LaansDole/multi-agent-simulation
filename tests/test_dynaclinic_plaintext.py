"""Plain-text case format (``dynaclinic.plaintext``) and its place in ``case_from_text``."""

import json

import pytest

from dynaclinic.devall_nodes import case_from_text
from dynaclinic.plaintext import parse_plain_case
from dynaclinic.types import Option

FULL = """\
Mock case: Pregnant patient with chest pain
A 29-year-old woman at 30 weeks of gestation presents with 1 day of pleuritic chest pain.
She has mild swelling of the left calf.

AGE: 29
sex: female
History: pregnancy, 30 weeks of gestation; asthma
Medications: prenatal vitamins
Allergies: none
Labs: D-dimer 1.9 ug/mL FEU; white blood cell count 9,800 /mm3; urinalysis: no pyuria; troponin I <0.01 ng/mL
Imaging: Chest radiograph: normal; Compression ultrasound: pending

Question: Which of the following is the most appropriate
next step in management?
A. CT pulmonary angiography
B) Ventilation-perfusion scan
(C) Start low-molecular-weight heparin
   and obtain compression ultrasonography
D. Start warfarin
"""


def test_full_format_fills_vignette_structured_question_and_options() -> None:
    case = parse_plain_case(FULL)
    assert case is not None
    assert case.vignette == (
        "A 29-year-old woman at 30 weeks of gestation presents with 1 day of pleuritic chest pain.\n"
        "She has mild swelling of the left calf."
    )
    assert case.question == "Which of the following is the most appropriate next step in management?"
    assert case.options == [
        Option("A", "CT pulmonary angiography"),
        Option("B", "Ventilation-perfusion scan"),
        Option("C", "Start low-molecular-weight heparin and obtain compression ultrasonography"),
        Option("D", "Start warfarin"),
    ]
    assert case.structured == {
        "demographics": {"age": 29, "sex": "female"},
        "history": ["pregnancy, 30 weeks of gestation", "asthma"],
        "meds": ["prenatal vitamins"],
        "allergies": [],
        "labs": [
            {"name": "D-dimer", "value": "1.9", "unit": "ug/mL FEU"},
            {"name": "white blood cell count", "value": "9,800", "unit": "/mm3"},
            {"name": "urinalysis", "value": "no pyuria", "unit": ""},
            {"name": "troponin I", "value": "<0.01", "unit": "ng/mL"},
        ],
        "imaging": ["Chest radiograph: normal", "Compression ultrasound: pending"],
    }
    assert (case.id, case.source, case.answer, case.gold_tier, case.unsafe_options) == ("devall", "devall", "", None, [])


def test_minimal_format_has_no_structured_fields() -> None:
    case = parse_plain_case("A 34-year-old man has a red leg.\nQuestion: Best treatment?\nA. Cephalexin\nB. Vancomycin")
    assert case is not None
    assert (case.vignette, case.question, case.letters(), case.structured) == (
        "A 34-year-old man has a red leg.", "Best treatment?", ["A", "B"], {}
    )


def test_option_lines_before_the_question_stay_in_the_vignette() -> None:
    case = parse_plain_case("A. fib was noted.\nLabs: potassium 5.1\nQuestion: Next?\nA) x\n(B) y")
    assert case is not None
    assert (case.vignette, case.structured, case.letters()) == (
        "A. fib was noted.", {"labs": [{"name": "potassium", "value": "5.1", "unit": ""}]}, ["A", "B"]
    )


@pytest.mark.parametrize(
    ("text", "vignette", "question"),
    [
        ("A 70-year-old man has fever and confusion.", "A 70-year-old man has fever and confusion.", ""),
        ("a patient has COVID-19 in a sunny day", "a patient has COVID-19 in a sunny day", ""),
        ("Vignette.\nQuestion: Next step?", "Vignette.", "Next step?"),
        ("Vignette.\nQuestion: Next step?\nA. Only one option", "Vignette.", "Next step? A. Only one option"),
        ("Vignette.\nA. x\nB. y", "Vignette.\nA. x\nB. y", ""),
        ("Vignette.\nQuestion:\nA. x\nB. y", "Vignette.", "A. x B. y"),
    ],
)
def test_without_a_question_and_two_options_the_case_is_open_ended(text: str, vignette: str, question: str) -> None:
    case = case_from_text(text)
    assert case == parse_plain_case(text)
    assert (case.vignette, case.question, case.options, case.open_ended) == (vignette, question, [], True)


def test_narrative_with_field_lines_keeps_its_structured_fields() -> None:
    case = case_from_text(
        "Mock case: COVID-19 at home\nA 58-year-old man has COVID-19 on a sunny day.\nAge: 58\n"
        "Medications: amlodipine 10 mg daily; simvastatin 40 mg daily\nAllergies: none\nLabs: CRP 12 mg/L\n"
        "He feels tired."
    )
    assert (case.open_ended, case.question, case.answer) == (True, "", "")
    assert case.vignette == "A 58-year-old man has COVID-19 on a sunny day.\nHe feels tired."
    assert case.structured == {
        "meds": ["amlodipine 10 mg daily", "simvastatin 40 mg daily"],
        "allergies": [],
        "labs": [{"name": "CRP", "value": "12", "unit": "mg/L"}],
        "demographics": {"age": 58},
    }


def test_case_from_text_parses_plain_text_and_keeps_json_first() -> None:
    assert case_from_text(FULL) == parse_plain_case(FULL)
    data = {"vignette": "v", "question": "q?", "options": [{"letter": "A", "text": "x"}], "answer": "A"}
    assert (case_from_text(json.dumps(data)).letters(), case_from_text(json.dumps(data)).answer) == (["A"], "A")
