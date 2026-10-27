"""GET /api/dynaclinic/scenarios: mock plain-text demo cases, each a faithful copy of a dataset case."""

from typing import Any

from fastapi.testclient import TestClient

from dynaclinic.eval.cases import DATA_DIR, load_synthetic
from dynaclinic.plaintext import parse_plain_case

SOURCES = {case.id: case for name in ("synthetic_cases.jsonl", "demo_cases.jsonl") for case in load_synthetic(DATA_DIR / name)}


def _without_lab_times(structured: dict[str, Any]) -> dict[str, Any]:
    labs = [(lab["name"], lab["value"], lab.get("unit", "")) for lab in structured.get("labs", [])]
    return {**structured, "labs": labs}


def test_scenarios_are_mock_plain_text_copies_of_dataset_cases(client: TestClient) -> None:
    scenarios = client.get("/api/dynaclinic/scenarios").json()
    assert {s["source"] for s in scenarios} == {
        "syn-low-01", "syn-mod-01", "syn-high-03", "demo-contested-01", "demo-contested-02", "demo-contested-03"
    }
    assert [s["id"] for s in scenarios] == sorted(s["id"] for s in scenarios)
    for scenario in scenarios:
        lines = scenario["text"].splitlines()
        assert lines[0] == scenario["title"] and scenario["title"].startswith("Mock case: ")
        assert scenario["teaches"] and not any(line.startswith("#") for line in lines)
        case, source = parse_plain_case(scenario["text"]), SOURCES[scenario["source"]]
        assert case is not None and case.answer == ""
        assert (case.vignette, case.question, case.options) == (source.vignette, source.question, source.options)
        assert _without_lab_times(case.structured) == _without_lab_times(source.structured)
