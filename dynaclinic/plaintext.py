"""Readable plain-text case format for DevAll task prompts (alternative to one Case JSON line).

::

    Mock case: <title>                  optional, not part of the case
    <vignette>                          every other line before Question:
    Age: 29                             optional demographics (Age, Sex)
    Sex: female
    History: a; b                       optional ';' lists; "none" = empty list
    Medications: a; b
    Allergies: none
    Labs: D-dimer 1.9 ug/mL FEU; urinalysis: no pyuria    "name value unit" or "name: value"
    Imaging: Chest radiograph: normal
    Question: <text>                    required
    A. <text>                           at least two options: A. / A) / (A)

Header names are case-insensitive and recognised only before ``Question:``; options only after it. A line
after ``Question:`` that is not an option continues the question, or the last option. The text carries no
gold answer, tier or unsafe options, so the case is not graded.
"""

import re
from typing import Any

from dynaclinic.types import Case, Option

_HEADER = re.compile(
    r"^\s*(mock case|age|sex|history|medications|allergies|labs|imaging|question)\s*:\s*(.*)$", re.IGNORECASE
)
_OPTION = re.compile(r"^\s*(?:\(([A-Z])\)|([A-Z])[.)])\s+(\S.*)$")
_LAB = re.compile(r"^(.+?)\s+([<>]?\d[\d.,]*)\s*(.*)$")
_LISTS = {"history": "history", "medications": "meds", "allergies": "allergies", "imaging": "imaging"}


def _items(value: str) -> list[str]:
    items = [item.strip() for item in value.split(";") if item.strip()]
    return [] if [item.lower() for item in items] == ["none"] else items


def _lab(item: str) -> dict[str, str]:
    if ":" in item:
        name, _, value = item.partition(":")
        return {"name": name.strip(), "value": value.strip(), "unit": ""}
    match = _LAB.match(item)
    return {"name": match[1], "value": match[2], "unit": match[3].strip()} if match else {"name": item, "value": "", "unit": ""}


def parse_plain_case(text: str) -> Case | None:
    """Case from the plain-text format above, or ``None`` without a question and at least two options."""
    vignette: list[str] = []
    structured: dict[str, Any] = {}
    demographics: dict[str, Any] = {}
    question: list[str] | None = None
    options: list[Option] = []
    for line in text.splitlines():
        if question is not None:
            option = _OPTION.match(line)
            if option:
                options.append(Option(option[1] or option[2], option[3].strip()))
            elif line.strip() and options:
                options[-1].text += f" {line.strip()}"
            elif line.strip():
                question.append(line.strip())
            continue
        header = _HEADER.match(line)
        if not header:
            vignette.append(line)
            continue
        key, value = header[1].lower(), header[2].strip()
        if key == "question":
            question = [value] if value else []
        elif key == "age":
            demographics["age"] = int(value) if value.isdigit() else value
        elif key == "sex":
            demographics["sex"] = value
        elif key == "labs":
            structured["labs"] = [_lab(item) for item in _items(value)]
        elif key in _LISTS:
            structured[_LISTS[key]] = _items(value)
    if not question or len(options) < 2:
        return None
    if demographics:
        structured["demographics"] = demographics
    return Case("devall", "devall", "\n".join(vignette).strip(), " ".join(question), options, answer="",
                structured=structured)
