"""yaml_instance/dynaclinic_mvp.yaml end to end through ``runtime.sdk.run_workflow`` against a FakeLLM."""

import json
from collections.abc import Iterator
from pathlib import Path

import pytest

from dynaclinic.eval.cases import load_synthetic
from dynaclinic.llm import FakeLLM, set_client_factory
from dynaclinic.prompts import (
    IMAGING,
    PATHOLOGY,
    PHARMACOLOGY,
    PRIMARY_CARE,
    SYNTHESIZER,
    TRIAGE,
)
from runtime.sdk import WorkflowRunResult, run_workflow
from tests.dynaclinic_fixtures import no_network  # noqa: F401
from tests.test_dynaclinic_pipeline import SCRIPT, _specialist, _triage

WORKFLOW = Path(__file__).resolve().parents[1] / "yaml_instance" / "dynaclinic_mvp.yaml"
CASES = {case.id: case for case in load_synthetic()}
LOW_PATH = ["CaseInput", "Triage", "PrimaryCare", "SafetyGate", "Report"]
TEAM = ["CaseInput", "Triage", "CareTeam", "DivergenceGate"]
ADVERSARIAL_PATH = [*TEAM, "Critic", "Synthesizer", "SafetyGate", "Report"]
COLLABORATIVE_PATH = [*TEAM, "Synthesizer", "SafetyGate", "Report"]


def _votes(letter: str) -> dict[str, float]:
    return {other: 0.025 for other in "ABCDE"} | {letter: 0.9}


@pytest.fixture
def run(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Iterator:
    """Run the MVP workflow in ``tmp_path`` (WareHouse/, no .env) with a FakeLLM for ``{role: reply}``."""
    monkeypatch.chdir(tmp_path)

    def go(task_prompt: str, **replies: str) -> tuple[WorkflowRunResult, list[str]]:
        client = FakeLLM({**SCRIPT, **replies})
        set_client_factory(lambda models: client)
        result = run_workflow(WORKFLOW, task_prompt=task_prompt)
        logs = json.loads((result.meta_info.output_dir / "execution_logs.json").read_text())["logs"]
        return result, [log["node_id"] for log in logs if log["event_type"] == "NODE_START"]

    yield go
    set_client_factory(None)


@pytest.mark.parametrize(
    ("case_id", "dissent", "path"),
    [("syn-low-03", None, LOW_PATH), ("syn-mod-05", None, COLLABORATIVE_PATH), ("syn-high-01", "A", ADVERSARIAL_PATH)],
    ids=["low", "moderate-collaborative", "high-adversarial"],
)
def test_case_json_routes_through_its_tier_path(run, case_id: str, dissent: str | None, path: list[str]) -> None:
    case = CASES[case_id]
    answer = f"FINAL ANSWER: {case.answer}"
    result, executed = run(
        json.dumps(case.to_dict()),
        **{TRIAGE: _triage(case.gold_tier), PRIMARY_CARE: f"Facts and risks of each option.\n{answer}",
           IMAGING: _specialist(_votes(dissent or case.answer)), PATHOLOGY: _specialist(_votes(case.answer)),
           PHARMACOLOGY: _specialist(_votes(case.answer)), SYNTHESIZER: f"The team findings support it.\n{answer}"},
    )
    assert executed == path
    assert set(result.meta_info.outputs) == {f"node_{node}" for node in path} | {"graph_summary"}
    report = result.final_message.text_content()
    assert report.startswith("DynaClinic report (GATE: PASS)") and report.endswith(answer)


def test_free_text_prompt_completes_without_a_final_answer(run) -> None:
    plan = "Draw blood cultures, then give IV ceftriaxone."
    result, executed = run("A 70-year-old man has fever, hypotension and confusion.", **{PRIMARY_CARE: plan})
    assert executed == LOW_PATH
    report = result.final_message.text_content()
    assert report.startswith("DynaClinic report (GATE: PASS)") and report.endswith(plan)
    assert "FINAL ANSWER" not in report
