"""Tests for dynaclinic.interfaces (in-memory stubs of FHIR/Neo4j/BioBERT/Qdrant/cache/MCTS)."""

from typing import Any

import numpy as np
import pytest

from dynaclinic.interfaces import (
    FHIRLiteIngestor,
    GreedyPlanner,
    HashingEmbeddingMemory,
    InMemoryGraphStore,
    InMemorySemanticCache,
    PlannerStep,
    sections_from_structured,
    structured_from_bundle,
)
from dynaclinic.types import Case, Option
from tests.dynaclinic_fixtures import no_network  # noqa: F401

VIGNETTE = (
    "A 68-year-old man with type 2 diabetes and atrial fibrillation on warfarin presents with two hours of "
    "crushing substernal chest pain radiating to the left arm with diaphoresis and nausea."
)


def _case() -> Case:
    return Case(
        id="c1",
        source="synthetic",
        vignette=VIGNETTE,
        question="Next step?",
        options=[Option("A", "Aspirin")],
        answer="A",
        structured={
            "demographics": {"age": 68, "sex": "male"},
            "history": ["type 2 diabetes", "atrial fibrillation"],
            "meds": ["warfarin 5 mg daily", "metformin 1 g twice daily"],
            "allergies": ["penicillin (anaphylaxis)"],
            "labs": [
                {"name": "troponin I", "value": "0.9", "unit": "ng/mL", "time": "2026-03-01T11:00"},
                {"name": "eGFR", "value": "64", "unit": "mL/min/1.73 m2"},
                {"name": "troponin I", "value": "0.2", "unit": "ng/mL", "time": "2026-03-01T08:00"},
            ],
            "imaging": ["Chest X-ray: no acute findings"],
        },
    )


def _bundle() -> dict[str, Any]:
    def entry(resource: dict[str, Any]) -> dict[str, Any]:
        return {"resource": resource}

    return {
        "resourceType": "Bundle",
        "entry": [
            entry({"resourceType": "Patient", "gender": "female", "birthDate": "1960-05-01"}),
            entry({"resourceType": "Condition", "code": {"text": "Chronic kidney disease stage 4"}}),
            entry({"resourceType": "Condition", "code": {"coding": [{"code": "38341003", "display": "Hypertension"}]}}),
            entry(
                {
                    "resourceType": "MedicationStatement",
                    "medicationCodeableConcept": {"text": "lisinopril"},
                    "dosage": [{"text": "20 mg daily"}],
                }
            ),
            entry(
                {
                    "resourceType": "AllergyIntolerance",
                    "code": {"text": "sulfonamide antibiotics"},
                    "reaction": [{"manifestation": [{"text": "rash"}]}],
                }
            ),
            entry(
                {
                    "resourceType": "Observation",
                    "code": {"text": "Potassium"},
                    "valueQuantity": {"value": 6.4, "unit": "mmol/L"},
                    "effectiveDateTime": "2026-03-02T09:30:00+00:00",
                }
            ),
            entry(
                {
                    "resourceType": "Observation",
                    "code": {"coding": [{"display": "Potassium"}]},
                    "valueQuantity": {"value": 5.1, "unit": "mmol/L"},
                    "effectiveDateTime": "2026-03-01T09:30:00+02:00",
                }
            ),
            entry({"resourceType": "Observation", "code": {"text": "ECG"}, "valueString": "peaked T waves"}),
            entry({"resourceType": "Encounter"}),
        ],
    }


def test_sections_render_all_fields_with_labs_time_ordered() -> None:
    sections = sections_from_structured(_case().structured)
    assert list(sections) == ["Demographics", "History", "Meds", "Allergies", "Labs", "Imaging"]
    assert sections["Demographics"] == "age: 68; sex: male"
    assert sections["Meds"] == "- warfarin 5 mg daily\n- metformin 1 g twice daily"
    assert sections["Labs"].splitlines() == [
        "- 2026-03-01T08:00 troponin I: 0.2 ng/mL",
        "- 2026-03-01T11:00 troponin I: 0.9 ng/mL",
        "- eGFR: 64 mL/min/1.73 m2",
    ]


