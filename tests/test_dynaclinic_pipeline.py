"""DynaClinic pipelines with scripted FakeLLM: routing, switching, gate regeneration, cache, baselines."""

import json
from collections import Counter

import pytest

from dynaclinic.interfaces import InMemorySemanticCache
from dynaclinic.llm import FakeLLM, LLMError
from dynaclinic.pipeline import (
    BLOCKED_PREFIX,
    DynaClinicPipeline,
    SingleAgentPipeline,
    StaticTeamPipeline,
)
from dynaclinic.prompts import (
    CRITIC,
    CRITIC_JUDGE,
    IMAGING,
    PATHOLOGY,
    PHARMACOLOGY,
    PRIMARY_CARE,
    SINGLE_AGENT,
    SYNTHESIZER,
    TRIAGE,
)
from dynaclinic.types import Case, Option, RunResult
from tests.dynaclinic_fixtures import no_network  # noqa: F401

CASE = Case(
    id="strep",
    source="synthetic",
    vignette=(
        "A 19-year-old woman has 2 days of sore throat and fever. Tonsillar exudates are present and a rapid "
        "streptococcal antigen test is positive. She had anaphylaxis after penicillin as a child."
    ),
    question="Which is the most appropriate treatment?",
    options=[Option("A", "Oral amoxicillin"), Option("B", "Oral azithromycin"), Option("C", "No antibiotic")],
    answer="B",
    structured={
        "demographics": {"age": 19, "sex": "female"},
        "allergies": ["penicillin (anaphylaxis)"],
        "labs": [{"name": "rapid streptococcal antigen test", "value": "positive"}],
    },
    unsafe_options=["A"],
)
FOR_B = {"A": 0.05, "B": 0.9, "C": 0.05}
FOR_A = {"A": 0.9, "B": 0.05, "C": 0.05}
UNSAFE_CLAIM = "Oral amoxicillin is first-line therapy"
SAFE_ANSWER = "Azithromycin avoids penicillin exposure.\nFINAL ANSWER: B"
UNSAFE_ANSWER = "The first option is standard therapy.\nFINAL ANSWER: A"


def _triage(tier: str) -> str:
    return json.dumps({"tier": tier, "rationale": "scripted", "features": {"organ_systems": 1}})


def _specialist(dist: dict[str, float], claim: str = "Azithromycin avoids the penicillin allergy") -> str:
    return json.dumps({"findings": ["scripted finding"], "distribution": dist, "claims": [claim]})


SCRIPT = {
    TRIAGE: _triage("LOW"),
    PRIMARY_CARE: "Facts and risks of each option.\nFINAL ANSWER: B",
    IMAGING: _specialist(FOR_B),
    PATHOLOGY: _specialist(FOR_B),
    PHARMACOLOGY: _specialist(FOR_B),
    CRITIC: json.dumps({"claims": [{"text": UNSAFE_CLAIM, "agent": IMAGING},
                                   {"text": "The rapid streptococcal antigen test is positive", "agent": PATHOLOGY}]}),
    CRITIC_JUDGE: json.dumps({"claims": [{"id": i, "logits": {"supported": 2.0, "unsupported": 0.0,
                                                              "fabrication": 0.0, "contradiction": 0.0}}
                                         for i in (1, 2)]}),
    SYNTHESIZER: SAFE_ANSWER,
    SINGLE_AGENT: "FINAL ANSWER: B",
}


def _client(**overrides: str | list[str]) -> FakeLLM:
    return FakeLLM({**SCRIPT, **overrides})


def _failing(role: str, **overrides: str | list[str]) -> FakeLLM:
    replies = {**SCRIPT, **overrides}

    def script(called: str, system: str, user: str) -> str:
        if called == role:
            raise LLMError(f"{role}: scripted outage")
        return replies[called]

    return FakeLLM(script)


def _stages(result: RunResult) -> list[str]:
    return [step for step in result.route if not step.startswith("planner:")]


def _roles(result: RunResult) -> Counter:
    return Counter(call.role for call in result.calls)


def _prompts(client: FakeLLM, role: str) -> list[str]:
    return [user for called, _, user in client.prompts if called == role]


