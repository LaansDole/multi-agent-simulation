"""Meta-Controller per the reviewed proposal: Complexity Score C, Uncertainty Score U, the piecewise mode rule and
the hierarchical hub-and-spoke Primary Care path (FakeLLM only, no network)."""

import json
from collections import Counter

import pytest

from dynaclinic import pipeline as pipeline_module
from dynaclinic import triage as triage_module
from dynaclinic.llm import FakeLLM, LLMError
from dynaclinic.pipeline import CaseRun, DynaClinicPipeline
from dynaclinic.prompts import (
    CONSULT_ROLES,
    CRITIC,
    GENERALIST,
    IMAGING,
    PHARMACOLOGY,
    PRIMARY_CARE,
    TRIAGE,
)
from dynaclinic.triage import MODERATE_SCORE, TAU_C
from dynaclinic.types import RunResult
from dynaclinic.uncertainty import (
    TAU_U_MCQ,
    TAU_U_OPEN,
    normalized_entropy,
    parse_sweep,
    select_mode,
    tau_u_for,
)
from tests.dynaclinic_fixtures import no_network  # noqa: F401
from tests.test_dynaclinic_pipeline import (
    CASE,
    FOR_A,
    OPEN_CASE,
    SCRIPT,
    WRITE_UP,
    _client,
    _failing,
    _specialist,
    _stages,
    _triage,
)


def sweep(*pairs: tuple[str, float]) -> str:
    """A generalist sweep reply listing ``(hypothesis, probability)`` pairs."""
    return json.dumps({"differential": [{"hypothesis": h, "probability": p} for h, p in pairs]})


UNIFORM = sweep(("A", 1 / 3), ("B", 1 / 3), ("C", 1 / 3))  # U = 1 over CASE's three options
ONE_HOT = sweep(("B", 1.0))  # U = 0


# --- Complexity Score C -------------------------------------------------------------------------------------------


@pytest.mark.parametrize("threshold", [0, 3, MODERATE_SCORE, 10, 31])
@pytest.mark.parametrize("reply", ["LOW", "MODERATE", "HIGH", "malformed", "outage"])
def test_complexity_is_above_tau_c_exactly_when_the_tier_is_not_low(
    monkeypatch: pytest.MonkeyPatch, reply: str, threshold: int
) -> None:
    """Every feature score 0..30 x every LLM tier, a malformed reply and a failed call (deterministic fallback), and
    escalation at several thresholds: ``C > TAU_C`` reproduces the LOW vs team boundary, and C is continuous in
    [0, 1] and non-decreasing in the score."""
    previous = -1.0
    for score in range(31):
        monkeypatch.setattr(triage_module, "feature_score", lambda case, s=score: (s, {}))
        monkeypatch.setattr(pipeline_module, "feature_score", lambda case, s=score: (s, {}))
        if reply == "outage":
            client = _failing(TRIAGE)
        else:
            client = _client(triage="not json" if reply == "malformed" else _triage(reply))
        run = CaseRun(client, CASE, RunResult(CASE.id, "dynamic"), {})
        run.triage(threshold)
        c, tier = run.result.complexity, run.result.tier
        assert 0.0 <= c <= 1.0 and run.result.tau_c == TAU_C
        assert (c > TAU_C) == (tier != "LOW"), (reply, threshold, score, c, tier)
        assert c >= previous
        previous = c


# --- Uncertainty Score U ------------------------------------------------------------------------------------------


def test_normalized_entropy_bounds_and_a_known_distribution() -> None:
    assert normalized_entropy([0.2] * 5, 5) == pytest.approx(1.0)
    assert normalized_entropy([1.0], 5) == 0.0
    # H(0.5, 0.25, 0.25) = 1.5 ln 2 = 1.0397; missing entries are zero mass, so k = 5 divides by ln 5.
    assert round(normalized_entropy([0.5, 0.25, 0.25], 5), 3) == 0.646
    assert round(normalized_entropy([0.5, 0.25, 0.25], 3), 3) == 0.946
    assert normalized_entropy([2.0, 1.0, 1.0], 5) == pytest.approx(normalized_entropy([0.5, 0.25, 0.25], 5))


def test_sweep_of_a_multiple_choice_case_is_over_its_options() -> None:
    differential, error = parse_sweep(sweep(("A", 0.6), ("B", 0.4), ("Z", 0.5)), ["A", "B", "C"], 3)
    assert error is None and differential == {"A": 0.6, "B": 0.4}  # Z is not an option; C is missing = zero mass


def test_sweep_keeps_the_top_k_and_renormalises() -> None:
    pairs = [("pneumonia", 0.4), ("influenza", 0.3), ("covid-19", 0.2), ("asthma", 0.1)]
    differential, error = parse_sweep(sweep(*pairs), [], 2)
    assert error is None and differential == pytest.approx({"pneumonia": 4 / 7, "influenza": 3 / 7})


