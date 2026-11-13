"""Tests for the DynaClinic eval harness CLI (offline: dry-run FakeLLM or injected clients)."""

import json
import shutil
import threading
import time
from collections import Counter
from pathlib import Path

import pytest

from dynaclinic.eval import harness
from dynaclinic.eval.cases import SYNTHETIC_PATH, load_synthetic
from dynaclinic.llm import FakeLLM, LLMError, set_client_factory
from dynaclinic.prompts import PATHOLOGY, SINGLE_AGENT, TRIAGE
from dynaclinic.types import CallRecord, RunResult
from tests.dynaclinic_fixtures import no_network  # noqa: F401

ARMS = ("dynamic", "single", "static")
SENTINEL = "sk-SENTINEL-do-not-leak-0123456789"


@pytest.fixture(autouse=True)
def _isolated(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Run from an empty directory so the repo ``.env`` is never read; no client factory leaks between tests."""
    monkeypatch.chdir(tmp_path)
    for key in ("OPENAI_API_KEY", "DYNACLINIC_MODEL", "DYNACLINIC_FALLBACK_MODELS"):
        monkeypatch.delenv(key, raising=False)
    yield
    set_client_factory(None)


def _rows(out: Path) -> list[dict]:
    return [json.loads(line) for line in (out / "results.jsonl").read_text().splitlines()]


def _main(out: Path, *args: str) -> int:
    return harness.main(["--out", str(out), "--concurrency", "4", *args])


def test_dry_run_writes_all_outputs_with_per_arm_counts(tmp_path: Path) -> None:
    out = tmp_path / "run"
    assert _main(out, "--dry-run", "--limit", "6") == 0
    rows = _rows(out)
    assert Counter(row["arm"] for row in rows) == {arm: 6 for arm in ARMS}
    assert len({(row["case_id"], row["arm"]) for row in rows}) == 18
    assert {"correct", "safety_violation", "triage_correct", "margin_loss", "gold", "gold_tier"} <= rows[0].keys()
    summary = json.loads((out / "summary.json").read_text())
    assert summary["dry_run"] is True and summary["n_cases"] == 6
    assert {arm: summary["arms_summary"][arm]["n"] for arm in ARMS} == {arm: 6 for arm in ARMS}
    markdown = (out / "summary.md").read_text()
    for arm in ARMS:
        assert f"| {arm} | 6 |" in markdown
    case_ids = [case.id for case in load_synthetic()[:6]]
    assert all(f"| {case_id} |" in markdown for case_id in case_ids)
    assert "| LOW |" in markdown


def test_resume_skips_pairs_already_in_results(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    out = tmp_path / "run"
    assert _main(out, "--dry-run", "--limit", "2", "--arms", "single,static") == 0
    first = (out / "results.jsonl").read_text()
    capsys.readouterr()

    assert _main(out, "--dry-run", "--limit", "3", "--arms", "single,static") == 0
    text = (out / "results.jsonl").read_text()
    assert text.startswith(first) and len(text.splitlines()) == 6
    assert capsys.readouterr().err.count("] syn-") == 2  # only the third case's two pairs ran

    assert _main(out, "--dry-run", "--limit", "3", "--arms", "single,static") == 0
    assert (out / "results.jsonl").read_text() == text


def test_each_worker_thread_gets_its_own_client(tmp_path: Path) -> None:
    clients: list[tuple[FakeLLM, set[int]]] = []

    def factory() -> FakeLLM:
        threads: set[int] = set()

        def script(role: str, system: str, user: str) -> str:
            threads.add(threading.get_ident())
            time.sleep(0.005)
            return harness.dry_run_reply(role, system, user)

        client = FakeLLM(script)
        clients.append((client, threads))
        return client

    cases = load_synthetic()[:12]
    rows = harness.run_eval(cases, ["single"], tmp_path / "run", factory, concurrency=4)
    assert len(rows) == 12
    assert all(len(row["calls"]) == 1 for row in rows)  # ledgers never mix across concurrent runs
    assert 1 <= len(clients) <= 4
    assert all(len(threads) == 1 for _, threads in clients)


def test_secret_never_reaches_outputs_or_progress(tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
                                                  capsys: pytest.CaptureFixture[str]) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", SENTINEL)

    def leaky(role: str, system: str, user: str) -> str:
        if role == SINGLE_AGENT:
            raise LLMError(f"upstream echoed key={SENTINEL}")
        if role == TRIAGE:
            raise RuntimeError(f"unexpected failure with {SENTINEL}")
        return harness.dry_run_reply(role, system, user)

    set_client_factory(lambda models: FakeLLM(leaky))
    out = tmp_path / "run"
    assert _main(out, "--limit", "2", "--arms", "dynamic,single") == 0
    rows = _rows(out)
    assert all(row["error"] and "***" in row["error"] for row in rows)
    for path in out.iterdir():
        assert SENTINEL not in path.read_text(), path.name
    assert SENTINEL not in capsys.readouterr().err

    assert _main(tmp_path / "dry", "--dry-run", "--limit", "2") == 0
    assert all(SENTINEL not in path.read_text() for path in (tmp_path / "dry").iterdir())


@pytest.mark.parametrize(("args", "policy"), [((), "shared_core"), (("--context-policy", "strict"), "strict")])
def test_context_policy_reaches_the_team_and_is_recorded(tmp_path: Path, args: tuple[str, ...], policy: str) -> None:
    clients: list[FakeLLM] = []

    def factory(models: list[str] | None) -> FakeLLM:
        clients.append(FakeLLM(harness.dry_run_reply))
        return clients[-1]

    set_client_factory(factory)
    out = tmp_path / "run"
    assert _main(out, "--limit", "1", "--arms", "dynamic,static", *args) == 0
    assert [row["context_policy"] for row in _rows(out)] == [policy, policy]
    assert json.loads((out / "summary.json").read_text())["context_policy"] == policy
    assert f"context policy: {policy}" in (out / "summary.md").read_text()
    vignette = load_synthetic()[0].vignette
    pathology = [user for client in clients for role, _, user in client.prompts if role == PATHOLOGY]
    assert pathology and all((vignette in user) == (policy == "shared_core") for user in pathology)


def test_missing_medqa_sample_is_skipped_with_a_message(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    data = tmp_path / "data"
    data.mkdir()
    shutil.copy(SYNTHETIC_PATH, data / SYNTHETIC_PATH.name)
    out = tmp_path / "run"
    argv = ["--out", str(out), "--dry-run", "--limit", "1", "--arms", "single"]
    assert harness.main([*argv, "--dataset", "synthetic,medqa"], data_dir=data) == 0
    assert f"no MedQA sample at {data / 'medqa_sample.jsonl'}; skipping" in capsys.readouterr().err
    assert len(_rows(out)) == 1

    assert harness.main([*argv, "--dataset", "medqa"], data_dir=data) == 1
    assert "no cases selected" in capsys.readouterr().err


def test_seed_shuffles_before_limit_reproducibly(tmp_path: Path) -> None:
    def ids(name: str, seed: str) -> list[str]:
        harness.main(["--out", str(tmp_path / name), "--dry-run", "--limit", "4", "--arms", "single", "--seed", seed])
        return [row["case_id"] for row in _rows(tmp_path / name)]

    first, again = ids("a", "7"), ids("b", "7")
    assert sorted(first) == sorted(again)
    assert sorted(first) != [case.id for case in load_synthetic()[:4]]


@pytest.mark.parametrize(
    ("k", "n", "expected"),
    [(5, 10, (0.2366, 0.7634)), (10, 10, (0.7225, 1.0)), (0, 10, (0.0, 0.2775)), (0, 0, None)],
)
def test_wilson_interval(k: int, n: int, expected: tuple[float, float] | None) -> None:
    interval = harness.wilson(k, n)
    assert interval == (pytest.approx(expected, abs=1e-4) if expected else None)


@pytest.mark.parametrize(("values", "expected"), [([3.0, 1.0, 2.0], 2.0), ([4.0, 1.0, 3.0, 2.0], 2.5), ([], None)])
def test_p50(values: list[float], expected: float | None) -> None:
    assert harness.p50(values) == expected


def _row(case_id: str, tier: str, *, answer: str | None, correct: bool, **extra: object) -> dict:
    grades = {"correct": correct, "safety_violation": False, "triage_correct": None, "margin_loss": None}
    fields = {k: v for k, v in extra.items() if k not in grades}
    result = RunResult(case_id, "single", final_answer=answer, **fields)
    return {**result.to_dict(), **grades, **{k: v for k, v in extra.items() if k in grades},
            "gold": "A", "gold_tier": tier}


def test_summary_metrics_tiers_and_cost_only_from_env_prices() -> None:
    call = CallRecord("single_agent", "gpt-x.1", 1000, 500, 2.0, False)
    fallback = CallRecord("single_agent", "gpt-y", 3000, 100, 6.0, True)
    rows = [
        _row("c1", "LOW", answer="A", correct=True, mode="single", calls=[call], latency_s=2.0),
        _row("c2", "LOW", answer="C", correct=False, mode="single", calls=[call], latency_s=2.0,
             safety_violation=True, blocked=True),
        _row("c3", "HIGH", answer="A", correct=True, mode="single", calls=[call], latency_s=4.0),
        _row("c4", "HIGH", answer=None, correct=False, calls=[fallback], latency_s=6.0, error="boom"),
    ]
    priced = {"DYNACLINIC_PRICE_GPT_X_1_IN": "2", "DYNACLINIC_PRICE_GPT_X_1_OUT": "10",
              "DYNACLINIC_PRICE_GPT_Y_IN": "1", "DYNACLINIC_PRICE_GPT_Y_OUT": "1"}

    summary = harness.summarize(rows, ["single"], priced)
    single = summary["arms_summary"]["single"]
    assert (single["n"], single["correct"], single["accuracy"]) == (4, 2, 0.5)
    assert single["accuracy_ci"] == pytest.approx(list(harness.wilson(2, 4)))
    assert (single["safety_violations"], single["safety_violation_rate"]) == (1, 0.25)
    assert (single["blocked_rate"], single["errors"]) == (0.25, 1)
    assert single["routes"] == {"single": 3, "none": 1}
    assert single["triage"] is None and single["adversarial_switch_rate"] is None
    assert single["mean_calls"] == 1.0
    assert single["mean_prompt_tokens"] == 1500 and single["mean_completion_tokens"] == 400
    assert (single["mean_latency_s"], single["p50_latency_s"]) == (3.5, 3.0)
    assert single["models"] == {"gpt-x.1": 3, "gpt-y": 1} and single["fallback_calls"] == 1
    assert single["cost_usd"] == pytest.approx(3 * (1000 * 2 + 500 * 10) / 1e6 + (3000 + 100) / 1e6)
    assert summary["per_tier"] == {"LOW": {"single": {"n": 2, "correct": 1}}, "HIGH": {"single": {"n": 2, "correct": 1}}}
    assert list(summary["per_tier"]) == ["LOW", "HIGH"]
    assert summary["cases"]["c4"]["arms"]["single"] == {"answer": None, "correct": False, "error": True}

    unpriced = {k: v for k, v in priced.items() if "GPT_Y" not in k}
    assert harness.summarize(rows, ["single"], unpriced)["arms_summary"]["single"]["cost_usd"] is None


def test_meta_controller_scores_are_summarised_and_pre_f14_rows_still_load() -> None:
    legacy = _row("c4", "LOW", answer="A", correct=True, mode="single")
    for key in ("complexity", "uncertainty", "tau_c", "tau_u", "top_k", "differential", "mode_reason", "consults"):
        del legacy[key]  # a resumed results.jsonl row written before the Meta-Controller scores existed
    luna = "calibrated for gpt-6-luna"
    rows = [_row("c1", "LOW", answer="A", correct=True, mode="hierarchical", complexity=0.25, uncertainty=0.5,
                 tau_u=0.15, tau_u_source=luna),
            _row("c2", "HIGH", answer="A", correct=True, mode="adversarial", complexity=1.0, uncertainty=None,
                 tau_u=0.15, tau_u_source=luna, route=["uncertainty:n/a", "mode:adversarial:uncertainty"]),
            {**_row("c3", "HIGH", answer="A", correct=True, mode="collaborative", complexity=0.75, uncertainty=0.2,
                    tau_u=0.59, tau_u_source=luna), "open_ended": True},
            _row("c5", "HIGH", answer="A", correct=True, mode="adversarial", complexity=0.75, uncertainty=0.1,
                 tau_u=0.15, route=["mode:collaborative", "divergence:0.40:switch"]),  # pre-f19: no tau_u_source
            legacy]
    summary = harness.summarize(rows, ["single"], {})
    s = summary["arms_summary"]["single"]
    assert (s["mean_complexity"], s["mean_uncertainty"], s["uncertainty_not_measured"]) == (
        pytest.approx(0.6875), pytest.approx(0.8 / 3), 1)
    assert (s["tau_u"], s["tau_u_source"]) == ({"multiple choice": [0.15], "open-ended": [0.59]}, [luna])
    assert s["adversarial_entry"] == {"uncertainty": 1, "conflict": 1}
    meta = {"run_id": "r", "generated_at": "t", "dry_run": True, "dataset": "synthetic", "n_cases": 5, "limit": None,
            "seed": None, "cache": False, "concurrency": 1, "context_policy": "shared_core", "arms": ["single"]}
    assert ("| single | 0.688 | 0.267 | 1 | multiple choice 0.15; open-ended 0.59 (calibrated for gpt-6-luna) "
            "| 1 / 1 |") in harness.render_markdown({**summary, **meta})
    fallback = _row("c6", "LOW", answer="A", correct=True, mode="hierarchical", complexity=0.25, uncertainty=0.1,
                    tau_u=0.15, tau_u_source="uncalibrated: fallback to gpt-6-luna's")
    assert "| multiple choice 0.15 (uncalibrated: fallback to gpt-6-luna's) |" in harness.render_markdown(
        {**harness.summarize([fallback], ["single"], {}), **meta})
    unscored = harness.summarize([legacy], ["single"], {})["arms_summary"]["single"]
    assert (unscored["mean_complexity"], unscored["uncertainty_not_measured"]) == (None, None)
    assert (unscored["tau_u"], unscored["tau_u_source"], unscored["adversarial_entry"]) == (None, None, None)
