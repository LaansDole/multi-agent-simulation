"""DynaClinic pipelines with scripted FakeLLM: routing, switching, gate regeneration, cache, baselines."""

import hashlib
import json
from collections import Counter
from collections.abc import Callable

import pytest

from dynaclinic.eval.harness import dry_run_client
from dynaclinic.interfaces import InMemorySemanticCache
from dynaclinic.llm import FakeLLM, LLMError
from dynaclinic.parsing import ABSTAIN
from dynaclinic.pipeline import (
    BLOCKED_PREFIX,
    DynaClinicPipeline,
    SingleAgentPipeline,
    StaticTeamPipeline,
)
from dynaclinic.prompts import (
    CRITIC,
    CRITIC_JUDGE,
    GENERALIST,
    IMAGING,
    MESH_ROLES,
    PATHOLOGY,
    PHARMACOLOGY,
    PRIMARY_CARE,
    PROPONENT,
    SHARED_CORE,
    SINGLE_AGENT,
    STRICT,
    SYNTHESIZER,
    TRIAGE,
)
from dynaclinic.types import Case, Option, RunResult
from tests.dynaclinic_fixtures import no_network  # noqa: F401
from tests.test_dynaclinic_prompts import CASE as PROMPTS_CASE

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
PROPONENT_CASE = ("CASE FOR H1: positive antigen test with penicillin anaphylaxis.\n"
                  "WOULD FALSIFY H1: a macrolide allergy.\nAGAINST H2: amoxicillin risks anaphylaxis.")
OPPONENT = {"H1": ["Macrolide resistance is common in streptococci."], "H2": ["Penicillin anaphylaxis history."]}


def _triage(tier: str) -> str:
    return json.dumps({"tier": tier, "rationale": "scripted", "features": {"organ_systems": 1}})


def _specialist(dist: dict[str, float], claim: str = "Azithromycin avoids the penicillin allergy") -> str:
    return json.dumps({"findings": ["scripted finding"], "distribution": dist, "claims": [claim]})


SCRIPT = {
    TRIAGE: _triage("LOW"),
    GENERALIST: json.dumps({"differential": [{"hypothesis": "B", "probability": 1.0}]}),  # U = 0: the mode follows C
    PRIMARY_CARE: "Facts and risks of each option.\nFINAL ANSWER: B",
    IMAGING: _specialist(FOR_B),
    PATHOLOGY: _specialist(FOR_B),
    PHARMACOLOGY: _specialist(FOR_B),
    CRITIC: json.dumps({"claims": [{"text": UNSAFE_CLAIM, "agent": IMAGING},
                                   {"text": "The rapid streptococcal antigen test is positive", "agent": PATHOLOGY}],
                        "opponent": {"against_h1": OPPONENT["H1"], "against_h2": OPPONENT["H2"]}}),
    PROPONENT: PROPONENT_CASE,
    CRITIC_JUDGE: json.dumps({"claims": [{"id": i, "logits": {"supported": 2.0, "unsupported": 0.0,
                                                              "fabrication": 0.0, "contradiction": 0.0}}
                                         for i in (1, 2)]}),
    SYNTHESIZER: SAFE_ANSWER,
    SINGLE_AGENT: "FINAL ANSWER: B",
    **{MESH_ROLES[role]: _specialist(FOR_B) for role in (IMAGING, PATHOLOGY, PHARMACOLOGY)},  # step 2 agrees too
}


def _client(**overrides: str | list[str]) -> FakeLLM:
    """FakeLLM for ``SCRIPT`` + ``overrides``; a specialist's mesh step-2 reply repeats its round-1 reply unless its
    ``MESH_ROLES`` entry is scripted too."""
    mesh = {MESH_ROLES[role]: overrides[role] for role in MESH_ROLES if role in overrides}
    return FakeLLM({**SCRIPT, **mesh, **overrides})


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


