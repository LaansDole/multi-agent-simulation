"""Tests for dynaclinic.prompts (persona prompts and modality-restricted inputs)."""

from dataclasses import replace

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
    SHARED_CORE,
    SINGLE_AGENT,
    SPECIALISTS,
    STRICT,
    SYNTHESIZER,
    SYSTEM_PROMPTS,
    TRIAGE,
    WRITE_UP_SECTIONS,
    answer_system,
    case_block,
    question_block,
    specialist_block,
    specialist_system,
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
OPEN_CASE = replace(CASE, question="", options=[], answer="")


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


@pytest.mark.parametrize("role", [PRIMARY_CARE, SYNTHESIZER, SINGLE_AGENT])
def test_open_ended_cases_get_a_sectioned_write_up_prompt_without_a_letter(role: str) -> None:
    prompt = answer_system(role, OPEN_CASE)
    assert "FINAL ANSWER" not in prompt and "letter>" not in prompt
    assert [section for section in WRITE_UP_SECTIONS if f"\n{section}:" not in prompt] == []
    assert prompt.endswith("End your reply with exactly one line: RECOMMENDATION: <one sentence>")
    assert answer_system(role, CASE) == SYSTEM_PROMPTS[role]


def test_open_ended_case_block_has_no_options_and_keeps_an_open_question() -> None:
    text = case_block(OPEN_CASE, SECTIONS)
    assert "Options:" not in text and "Question:" not in text and "no answer options" in text
    asked = question_block(replace(OPEN_CASE, question="Can he travel tomorrow?"))
    assert asked.startswith("Question: Can he travel tomorrow?\n") and "Options:" not in asked


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


@pytest.mark.parametrize("role", SPECIALISTS)
def test_shared_core_specialist_prompts_keep_the_json_contract(role: str) -> None:
    prompt = specialist_system(role, SHARED_CORE)
    assert role in prompt.lower() and "JSON" in prompt
    assert [key for key in ('"findings"', '"distribution"', '"claims"') if key not in prompt] == []


@pytest.mark.parametrize("policy", [STRICT, SHARED_CORE])
@pytest.mark.parametrize("role", SPECIALISTS)
def test_open_ended_specialist_prompts_ask_for_a_leading_diagnosis_and_a_recommendation_not_a_distribution(
    role: str, policy: str
) -> None:
    prompt = specialist_system(role, policy, open_ended=True)
    lines = prompt.splitlines()
    assert role in prompt.lower() and '"findings"' in prompt and '"claims"' in prompt
    assert "distribution" not in prompt and "FINAL ANSWER" not in prompt and "PRIMARY ASSERTION" not in prompt
    assert lines[-1].startswith("Write LEADING DIAGNOSIS: ABSTAIN")
    # the two final lines, in this order; the diagnosis is what is wrong with the patient, never an action
    diagnosis = lines.index(next(line for line in lines if line.startswith("LEADING DIAGNOSIS: <")))
    assert "diagnosis or clinical problem, a short noun phrase" in lines[diagnosis]
    assert lines[diagnosis + 1].startswith("DOMAIN RECOMMENDATION: <your domain's action")
    assert ("The LEADING DIAGNOSIS says what is wrong with the patient: never a test, a treatment or another action"
            in " ".join(lines))


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
def test_strict_specialist_input_is_restricted_to_its_modality(role: str, present: list[str], absent: list[str]) -> None:
    text = specialist_block(role, CASE, SECTIONS, STRICT)
    assert specialist_system(role, STRICT) == SYSTEM_PROMPTS[role]
    assert CASE.question in text and "A. Oral amoxicillin" in text
    assert [p for p in present if p not in text] == []
    assert [a for a in absent if a in text] == []