def test_sections_missing_fields_are_empty() -> None:
    assert sections_from_structured({}) == dict.fromkeys(
        ["Demographics", "History", "Meds", "Allergies", "Labs", "Imaging"], ""
    )


def test_fhir_bundle_flattens_to_same_sections_with_labs_time_ordered() -> None:
    structured = structured_from_bundle(_bundle())
    sections = sections_from_structured(structured)
    assert sections["Demographics"] == "sex: female; birthDate: 1960-05-01"
    assert sections["History"] == "- Chronic kidney disease stage 4\n- Hypertension"
    assert sections["Meds"] == "- lisinopril 20 mg daily"
    assert sections["Allergies"] == "- sulfonamide antibiotics (rash)"
    assert sections["Labs"].splitlines() == [
        "- 2026-03-01T09:30:00+02:00 Potassium: 5.1 mmol/L",
        "- 2026-03-02T09:30:00+00:00 Potassium: 6.4 mmol/L",
        "- ECG: peaked T waves",
    ]


def test_ingest_builds_patient_graph_with_temporal_chain() -> None:
    ingestor = FHIRLiteIngestor()
    sections = ingestor.ingest(_case())
    assert sections == sections_from_structured(_case().structured)
    graph = ingestor.graph
    assert [n["id"] for n in graph.nodes("Patient")] == ["patient:c1"]
    assert len(graph.neighbors("patient:c1", "TAKES")) == 2
    assert len(graph.neighbors("patient:c1", "HAS_CONDITION")) == 2
    assert len(graph.neighbors("patient:c1", "ALLERGIC_TO")) == 1
    assert len(graph.neighbors("patient:c1", "HAS_IMAGING")) == 1
    observations = graph.neighbors("patient:c1", "HAS_OBSERVATION")
    assert len(observations) == 3
    times = [n["id"] for n in graph.nodes("TimePoint")]
    assert times == ["time:c1:2026-03-01T08:00", "time:c1:2026-03-01T11:00"]
    assert graph.neighbors(times[0], "NEXT") == [times[1]]
    timed = [obs for obs in observations if graph.neighbors(obs, "AT_TIME")]
    assert {graph.neighbors(obs, "AT_TIME")[0] for obs in timed} == set(times)


def test_graph_store_rejects_edges_to_unknown_nodes_and_dedupes() -> None:
    graph = InMemoryGraphStore()
    graph.add_node("a", "Patient")
    graph.add_node("b", "Condition", text="asthma")
    graph.add_edge("a", "HAS_CONDITION", "b")
    graph.add_edge("a", "HAS_CONDITION", "b")
    assert graph.edges == [("a", "HAS_CONDITION", "b")]
    assert graph.nodes("Condition") == [{"id": "b", "label": "Condition", "text": "asthma"}]
    with pytest.raises(KeyError):
        graph.add_edge("a", "TAKES", "missing")


def test_hashing_embedding_is_deterministic_normalised_and_ranked() -> None:
    memory = HashingEmbeddingMemory(dim=256)
    vector = memory.embed("Chest pain, chest pain!")
    assert np.allclose(vector, HashingEmbeddingMemory(dim=256).embed("chest PAIN chest pain"))
    assert np.isclose(np.linalg.norm(vector), 1.0)
    assert not memory.embed("").any()
    memory.add("crushing chest pain with diaphoresis", {"id": 1})
    memory.add("itchy rash on both forearms", {"id": 2})
    results = memory.search("chest pain and diaphoresis", top_k=2)
    assert [payload["id"] for _, payload in results] == [1, 2]
    assert results[0][0] > results[1][0]
    assert HashingEmbeddingMemory().search("anything") == []