def test_low_path_calls_triage_sweep_and_primary_care() -> None:
    result = DynaClinicPipeline(_client()).run(CASE)
    assert _stages(result) == ["ingest", "cache_lookup:off", "triage:LOW", "uncertainty:0.00", "mode:hierarchical",
                               "primary_care", "safety_gate:pass"]
    assert [call.role for call in result.calls] == [TRIAGE, GENERALIST, PRIMARY_CARE]
    assert (result.tier, result.mode, result.final_answer) == ("LOW", "hierarchical", "B")
    assert result.triage["llm_tier"] == "LOW" and result.triage["deterministic_tier"] == "LOW"
    assert not result.blocked and result.error is None
    planner_actions = [step.split(":")[1] for step in result.route if step.startswith("planner:")]
    assert planner_actions == ["retrieval", "agent_call", "agent_call", "agent_call", "agent_call", "terminal"]


def test_primary_care_samples_are_majority_voted() -> None:
    client = _client(primary_care=["FINAL ANSWER: C", "FINAL ANSWER: B", "FINAL ANSWER: B"])
    result = DynaClinicPipeline(client, pca_samples=3).run(CASE)
    assert _roles(result)[PRIMARY_CARE] == 3
    assert result.final_answer == "B"


def test_high_agreeing_team_is_collaborative_without_critic() -> None:
    client = _client(triage=_triage("HIGH"))
    result = DynaClinicPipeline(client).run(CASE)
    assert _roles(result) == Counter({TRIAGE: 1, GENERALIST: 1, IMAGING: 1, PATHOLOGY: 1, PHARMACOLOGY: 1,
                                      **dict.fromkeys(MESH_ROLES.values(), 1), SYNTHESIZER: 1})
    assert _stages(result) == [
        "ingest", "cache_lookup:off", "triage:HIGH", "uncertainty:0.00", "mode:collaborative",
        "care_team:imaging,pathology,pharmacology", "divergence:0.00:stay",
        "mesh_exchange:imaging,pathology,pharmacology", "synthesizer", "safety_gate:pass",
    ]
    assert result.mode == "collaborative" and result.switch is False and result.divergence < 0.25
    assert set(result.distributions) == {IMAGING, PATHOLOGY, PHARMACOLOGY}
    assert "Conflict set" not in _prompts(client, SYNTHESIZER)[0]


def test_high_disagreeing_team_switches_to_adversarial_critic() -> None:
    client = _client(triage=_triage("HIGH"), imaging=_specialist(FOR_A, UNSAFE_CLAIM))
    result = DynaClinicPipeline(client).run(CASE)
    assert _roles(result) == Counter(
        {TRIAGE: 1, GENERALIST: 1, IMAGING: 1, PATHOLOGY: 1, PHARMACOLOGY: 1, PROPONENT: 1, CRITIC: 1, CRITIC_JUDGE: 1,
         SYNTHESIZER: 1}
    )
    stages = _stages(result)
    assert stages[6].startswith("divergence:") and stages[6].endswith(":switch")
    assert stages[7:] == ["proponent", "critic", "synthesizer", "safety_gate:pass"]
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


OPEN_CASE = Case("covid", "devall", "A patient has COVID-19 on a sunny day.", "", [], "",
                 structured={"meds": ["amlodipine 10 mg daily", "simvastatin 40 mg daily"]})
WRITE_UP = ("ASSESSMENT: Probable mild COVID-19; the sunny weather is clinically irrelevant.\n"
            "DIFFERENTIAL: Influenza.\nPLAN: Isolate, fluids, paracetamol.\n"
            "RED FLAGS / ESCALATE IF: SpO2 below 94%.\nMISSING INFORMATION: Vaccination status.\n"
            "RECOMMENDATION: Manage at home with isolation and symptom relief.")
OPEN_FINDINGS = json.dumps({"findings": ["no relevant data"], "claims": []})


