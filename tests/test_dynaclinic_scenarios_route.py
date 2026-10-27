"""graph.demo_scenarios of dynaclinic_mvp.yaml: mock plain-text demo cases, each a faithful copy of a dataset case."""

from typing import Any

from fastapi.testclient import TestClient

from dynaclinic.eval.cases import DATA_DIR, load_synthetic
from dynaclinic.plaintext import parse_plain_case

SOURCES = {case.id: case for name in ("synthetic_cases.jsonl", "demo_cases.jsonl") for case in load_synthetic(DATA_DIR / name)}
# Scenario id -> dataset case id it was copied from.
COPIED_FROM = {
    "low-leg-redness": "syn-low-01",
    "moderate-atrial-fibrillation": "syn-mod-01",
    "high-flank-pain": "syn-high-03",
    "contested-fall-on-apixaban": "demo-contested-01",
    "contested-pregnancy-chest-pain": "demo-contested-02",
    "contested-abdominal-pain": "demo-contested-03",
}


def _without_lab_times(structured: dict[str, Any]) -> dict[str, Any]:
    labs = [(lab["name"], lab["value"], lab.get("unit", "")) for lab in structured.get("labs", [])]
    return {**structured, "labs": labs}


def test_scenarios_are_mock_plain_text_copies_of_dataset_cases(client: TestClient) -> None:
    scenarios = client.get("/api/workflows/dynaclinic_mvp.yaml/scenarios").json()
    assert [s["id"] for s in scenarios] == list(COPIED_FROM)
    for scenario in scenarios:
        lines = scenario["text"].splitlines()
        assert lines[0] == scenario["title"] and scenario["title"].startswith("Mock case: ")
        assert scenario["teaches"] and not any(line.startswith("#") for line in lines)
        case, source = parse_plain_case(scenario["text"]), SOURCES[COPIED_FROM[scenario["id"]]]
        assert case is not None and case.answer == "" and case.question and len(case.options) >= 2
        assert (case.vignette, case.question, case.options) == (source.vignette, source.question, source.options)
        assert _without_lab_times(case.structured) == _without_lab_times(source.structured)