def test_semantic_cache_hit_at_threshold_and_miss_below() -> None:
    near = VIGNETTE.replace("two hours", "three hours")
    similarity = HashingEmbeddingMemory().similarity(VIGNETTE, near)
    assert 0.9 < similarity < 1.0

    at_threshold = InMemorySemanticCache(threshold=similarity)
    assert at_threshold.store(VIGNETTE, {"final_answer": "A"}, verified=True) is True
    assert at_threshold.lookup(near) == {"final_answer": "A"}

    above = InMemorySemanticCache(threshold=similarity + 1e-6)
    above.store(VIGNETTE, {"final_answer": "A"}, verified=True)
    assert above.lookup(VIGNETTE) == {"final_answer": "A"}
    assert above.lookup(near) is None


def test_semantic_cache_never_stores_unverified_and_returns_copies() -> None:
    cache = InMemorySemanticCache()
    assert cache.threshold == 0.97
    assert cache.store(VIGNETTE, {"final_answer": "B"}, verified=False) is False
    assert cache.lookup(VIGNETTE) is None
    result = {"final_answer": "A"}
    cache.store(VIGNETTE, result, verified=True)
    result["final_answer"] = "mutated"
    hit = cache.lookup(VIGNETTE)
    assert hit == {"final_answer": "A"}
    hit["final_answer"] = "mutated"
    assert cache.lookup(VIGNETTE) == {"final_answer": "A"}
    assert cache.lookup("unrelated dermatology question about eczema") is None


def _walk(planner: GreedyPlanner, **outcomes: Any) -> list[str]:
    """Follow the planner from ``start``; ``gate_results`` feeds successive safety-gate outcomes."""
    gate_results = list(outcomes.pop("gate_results", [True]))
    stages, last, regenerations = [], "start", 0
    while True:
        gate_passed = gate_results.pop(0) if last == "safety_gate" else None
        step = planner.next_step(last, gate_passed=gate_passed, regenerations=regenerations, **outcomes)
        stages.append(f"{step.action}:{step.stage}")
        if step.action == "terminal":
            return stages
        if step.action == "backtrack":
            regenerations += 1
        last = step.stage


def test_planner_low_path() -> None:
    assert _walk(GreedyPlanner(), tier="LOW") == [
        "retrieval:cache_lookup",
        "agent_call:triage",
        "agent_call:primary_care",
        "agent_call:safety_gate",
        "terminal:done",
    ]


def test_planner_team_paths() -> None:
    assert _walk(GreedyPlanner(), tier="HIGH", mode="adversarial") == [
        "retrieval:cache_lookup",
        "agent_call:triage",
        "agent_call:care_team",
        "agent_call:divergence",
        "agent_call:critic",
        "agent_call:synthesizer",
        "agent_call:safety_gate",
        "terminal:done",
    ]
    assert "agent_call:critic" not in _walk(GreedyPlanner(), tier="MODERATE", mode="collaborative")


def test_planner_cache_hit_terminates() -> None:
    assert _walk(GreedyPlanner(), cache_hit=True) == ["retrieval:cache_lookup", "terminal:done"]


def test_planner_backtracks_once_on_gate_failure() -> None:
    stages = _walk(GreedyPlanner(), tier="LOW", gate_results=[False, False])
    assert stages[-4:] == [
        "agent_call:safety_gate",
        "backtrack:synthesizer",
        "agent_call:safety_gate",
        "terminal:done",
    ]
    assert _walk(GreedyPlanner(), tier="LOW", gate_results=[False, True]).count("backtrack:synthesizer") == 1


def test_planner_rejects_unknown_stage_and_missing_tier() -> None:
    with pytest.raises(ValueError, match="unknown stage"):
        GreedyPlanner().next_step("dance")
    with pytest.raises(ValueError, match="tier"):
        GreedyPlanner().next_step("triage")


def test_planner_reward_formula_and_trace() -> None:
    planner = GreedyPlanner(alpha=2.0, beta=0.5, gamma=1.0)
    assert planner.reward(delta_missing=0.5, delta_conf=0.4, stagnation=0.3) == pytest.approx(2.0 * 0.5 + 0.5 * 0.4 - 0.3)
    assert planner.record("triage", 1.0, 0.0, 0.0) == pytest.approx(2.0)
    assert planner.trace == [("triage", pytest.approx(2.0))]
    assert PlannerStep("terminal", "done").action in GreedyPlanner.ACTIONS
