"""Read-only replay of recorded MedQA benchmark runs (no model calls)."""

import json
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException

router = APIRouter()

_REPO_ROOT = Path(__file__).resolve().parents[2]
RESULTS_DIR = _REPO_ROOT / "docs" / "dynaclinic" / "results"
QUESTIONS_PATH = _REPO_ROOT / "data" / "dynaclinic" / "medqa_sample.jsonl"

ARM_ORDER = ["single", "dynamic", "static"]
PRESETS: dict[str, dict[str, Any]] = {
    "slide8-gpt-6-luna": {
        "label": "MedQA-50, gpt-6-luna (slide 8)",
        "arms": {
            "single": "2026-10-27-medqa50-gpt-6-luna-shared-core",
            "static": "2026-10-27-medqa50-gpt-6-luna-shared-core",
            "dynamic": "2026-10-28-f15-medqa50-dynamic-gpt-6-luna",
        },
    },
}
_NOISE_PREFIXES = ("planner:", "cache_lookup:")


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    """Parse a JSONL file, skipping blank lines."""
    with path.open(encoding="utf-8") as fh:
        return [json.loads(line) for line in fh if line.strip()]


def _replayable_runs() -> dict[str, Path]:
    """Map folder name -> path for runs with results.jsonl whose case ids are all MedQA."""
    runs: dict[str, Path] = {}
    if not RESULTS_DIR.is_dir():
        return runs
    for folder in sorted(RESULTS_DIR.iterdir()):
        results = folder / "results.jsonl"
        if not results.is_file():
            continue
        records = _read_jsonl(results)
        if records and all(str(r.get("case_id", "")).startswith("medqa") for r in records):
            runs[folder.name] = folder
    return runs


def _run_model(folder: Path, records: list[dict[str, Any]]) -> str:
    """Return summary.json primary_model, else the first call's model, else ""."""
    summary = folder / "summary.json"
    if summary.is_file():
        model = json.loads(summary.read_text(encoding="utf-8")).get("primary_model")
        if model:
            return str(model)
    for rec in records:
        for call in rec.get("calls") or []:
            if call.get("model"):
                return str(call["model"])
    return ""


def _arm_result(rec: dict[str, Any]) -> dict[str, Any]:
    """Project one (case, arm) record onto the replay ArmResult shape."""
    calls = rec.get("calls") or []
    steps = [
        s for s in rec.get("route") or [] if s != "ingest" and not s.startswith(_NOISE_PREFIXES)
    ]
    return {
        "answer": rec.get("final_answer"),
        "correct": bool(rec.get("correct")),
        "mode": rec.get("mode"),
        "C": rec.get("complexity"),
        "U": rec.get("uncertainty"),
        "tau_c": rec.get("tau_c"),
        "tau_u": rec.get("tau_u"),
        "mode_reason": rec.get("mode_reason"),
        "calls": len(calls),
        "roles": [c.get("role") for c in calls],
        "steps": steps,
        "latency_s": rec.get("latency_s"),
    }


def _build(run_id: str, runs: dict[str, Path]) -> dict[str, Any]:
    """Build the full replay payload for a preset id or a replayable folder name."""
    preset = PRESETS.get(run_id)
    if preset is not None and all(f in runs for f in preset["arms"].values()):
        label = preset["label"]
        sources: dict[str, str] = preset["arms"]
    elif run_id in runs:
        label = run_id
        sources = {}
    else:
        raise HTTPException(status_code=404, detail=f"Unknown benchmark: {run_id}")

    records: list[dict[str, Any]] = []
    model = ""
    if sources:
        loaded: dict[str, list[dict[str, Any]]] = {}
        for arm, folder_name in sources.items():
            if folder_name not in loaded:
                loaded[folder_name] = _read_jsonl(runs[folder_name] / "results.jsonl")
            records += [r for r in loaded[folder_name] if r.get("arm") == arm]
            model = model or _run_model(runs[folder_name], loaded[folder_name])
    else:
        records = _read_jsonl(runs[run_id] / "results.jsonl")
        model = _run_model(runs[run_id], records)

    questions_src = (
        {q["id"]: q for q in _read_jsonl(QUESTIONS_PATH)} if QUESTIONS_PATH.is_file() else {}
    )
    present = {r.get("arm") for r in records}
    arms = [a for a in ARM_ORDER if a in present]
    totals = {a: {"n": 0, "correct": 0, "accuracy": 0.0} for a in arms}
    questions: dict[str, dict[str, Any]] = {}
    for rec in records:
        arm = rec.get("arm")
        if arm not in totals:
            continue
        case_id = rec["case_id"]
        src = questions_src.get(case_id, {})
        q = questions.setdefault(
            case_id,
            {
                "case_id": case_id,
                "question": src.get("question", ""),
                "options": src.get("options", {}),
                "gold": rec.get("gold") or src.get("answer_idx", ""),
                "arms": {},
            },
        )
        q["arms"][arm] = _arm_result(rec)
        totals[arm]["n"] += 1
        totals[arm]["correct"] += int(bool(rec.get("correct")))
    for t in totals.values():
        t["accuracy"] = round(t["correct"] / t["n"], 4) if t["n"] else 0.0

    return {
        "id": run_id,
        "label": label,
        "model": model,
        "arms": arms,
        "n": len(questions),
        "totals": totals,
        "questions": [questions[k] for k in sorted(questions)],
    }


@router.get("/api/benchmarks")
def list_benchmarks() -> dict[str, list[dict[str, Any]]]:
    """List presets then replayable MedQA run folders with per-arm accuracy."""
    runs = _replayable_runs()
    ids = [p for p in PRESETS if all(f in runs for f in PRESETS[p]["arms"].values())]
    out = []
    for run_id in ids + list(runs):
        full = _build(run_id, runs)
        out.append(
            {
                "id": full["id"],
                "label": full["label"],
                "model": full["model"],
                "arms": full["arms"],
                "n": full["n"],
                "accuracy": {a: t["accuracy"] for a, t in full["totals"].items()},
            }
        )
    return {"runs": out}


@router.get("/api/benchmarks/{run_id}")
def get_benchmark(run_id: str) -> dict[str, Any]:
    """Return the full replay (scoreboard + per-question paths) for one run or preset."""
    return _build(run_id, _replayable_runs())
