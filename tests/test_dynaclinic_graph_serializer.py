"""Workflow graph serializer tests specific to the DynaClinic workflow and dc_* nodes."""

from pathlib import Path

from check.check import load_config
from dynaclinic.devall_nodes import default_model
from server.services.workflow_graph_serializer import serialize_design

DYNACLINIC_MVP = Path(__file__).resolve().parents[1] / "yaml_instance" / "dynaclinic_mvp.yaml"

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


class TestDynaClinicCharacters:
    def test_character_names_keep_words_and_capitals(self):
        agents = serialize_design(load_config(DYNACLINIC_MVP), filename="dynaclinic_mvp.yaml")["agent_nodes"]
        assert [a["label"] for a in agents] == [
            "Triage", "Primary Care", "Diagnostic Imaging", "Pathology/Lab", "Pharmacology", "Proponent", "Critic",
            "Synthesizer",
        ]

    def test_characters_carry_their_role_label(self):
        agents = serialize_design(load_config(DYNACLINIC_MVP), filename="dynaclinic_mvp.yaml")["agent_nodes"]
        assert {(a["node_id"], a.get("sub_agent")): a["role_label"] for a in agents} == {
            ("Triage", None): "Meta-Controller (complexity)",
            ("PrimaryCare", None): "Primary Care Agent",
            ("CareTeam", "imaging"): "Diagnostic Imaging",
            ("CareTeam", "pathology"): "Pathology/Lab",
            ("CareTeam", "pharmacology"): "Pharmacology",
            ("Proponent", None): "Proponent",
            ("Critic", None): "Clinical Critic (Opponent)",
            ("Synthesizer", None): "Consensus Builder / Mediator",
        }

    def test_llm_nodes_are_characters_and_care_team_has_three(self):
        result = serialize_design(load_config(DYNACLINIC_MVP), filename="dynaclinic_mvp.yaml")
        assert {n["id"]: n["is_agent"] for n in result["nodes"]} == {
            "CaseInput": False,
            "Triage": True,
            "GeneralistSweep": False,  # LLM call, but not agent_like: no 3D character
            "PrimaryCare": True,
            "CareTeam": True,
            "DivergenceGate": False,
            "MeshExchange": False,  # the Care Team's specialists talking: no second set of characters
            "Proponent": True,
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
            ("Proponent", None, 6),
            ("Critic", None, 7),
            ("Synthesizer", None, 8),
        ]
        assert [a["label"] for a in agents if a["node_id"] == "CareTeam"] == [
            "Diagnostic Imaging",
            "Pathology/Lab",
            "Pharmacology",
        ]


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
        monkeypatch.delenv("DYNACLINIC_MODEL", raising=False)
        monkeypatch.setenv("DYNACLINIC_FALLBACK_MODELS", " ,fb-model")
        assert default_model() == "fb-model"
        monkeypatch.delenv("DYNACLINIC_FALLBACK_MODELS")
        assert default_model() is None