def test_low_path_calls_only_triage_and_primary_care() -> None:
    result = DynaClinicPipeline(_client()).run(CASE)
    assert _stages(result) == ["ingest", "cache_lookup:off", "triage:LOW", "primary_care", "safety_gate:pass"]
    assert [call.role for call in result.calls] == [TRIAGE, PRIMARY_CARE]
    assert (result.tier, result.mode, result.final_answer) == ("LOW", "single", "B")
    assert result.triage["llm_tier"] == "LOW" and result.triage["deterministic_tier"] == "LOW"
    assert not result.blocked and result.error is None
    planner_actions = [step.split(":")[1] for step in result.route if step.startswith("planner:")]
    assert planner_actions == ["retrieval", "agent_call", "agent_call", "agent_call", "terminal"]


def test_primary_care_samples_are_majority_voted() -> None:
    client = _client(primary_care=["FINAL ANSWER: C", "FINAL ANSWER: B", "FINAL ANSWER: B"])
    result = DynaClinicPipeline(client, pca_samples=3).run(CASE)
    assert _roles(result)[PRIMARY_CARE] == 3
    assert result.final_answer == "B"


def test_high_agreeing_team_is_collaborative_without_critic() -> None:
    client = _client(triage=_triage("HIGH"))
    result = DynaClinicPipeline(client).run(CASE)
    assert _roles(result) == Counter({TRIAGE: 1, IMAGING: 1, PATHOLOGY: 1, PHARMACOLOGY: 1, SYNTHESIZER: 1})
    assert _stages(result) == [
        "ingest", "cache_lookup:off", "triage:HIGH", "care_team:imaging,pathology,pharmacology",
        "divergence:0.00:stay", "synthesizer", "safety_gate:pass",
    ]
    assert result.mode == "collaborative" and result.switch is False and result.divergence < 0.25
    assert set(result.distributions) == {IMAGING, PATHOLOGY, PHARMACOLOGY}
    assert "Conflict set" not in _prompts(client, SYNTHESIZER)[0]


def test_high_disagreeing_team_switches_to_adversarial_critic() -> None:
    client = _client(triage=_triage("HIGH"), imaging=_specialist(FOR_A, UNSAFE_CLAIM))
    result = DynaClinicPipeline(client).run(CASE)
    assert _roles(result) == Counter(
        {TRIAGE: 1, IMAGING: 1, PATHOLOGY: 1, PHARMACOLOGY: 1, CRITIC: 1, CRITIC_JUDGE: 1, SYNTHESIZER: 1}
    )
    stages = _stages(result)
    assert stages[4].startswith("divergence:") and stages[4].endswith(":switch")
    assert stages[5:] == ["critic", "synthesizer", "safety_gate:pass"]
    assert result.mode == "adversarial" and result.switch is True and result.disagreement is True
    assert result.top1 == {IMAGING: "A", PATHOLOGY: "B", PHARMACOLOGY: "B"}
    assert result.conflict_set == ["A", "B"]
    assert any(UNSAFE_CLAIM in claim for claim in result.flagged_claims)
    resolution = _prompts(client, SYNTHESIZER)[0]
    assert "Conflict set: A, B" in resolution
    assert all(claim in resolution for claim in result.flagged_claims)
    assert RunResult.from_dict(json.loads(json.dumps(result.to_dict()))) == result


def test_moderate_team_uses_two_specialists_including_pharmacology_for_allergies() -> None:
    result = DynaClinicPipeline(_client(triage=_triage("MODERATE"))).run(CASE)
    assert "care_team:pathology,pharmacology" in _stages(result)
    assert IMAGING not in _roles(result)


def test_gate_block_triggers_one_regeneration_that_can_clear_it() -> None:
    client = _client(triage=_triage("HIGH"), synthesizer=[UNSAFE_ANSWER, SAFE_ANSWER])
    result = DynaClinicPipeline(client).run(CASE)
    assert _stages(result)[-4:] == ["synthesizer", "safety_gate:blocked", "regenerate", "safety_gate:pass"]
    assert "planner:backtrack" in " ".join(result.route)
    assert (result.final_answer, result.blocked) == ("B", False)
    violation = "allergy (contraindicated): amoxicillin"
    assert violation not in _prompts(client, SYNTHESIZER)[0]
    assert violation in _prompts(client, SYNTHESIZER)[1]


def test_gate_still_failing_after_regeneration_blocks_for_manual_review() -> None:
    client = _client(triage=_triage("HIGH"), synthesizer=UNSAFE_ANSWER)
    result = DynaClinicPipeline(client).run(CASE)
    assert _roles(result)[SYNTHESIZER] == 2
    assert result.blocked is True
    assert result.final_text.startswith(BLOCKED_PREFIX)
    assert result.final_answer == "A"
    assert not next(g for g in result.gates if g.name == "T_SAD").passed


