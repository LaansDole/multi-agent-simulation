"""DevAll node types: registration, schema export, configs and executors over the shared pipeline stages."""

import json
from collections.abc import Callable, Iterator
from unittest.mock import Mock

import pytest

from dynaclinic.devall_nodes import STATE_KEY, case_from_text
from dynaclinic.llm import FakeLLM, LLMError, set_client_factory
from dynaclinic.parsing import first_line_marker
from dynaclinic.pipeline import BLOCKED_PREFIX, CaseRun
from dynaclinic.prompts import (
    CRITIC,
    IMAGING,
    PATHOLOGY,
    PHARMACOLOGY,
    PRIMARY_CARE,
    SYNTHESIZER,
    TRIAGE,
)
from dynaclinic.types import Case
from entity.configs import ConfigError, Node
from entity.messages import Message, MessageRole
from runtime.bootstrap.schema import ensure_schema_registry_populated
from runtime.node.executor.base import ExecutionContext
from runtime.node.registry import iter_node_registrations
from tests.dynaclinic_fixtures import no_network  # noqa: F401
from tests.test_dynaclinic_pipeline import (
    CASE,
    FOR_A,
    SCRIPT,
    UNSAFE_ANSWER,
    UNSAFE_CLAIM,
    _specialist,
    _triage,
)
from utils.schema_exporter import build_schema_response

NODE_TYPES = (
    "dc_triage", "dc_primary_care", "dc_care_team", "dc_divergence_gate", "dc_critic", "dc_synthesizer",
    "dc_safety_gate",
)
CASE_JSON = json.dumps(CASE.to_dict())
SEPSIS_TEXT = "A 70-year-old man has fever, hypotension and confusion."
Build = Callable[..., "Harness"]


class Harness:
    """Runs DynaClinic nodes in one ``ExecutionContext`` the way the DevAll graph does, against a FakeLLM."""

    def __init__(self, script: object) -> None:
        self.client = FakeLLM(script)
        self.models: list[list[str] | None] = []
        self.context = ExecutionContext(tool_manager=Mock(), function_manager=Mock(), log_manager=Mock())

    def factory(self, models: list[str] | None) -> FakeLLM:
        self.models.append(models)
        return self.client

    def run(self, node_type: str, text: str = "", **config: object) -> str:
        node = Node.from_dict({"id": node_type, "type": node_type, "config": config}, path="graph.nodes")
        executor = iter_node_registrations()[node_type].build_executor(self.context)
        inputs = [Message(role=MessageRole.USER, content=text)] if text else []
        [message] = executor.execute(node, inputs)
        return message.text_content()

    @property
    def run_state(self) -> CaseRun:
        return self.context.global_state[STATE_KEY].run


@pytest.fixture
def harness() -> Iterator[Build]:
    """Yield a ``Harness`` builder whose FakeLLM is installed through ``set_client_factory``."""
    ensure_schema_registry_populated()

    def build(**overrides: object) -> Harness:
        h = Harness({**SCRIPT, **overrides})
        set_client_factory(h.factory)
        return h

    yield build
    set_client_factory(None)


def test_registry_and_schema_export_include_the_seven_node_types() -> None:
    ensure_schema_registry_populated()
    assert set(NODE_TYPES) <= iter_node_registrations().keys()
    crumbs = [{"node": "DesignConfig", "field": "graph"}, {"node": "GraphDefinition", "field": "nodes"}]
    type_field = next(f for f in build_schema_response(crumbs)["fields"] if f["name"] == "type")
    assert set(NODE_TYPES) <= set(type_field["enum"])
    triage_fields = build_schema_response([*crumbs, {"node": "Node", "field": "config", "value": "dc_triage"}])
    assert {"model", "fallback_models", "escalate_threshold"} <= {f["name"] for f in triage_fields["fields"]}
    for node_type in ("dc_care_team", "dc_synthesizer"):
        fields = build_schema_response([*crumbs, {"node": "Node", "field": "config", "value": node_type}])["fields"]
        assert "context_policy" in {f["name"] for f in fields}, node_type


def test_configs_default_to_the_env_model_chain() -> None:
    ensure_schema_registry_populated()
    config = Node.from_dict({"id": "g", "type": "dc_safety_gate", "config": {}}, path="n").config
    assert (config.model, config.fallback_models, config.max_rollbacks) == (None, [], 1)
    assert Node.from_dict({"id": "d", "type": "dc_divergence_gate", "config": {}}, path="n").config.tau == 0.25


