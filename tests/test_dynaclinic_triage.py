"""Tests for dynaclinic.triage (Meta-Controller tier 1)."""

import json

import pytest

from dynaclinic.llm import FakeLLM
from dynaclinic.prompts import SYSTEM_PROMPTS, TRIAGE
from dynaclinic.triage import (
    HIGH_SCORE,
    MODERATE_SCORE,
    feature_score,
    score_tier,
    triage_case,
)
from dynaclinic.types import Case, Option
from tests.dynaclinic_fixtures import no_network  # noqa: F401

OPTIONS = [Option("A", "Option one"), Option("B", "Option two")]
SIMPLE = Case(
    id="simple",
    source="synthetic",
    vignette="A 25-year-old woman has 2 days of sore throat and fever. She is otherwise well.",
    question="What is the next step?",
    options=OPTIONS,
    answer="A",
)
COMPLEX = Case(
    id="complex",
    source="synthetic",
    vignette="A 70-year-old man has crushing chest pain and new confusion.",
    question="What is the next step?",
    options=OPTIONS,
    answer="B",
    structured={
        "history": ["type 2 diabetes", "chronic kidney disease"],
        "meds": ["metformin 500 mg", "lisinopril 10 mg", "aspirin 81 mg"],
        "labs": [
            {"name": "Potassium", "value": "4.0", "time": "2026-01-01T08:00"},
            {"name": "potassium", "value": "6.9", "time": "2026-01-02T08:00"},
            {"name": "sodium", "value": "140"},
            {"name": "eGFR", "value": "25"},
            {"name": "urinalysis", "value": "trace protein"},
        ],
        "imaging": ["ECG: ST elevation in V2-V4"],
    },
)


def _llm(tier: str, rationale: str = "because") -> FakeLLM:
    return FakeLLM({TRIAGE: json.dumps({"tier": tier, "rationale": rationale, "features": {"organ_systems": 1}})})


def test_feature_score_counts_each_feature() -> None:
    score, features = feature_score(COMPLEX)
    # organs: cardiovascular (chest pain, ECG), neurologic (confusion), endocrine (diabetes), renal (kidney).
    # abnormal labs: potassium (any value out of range, counted once), eGFR; unknown/qualitative labs ignored.
    assert features == {"organ_systems": 4, "comorbidities": 2, "medications": 3, "abnormal_labs": 2, "red_flags": 2}
    assert score == 13


def test_simple_case_scores_low_and_complex_case_scores_high() -> None:
    assert score_tier(feature_score(SIMPLE)[0]) == "LOW"
    assert score_tier(feature_score(COMPLEX)[0]) == "HIGH"


@pytest.mark.parametrize(
    ("score", "tier"),
    [(0, "LOW"), (MODERATE_SCORE - 1, "LOW"), (MODERATE_SCORE, "MODERATE"), (HIGH_SCORE - 1, "MODERATE"),
     (HIGH_SCORE, "HIGH")],
)
def test_score_tier_boundaries(score: int, tier: str) -> None:
    assert score_tier(score) == tier


def test_llm_low_on_a_simple_case_stays_low() -> None:
    result = triage_case(_llm("LOW"), SIMPLE)
    assert (result.tier, result.llm_tier, result.deterministic_tier, result.escalated) == ("LOW", "LOW", "LOW", False)
    assert result.error is None


def test_llm_low_is_escalated_one_level_when_deterministic_score_is_high() -> None:
    result = triage_case(_llm("LOW", "looks simple"), COMPLEX)
    assert result.tier == "MODERATE"  # one level up, not straight to the deterministic HIGH
    assert result.llm_tier == "LOW" and result.deterministic_tier == "HIGH"
    assert result.escalated is True
    assert result.rationale == "looks simple"
    assert result.llm_features == {"organ_systems": 1}


def test_escalate_threshold_is_configurable() -> None:
    score = feature_score(COMPLEX)[0]
    assert triage_case(_llm("LOW"), COMPLEX, escalate_threshold=score + 1).tier == "LOW"
    assert triage_case(_llm("LOW"), COMPLEX, escalate_threshold=score).tier == "MODERATE"


@pytest.mark.parametrize("llm_tier", ["MODERATE", "HIGH"])
def test_only_llm_low_is_escalated(llm_tier: str) -> None:
    result = triage_case(_llm(llm_tier), COMPLEX)
    assert (result.tier, result.escalated) == (llm_tier, False)


def test_llm_tier_is_never_lowered_by_the_deterministic_score() -> None:
    result = triage_case(_llm("HIGH"), SIMPLE)
    assert (result.tier, result.deterministic_tier) == ("HIGH", "LOW")


def test_tier_value_is_normalised() -> None:
    assert triage_case(_llm(" high "), SIMPLE).tier == "HIGH"


@pytest.mark.parametrize(
    "reply",
    [
        "COMPLEXITY: HIGH, definitely not LOW",
        '{"tier": "CRITICAL", "rationale": "x"}',
        '{"rationale": "no tier given"}',
        '{"tier": ["HIGH"]}',
    ],
)
def test_malformed_llm_reply_falls_back_to_deterministic_tier(reply: str) -> None:
    result = triage_case(FakeLLM({TRIAGE: reply}), COMPLEX)
    assert result.tier == "HIGH" == result.deterministic_tier
    assert result.llm_tier is None
    assert result.escalated is False
    assert result.error and "malformed" in result.error


def test_one_triage_call_with_the_meta_controller_prompt_and_full_case() -> None:
    client = _llm("LOW")
    result = triage_case(client, COMPLEX)
    assert [(c.role, c.model) for c in result.calls] == [(TRIAGE, "fake")]
    [(_role, system, user)] = client.prompts
    assert system == SYSTEM_PROMPTS[TRIAGE]
    for part in (COMPLEX.vignette, "metformin 500 mg", "potassium: 6.9", "ECG: ST elevation"):
        assert part in user, part