@pytest.mark.parametrize(
    "reply",
    ["no json here", json.dumps({"differential": []}), json.dumps({"tier": "LOW"}), sweep(("A", -0.2), ("B", 1.2)),
     sweep(("A", "0.5")), sweep(("A", 0.0), ("B", 0.0)), sweep(("X", 1.0)), sweep(("A", True))],
    ids=["not-json", "empty", "no-differential", "negative", "string", "zero-mass", "no-option", "bool"],
)
def test_malformed_sweep_is_not_measured(reply: str) -> None:
    differential, error = parse_sweep(reply, ["A", "B", "C"], 3)
    assert differential is None and error


@pytest.mark.parametrize(("triage", "mode"), [("LOW", "hierarchical"), ("HIGH", "collaborative")])
@pytest.mark.parametrize("broken", ["malformed", "outage"])
def test_unmeasured_uncertainty_warns_and_routes_on_complexity_only(triage: str, mode: str, broken: str) -> None:
    replies = {"triage": _triage(triage)}
    client = _failing(GENERALIST, **replies) if broken == "outage" else _client(generalist="{}", **replies)
    result = DynaClinicPipeline(client).run(CASE)
    assert result.uncertainty is None and result.mode == mode and result.error is None
    assert any(w.startswith("generalist: ") and "U not measured" in w for w in result.warnings)
    assert "uncertainty:n/a" in _stages(result)


# --- the piecewise rule -------------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("c", "u", "mode"),
    [
        (TAU_C, TAU_U_MCQ, "hierarchical"),  # equalities go to the <= side
        (0.0, 0.0, "hierarchical"),
        (TAU_C + 1e-9, TAU_U_MCQ, "collaborative"),
        (1.0, 0.0, "collaborative"),
        (TAU_C, TAU_U_MCQ + 1e-9, "adversarial"),
        (1.0, 1.0, "adversarial"),  # regardless of C
        (0.0, 1.0, "adversarial"),
    ],
)
def test_select_mode_boundaries(c: float, u: float, mode: str) -> None:
    assert select_mode(c, u, TAU_C, TAU_U_MCQ) == mode


def test_select_mode_reads_the_given_thresholds() -> None:
    assert select_mode(0.3, 0.3, tau_c=0.2, tau_u=0.25) == "adversarial"
    assert select_mode(0.3, 0.3, tau_c=0.4, tau_u=0.35) == "hierarchical"
    assert select_mode(0.3, 0.3, tau_c=0.2, tau_u=0.35) == "collaborative"


# Multiple choice (CASE, k = 3): U(0.97, 0.015, 0.015) = 0.142 <= 0.15 < U(0.96, 0.02, 0.02) = 0.178.
# Open-ended (k = 5): U(0.6, 0.25, 0.15) = 0.583 <= 0.59 < U(0.5, 0.3, 0.2) = 0.640.
FOCUSED = sweep(("A", 0.97), ("B", 0.015), ("C", 0.015))
SPREAD = sweep(("A", 0.96), ("B", 0.02), ("C", 0.02))
OPEN_FOCUSED = sweep(("COVID-19", 0.6), ("influenza", 0.25), ("bacterial pneumonia", 0.15))
OPEN_SPREAD = sweep(("COVID-19", 0.5), ("influenza", 0.3), ("bacterial pneumonia", 0.2))


def test_tau_u_for_reads_the_input_form_of_a_case_or_a_flag() -> None:
    assert (TAU_U_MCQ, TAU_U_OPEN) == (0.15, 0.59)
    assert tau_u_for(CASE) == tau_u_for(False) == TAU_U_MCQ
    assert tau_u_for(OPEN_CASE) == tau_u_for(True) == TAU_U_OPEN
    assert (tau_u_for(CASE, tau_u_mcq=0.3, tau_u_open=0.7), tau_u_for(OPEN_CASE, tau_u_mcq=0.3, tau_u_open=0.7)) == (
        0.3, 0.7)


