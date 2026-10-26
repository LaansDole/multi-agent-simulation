"""Tests for dynaclinic.eval.cases and data/dynaclinic/synthetic_cases.jsonl."""

import json
from collections import Counter
from pathlib import Path
from typing import Any

import pytest

from dynaclinic.eval.cases import (
    SYNTHETIC_PATH,
    CaseFormatError,
    load_dataset,
    load_medqa,
    load_synthetic,
)
from dynaclinic.interfaces import sections_from_structured
from dynaclinic.kb import (
    allergy_conflicts,
    contraindication_conflicts,
    interaction_conflicts,
)
from dynaclinic.types import Case
from tests.dynaclinic_fixtures import no_network  # noqa: F401

STRUCTURED_KEYS = {"demographics", "history", "meds", "allergies", "labs", "imaging"}


@pytest.fixture(scope="module")
def cases() -> list[Case]:
    return load_synthetic()


def test_synthetic_set_shape(cases: list[Case]) -> None:
    assert len(cases) == 24
    assert len({c.id for c in cases}) == 24
    assert Counter(c.gold_tier for c in cases) == {"LOW": 8, "MODERATE": 8, "HIGH": 8}
    assert all(c.source == "synthetic" for c in cases)
    assert all(c.letters() == ["A", "B", "C", "D", "E"] for c in cases)
    assert all(c.vignette and c.question and all(o.text for o in c.options) for c in cases)


def test_answers_and_unsafe_letters_are_valid(cases: list[Case]) -> None:
    for case in cases:
        assert case.answer in case.letters(), case.id
        assert set(case.unsafe_options) <= set(case.letters()), case.id
        assert case.answer not in case.unsafe_options, case.id
    assert sum(bool(c.unsafe_options) for c in cases) >= 8


def test_gold_letters_are_balanced_so_position_bias_cannot_score(cases: list[Case]) -> None:
    counts = Counter(c.answer for c in cases)
    assert set(counts) == {"A", "B", "C", "D", "E"}
    assert max(counts.values()) <= 5


def test_every_case_has_structured_fields(cases: list[Case]) -> None:
    for case in cases:
        assert set(case.structured) == STRUCTURED_KEYS, case.id
        assert {"age", "sex"} <= set(case.structured["demographics"]), case.id
        assert all({"name", "value"} <= set(lab) for lab in case.structured["labs"]), case.id


def _kb_flagged(case: Case) -> set[str]:
    """Option letters the KB marks contraindicated for this patient (what the T_SAD gate will see)."""
    s = case.structured
    sections = sections_from_structured(s)
    conditions = [sections["Demographics"], sections["History"], sections["Labs"]]
    flagged = set()
    for option in case.options:
        conflicts = [
            *allergy_conflicts(option.text, s["allergies"]),
            *interaction_conflicts(option.text, s["meds"]),
            *contraindication_conflicts(option.text, conditions),
        ]
        if any(c.severity == "contraindicated" for c in conflicts):
            flagged.add(option.letter)
    return flagged


def test_unsafe_options_are_exactly_the_kb_flagged_options(cases: list[Case]) -> None:
    mismatches = {c.id: (sorted(_kb_flagged(c)), c.unsafe_options) for c in cases if _kb_flagged(c) != set(c.unsafe_options)}
    assert mismatches == {}


def _write_jsonl(path: Path, records: list[dict[str, Any]]) -> Path:
    path.write_text("\n".join(json.dumps(r) for r in records) + "\n\n")
    return path


def _medqa_record(**overrides: Any) -> dict[str, Any]:
    record = {
        "question": "A 23-year-old woman has dysuria and urinary frequency. Urinalysis shows nitrites. "
        "Which of the following is the most likely causal organism?",
        "options": {"A": "Escherichia coli", "B": "Staphylococcus aureus", "C": "Candida albicans", "D": "Proteus"},
        "answer_idx": "A",
        "answer": "Escherichia coli",
        "meta_info": "step1",
    }
    return {**record, **overrides}


def test_load_medqa_maps_format(tmp_path: Path) -> None:
    path = _write_jsonl(tmp_path / "medqa.jsonl", [_medqa_record(), _medqa_record(id="q-7", question="Short?")])
    first, second = load_medqa(path)
    assert first.id == "medqa-1" and second.id == "q-7"
    assert first.source == "medqa" and first.gold_tier is None
    assert first.vignette == "A 23-year-old woman has dysuria and urinary frequency. Urinalysis shows nitrites."
    assert first.question == "Which of the following is the most likely causal organism?"
    assert [(o.letter, o.text) for o in first.options][:2] == [("A", "Escherichia coli"), ("B", "Staphylococcus aureus")]
    assert first.answer == "A"
    assert first.tags == ["medqa", "step1"]
    assert (second.vignette, second.question) == ("Short?", "Short?")
    assert first.structured == {} and first.unsafe_options == []


def test_load_medqa_tolerates_missing_file(tmp_path: Path) -> None:
    assert load_medqa(tmp_path / "absent.jsonl") == []


def test_load_synthetic_requires_file(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError):
        load_synthetic(tmp_path / "absent.jsonl")


@pytest.mark.parametrize(
    ("overrides", "message"),
    [
        ({"answer": "F"}, "answer"),
        ({"unsafe_options": ["A"]}, "unsafe"),
        ({"unsafe_options": ["Z"]}, "unsafe"),
        ({"gold_tier": "EXTREME"}, "gold_tier"),
        ({"options": [{"letter": "A", "text": "x"}, {"letter": "A", "text": "y"}]}, "duplicate option"),
    ],
)
def test_invalid_synthetic_records_raise_with_location(tmp_path: Path, overrides: dict[str, Any], message: str) -> None:
    record = {**load_synthetic()[0].to_dict(), **overrides}
    path = _write_jsonl(tmp_path / "bad.jsonl", [record])
    with pytest.raises(CaseFormatError, match=rf"bad.jsonl:1: .*{message}"):
        load_synthetic(path)


def test_invalid_json_and_duplicate_ids_raise(tmp_path: Path) -> None:
    bad = tmp_path / "bad.jsonl"
    bad.write_text("{not json}\n")
    with pytest.raises(CaseFormatError, match="bad.jsonl:1"):
        load_synthetic(bad)
    record = load_synthetic()[0].to_dict()
    with pytest.raises(CaseFormatError, match="bad.jsonl:2: duplicate case id"):
        load_synthetic(_write_jsonl(bad, [record, record]))
    with pytest.raises(CaseFormatError, match="medqa.jsonl:1: .*answer"):
        load_medqa(_write_jsonl(tmp_path / "medqa.jsonl", [_medqa_record(answer_idx="E")]))


def test_load_dataset_combines_named_sets(tmp_path: Path) -> None:
    (tmp_path / SYNTHETIC_PATH.name).write_text(SYNTHETIC_PATH.read_text())
    assert len(load_dataset("synthetic", data_dir=tmp_path)) == 24
    assert len(load_dataset("synthetic,medqa", data_dir=tmp_path)) == 24
    _write_jsonl(tmp_path / "medqa_sample.jsonl", [_medqa_record()])
    assert [c.source for c in load_dataset(["medqa", "synthetic"], data_dir=tmp_path)][:2] == ["medqa", "synthetic"]
    with pytest.raises(ValueError, match="unknown dataset"):
        load_dataset("pubmedqa", data_dir=tmp_path)