@pytest.mark.parametrize(
    ("pipeline_cls", "tier"),
    [(DynaClinicPipeline, "LOW"), (DynaClinicPipeline, "HIGH"), (StaticTeamPipeline, None), (SingleAgentPipeline, None)],
)
def test_open_ended_case_is_answered_with_a_write_up_and_no_letter_anywhere(pipeline_cls: type, tier: str | None) -> None:
    client = _client(triage=_triage(tier or "LOW"), primary_care=WRITE_UP, synthesizer=WRITE_UP, single_agent=WRITE_UP,
                     imaging=OPEN_FINDINGS, pathology=OPEN_FINDINGS, pharmacology=OPEN_FINDINGS)
    result = pipeline_cls(client).run(OPEN_CASE)
    assert (result.final_text, result.final_answer, result.error, result.blocked) == (WRITE_UP, None, None, False)
    assert [w for w in result.warnings if "FINAL ANSWER" in w] == []
    assert [role for role, system, user in client.prompts if "FINAL ANSWER" in system + user] == []


def _asserting(diagnosis: str, recommendation: str = "Act within this domain.") -> str:
    return (json.dumps({"findings": ["scripted finding"], "claims": []})
            + f"\nLEADING DIAGNOSIS: {diagnosis}\nDOMAIN RECOMMENDATION: {recommendation}")


def _one_hot(embedded: list[str]) -> Callable[[list[str]], list[list[float]]]:
    """Fake embedder recording its inputs in ``embedded``: every distinct text is its own axis, so any wording
    difference between two texts is the maximal distance 1."""

    def embed(texts: list[str]) -> list[list[float]]:
        embedded.extend(texts)
        axes = sorted(set(texts))
        return [[float(text == axis) for axis in axes] for text in texts]

    return embed


# One action per lens, as the real specialists answered the PE scenario: wording that differs by design.
RECOMMENDATIONS = {IMAGING: "Obtain CT pulmonary angiography.",
                   PATHOLOGY: "Interpret the elevated D-dimer with the pretest probability.",
                   PHARMACOLOGY: "Hold anticoagulation decisions until imaging confirms the diagnosis."}


@pytest.mark.parametrize(
    ("pharmacology", "stages"),
    [
        ("Pulmonary embolism", ["divergence:0.00:stay", "mesh_exchange:imaging,pathology,pharmacology", "synthesizer"]),
        ("Acute coronary syndrome", ["divergence:0.67:switch", "proponent", "critic", "synthesizer"]),
    ],
)
def test_open_ended_divergence_embeds_the_leading_diagnoses_never_the_recommendations(
    pharmacology: str, stages: list[str]
) -> None:
    embedded: list[str] = []
    diagnoses = {IMAGING: "Pulmonary embolism", PATHOLOGY: "Pulmonary embolism", PHARMACOLOGY: pharmacology}
    script = {**SCRIPT, TRIAGE: _triage("HIGH"), SYNTHESIZER: WRITE_UP,
              **{role: _asserting(diagnoses[role], RECOMMENDATIONS[role]) for role in diagnoses}}
    client = FakeLLM({**script, **{MESH_ROLES[role]: script[role] for role in diagnoses}}, _one_hot(embedded))
    result = DynaClinicPipeline(client, tau_semantic=0.5).run(OPEN_CASE)
    # after a switch the Proponent embeds each distinct wording once more, with the sweep's differential ("B")
    grouped = [*dict.fromkeys(diagnoses.values()), "B"] if "proponent" in stages else []
    assert embedded == [*diagnoses.values(), *grouped]
    assert (_stages(result)[6:], result.assertions, result.warnings) == ([*stages, "safety_gate:pass"], diagnoses, [])
    blackboard = _prompts(client, SYNTHESIZER)[0]
    assert [f"domain recommendation: {text}" in blackboard for text in RECOMMENDATIONS.values()] == [True] * 3


