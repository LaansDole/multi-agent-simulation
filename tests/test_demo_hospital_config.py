"""demo_hospital: OpenAI wiring, and each day's admission reaching that day's summary and memory."""

import itertools
import json
from pathlib import Path
from types import SimpleNamespace

from check.check import load_config
from entity.configs.node.agent import AgentConfig
from entity.messages import Message, MessageRole
from runtime import sdk
from runtime.node.agent import ModelResponse, ProviderRegistry
from runtime.node.agent.memory.embedding import OpenAIEmbedding
from runtime.node.executor import loop_timer_executor

DEMO_HOSPITAL = Path(__file__).resolve().parent.parent / "yaml_instance" / "demo_hospital.yaml"

DUMMY_VARS = {
    "OPENAI_BASE_URL": "https://openai.test/v1",
    "OPENAI_API_KEY": "sk-openai-dummy",
    "BASE_URL": "http://lmstudio.test:1234/v1",
    "API_KEY": "lm-studio-dummy",
}


def test_demo_hospital_agents_and_embedder_use_openai() -> None:
    design = load_config(DEMO_HOSPITAL, vars_override=DUMMY_VARS)

    agents = [cfg for node in design.graph.nodes if (cfg := node.as_config(AgentConfig))]
    assert agents
    for agent in agents:
        assert (agent.name, agent.base_url, agent.api_key) == ("gpt-6-luna", "https://openai.test/v1", "sk-openai-dummy")

    embeddings = [store.config.embedding for store in design.graph.memory or [] if getattr(store.config, "embedding", None)]
    assert embeddings
    for embedding in embeddings:
        assert (embedding.provider, embedding.model, embedding.base_url, embedding.api_key) == (
            "openai",
            "text-embedding-3-small",
            "https://openai.test/v1",
            "sk-openai-dummy",
        )


PATIENTS = ["Maya Chen", "Omar Haddad", "Lena Novak"]


def _names_in(text: str) -> list[str]:
    return [name for name in PATIENTS if name in text]


def test_each_day_summary_and_memory_name_only_that_days_admission(tmp_path: Path, monkeypatch) -> None:
    summary_prompts: list[str] = []
    admitted = iter(PATIENTS)

    class ScriptedProvider:
        """Stands in for each agent, keyed by the agent's role; DailySummary names the patients it was shown."""

        def __init__(self, config: AgentConfig) -> None:
            self.role = config.role

        def create_client(self) -> None:
            return None

        def call_model(self, client: None, conversation: list[Message], *args, **kwargs) -> ModelResponse:
            seen = "\n".join(m.text_content() for m in conversation if m.role is not MessageRole.SYSTEM)
            if self.role.startswith("Generate a JSON object with patient data"):
                patient = {"patient_name": next(admitted), "age": 42, "condition": "appendicitis",
                           "severity": "medium", "admission_date": "2024-01-15"}
                text = json.dumps(patient)
            elif self.role.startswith("You received a patient admission report"):
                text = f"Acknowledged: {', '.join(_names_in(seen))} admitted."
            elif self.role.startswith("Generate a JSON array of 3 patients"):
                text = json.dumps([{"name": f"Queue {i}", "priority": "low", "wait_time": 5} for i in range(3)])
            elif self.role.startswith("You received a triage status report"):
                text = "Triage queue acknowledged."
            elif self.role.startswith("You received a hospital report"):
                summary_prompts.append(seen)
                names = _names_in(seen)
                text = f"Admitted today: {', '.join(names)}." if names else "No admissions noted today."
            else:
                text = "HOSPITAL SIMULATION - FINAL REPORT"
            return ModelResponse(message=Message(role=MessageRole.ASSISTANT, content=text))

    monkeypatch.setattr(ProviderRegistry, "get_provider", lambda _name: ScriptedProvider)
    monkeypatch.setattr(OpenAIEmbedding, "get_embedding", lambda self, text: [float(len(text) % 7 + 1), 1.0, 0.5])
    # LoopGate (60 s) sees 0 s, 30 s, 60 s on its three hits: two loop-backs, release on day 3.
    ticks = itertools.count(step=30.0)
    monkeypatch.setattr(loop_timer_executor, "time", SimpleNamespace(time=lambda: next(ticks)))
    monkeypatch.setattr(sdk, "OUTPUT_ROOT", tmp_path)

    result = sdk.run_workflow(DEMO_HOSPITAL, task_prompt="run the hospital", session_name="admissions",
                              variables=DUMMY_VARS)

    assert [_names_in(prompt) for prompt in summary_prompts] == [[name] for name in PATIENTS]
    memory = json.loads((Path(result.meta_info.output_dir) / "daily_summaries.json").read_text())
    # FinalReport also writes its report to this store (default write: true); only DailySummary's items are days.
    days = [item for item in memory if item["metadata"]["agent_role"].startswith("You received a hospital report")]
    assert [_names_in(item["content_summary"]) for item in days] == [[name] for name in PATIENTS]
