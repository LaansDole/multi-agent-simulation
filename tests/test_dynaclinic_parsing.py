"""Tests for dynaclinic.parsing."""

import pytest

from dynaclinic.parsing import extract_final_answer, extract_json, first_line_marker
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