def test_open_ended_specialist_without_a_leading_diagnosis_falls_back_to_its_primary_assertion_line() -> None:
    embedded: list[str] = []
    legacy = json.dumps({"findings": ["scripted finding"], "claims": []}) + "\nPRIMARY ASSERTION: Pulmonary embolism"
    script = {**SCRIPT, TRIAGE: _triage("HIGH"), SYNTHESIZER: WRITE_UP, IMAGING: legacy,
              # a LEADING DIAGNOSIS line wins over a stray PRIMARY ASSERTION line, wherever it stands
              PATHOLOGY: _asserting("Pulmonary embolism") + "\nPRIMARY ASSERTION: Obtain serial troponins.",
              PHARMACOLOGY: _asserting("ABSTAIN - no drug data", "None."),
              **dict.fromkeys(MESH_ROLES.values(), _asserting("Pulmonary embolism"))}
    result = DynaClinicPipeline(FakeLLM(script, _one_hot(embedded)), tau_semantic=0.5).run(OPEN_CASE)
    assert result.assertions == {IMAGING: "Pulmonary embolism", PATHOLOGY: "Pulmonary embolism", PHARMACOLOGY: ABSTAIN}
    assert result.warnings == ["imaging: no LEADING DIAGNOSIS line; read its PRIMARY ASSERTION line as the diagnosis"]
    assert (embedded, _stages(result)[6]) == (["Pulmonary embolism"] * 2, "divergence:0.00:stay")


@pytest.mark.parametrize(
    ("pharmacology", "tau_semantic", "stages"),
    [
        ("Septic shock from pneumonia.", 0.5, ["divergence:0.00:stay", "mesh_exchange:imaging,pathology,pharmacology",
                                               "synthesizer", "safety_gate:pass"]),
        ("Pulmonary embolism.", 0.5, ["divergence:0.67:switch", "proponent", "critic", "synthesizer",
                                      "safety_gate:pass"]),
        # divergence == tau_semantic switches (safety-biased boundary)
        ("Septic shock from pneumonia.", 0.0, ["divergence:0.00:switch", "proponent", "critic", "synthesizer",
                                               "safety_gate:pass"]),
    ],
)
def test_open_ended_team_routes_on_the_semantic_divergence_of_its_assertions(
    pharmacology: str, tau_semantic: float, stages: list[str]
) -> None:
    def by_keyword(texts: list[str]) -> list[list[float]]:
        return [[float("septic" in text.lower()), float("embol" in text.lower())] for text in texts]

    script = {**SCRIPT, "triage": _triage("HIGH"), "synthesizer": WRITE_UP, "imaging": _asserting("Septic shock."),
              "pathology": _asserting("Septic shock, likely pulmonary source."), "pharmacology": _asserting(pharmacology)}
    script |= {MESH_ROLES[role]: script[role] for role in MESH_ROLES}
    result = DynaClinicPipeline(FakeLLM(script, by_keyword), tau_semantic=tau_semantic).run(OPEN_CASE)
    assert _stages(result)[6:] == stages
    assert (result.embedder, result.final_text, result.warnings) == ("fake", WRITE_UP, [])


@pytest.mark.parametrize(("policy", "team"), [(SHARED_CORE, "imaging,pathology"), (STRICT, "imaging,pharmacology")])
def test_moderate_open_ended_team_follows_the_narrative_slices_under_shared_core(policy: str, team: str) -> None:
    case = Case("pe", "devall", "55-year-old with acute chest pain, normal ECG, elevated D-dimer, and recent long "
                "flight.", "", [], "")
    client = _client(triage=_triage("MODERATE"), synthesizer=WRITE_UP, imaging=_asserting("Pulmonary embolism."),
                     pathology=_asserting("Pulmonary embolism."), pharmacology=_asserting("Pulmonary embolism."))
    result = DynaClinicPipeline(client, context_policy=policy).run(case)
    assert f"care_team:{team}" in _stages(result)


