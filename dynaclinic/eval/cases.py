"""Dataset loaders: hand-authored synthetic vignettes and MedQA-format JSONL, validated on load."""

import json
import logging
import re
from collections.abc import Callable, Iterable, Iterator
from pathlib import Path
from typing import Any

from dynaclinic.types import TIERS, Case, Option

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "dynaclinic"
SYNTHETIC_PATH = DATA_DIR / "synthetic_cases.jsonl"
MEDQA_PATH = DATA_DIR / "medqa_sample.jsonl"
_QUESTION_SPLIT = re.compile(r"(.*[.!])\s+([^.!?]*\?)\s*$", re.DOTALL)


class CaseFormatError(ValueError):
    """Raised when a dataset record is malformed."""


def validate_case(case: Case) -> None:
    """Raise ``CaseFormatError`` unless options, answer, unsafe options and tier are consistent."""
    letters = case.letters()
    if len(set(letters)) != len(letters):
        raise CaseFormatError(f"duplicate option letters {letters}")
    if case.answer not in letters:
        raise CaseFormatError(f"answer {case.answer!r} is not one of the options {letters}")
    bad = [letter for letter in case.unsafe_options if letter not in letters or letter == case.answer]
    if bad:
        raise CaseFormatError(f"unsafe_options {bad} must be option letters other than the answer")
    if case.gold_tier is not None and case.gold_tier not in TIERS:
        raise CaseFormatError(f"gold_tier {case.gold_tier!r} is not one of {TIERS}")


def _records(path: Path) -> Iterator[tuple[int, dict[str, Any]]]:
    for lineno, line in enumerate(path.read_text().splitlines(), 1):
        if line.strip():
            try:
                yield lineno, json.loads(line)
            except json.JSONDecodeError as err:
                raise CaseFormatError(f"{path}:{lineno}: invalid JSON: {err}") from err


def _load(path: Path, build: Callable[[int, dict[str, Any]], Case]) -> list[Case]:
    cases: list[Case] = []
    seen: set[str] = set()
    for lineno, record in _records(path):
        try:
            case = build(lineno, record)
            validate_case(case)
        except (CaseFormatError, KeyError, TypeError, AttributeError) as err:
            raise CaseFormatError(f"{path}:{lineno}: {err}") from err
        if case.id in seen:
            raise CaseFormatError(f"{path}:{lineno}: duplicate case id {case.id!r}")
        seen.add(case.id)
        cases.append(case)
    return cases


def load_synthetic(path: Path = SYNTHETIC_PATH) -> list[Case]:
    """Load ``Case.to_dict()`` records (one per line). The file is required."""
    return _load(path, lambda lineno, record: Case.from_dict(record))


def _medqa_case(lineno: int, record: dict[str, Any]) -> Case:
    text = record["question"].strip()
    match = _QUESTION_SPLIT.match(text)
    vignette, question = (match.group(1), match.group(2)) if match else (text, text)
    return Case(
        id=str(record.get("id") or f"medqa-{lineno}"),
        source="medqa",
        vignette=vignette,
        question=question,
        options=[Option(letter, str(text)) for letter, text in sorted(record["options"].items())],
        answer=record["answer_idx"],
        tags=["medqa", *([record["meta_info"]] if record.get("meta_info") else [])],
    )


def load_medqa(path: Path = MEDQA_PATH) -> list[Case]:
    """Load MedQA-format records (``question``, ``options`` {letter: text}, ``answer_idx``); ``[]`` if absent."""
    if not path.is_file():
        logger.info("MedQA sample %s not found; skipping", path)
        return []
    return _load(path, _medqa_case)


def load_dataset(names: str | Iterable[str], data_dir: Path = DATA_DIR) -> list[Case]:
    """Load and concatenate named datasets (``"synthetic"``, ``"medqa"``; comma list or iterable) in order."""
    loaders = {
        "synthetic": lambda: load_synthetic(data_dir / SYNTHETIC_PATH.name),
        "medqa": lambda: load_medqa(data_dir / MEDQA_PATH.name),
    }
    cases: list[Case] = []
    for name in (n.strip() for n in (names.split(",") if isinstance(names, str) else names)):
        if name not in loaders:
            raise ValueError(f"unknown dataset {name!r}; expected one of {sorted(loaders)}")
        cases += loaders[name]()
    return cases
