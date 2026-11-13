"""Tests for the read-only benchmark replay API (/api/benchmarks)."""

import json
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient


def _rec(case_id: str, arm: str, answer: str, gold: str = "A", **extra: Any) -> dict[str, Any]:
    """Build a minimal results.jsonl record."""
    return {
        "case_id": case_id,
        "arm": arm,
        "final_answer": answer,
        "gold": gold,
        "correct": answer == gold,
        "mode": extra.pop("mode", None),
        "route": extra.pop("route", []),
        "calls": extra.pop("calls", []),
        "latency_s": 1.5,
        **extra,
    }


def _write_run(root: Path, name: str, records: list[dict[str, Any]] | None, model: str = "") -> None:
    """Write a fake run folder; records=None means no results.jsonl."""
    d = root / name
    d.mkdir(parents=True)
    if records is not None:
        (d / "results.jsonl").write_text("\n".join(json.dumps(r) for r in records) + "\n")
    if model:
        (d / "summary.json").write_text(json.dumps({"primary_model": model}))


@pytest.fixture()
def fake_results(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Two MedQA runs, a synthetic run, an empty folder, a questions file and a preset."""
    root = tmp_path / "results"
    dyn_route = [
        "ingest", "cache_lookup:off", "planner:x", "triage:HIGH", "planner:y",
        "uncertainty:0.38", "mode:adversarial:uncertainty", "proponent", "critic",
        "synthesizer", "safety_gate:pass", "planner:terminal",
    ]
    dyn_calls = [{"role": r, "model": "m-calls"} for r in ["triage", "proponent", "critic", "synthesizer"]]
    _write_run(
        root,
        "run-a",
        [
            _rec("medqa-test-0002", "single", "A"),
            _rec("medqa-test-0001", "single", "B"),
            _rec("medqa-test-0001", "static", "A"),
            _rec("medqa-test-0001", "dynamic", "C", mode="hierarchical"),
            _rec("medqa-test-0002", "dynamic", "A"),
        ],
        model="m-a",
    )
    _write_run(
        root,
        "run-b",
        [
            _rec(
                "medqa-test-0001", "dynamic", "A", mode="adversarial", route=dyn_route,
                calls=dyn_calls, complexity=1.0, uncertainty=0.38, tau_u=0.15,
            ),
            _rec("medqa-test-0001", "single", "D"),
        ],
    )
    _write_run(root, "syn-run", [_rec("syn-001", "single", "A")], model="m-syn")
    _write_run(root, "no-results", None)
    questions = tmp_path / "questions.jsonl"
    questions.write_text(
        json.dumps({"id": "medqa-test-0001", "question": "Q1?", "options": {"A": "a", "B": "b"}, "answer_idx": "A"})
        + "\n"
    )
    monkeypatch.setattr("server.routes.benchmarks.RESULTS_DIR", root)
    monkeypatch.setattr("server.routes.benchmarks.QUESTIONS_PATH", questions)
    monkeypatch.setattr(
        "server.routes.benchmarks.PRESETS",
        {"p": {"label": "Preset P", "arms": {"single": "run-a", "static": "run-a", "dynamic": "run-b"}}},
    )
    return root


def test_list_filters_and_orders(client: TestClient, fake_results: Path) -> None:
    """Preset first, MedQA folders listed with accuracy, synthetic/empty folders excluded."""
    runs = client.get("/api/benchmarks").json()["runs"]
    assert [r["id"] for r in runs] == ["p", "run-a", "run-b"]
    run_a = runs[1]
    assert run_a["label"] == "run-a"
    assert run_a["model"] == "m-a"
    assert run_a["arms"] == ["single", "dynamic", "static"]
    assert run_a["n"] == 2
    assert run_a["accuracy"] == {"single": 0.5, "dynamic": 0.5, "static": 1.0}
    assert runs[2]["model"] == "m-calls"


def test_detail_joins_and_filters(client: TestClient, fake_results: Path) -> None:
    """Questions joined, route noise dropped in order, roles/calls/totals reported."""
    body = client.get("/api/benchmarks/run-b").json()
    assert body["arms"] == ["single", "dynamic"]
    assert body["totals"]["dynamic"] == {"n": 1, "correct": 1, "accuracy": 1.0}
    (q,) = body["questions"]
    assert q["question"] == "Q1?"
    assert q["options"] == {"A": "a", "B": "b"}
    assert q["gold"] == "A"
    dyn = q["arms"]["dynamic"]
    assert dyn["steps"] == [
        "triage:HIGH", "uncertainty:0.38", "mode:adversarial:uncertainty",
        "proponent", "critic", "synthesizer", "safety_gate:pass",
    ]
    assert dyn["roles"] == ["triage", "proponent", "critic", "synthesizer"]
    assert dyn["calls"] == 4
    assert (dyn["C"], dyn["U"], dyn["tau_u"], dyn["tau_c"]) == (1.0, 0.38, 0.15, None)
    assert dyn["mode"] == "adversarial"


def test_detail_missing_question_and_sorting(client: TestClient, fake_results: Path) -> None:
    """Cases missing from the questions file fall back to empty text; sorted by case_id."""
    qs = client.get("/api/benchmarks/run-a").json()["questions"]
    assert [q["case_id"] for q in qs] == ["medqa-test-0001", "medqa-test-0002"]
    assert (qs[1]["question"], qs[1]["options"]) == ("", {})


def test_preset_merges_arms(client: TestClient, fake_results: Path) -> None:
    """Preset takes single/static from run-a and dynamic from run-b."""
    body = client.get("/api/benchmarks/p").json()
    assert body["label"] == "Preset P"
    assert body["model"] == "m-a"
    by_id = {q["case_id"]: q for q in body["questions"]}
    assert by_id["medqa-test-0001"]["arms"]["single"]["answer"] == "B"  # run-b says D
    assert by_id["medqa-test-0001"]["arms"]["dynamic"]["answer"] == "A"  # run-a says C
    assert set(by_id["medqa-test-0002"]["arms"]) == {"single"}
    assert body["totals"]["dynamic"] == {"n": 1, "correct": 1, "accuracy": 1.0}
    assert body["n"] == 2


@pytest.mark.parametrize("bad", ["..%2F..%2Fetc", "../x", "syn-run", "no-results", "nope"])
def test_unknown_ids_rejected(client: TestClient, fake_results: Path, bad: str) -> None:
    """Traversal, non-MedQA and unknown ids are rejected (400 from the security middleware or 404)."""
    assert client.get(f"/api/benchmarks/{bad}").status_code in (400, 404)


@pytest.mark.parametrize("bad", ["../run-a", "../../etc/passwd", "run-a/..", "syn-run", "nope"])
def test_handler_404_without_middleware(fake_results: Path, bad: str) -> None:
    """The handler itself 404s any id not in the known set, independent of middleware."""
    from fastapi import HTTPException

    from server.routes.benchmarks import get_benchmark

    with pytest.raises(HTTPException) as exc:
        get_benchmark(bad)
    assert exc.value.status_code == 404


def test_real_slide8_preset(client: TestClient) -> None:
    """Smoke against the recorded docs data: slide 8 accuracies."""
    body = client.get("/api/benchmarks/slide8-gpt-6-luna").json()
    assert body["n"] == 50
    assert body["arms"] == ["single", "dynamic", "static"]
    acc = {a: t["accuracy"] for a, t in body["totals"].items()}
    assert acc == {"single": 0.94, "dynamic": 0.96, "static": 0.90}
    assert all(t["n"] == 50 for t in body["totals"].values())