# sha256 of the sorted (role, system, user) prompts of a dry-run on tests.test_dynaclinic_prompts.CASE. The static
# arm's was captured at 1b01dc2 before context_policy existed: the strict policy must keep every prompt byte-for-byte.
# The dynamic arm's was re-captured at f15 (its generalist sweep, f14, stays excluded): the dry run routes this case to
# a collaborative team, whose mesh exchange adds step-2 prompts that the Consensus Builder then reads.
STRICT_TRANSCRIPTS = {
    StaticTeamPipeline: "b86e0bc0c7991668f698b283533c3a27072486d54fece18e69613747ca4e458b",
    DynaClinicPipeline: "c6e126d706513f42cd7c829eafac8eedef23a6dfe8fe79ad57cbaf51b7b32387",
}


@pytest.mark.parametrize("pipeline_cls", list(STRICT_TRANSCRIPTS))
def test_strict_policy_prompts_are_byte_identical_to_the_pre_policy_pipeline(pipeline_cls: type) -> None:
    client = dry_run_client()
    pipeline_cls(client, context_policy=STRICT).run(PROMPTS_CASE)
    prompts = sorted(prompt for prompt in client.prompts if prompt[0] != GENERALIST)
    assert hashlib.sha256(json.dumps(prompts).encode()).hexdigest() == STRICT_TRANSCRIPTS[pipeline_cls]


# sha256 of the sorted prompts of the static and single arms on an open-ended case whose specialists disagree,
# captured at b04187c before H1/H2 were grouped by meaning: neither arm runs the Proponent, so neither may change.
OPEN_TRANSCRIPTS = {
    StaticTeamPipeline: "bad02526b3b89649916c8064347379ab29435df7a88059e79c2da7cded78511d",
    SingleAgentPipeline: "f79106a493e46e95e2a2266ab5d1ce57b98743919e9da2a19cc7640cadd022ce",
}


@pytest.mark.parametrize("pipeline_cls", list(OPEN_TRANSCRIPTS))
def test_static_and_single_open_ended_prompts_are_unchanged(pipeline_cls: type) -> None:
    client = _client(synthesizer=WRITE_UP, single_agent=WRITE_UP, imaging=_asserting("Pulmonary embolism"),
                     pathology=_asserting("Suspected pulmonary embolism"),
                     pharmacology=_asserting("Acute coronary syndrome"))
    pipeline_cls(client).run(OPEN_CASE)
    assert hashlib.sha256(json.dumps(sorted(client.prompts)).encode()).hexdigest() == OPEN_TRANSCRIPTS[pipeline_cls]


@pytest.mark.parametrize("pipeline_cls", [StaticTeamPipeline, DynaClinicPipeline])
@pytest.mark.parametrize(("policy", "sees_case"), [(None, True), (SHARED_CORE, True), (STRICT, False)])
def test_context_policy_decides_whether_team_and_synthesizer_see_the_vignette(
    pipeline_cls: type, policy: str | None, sees_case: bool
) -> None:
    client = _client(triage=_triage("HIGH"))
    pipeline_cls(client, **({} if policy is None else {"context_policy": policy})).run(CASE)
    seen = {role: "Tonsillar exudates" in user for role, _, user in client.prompts if role not in (TRIAGE, GENERALIST)}
    expected = dict.fromkeys((IMAGING, PATHOLOGY, PHARMACOLOGY, SYNTHESIZER), sees_case)
    if pipeline_cls is StaticTeamPipeline:  # decomposition reads the Blackboard; the judge always has the full case
        expected |= {CRITIC: False, CRITIC_JUDGE: True}
    else:  # the mesh step 2 repeats each specialist's round-1 view of the case
        expected |= dict.fromkeys(MESH_ROLES.values(), sees_case)
    assert seen == expected
    assert all("Blackboard:" in user for role, _, user in client.prompts if role == SYNTHESIZER)


def test_unknown_context_policy_is_rejected_at_construction() -> None:
    with pytest.raises(ValueError, match="loose"):
        StaticTeamPipeline(_client(), context_policy="loose")
