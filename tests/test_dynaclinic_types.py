"""Tests for dynaclinic.types."""

import json
import socket

import pytest

from dynaclinic.types import (
    BlackboardEntry,
    CallRecord,
    Case,
    Claim,
    GateResult,
    Option,
    RunResult,
)
from tests.dynaclinic_fixtures import NetworkBlockedError, no_network  # noqa: F401


def _case() -> Case:
    return Case(
        id="syn-001",
        source="synthetic",
        vignette="A 30-year-old woman with dysuria.",
        question="What is the best treatment?",
        options=[Option("A", "Nitrofurantoin"), Option("B", "Trimethoprim-sulfamethoxazole")],
        answer="A",
        gold_tier="LOW",
        structured={"allergies": ["sulfonamide antibiotics (rash)"], "labs": [{"name": "WBC", "value": "8"}]},
        unsafe_options=["B"],
        tags=["uti"],
    )


def test_network_guard_blocks_socket_connect() -> None:
    with pytest.raises(NetworkBlockedError):
        socket.create_connection(("127.0.0.1", 9), timeout=1)


def test_case_round_trip_through_json() -> None:
    case = _case()
    restored = Case.from_dict(json.loads(json.dumps(case.to_dict())))
    assert restored == case
    assert isinstance(restored.options[0], Option)


def test_case_defaults_are_independent() -> None:
    a = Case(id="1", source="medqa", vignette="v", question="q", options=[Option("A", "x")], answer="A")
    b = Case(id="2", source="medqa", vignette="v", question="q", options=[Option("A", "x")], answer="A")
    a.structured["meds"] = ["warfarin"]
    a.unsafe_options.append("A")
    assert a.gold_tier is None
    assert b.structured == {} and b.unsafe_options == [] and b.tags == []


def test_option_letters() -> None:
    assert _case().letters() == ["A", "B"]


def test_run_result_round_trip_restores_nested_types() -> None:
    result = RunResult(
        case_id="syn-001",
        arm="dynamic",
        route=["triage", "primary_care", "safety_gate"],
        tier="LOW",
        mode="single",
        final_answer="A",
        final_text="FINAL ANSWER: A",
        gates=[GateResult("T_SAD", False, ["allergy: sulfamethoxazole"])],
        calls=[CallRecord("triage", "fake", 10, 5, 0.01, False)],
        latency_s=0.2,
    )
    data = json.loads(json.dumps(result.to_dict()))
    restored = RunResult.from_dict(data)
    assert restored == result
    assert isinstance(restored.gates[0], GateResult)
    assert isinstance(restored.calls[0], CallRecord)


def test_run_result_defaults() -> None:
    result = RunResult(case_id="c", arm="single")
    assert result.route == [] and result.gates == [] and result.calls == []
    assert result.divergence is None and result.final_answer is None and result.error is None
    assert result.blocked is False and result.cache_hit is False


@pytest.mark.parametrize(
    "obj",
    [
        BlackboardEntry("Imaging", "finding", "No consolidation", {"A": 0.6, "B": 0.4}, ["clear lungs"], 1),
        Claim("Patient is on warfarin", "Pharmacology", 0.9, {"supported": 0.8}, 0.85, "supported"),
        GateResult("A_SAD", True, []),
        CallRecord("critic", "gpt-x", 1, 2, 0.5, True),
        Option("C", "Aspirin"),
    ],
)
def test_flat_types_round_trip(obj: object) -> None:
    data = json.loads(json.dumps(obj.to_dict()))
    assert type(obj).from_dict(data) == obj


def test_blackboard_entry_defaults() -> None:
    entry = BlackboardEntry("Pathology", "hypothesis", "Anemia")
    assert entry.distribution is None and entry.claims == [] and entry.step == 0
