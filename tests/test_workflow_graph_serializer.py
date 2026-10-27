"""Unit tests for the workflow graph serializer."""

from pathlib import Path

import pytest

from check.check import load_config
from server.services.workflow_graph_serializer import serialize_design

DYNACLINIC_MVP = Path(__file__).resolve().parents[1] / "yaml_instance" / "dynaclinic_mvp.yaml"

# Minimal workflow that passes load_config with concrete (non-${VAR}) values
# so validation does not depend on environment variables.
MINIMAL_YAML = """\
version: 0.0.0
vars: {}
graph:
  id: minimal_graph
  description: A minimal two-node workflow for serializer tests.
  is_majority_voting: false
  nodes:
    - id: starter
      type: literal
      config:
        content: begin
        role: user
      description: Start node
      context_window: 0
      log_output: true
    - id: worker
      type: agent
      config:
        provider: openai
        name: test-model
        role: Do the work and report back.
        base_url: http://localhost
        api_key: sk-test
        params: {}
        tooling: null
        thinking: null
        memories: []
      description: The worker agent
      context_window: 0
      log_output: true
  edges:
    - from: starter
      to: worker
      trigger: true
      carry_data: true
  start:
    - starter
  end:
    - worker
"""


@pytest.fixture()
def design(tmp_path: Path) -> object:
    yaml_path = tmp_path / "minimal.yaml"
    yaml_path.write_text(MINIMAL_YAML, encoding="utf-8")
    return load_config(yaml_path)


class TestSerializeDesign:
    def test_top_level_fields(self, design):
        result = serialize_design(design, filename="minimal.yaml")
        assert result["filename"] == "minimal.yaml"
        assert result["version"] == "0.0.0"
        assert result["graph_id"] == "minimal_graph"
        assert result["is_majority_voting"] is False
        assert result["start"] == ["starter"]
        assert result["end"] == ["worker"]

    def test_node_types_catalog_includes_builtins(self, design):
        result = serialize_design(design, filename="minimal.yaml")
        nt = result["node_types"]
        assert "agent" in nt
        assert "literal" in nt
        assert isinstance(nt["agent"], str)

    def test_nodes_preserve_yaml_order_and_types(self, design):
        result = serialize_design(design, filename="minimal.yaml")
        ids = [n["id"] for n in result["nodes"]]
        assert ids == ["starter", "worker"]
        starter = result["nodes"][0]
        assert starter["type"] == "literal"
        assert starter["is_agent"] is False
        assert starter["config_summary"] is None
        assert starter["label"] == "Starter"  # titleize("starter")

    def test_agent_node_config_summary(self, design):
        result = serialize_design(design, filename="minimal.yaml")
        worker = result["nodes"][1]
        assert worker["is_agent"] is True
        summary = worker["config_summary"]
        assert summary["provider"] == "openai"
        assert summary["model"] == "test-model"
        assert summary["has_tooling"] is False
        assert summary["has_memory"] is False
        assert summary["has_thinking"] is False

    def test_agent_nodes_convenience_list_with_slots(self, design):
        result = serialize_design(design, filename="minimal.yaml")
        # A plain agent entry carries no sub_agent key (shape unchanged for agent workflows).
        assert result["agent_nodes"] == [{"node_id": "worker", "label": "Worker", "proposed_slot": 1}]

    def test_dynaclinic_llm_nodes_are_characters_and_care_team_has_three(self):
        design = load_config(DYNACLINIC_MVP)
        result = serialize_design(design, filename="dynaclinic_mvp.yaml")
        assert {n["id"]: n["is_agent"] for n in result["nodes"]} == {
            "CaseInput": False,
            "Triage": True,
            "GeneralistSweep": False,  # LLM call, but no 3D character: the seven slots are taken
            "PrimaryCare": True,
            "CareTeam": True,
            "DivergenceGate": False,
            "Critic": True,
            "Synthesizer": True,
            "SafetyGate": False,
            "Report": False,
        }
        agents = result["agent_nodes"]
        assert [(a["node_id"], a.get("sub_agent"), a["proposed_slot"]) for a in agents] == [
            ("Triage", None, 1),
            ("PrimaryCare", None, 2),
            ("CareTeam", "imaging", 3),
            ("CareTeam", "pathology", 4),
            ("CareTeam", "pharmacology", 5),
            ("Critic", None, 6),
            ("Synthesizer", None, 7),
        ]
        assert [a["label"] for a in agents if a["node_id"] == "CareTeam"] == [
            "Diagnostic Imaging",
            "Pathology/Lab",
            "Pharmacology",
        ]

    def test_eighth_agent_gets_null_slot(self, tmp_path):
        nodes_yaml = "\n".join(
            f"    - id: agent_{i}\n      type: agent\n      config:\n"
            f"        provider: openai\n        name: m{i}\n        role: r{i}\n"
            f"        base_url: http://localhost\n        api_key: sk-test\n"
            f"        params: {{}}\n        tooling: null\n        thinking: null\n        memories: []\n"
            for i in range(8)
        )
        many_yaml = (
            "version: 0.0.0\nvars: {}\ngraph:\n  id: many\n  is_majority_voting: false\n"
            f"  nodes:\n{nodes_yaml}\n  start:\n    - agent_0\n  end:\n    - agent_7\n"
        )
        p = tmp_path / "many.yaml"
        p.write_text(many_yaml, encoding="utf-8")
        many_design = load_config(p)
        result = serialize_design(many_design, filename="many.yaml")
        slots = [a["proposed_slot"] for a in result["agent_nodes"]]
        assert slots == [1, 2, 3, 4, 5, 6, 7, None]

    def test_edges_serialized(self, design):
        result = serialize_design(design, filename="minimal.yaml")
        assert len(result["edges"]) == 1
        e = result["edges"][0]
        assert e["from"] == "starter"
        assert e["to"] == "worker"
        assert e["trigger"] is True
        assert e["carry_data"] is True
        assert e["is_dynamic"] is False


