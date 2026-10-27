"""Tests for dynaclinic.parsing."""

import pytest

from dynaclinic.parsing import (
    ABSTAIN,
    DOMAIN_RECOMMENDATION,
    LEADING_DIAGNOSIS,
    PRIMARY_ASSERTION,
    extract_diagnosis,
    extract_final_answer,
    extract_json,
    extract_line,
    first_line_marker,
)
from tests.dynaclinic_fixtures import no_network  # noqa: F401

LETTERS = ["A", "B", "C", "D", "E"]


@pytest.mark.parametrize(
    "text",
    [
        '{"tier": "HIGH", "n": 2}',
        '```json\n{"tier": "HIGH", "n": 2}\n```',
        'Here is my answer:\n```\n{"tier": "HIGH", "n": 2}\n```\nHope that helps.',
        'Sure. {"tier": "HIGH", "n": 2} Let me know.',
        'Use {braces} carefully: {"tier": "HIGH", "n": 2}',
        'Stray { opener then {"tier": "HIGH", "n": 2}',
        '{"tier": "HIGH", "n": 2,}',
    ],
)
def test_extract_json_variants(text: str) -> None:
    assert extract_json(text) == {"tier": "HIGH", "n": 2}


def test_extract_json_returns_first_object_with_nesting_and_braces_in_strings() -> None:
    text = 'a {"note": "x } y {", "inner": {"k": [1, {"z": 2}]}} b {"second": true}'
    assert extract_json(text) == {"note": "x } y {", "inner": {"k": [1, {"z": 2}]}}


def test_extract_json_does_not_return_inner_object_of_malformed_outer() -> None:
    assert extract_json('{"tier": "LOW" "features": {"a": 1}}') is None


@pytest.mark.parametrize("text", ["", "no json here", '{"truncated": ', "[1, 2]"])
def test_extract_json_none(text: str) -> None:
    assert extract_json(text) is None


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Reasoning...\nFINAL ANSWER: C", "C"),
        ("**FINAL ANSWER:** B", "B"),
        ("**Final Answer**: (D)", "D"),
        ("Final answer: **E**", "E"),
        ("FINAL ANSWER: A. Nitrofurantoin", "A"),
        ("FINAL ANSWER: Option B", "B"),
        ("FINAL ANSWER: [C]", "C"),
        ("FINAL ANSWER: A\nOn reflection...\nFINAL ANSWER: D", "D"),
    ],
)
def test_extract_final_answer(text: str, expected: str) -> None:
    assert extract_final_answer(text, LETTERS) == expected


@pytest.mark.parametrize(
    "text",
    [
        "The answer is clearly C.",
        "FINAL ANSWER: F",
        "Final answer: a beta blocker",
        "FINAL ANSWER: C\nFINAL ANSWER: Z",
        "",
    ],
)
def test_extract_final_answer_none(text: str) -> None:
    assert extract_final_answer(text, LETTERS) is None


def test_extract_final_answer_respects_option_letters() -> None:
    assert extract_final_answer("FINAL ANSWER: E", ["A", "B", "C", "D"]) is None


@pytest.mark.parametrize(
    ("text", "key", "expected"),
    [
        ("\n\n  ROUTE: moderate\nMODE: ADVERSARIAL", "ROUTE", "MODERATE"),
        ("**GATE:** PASS", "GATE", "PASS"),
        ("## MODE: COLLABORATIVE (divergence 0.1)", "MODE", "COLLABORATIVE"),
        ("route: LOW", "ROUTE", "LOW"),
    ],
)
def test_first_line_marker(text: str, key: str, expected: str) -> None:
    assert first_line_marker(text, key) == expected


@pytest.mark.parametrize(
    "text",
    [
        "Triage complete.\nROUTE: HIGH",
        "The ROUTE: HIGH is chosen",
        "ROUTER: HIGH",
        "",
    ],
)
def test_first_line_marker_only_first_non_empty_line(text: str) -> None:
    assert first_line_marker(text, "ROUTE") is None


@pytest.mark.parametrize(
    ("text", "key", "expected"),
    [
        ('{"findings": []}\nLEADING DIAGNOSIS: Pulmonary embolism\nDOMAIN RECOMMENDATION: Obtain CT angiography.',
         LEADING_DIAGNOSIS, "Pulmonary embolism"),
        ("**Leading diagnosis:** `Community-acquired pneumonia`", LEADING_DIAGNOSIS, "Community-acquired pneumonia"),
        ("- LEADING DIAGNOSIS : Sepsis\nnotes\nLEADING DIAGNOSIS: Septic shock", LEADING_DIAGNOSIS, "Septic shock"),
        ("LEADING DIAGNOSIS: ABSTAIN", LEADING_DIAGNOSIS, ABSTAIN),
        ("LEADING DIAGNOSIS: abstain - no imaging in this case.", LEADING_DIAGNOSIS, ABSTAIN),
        ("LEADING DIAGNOSIS: Abstinence syndrome from alcohol", LEADING_DIAGNOSIS, "Abstinence syndrome from alcohol"),
        ('{"findings": ["x"], "claims": []}', LEADING_DIAGNOSIS, None),
        ("LEADING DIAGNOSIS:   ", LEADING_DIAGNOSIS, None),
        ("The leading diagnosis: is inline, not a line of its own", LEADING_DIAGNOSIS, None),
        ("PRIMARY ASSERTION: Pulmonary embolism", LEADING_DIAGNOSIS, None),
        # the pre-F13 single line, read as the diagnosis by the pipeline's fallback
        ("**Primary  assertion:** Pulmonary embolism is most likely.", PRIMARY_ASSERTION,
         "Pulmonary embolism is most likely."),
        ("PRIMARY ASSERTION: abstain - no imaging in this case.", PRIMARY_ASSERTION, ABSTAIN),
    ],
)
def test_extract_diagnosis(text: str, key: str, expected: str | None) -> None:
    assert extract_diagnosis(text, key) == expected


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        # a recommendation is read verbatim, never as ABSTAIN
        ("LEADING DIAGNOSIS: Pulmonary embolism\n**Domain recommendation:** Abstain from NSAIDs.", "Abstain from NSAIDs."),
        ("LEADING DIAGNOSIS: Pulmonary embolism\nRECOMMENDATION: Admit.", None),
    ],
)
def test_extract_line_reads_the_domain_recommendation(text: str, expected: str | None) -> None:
    assert extract_line(text, DOMAIN_RECOMMENDATION) == expected
