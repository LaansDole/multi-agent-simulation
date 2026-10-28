"""yaml_instance/dynaclinic_mvp.yaml end to end through ``runtime.sdk.run_workflow`` against a FakeLLM."""

import json
from collections.abc import Iterator
from pathlib import Path

import pytest

from dynaclinic.eval.cases import load_synthetic
from dynaclinic.llm import FakeLLM, set_client_factory
from dynaclinic.prompts import (
    GENERALIST,
    IMAGING,
    PATHOLOGY,
    PHARMACOLOGY,
    PRIMARY_CARE,
    SYNTHESIZER,
    TRIAGE,
    WRITE_UP_SECTIONS,
)
from runtime.sdk import WorkflowRunResult, run_workflow
from tests.dynaclinic_fixtures import no_network  # noqa: F401
from tests.test_dynaclinic_pipeline import SCRIPT, _specialist, _triage

WORKFLOW = Path(__file__).resolve().parents[1] / "yaml_instance" / "dynaclinic_mvp.yaml"
CASES = {case.id: case for case in load_synthetic()}
LOW_PATH = ["CaseInput", "Triage", "GeneralistSweep", "PrimaryCare", "SafetyGate", "Report"]
TEAM = ["CaseInput", "Triage", "GeneralistSweep", "CareTeam", "DivergenceGate"]
ADVERSARIAL_PATH = [*TEAM, "Critic", "Synthesizer", "SafetyGate", "Report"]
COLLABORATIVE_PATH = [*TEAM, "MeshExchange", "Synthesizer", "SafetyGate", "Report"]
COVID_PROMPT = "a patient has COVID-19 in a sunny day"
WRITE_UP = """ASSESSMENT: Probable mild COVID-19. The sunny weather is clinically irrelevant.
DIFFERENTIAL: Influenza or another viral respiratory infection.
PLAN: Confirm with a test, isolate at home, fluids and paracetamol; consider an antiviral if high risk.
RED FLAGS / ESCALATE IF: Shortness of breath, chest pain, confusion or SpO2 below 94%.
MISSING INFORMATION: Age, vaccination status, comorbidities, current medications and oxygen saturation.
RECOMMENDATION: Manage at home with isolation and symptom relief, with clear advice on when to seek care."""


def _votes(letter: str) -> dict[str, float]:
    return {other: 0.025 for other in "ABCDE"} | {letter: 0.9}


@pytest.fixture
def run(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Iterator:
    """Run the MVP workflow in ``tmp_path`` (WareHouse/, no .env) with a FakeLLM for ``{role: reply}``."""
    monkeypatch.chdir(tmp_path)

    def go(task_prompt: str, **replies: str) -> tuple[WorkflowRunResult, list[str], FakeLLM]:
        client = FakeLLM({**SCRIPT, **replies})
        set_client_factory(lambda models: client)
        result = run_workflow(WORKFLOW, task_prompt=task_prompt)
        logs = json.loads((result.meta_info.output_dir / "execution_logs.json").read_text())["logs"]
        return result, [log["node_id"] for log in logs if log["event_type"] == "NODE_START"], client

    yield go
    set_client_factory(None)


@pytest.mark.parametrize(
    ("case_id", "dissent", "uncertain", "path"),
    [
        ("syn-low-03", None, False, LOW_PATH),
        ("syn-mod-05", None, False, COLLABORATIVE_PATH),
        ("syn-high-01", "A", False, ADVERSARIAL_PATH),
        # a LOW case with a flat generalist differential (U = 1 > tau_u): adversarial although the team agrees
        ("syn-low-03", None, True, ADVERSARIAL_PATH),
    ],
    ids=["low-hierarchical", "moderate-collaborative", "high-adversarial", "low-uncertain-adversarial"],
)
def test_case_json_routes_through_its_mode_path(
    run, case_id: str, dissent: str | None, uncertain: bool, path: list[str]
) -> None:
    case = CASES[case_id]
    answer = f"FINAL ANSWER: {case.answer}"
    flat = json.dumps({"differential": [{"hypothesis": letter, "probability": 1} for letter in case.letters()]})
    result, executed, _ = run(
        json.dumps(case.to_dict()),
        **{TRIAGE: _triage(case.gold_tier), PRIMARY_CARE: f"Facts and risks of each option.\n{answer}",
           IMAGING: _specialist(_votes(dissent or case.answer)), PATHOLOGY: _specialist(_votes(case.answer)),
           PHARMACOLOGY: _specialist(_votes(case.answer)), SYNTHESIZER: f"The team findings support it.\n{answer}",
           **({GENERALIST: flat} if uncertain else {})},
    )
    assert executed == path
    assert set(result.meta_info.outputs) == {f"node_{node}" for node in path} | {"graph_summary"}
    report = result.final_message.text_content()
    assert report.startswith("DynaClinic report (GATE: PASS)") and report.endswith(answer)
    assert "\n\nAnswer:\n" in report and "Assessment and plan:" not in report


def test_free_text_prompt_completes_without_a_final_answer(run) -> None:
    plan = "Draw blood cultures, then give IV ceftriaxone."
    result, executed, _ = run("A 70-year-old man has fever, hypotension and confusion.", **{PRIMARY_CARE: plan})
    assert executed == LOW_PATH
    report = result.final_message.text_content()
    assert report.startswith("DynaClinic report (GATE: PASS)") and report.endswith(plan)
    assert "FINAL ANSWER" not in report


def test_open_ended_scenario_is_reported_as_an_assessment_and_plan_not_a_letter(run) -> None:
    result, executed, client = run(COVID_PROMPT, **{PRIMARY_CARE: WRITE_UP})
    assert executed == LOW_PATH
    [(system, user)] = [(system, user) for role, system, user in client.prompts if role == PRIMARY_CARE]
    assert COVID_PROMPT in user and "FINAL ANSWER" not in system + user and "Options:" not in user
    assert [section for section in WRITE_UP_SECTIONS if f"\n{section}:" not in system] == []
    assert "RECOMMENDATION: <one sentence>" in system
    report = result.final_message.text_content()
    assert report.startswith("DynaClinic report (GATE: PASS)")
    assert report.endswith(f"\n\nAssessment and plan:\n{WRITE_UP}")
    assert "Answer:" not in report and "FINAL ANSWER" not in report