PINNED_DC_YAML = """\
version: 0.0.0
vars: {}
graph:
  id: pinned_dc
  description: One DynaClinic node with an explicit model.
  is_majority_voting: false
  nodes:
    - id: Triage
      type: dc_triage
      config:
        model: pinned-model
  edges: []
  start:
    - Triage
  end:
    - Triage
"""


class TestDynaClinicModelSummary:
    def test_dc_agent_nodes_use_env_model(self, monkeypatch):
        design = load_config(DYNACLINIC_MVP)
        monkeypatch.setenv("DYNACLINIC_MODEL", "env-model")
        nodes = serialize_design(design, filename="dynaclinic_mvp.yaml")["nodes"]
        dc_agents = [n for n in nodes if n["is_agent"] and n["type"].startswith("dc_")]
        assert dc_agents
        for n in dc_agents:
            assert n["config_summary"]["provider"] == "openai"
            assert n["config_summary"]["model"] == "env-model"
        assert all(n["config_summary"] is None for n in nodes if not n["is_agent"])

    def test_explicit_model_wins_over_env(self, tmp_path, monkeypatch):
        p = tmp_path / "pinned.yaml"
        p.write_text(PINNED_DC_YAML, encoding="utf-8")
        design = load_config(p)
        monkeypatch.setenv("DYNACLINIC_MODEL", "env-model")
        summary = serialize_design(design, filename="pinned.yaml")["nodes"][0]["config_summary"]
        assert summary["model"] == "pinned-model"

    def test_default_model_env_fallback_chain(self, monkeypatch):
        from dynaclinic.devall_nodes import default_model

        monkeypatch.delenv("DYNACLINIC_MODEL", raising=False)
        monkeypatch.setenv("DYNACLINIC_FALLBACK_MODELS", " ,fb-model")
        assert default_model() == "fb-model"
        monkeypatch.delenv("DYNACLINIC_FALLBACK_MODELS")
        assert default_model() is None