@pytest.mark.parametrize(
    ("case", "reply", "kwargs", "mode", "tau_u"),
    [
        (CASE, FOCUSED, {}, "hierarchical", 0.15),
        (CASE, SPREAD, {}, "adversarial", 0.15),
        (OPEN_CASE, OPEN_FOCUSED, {}, "hierarchical", 0.59),  # 0.58 is far above the multiple-choice 0.15
        (OPEN_CASE, OPEN_SPREAD, {}, "adversarial", 0.59),
        (CASE, SPREAD, {"tau_u_mcq": 0.2}, "hierarchical", 0.2),
        (OPEN_CASE, OPEN_SPREAD, {"tau_u_open": 0.7}, "hierarchical", 0.7),
        (CASE, FOCUSED, {"tau_u": 0.1}, "adversarial", 0.1),  # the single override wins for both forms
        (OPEN_CASE, OPEN_SPREAD, {"tau_u": 0.9, "tau_u_open": 0.1}, "hierarchical", 0.9),
    ],
    ids=["mcq-below", "mcq-above", "open-below", "open-above", "mcq-configured", "open-configured",
         "override-mcq", "override-open"],
)
def test_pipeline_tau_u_is_calibrated_per_input_form_and_overridable(
    case: object, reply: str, kwargs: dict, mode: str, tau_u: float
) -> None:
    result = DynaClinicPipeline(_client(generalist=reply, primary_care=WRITE_UP if case is OPEN_CASE else FINAL),
                                **kwargs).run(case)
    assert (result.mode, result.tau_u, result.top_k) == (mode, tau_u, 5 if case is OPEN_CASE else 3)


@pytest.mark.parametrize("kwargs", [{"tau_u": 1.5}, {"tau_u_mcq": -0.1}, {"tau_u_open": 2.0}])
def test_pipeline_rejects_a_tau_u_outside_the_unit_interval(kwargs: dict) -> None:
    with pytest.raises(ValueError, match="tau_u"):
        DynaClinicPipeline(_client(), **kwargs)


def test_dynamic_arm_records_the_rule_inputs_and_the_planner_stage() -> None:
    result = DynaClinicPipeline(_client(generalist=FOCUSED)).run(CASE)
    stages = _stages(result)
    assert stages[:6] == ["ingest", "cache_lookup:off", "triage:LOW", "uncertainty:0.14", "mode:hierarchical",
                          "primary_care"]
    assert result.complexity <= result.tau_c == TAU_C and result.uncertainty == pytest.approx(0.1416, abs=1e-4)
    assert result.differential == pytest.approx({"A": 0.97, "B": 0.015, "C": 0.015})
    assert result.mode_reason == f"C {result.complexity:.2f} <= tau_c 0.5 and U 0.14 <= tau_u 0.15: hierarchical"
    assert [call.role for call in result.calls] == [TRIAGE, GENERALIST, PRIMARY_CARE]


def test_multiple_choice_sweep_prompt_asks_for_every_option_on_the_full_case() -> None:
    client = _client()
    DynaClinicPipeline(client).run(CASE)
    [(system, user)] = [(system, user) for role, system, user in client.prompts if role == GENERALIST]
    assert CASE.vignette in user and "A. " in user and '"differential"' in system and "every option" in system


def test_open_ended_sweep_uses_k_and_the_case_text() -> None:
    reply = sweep(("COVID-19", 0.25), ("influenza", 0.25), ("bacterial pneumonia", 0.25), ("heat illness", 0.25))
    client = _client(generalist=reply, primary_care=WRITE_UP)
    result = DynaClinicPipeline(client, top_k=4).run(OPEN_CASE)
    assert result.top_k == 4 and result.uncertainty == pytest.approx(1.0) and result.mode == "adversarial"
    [(system, user)] = [(system, user) for role, system, user in client.prompts if role == GENERALIST]
    assert OPEN_CASE.vignette in user and "4" in system


# --- adversarial mode entered by uncertainty ----------------------------------------------------------------------


def test_low_tier_entered_by_uncertainty_runs_the_moderate_size_team_and_stays_adversarial() -> None:
    client = _client(generalist=UNIFORM)  # triage LOW, every specialist agrees on B
    result = DynaClinicPipeline(client).run(CASE)
    moderate = DynaClinicPipeline(_client(triage=_triage("MODERATE"))).run(CASE)
    team = next(stage for stage in _stages(moderate) if stage.startswith("care_team:"))
    stages = _stages(result)
    assert result.tier == "LOW" and team in stages and len(team.split(",")) == 2
    assert "mode:adversarial:uncertainty" in stages and "divergence:0.00:stay" in stages
    assert result.switch is False and result.mode == "adversarial"  # the detector reports; the mode stays
    assert stages[-3:] == ["critic", "synthesizer", "safety_gate:pass"]
    assert "entered by uncertainty" in result.mode_reason
    assert Counter(call.role for call in result.calls)[CRITIC] == 1


def test_collaborative_team_still_switches_on_divergence() -> None:
    client = _client(triage=_triage("HIGH"), imaging=_specialist(FOR_A))
    result = DynaClinicPipeline(client).run(CASE)
    assert "mode:collaborative" in _stages(result) and result.mode == "adversarial" and result.switch is True