@pytest.mark.parametrize(
    ("role", "slice_text", "absent"),
    [
        (IMAGING, "Chest x-ray: right lower lobe consolidation", ["warfarin", "penicillin", "INR"]),
        (PATHOLOGY, "INR: 2.6", ["warfarin", "penicillin", "Chest x-ray:"]),
        (PHARMACOLOGY, "warfarin 5 mg daily", ["INR", "Chest x-ray:"]),
    ],
)
def test_shared_core_specialist_input_is_the_case_summary_then_its_own_slice(
    role: str, slice_text: str, absent: list[str]
) -> None:
    text = specialist_block(role, CASE, SECTIONS, SHARED_CORE)
    summary, _, own = text.partition("Your modality data (focus here):")
    assert summary.startswith("Shared case summary:")
    for part in (CASE.vignette, "age: 70; sex: male", CASE.question, "B. Oral doxycycline"):
        assert part in summary, part
    assert slice_text in own and slice_text not in summary
    assert [a for a in absent if a in text] == []  # other modalities' structured data stays out


def test_specialist_block_rejects_unknown_role() -> None:
    with pytest.raises(ValueError, match="radiology"):
        specialist_block("radiology", CASE, SECTIONS)


def test_specialist_block_rejects_unknown_policy() -> None:
    with pytest.raises(ValueError, match="loose"):
        specialist_block(PATHOLOGY, CASE, SECTIONS, "loose")


NARRATIVE = sections_from_structured({})  # a bare free-text scenario has no structured sections
WARFARIN = Case("chest-pain", "devall", "68-year-old diabetic patient with chest pain, renal insufficiency, and "
                "concurrent warfarin therapy.", "", [], "")
PE = replace(WARFARIN, vignette="55-year-old with acute chest pain, normal ECG, elevated D-dimer, and recent long "
                                "flight. She lives alone.")
DRUGS = replace(WARFARIN, vignette="Chest pain since noon. Warfarin was stopped last week. She is on lisinopril. "
                                   "She lives alone.")


def _own(text: str) -> str:
    """The specialist's own modality part of a ``specialist_block`` (all of it under ``strict``)."""
    return text.rpartition("Your modality data (focus here):")[2]


@pytest.mark.parametrize("role", SPECIALISTS)
def test_open_ended_shared_core_specialists_abstain_only_when_the_whole_scenario_is_silent_on_their_domain(
    role: str,
) -> None:
    shared = specialist_system(role, SHARED_CORE, open_ended=True)
    assert "whole scenario" in shared and "holds no relevant data" not in shared
    assert shared.splitlines()[-1].startswith("Write LEADING DIAGNOSIS: ABSTAIN only when the whole scenario")
    # strict means the slice only: abstain whenever the modality slice is empty
    assert specialist_system(role, STRICT, open_ended=True).splitlines()[-1].endswith("holds no relevant data.")


@pytest.mark.parametrize(
    ("case", "role", "sentence"),
    [
        (WARFARIN, PHARMACOLOGY, "concurrent warfarin therapy"),
        (WARFARIN, PATHOLOGY, "renal insufficiency"),
        (PE, PATHOLOGY, "elevated D-dimer"),
        (PE, IMAGING, "normal ECG"),
        (PE, PHARMACOLOGY, None),
        (DRUGS, PHARMACOLOGY, "Warfarin was stopped last week."),
        (DRUGS, PHARMACOLOGY, "She is on lisinopril."),
    ],
)
def test_open_ended_shared_core_slices_carry_the_narrative_sentences_of_their_domain(
    case: Case, role: str, sentence: str | None
) -> None:
    own = _own(specialist_block(role, case, NARRATIVE, SHARED_CORE))
    assert "lives alone" not in own
    if sentence is None:
        assert own.strip() == f"(no {role} data available)"
    else:
        assert sentence in own and "data available" not in own


@pytest.mark.parametrize(
    ("case", "policy"),
    [(WARFARIN, STRICT), (replace(WARFARIN, question="Next step?", options=CASE.options, answer="A"), SHARED_CORE)],
)
@pytest.mark.parametrize("role", [PATHOLOGY, PHARMACOLOGY])
def test_strict_and_multiple_choice_slices_take_no_narrative_lab_or_drug_sentences(
    case: Case, policy: str, role: str
) -> None:
    assert _own(specialist_block(role, case, NARRATIVE, policy)).strip().startswith(f"(no {role} data available)")
