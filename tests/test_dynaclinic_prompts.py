"""Tests for dynaclinic.prompts (persona prompts and modality-restricted inputs)."""

import pytest

from dynaclinic.interfaces import sections_from_structured
from dynaclinic.parsing import extract_final_answer
from dynaclinic.prompts import (
    CRITIC,
    CRITIC_JUDGE,
    IMAGING,
    PATHOLOGY,
    PHARMACOLOGY,
    PRIMARY_CARE,
    SINGLE_AGENT,
    SPECIALISTS,
    SYNTHESIZER,
    SYSTEM_PROMPTS,
    TRIAGE,
    case_block,
    specialist_block,
)
from dynaclinic.types import Case, Option
from tests.dynaclinic_fixtures import no_network  # noqa: F401

CASE = Case(
    id="t-1",
    source="synthetic",
    vignette=(
        "A 70-year-old man has 3 days of productive cough and fever. "
        "Chest x-ray shows right lower lobe consolidation. He lives alone."
    ),
    question="Which is the most appropriate antibiotic?",
    options=[Option("A", "Oral amoxicillin"), Option("B", "Oral doxycycline")],
    answer="B",
    structured={
        "demographics": {"age": 70, "sex": "male"},
        "history": ["atrial fibrillation"],
        "meds": ["warfarin 5 mg daily"],
        "allergies": ["penicillin (anaphylaxis)"],
        "labs": [{"name": "INR", "value": "2.6", "time": "2026-01-02T08:00"}],
        "imaging": ["Chest x-ray: right lower lobe consolidation"],
    },
)
SECTIONS = sections_from_structured(CASE.structured)


def test_every_role_has_a_system_prompt() -> None:
    assert set(SYSTEM_PROMPTS) == {
        TRIAGE, PRIMARY_CARE, *SPECIALISTS, CRITIC, CRITIC_JUDGE, SYNTHESIZER, SINGLE_AGENT
    }
    assert SPECIALISTS == (IMAGING, PATHOLOGY, PHARMACOLOGY)


@pytest.mark.parametrize("role", [PRIMARY_CARE, SYNTHESIZER, SINGLE_AGENT])
def test_answering_prompts_demand_a_final_answer_line_the_parser_reads(role: str) -> None:
    prompt = SYSTEM_PROMPTS[role]
    assert "FINAL ANSWER: <letter>" in prompt
    assert extract_final_answer(prompt.replace("<letter>", "B"), ["A", "B"]) == "B"


@pytest.mark.parametrize(
    ("role", "required"),
    [
        (TRIAGE, ['"tier"', "LOW", "MODERATE", "HIGH", '"rationale"', '"features"']),
        (IMAGING, ['"findings"', '"distribution"', '"claims"']),
        (PATHOLOGY, ['"findings"', '"distribution"', '"claims"']),
        (PHARMACOLOGY, ['"findings"', '"distribution"', '"claims"']),
        (CRITIC, ['"claims"', '"text"', '"agent"']),
        (CRITIC_JUDGE, ['"id"', '"logits"', '"supported"', '"unsupported"', '"fabrication"', '"contradiction"']),
    ],
)
def test_json_prompts_name_the_keys_their_parsers_read(role: str, required: list[str]) -> None:
    prompt = SYSTEM_PROMPTS[role]
    assert "JSON" in prompt
    missing = [key for key in required if key not in prompt]
    assert missing == []


def test_primary_care_prompt_enforces_the_informative_model() -> None:
    prompt = SYSTEM_PROMPTS[PRIMARY_CARE].lower()
    assert "informative" in prompt
    for banned in ("paternalistic", "interpretive", "deliberative", "i recommend", "you should"):
        assert banned in prompt, banned


def test_specialists_are_told_they_see_only_their_modality() -> None:
    for role in SPECIALISTS:
        assert "only" in SYSTEM_PROMPTS[role].lower()
        assert role in SYSTEM_PROMPTS[role].lower()


def test_case_block_has_vignette_sections_question_and_options() -> None:
    text = case_block(CASE, SECTIONS)
    for part in (CASE.vignette, "warfarin 5 mg daily", "penicillin (anaphylaxis)", "INR: 2.6", CASE.question,
                 "A. Oral amoxicillin", "B. Oral doxycycline"):
        assert part in text, part


def test_case_block_omits_empty_sections() -> None:
    sections = sections_from_structured({"history": ["asthma"]})
    text = case_block(CASE, sections)
    assert "History" in text
    assert "Meds" not in text and "Imaging" not in text


@pytest.mark.parametrize(
    ("role", "present", "absent"),
    [
        (IMAGING, ["right lower lobe consolidation", "Chest x-ray shows"], ["warfarin", "penicillin", "INR", "lives alone"]),
        (PATHOLOGY, ["INR: 2.6"], ["warfarin", "penicillin", "consolidation", "productive cough"]),
        (PHARMACOLOGY, ["warfarin 5 mg daily", "penicillin (anaphylaxis)"], ["INR", "consolidation", "productive cough"]),
    ],
)
def test_specialist_input_is_restricted_to_its_modality(role: str, present: list[str], absent: list[str]) -> None:
    text = specialist_block(role, CASE, SECTIONS)
    assert CASE.question in text and "A. Oral amoxicillin" in text
    assert [p for p in present if p not in text] == []
    assert [a for a in absent if a in text] == []


def test_specialist_block_rejects_unknown_role() -> None:
    with pytest.raises(ValueError, match="radiology"):
        specialist_block("radiology", CASE, SECTIONS)