# --- hierarchical hub-and-spoke -----------------------------------------------------------------------------------

DRUG_Q = "Does azithromycin interact with anything she takes?"
IMAGING_Q = "Is there any consolidation on her chest film?"
DRUG_A = "No interaction: she takes no medications."
IMAGING_A = "No imaging was done."
FINAL = "Facts and risks of each option.\nFINAL ANSWER: B"


def _hub(*consults: str) -> FakeLLM:
    lines = "\n".join(consults)
    return _client(**{PRIMARY_CARE: [f"I need specialist input first.\n{lines}", FINAL],
                      CONSULT_ROLES[PHARMACOLOGY]: DRUG_A, CONSULT_ROLES[IMAGING]: IMAGING_A})


def _spoke_prompts(client: FakeLLM) -> dict[str, tuple[str, str]]:
    spokes = {name: role for role, name in CONSULT_ROLES.items()}
    return {spokes[role]: (system, user) for role, system, user in client.prompts if role in spokes}


def test_hub_without_consult_lines_makes_exactly_one_call() -> None:
    client = _client()
    result = DynaClinicPipeline(client).run(CASE)
    assert [call.role for call in result.calls] == [TRIAGE, GENERALIST, PRIMARY_CARE]
    assert result.consults == [] and result.final_answer == "B"
    [system] = [system for role, system, _ in client.prompts if role == PRIMARY_CARE]
    assert "CONSULT: <imaging|pathology|pharmacology>: <question>" in system and "Informative model" in system


def test_hub_consults_spokes_independently_then_finalises() -> None:
    client = _hub(f"CONSULT: pharmacology: {DRUG_Q}", f"CONSULT: imaging: {IMAGING_Q}")
    result = DynaClinicPipeline(client).run(CASE)
    roles = Counter(call.role for call in result.calls)
    assert roles == Counter({TRIAGE: 1, GENERALIST: 1, PRIMARY_CARE: 2, CONSULT_ROLES[PHARMACOLOGY]: 1,
                             CONSULT_ROLES[IMAGING]: 1})
    spokes = _spoke_prompts(client)
    drug_system, drug_user = spokes[PHARMACOLOGY]
    imaging_system, imaging_user = spokes[IMAGING]
    assert DRUG_Q in drug_user and "penicillin (anaphylaxis)" in drug_user  # its question and its own slice
    assert IMAGING_Q in imaging_user
    for text in (IMAGING_Q, IMAGING_A, "Imaging"):
        assert text not in drug_user
    for text in (DRUG_Q, DRUG_A, "Allergies"):
        assert text not in imaging_user
    assert "Pharmacology" in drug_system and "Diagnostic Imaging" in imaging_system
    final_user = [user for role, _, user in client.prompts if role == PRIMARY_CARE][1]
    assert all(text in final_user for text in (DRUG_Q, DRUG_A, IMAGING_Q, IMAGING_A))
    assert result.final_text == FINAL and result.final_answer == "B" and result.mode == "hierarchical"
    assert result.consults == [{"role": PHARMACOLOGY, "question": DRUG_Q, "answer": DRUG_A},
                               {"role": IMAGING, "question": IMAGING_Q, "answer": IMAGING_A}]
    assert "hub_consult:pharmacology,imaging" in _stages(result)


def test_consults_beyond_two_or_for_unknown_roles_are_ignored_with_a_warning() -> None:
    client = _hub("CONSULT: cardiology: Is the ECG normal?", f"CONSULT: pharmacology: {DRUG_Q}",
                  f"CONSULT: imaging: {IMAGING_Q}", "CONSULT: pathology: Is the antigen test reliable?")
    result = DynaClinicPipeline(client).run(CASE)
    assert set(_spoke_prompts(client)) == {PHARMACOLOGY, IMAGING}
    assert any("cardiology" in w and "unknown" in w for w in result.warnings)
    assert any("pathology" in w and "beyond 2" in w for w in result.warnings)


def test_failed_spoke_is_reported_and_the_hub_still_finalises() -> None:
    hub = iter([f"CONSULT: pharmacology: {DRUG_Q}", FINAL])

    def script(role: str, system: str, user: str) -> str:
        if role == CONSULT_ROLES[PHARMACOLOGY]:
            raise LLMError("scripted outage")
        return next(hub) if role == PRIMARY_CARE else SCRIPT[role]

    result = DynaClinicPipeline(FakeLLM(script)).run(CASE)
    assert result.final_answer == "B" and result.error is None
    assert result.consults == [{"role": PHARMACOLOGY, "question": DRUG_Q, "answer": "(no answer: the call failed)"}]
    assert any(w.startswith(f"{CONSULT_ROLES[PHARMACOLOGY]}: call failed") for w in result.warnings)

