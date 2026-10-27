"""Robust parsing of model output: JSON objects, final answers, anchored markers."""

import json
import re
from collections.abc import Iterable, Iterator
from typing import Any

_TRAILING_COMMA = re.compile(r",\s*([}\]])")
# Letter is case-sensitive so "Final answer: a beta blocker" never reads as "A".
_FINAL_ANSWER = re.compile(
    r"(?i:final\s*answer)[\s*_`:\-]*(?:(?i:option)\s+)?[(\[*_`\s]*([A-Z])(?![A-Za-z])"
)
ABSTAIN = "ABSTAIN"
_ASSERTION = re.compile(r"^[\s*_`#>-]*primary\s+assertion[\s*_`]*:(.*)$", re.IGNORECASE | re.MULTILINE)


def _balanced_objects(text: str) -> Iterator[str]:
    """Yield top-level ``{...}`` spans in order, skipping braces inside JSON strings."""
    start = text.find("{")
    while start != -1:
        depth, in_string, escaped = 0, False, False
        for end in range(start, len(text)):
            char = text[end]
            if in_string:
                if escaped:
                    escaped = False
                elif char == "\\":
                    escaped = True
                elif char == '"':
                    in_string = False
            elif char == '"':
                in_string = True
            elif char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    yield text[start : end + 1]
                    start = text.find("{", end + 1)
                    break
        else:  # unbalanced from here: retry from the next opener
            start = text.find("{", start + 1)


def extract_json(text: str) -> dict[str, Any] | None:
    """Return the first balanced JSON object in ``text``, or ``None``.

    Handles fenced and unfenced JSON, surrounding prose and trailing commas.
    Objects nested inside a malformed outer object are never returned.
    """
    for span in _balanced_objects(text):
        for candidate in (span, _TRAILING_COMMA.sub(r"\1", span)):
            try:
                value = json.loads(candidate)
            except json.JSONDecodeError:
                continue
            if isinstance(value, dict):
                return value
    return None


def extract_final_answer(text: str, letters: Iterable[str]) -> str | None:
    """Return the letter from the last ``FINAL ANSWER: X`` if it is a valid option.

    Tolerates bold/markdown, parentheses/brackets and an ``Option`` prefix.
    """
    matches = _FINAL_ANSWER.findall(text)
    if not matches:
        return None
    letter = matches[-1]
    return letter if letter in {item.upper() for item in letters} else None


def extract_primary_assertion(text: str) -> str | None:
    """Return the value of the last ``PRIMARY ASSERTION:`` line: ``ABSTAIN`` when it starts with that word
    (a reason may follow), ``None`` when the line is missing or empty. Tolerates markdown around key and value."""
    values = [value.strip(" \t*_`\"'") for value in _ASSERTION.findall(text)]
    values = [value for value in values if value]
    if not values:
        return None
    return ABSTAIN if re.match(rf"{ABSTAIN}\b", values[-1], re.IGNORECASE) else values[-1]


def first_line_marker(text: str, key: str) -> str | None:
    """Return the upper-cased first word after ``KEY:`` on the first non-empty line only."""
    pattern = re.compile(rf"{re.escape(key)}\s*[*_`]*\s*:\s*[*_`]*\s*([A-Za-z][A-Za-z_\-]*)", re.IGNORECASE)
    for line in text.splitlines():
        line = line.strip().strip("#*_` ")
        if line:
            match = pattern.match(line)
            return match.group(1).upper() if match else None
    return None