def test_cache_hit_returns_verified_answer_with_zero_calls() -> None:
    pipeline = DynaClinicPipeline(_client(), cache=InMemorySemanticCache())
    first = pipeline.run(CASE)
    second = pipeline.run(CASE)
    assert first.calls and not first.cache_hit
    assert second.calls == [] and second.cache_hit
    assert "cache_hit" in second.route
    assert second.final_answer == "B" and not second.blocked


def test_blocked_result_is_never_cached() -> None:
    pipeline = DynaClinicPipeline(_client(triage=_triage("HIGH"), synthesizer=UNSAFE_ANSWER),
                                  cache=InMemorySemanticCache())
    pipeline.run(CASE)
    assert pipeline.run(CASE).calls


def test_cached_answer_failing_this_patients_gates_is_rejected() -> None:
    no_allergy = Case.from_dict({**CASE.to_dict(), "id": "strep-2", "structured": {}, "unsafe_options": []})
    client = _client(primary_care=["FINAL ANSWER: A", "FINAL ANSWER: B"])
    pipeline = DynaClinicPipeline(client, cache=InMemorySemanticCache(threshold=0.0))
    assert pipeline.run(no_allergy).final_answer == "A"
    result = pipeline.run(CASE)
    assert "cache_lookup:rejected" in result.route and not result.cache_hit
    assert result.final_answer == "B" and result.calls


def test_static_team_always_runs_critic() -> None:
    result = StaticTeamPipeline(_client()).run(CASE)
    assert TRIAGE not in _roles(result)
    assert _roles(result)[CRITIC] == 1 and _roles(result)[CRITIC_JUDGE] == 1
    assert _stages(result) == [
        "ingest", "care_team:imaging,pathology,pharmacology", "divergence:0.00:stay",
        "critic", "synthesizer", "safety_gate:pass",
    ]
    assert (result.tier, result.mode, result.final_answer) == (None, "adversarial", "B")


@pytest.mark.parametrize("broken", ["raise", "malformed"])
def test_failing_specialist_is_recorded_and_the_rest_are_used(broken: str) -> None:
    if broken == "raise":
        client = _failing(IMAGING, triage=_triage("HIGH"))
    else:
        client = _client(triage=_triage("HIGH"), imaging="I cannot help with that.")
    result = DynaClinicPipeline(client).run(CASE)
    assert result.error is None and result.final_answer == "B"
    assert set(result.distributions) == {PATHOLOGY, PHARMACOLOGY}
    assert any(warning.startswith(IMAGING) for warning in result.warnings)


@pytest.mark.parametrize("pipeline_cls", [DynaClinicPipeline, StaticTeamPipeline])
def test_regression_all_specialists_failing_is_an_error_not_agreement(pipeline_cls: type) -> None:
    broken = {role: "I cannot help with that." for role in (IMAGING, PATHOLOGY, PHARMACOLOGY)}
    result = pipeline_cls(_client(triage=_triage("HIGH"), **broken)).run(CASE)
    assert result.error == "all specialists failed"
    assert result.final_answer is None and result.divergence is None
    assert "care_team:failed" in result.route
    assert SYNTHESIZER not in _roles(result) and CRITIC not in _roles(result)


def test_triage_failure_falls_back_to_deterministic_tier() -> None:
    result = DynaClinicPipeline(_failing(TRIAGE)).run(CASE)
    assert result.tier == result.triage["deterministic_tier"] == "LOW"
    assert result.triage["llm_tier"] is None
    assert any("triage" in warning for warning in result.warnings)
    assert result.final_answer == "B" and result.error is None


@pytest.mark.parametrize(
    ("pipeline_cls", "role"),
    [(DynaClinicPipeline, PRIMARY_CARE), (StaticTeamPipeline, SYNTHESIZER), (SingleAgentPipeline, SINGLE_AGENT)],
)
def test_fatal_model_error_is_recorded_not_raised(pipeline_cls: type, role: str) -> None:
    result = pipeline_cls(_failing(role)).run(CASE)
    assert result.error and "scripted outage" in result.error
    assert result.final_answer is None
    assert role not in _roles(result)


def test_single_agent_is_one_call_and_ledger_resets_per_case() -> None:
    pipeline = SingleAgentPipeline(_client())
    for _ in range(2):
        result = pipeline.run(CASE)
        assert [call.role for call in result.calls] == [SINGLE_AGENT]
        assert (result.route, result.mode, result.final_answer) == (["single_agent"], "single", "B")
