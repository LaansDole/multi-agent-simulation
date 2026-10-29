"""yaml_instance/dynaclinic_hospital.yaml: two simulated days, one DynaClinic consult subgraph run per day (offline)."""

import json
from pathlib import Path

import pytest

from dynaclinic.llm import FakeLLM, set_client_factory
from dynaclinic.prompts import PRIMARY_CARE, TRIAGE
from entity.configs.node.agent import AgentConfig
from entity.messages import Message, MessageRole
from runtime import sdk
from runtime.node.agent import ModelResponse, ProviderRegistry
from runtime.node.agent.memory.embedding import OpenAIEmbedding
from tests.dynaclinic_fixtures import no_network  # noqa: F401
from tests.test_demo_hospital_config import DUMMY_VARS
from tests.test_dynaclinic_pipeline import SCRIPT

WORKFLOW = Path(__file__).resolve().parents[1] / "yaml_instance" / "dynaclinic_hospital.yaml"
PATIENTS = [
    {"patient_name": "Ana Ruiz", "age": 34, "sex": "female", "chief_complaint": "right lower abdominal pain for 18 hours",
     "history_of_present_illness": "Pain began around the navel and moved to the right lower abdomen; nausea.",
     "vitals": "BP 124/78, HR 102, RR 18, T 38.1 C, SpO2 98%", "history": [], "medications": [],
     "allergies": ["penicillin (rash)"], "exam": "Right lower quadrant guarding.", "labs": ["WBC 14.2 x10^9/L"]},
    {"patient_name": "Ben Okafor", "age": 71, "sex": "male", "chief_complaint": "productive cough and fever for 4 days",
     "history_of_present_illness": "Rusty sputum and right-sided pleuritic chest pain.",
     "vitals": "BP 108/66, HR 112, RR 26, T 39.0 C, SpO2 90%", "history": ["COPD"], "medications": ["tiotropium"],
     "allergies": [], "exam": "Right basal crackles.", "labs": ["CRP 180 mg/L"],
     "imaging": ["Chest radiograph: right lower zone opacity"]},
]
WRITE_UP = """ASSESSMENT: Scripted leading diagnosis.
PLAN: Scripted plan.
RECOMMENDATION: Admit and treat as planned."""


def test_two_days_each_run_one_fresh_consult_whose_report_reaches_the_daily_summary(tmp_path: Path, monkeypatch) -> None:
    admitted = iter(PATIENTS)
    summary_prompts: list[str] = []
    final_prompts: list[str] = []

    class ScriptedProvider:
        """Stands in for each hospital agent, keyed by its role; DailySummary records what it was shown."""

        def __init__(self, config: AgentConfig) -> None:
            self.role = config.role

        def create_client(self) -> None:
            return None

        def call_model(self, client: None, conversation: list[Message], *args, **kwargs) -> ModelResponse:
            seen = "\n".join(m.text_content() for m in conversation if m.role is not MessageRole.SYSTEM)
            if self.role.startswith("You are the admissions desk"):
                text = json.dumps(next(admitted))
            elif self.role.startswith("Generate a JSON array of 3 patients"):
                text = json.dumps([{"name": f"Queue {i}", "priority": "low", "wait_time": 5} for i in range(3)])
            elif self.role.startswith("You received a triage status report"):
                text = "Triage queue acknowledged."
            elif self.role.startswith("You received the hospital report for one simulation day"):
                summary_prompts.append(seen)
                n = len(summary_prompts)
                text = f"Day {n}\nPatient: ...\n{'Plan: noted. ' * 50}END OF DAY {n}"
            else:
                final_prompts.append("\n".join(m.text_content() for m in conversation))
                text = "HOSPITAL SIMULATION - FINAL REPORT"
            return ModelResponse(message=Message(role=MessageRole.ASSISTANT, content=text))

    client = FakeLLM({**SCRIPT, PRIMARY_CARE: WRITE_UP})
    set_client_factory(lambda models: client)
    monkeypatch.setattr(ProviderRegistry, "get_provider", lambda _name: ScriptedProvider)
    monkeypatch.setattr(OpenAIEmbedding, "get_embedding", lambda self, text: pytest.fail("no embedder is configured"))
    monkeypatch.setattr(sdk, "OUTPUT_ROOT", tmp_path)
    try:
        result = sdk.run_workflow(WORKFLOW, task_prompt="Run the hospital", session_name="dc_hospital",
                                  variables=DUMMY_VARS)
    finally:
        set_client_factory(None)

    logs = json.loads((Path(result.meta_info.output_dir) / "execution_logs.json").read_text())["logs"]
    started = [log["node_id"] for log in logs if log["event_type"] == "NODE_START"]
    assert started.count("DynaClinicConsult") == 2 and started.count("DailySummary") == 2
    # Each consult starts its own case from that day's presentation only.
    triaged = [user for role, _system, user in client.prompts if role == TRIAGE]
    assert [[p["chief_complaint"] in case for p in PATIENTS] for case in triaged] == [[True, False], [False, True]]
    for day, (prompt, patient, other) in enumerate(zip(summary_prompts, PATIENTS, reversed(PATIENTS)), start=1):
        assert f"Day {day}:" in prompt and patient["patient_name"] in prompt and other["patient_name"] not in prompt
        assert "DynaClinic report (GATE: PASS)" in prompt and "Meta-Controller: MODE " in prompt
        assert prompt.count("DynaClinic report (") == 1 and "\n\nAssessment and plan:\n" in prompt
    # FinalReport reads every day's whole summary from memory.
    [final] = final_prompts
    assert "END OF DAY 1" in final and "END OF DAY 2" in final
    assert result.final_message.text_content().startswith("HOSPITAL SIMULATION - FINAL REPORT")