@pytest.mark.parametrize(
    ("node_type", "config"),
    [
        ("dc_divergence_gate", {"tau": 1.5}),
        ("dc_primary_care", {"pca_samples": 0}),
        ("dc_safety_gate", {"max_rollbacks": -1}),
        ("dc_triage", {"escalate_threshold": "high"}),
        ("dc_care_team", {"fallback_models": ["gpt-5.6-luna"]}),
        ("dc_critic", {"fallback_models": "gpt-5.6-luna", "model": "gpt-6-luna"}),
        ("dc_care_team", {"context_policy": "loose"}),
        ("dc_synthesizer", {"context_policy": 1}),
    ],
)
def test_invalid_config_is_a_config_error(node_type: str, config: dict) -> None:
    ensure_schema_registry_populated()
    with pytest.raises(ConfigError):
        Node.from_dict({"id": "n", "type": node_type, "config": config}, path="n")


def test_case_from_text_reads_case_json_or_falls_back_to_free_text() -> None:
    assert case_from_text(CASE_JSON) == CASE
    partial = case_from_text(json.dumps({"vignette": "v", "question": "q?", "options": [{"letter": "A", "text": "x"}]}))
    assert (partial.letters(), partial.answer, partial.source) == (["A"], "", "devall")
    free = case_from_text(f"  {SEPSIS_TEXT}\n")
    assert (free.vignette, free.options, free.source) == (SEPSIS_TEXT, [], "devall")
    assert case_from_text('{"vignette": "no options key"}').vignette == '{"vignette": "no options key"}'


def test_low_path_emits_markers_and_shares_state(harness: Build) -> None:
    h = harness()
    assert first_line_marker(h.run("dc_triage", CASE_JSON), "ROUTE") == "LOW"
    care = h.run("dc_primary_care")
    assert care.splitlines()[0] == "STAGE: primary_care" and care.endswith("FINAL ANSWER: B")
    assert first_line_marker(h.run("dc_safety_gate"), "GATE") == "PASS"
    result = h.run_state.result
    assert result.route == ["ingest", "triage:LOW", "primary_care", "safety_gate:pass"]
    assert [call.role for call in result.calls] == [TRIAGE, PRIMARY_CARE]
    assert result.final_answer == "B" and not result.blocked


def test_high_disagreeing_team_goes_adversarial_through_critic(harness: Build) -> None:
    h = harness(triage=_triage("HIGH"), imaging=_specialist(FOR_A, UNSAFE_CLAIM))
    assert first_line_marker(h.run("dc_triage", CASE_JSON), "ROUTE") == "HIGH"
    assert h.run("dc_care_team").splitlines()[0] == "STAGE: care_team"
    assert first_line_marker(h.run("dc_divergence_gate"), "MODE") == "ADVERSARIAL"
    critic = h.run("dc_critic")
    assert critic.splitlines()[0] == "STAGE: critic" and UNSAFE_CLAIM in critic
    assert h.run("dc_synthesizer").splitlines()[0] == "STAGE: synthesizer"
    assert first_line_marker(h.run("dc_safety_gate"), "GATE") == "PASS"
    route = h.run_state.result.route
    assert route[2] == "care_team:imaging,pathology,pharmacology"
    assert route[3].endswith(":switch") and route[4:] == ["critic", "synthesizer", "safety_gate:pass"]


def test_high_agreeing_team_is_collaborative(harness: Build) -> None:
    h = harness(triage=_triage("HIGH"))
    h.run("dc_triage", CASE_JSON)
    h.run("dc_care_team")
    assert first_line_marker(h.run("dc_divergence_gate", tau=0.5), "MODE") == "COLLABORATIVE"
    assert CRITIC not in [call.role for call in h.run_state.result.calls]


def test_divergence_gate_shows_an_abstaining_specialist_without_counting_its_vote(harness: Build) -> None:
    h = harness(triage=_triage("HIGH"), imaging=_specialist(dict.fromkeys("ABC", 1 / 3)))
    h.run("dc_triage", CASE_JSON)
    h.run("dc_care_team")
    gate = h.run("dc_divergence_gate")
    assert first_line_marker(gate, "MODE") == "COLLABORATIVE"
    assert "imaging A (abstains)" in gate and "pathology B," in gate


@pytest.mark.parametrize(
    ("config", "sees_case"),
    [({}, True), ({"context_policy": "shared_core"}, True), ({"context_policy": "strict"}, False)],
)
def test_care_team_and_synthesizer_follow_their_context_policy(harness: Build, config: dict, sees_case: bool) -> None:
    h = harness(triage=_triage("HIGH"))
    h.run("dc_triage", CASE_JSON)
    h.run("dc_care_team", **config)
    h.run("dc_divergence_gate")
    h.run("dc_synthesizer", **config)
    seen = {role: "Tonsillar exudates" in user for role, _, user in h.client.prompts if role != TRIAGE}
    assert seen == dict.fromkeys((IMAGING, PATHOLOGY, PHARMACOLOGY, SYNTHESIZER), sees_case)


