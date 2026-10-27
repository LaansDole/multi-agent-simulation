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
# Final lines of an open-ended specialist reply; PRIMARY ASSERTION is the pre-F13 single line, read as the diagnosis.
LEADING_DIAGNOSIS = "LEADING DIAGNOSIS"
DOMAIN_RECOMMENDATION = "DOMAIN RECOMMENDATION"
PRIMARY_ASSERTION = "PRIMARY ASSERTION"
MAX_CONSULTS = 2
_CONSULT = re.compile(r"^[ \t*_`#>-]*CONSULT[ \t*_`]*:[ \t]*([^:\n]+?)[ \t]*:[ \t]*(\S.*?)[ \t]*$",
                      re.IGNORECASE | re.MULTILINE)


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


def extract_line(text: str, key: str) -> str | None:
    """Return the value of the last ``KEY:`` line (``key`` words may be split by any whitespace), ``None`` when
    the line is missing or empty. Tolerates markdown around key and value."""
    words = r"\s+".join(map(re.escape, key.split()))
    pattern = re.compile(rf"^[\s*_`#>-]*{words}[\s*_`]*:(.*)$", re.IGNORECASE | re.MULTILINE)
    values = [value.strip(" \t*_`\"'") for value in pattern.findall(text)]
    values = [value for value in values if value]
    return values[-1] if values else None


def extract_diagnosis(text: str, key: str = LEADING_DIAGNOSIS) -> str | None:
    """``extract_line`` for a diagnosis line: ``ABSTAIN`` when the value starts with that word (a reason may follow)."""
    value = extract_line(text, key)
    return ABSTAIN if value and re.match(rf"{ABSTAIN}\b", value, re.IGNORECASE) else value


def first_line_marker(text: str, key: str) -> str | None:
    """Return the upper-cased first word after ``KEY:`` on the first non-empty line only."""
    pattern = re.compile(rf"{re.escape(key)}\s*[*_`]*\s*:\s*[*_`]*\s*([A-Za-z][A-Za-z_\-]*)", re.IGNORECASE)
    for line in text.splitlines():
        line = line.strip().strip("#*_` ")
        if line:
            match = pattern.match(line)
            return match.group(1).upper() if match else None
    return None


def consult_requests(
    text: str, roles: Iterable[str], limit: int = MAX_CONSULTS
) -> tuple[list[tuple[str, str]], list[str]]:
    """``(requests, warnings)`` from the ``CONSULT: <role>: <question>`` lines of a hub reply, in order.

    A line naming a role outside ``roles`` (case-insensitive) or past the first ``limit`` valid ones is ignored with
    a warning."""
    known = set(roles)
    requests: list[tuple[str, str]] = []
    warnings: list[str] = []
    for name, question in _CONSULT.findall(text):
        role = name.strip(" *_`").lower()
        if role not in known:
            warnings.append(f"ignored CONSULT for unknown role {name.strip()!r}")
        elif len(requests) >= limit:
            warnings.append(f"ignored CONSULT {role} beyond {limit} consults")
        else:
            requests.append((role, question.strip(" *_`")))
    return requests, warnings