@pytest.mark.parametrize(("max_rollbacks", "synthesizer_calls"), [(1, 1), (0, 0)])
def test_blocked_gate_regenerates_then_labels_manual_review(
    harness: Build, max_rollbacks: int, synthesizer_calls: int
) -> None:
    h = harness(primary_care=UNSAFE_ANSWER, synthesizer=UNSAFE_ANSWER)
    h.run("dc_triage", CASE_JSON)
    h.run("dc_primary_care")
    gate = h.run("dc_safety_gate", max_rollbacks=max_rollbacks)
    assert first_line_marker(gate, "GATE") == "BLOCKED" and BLOCKED_PREFIX in gate and "T_SAD" in gate
    assert [call.role for call in h.run_state.result.calls].count(SYNTHESIZER) == synthesizer_calls


def test_free_text_case_has_optional_final_answer_and_text_only_gates(harness: Build) -> None:
    h = harness(primary_care="Give IV ceftriaxone now, then draw blood cultures.",
                synthesizer="Draw blood cultures, then give IV ceftriaxone.")
    assert first_line_marker(h.run("dc_triage", SEPSIS_TEXT), "ROUTE") == "LOW"
    h.run("dc_primary_care")
    assert first_line_marker(h.run("dc_safety_gate"), "GATE") == "PASS"
    result = h.run_state.result
    assert result.route[-4:] == ["primary_care", "safety_gate:blocked", "regenerate", "safety_gate:pass"]
    assert result.final_answer is None and result.warnings == []


def test_free_text_team_without_distributions_runs_the_adversarial_path(harness: Build) -> None:
    findings = json.dumps({"findings": ["hypotension with fever"], "claims": ["Septic shock is likely"]})
    h = harness(triage=_triage("HIGH"), imaging=findings, pathology=findings, pharmacology=findings,
                synthesizer="Draw blood cultures, then start IV ceftriaxone and fluids.")
    h.run("dc_triage", SEPSIS_TEXT)
    h.run("dc_care_team")
    assert len(h.run_state.board) == 3
    gate = h.run("dc_divergence_gate")
    assert first_line_marker(gate, "MODE") == "ADVERSARIAL" and "not measurable" in gate
    h.run("dc_critic")
    h.run("dc_synthesizer")
    assert first_line_marker(h.run("dc_safety_gate"), "GATE") == "PASS"
    result = h.run_state.result
    assert result.divergence is None and result.final_answer is None and result.error is None
    assert result.route[3:] == ["divergence:n/a:switch", "critic", "synthesizer", "safety_gate:pass"]


def test_all_specialists_failing_raises_and_records_the_error(harness: Build) -> None:
    broken = {role: "I cannot help with that." for role in (IMAGING, PATHOLOGY, PHARMACOLOGY)}
    h = harness(triage=_triage("HIGH"), **broken)
    h.run("dc_triage", CASE_JSON)
    with pytest.raises(LLMError, match="all specialists failed"):
        h.run("dc_care_team")
    result = h.run_state.result
    assert result.error == "all specialists failed" and result.route[-1] == "care_team:failed"
    assert sorted(call.role for call in result.calls) == sorted([TRIAGE, IMAGING, PATHOLOGY, PHARMACOLOGY])


def test_model_config_builds_one_client_per_chain_per_run(harness: Build) -> None:
    h = harness()
    h.run("dc_triage", CASE_JSON, model="gpt-6-luna", fallback_models=["gpt-5.6-luna"])
    h.run("dc_primary_care", model="gpt-6-luna", fallback_models=["gpt-5.6-luna"])
    h.run("dc_safety_gate")
    assert h.models == [["gpt-6-luna", "gpt-5.6-luna"], None]


def test_triage_starts_a_fresh_case_run(harness: Build) -> None:
    h = harness()
    h.run("dc_triage", CASE_JSON)
    first = h.run_state
    h.run("dc_triage", SEPSIS_TEXT)
    assert h.run_state is not first and isinstance(h.run_state.case, Case)
    assert (h.run_state.case.vignette, h.run_state.case.options) == (SEPSIS_TEXT, [])
    assert h.run_state.result.route == ["ingest", "triage:LOW"]
