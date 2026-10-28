"""Team topologies per the reviewed proposal (FakeLLM only, no network): the collaborative mesh exchange, and the
adversarial Proponent / Opponent (Clinical Critic) / Mediator (Conflict Resolver) debate."""

import json

import pytest

from dynaclinic.llm import FakeLLM, LLMError
from dynaclinic.pipeline import (
    DynaClinicPipeline,
    StaticTeamPipeline,
    select_hypotheses,
)
from dynaclinic.prompts import (
    CRITIC,
    GENERALIST,
    IMAGING,
    MESH_ROLES,
    PATHOLOGY,
    PHARMACOLOGY,
    PROPONENT,
    SPECIALISTS,
    SYNTHESIZER,
    SYSTEM_PROMPTS,
    TRIAGE,
)
from dynaclinic.types import RunResult
from tests.dynaclinic_fixtures import no_network  # noqa: F401
from tests.test_dynaclinic_pipeline import (
    CASE,
    FOR_A,
    FOR_B,
    OPEN_CASE,
    OPPONENT,
    PROPONENT_CASE,
    SCRIPT,
    WRITE_UP,
    _asserting,
    _client,
    _failing,
    _prompts,
    _specialist,
    _stages,
    _triage,
)

ROUND1 = {role: _specialist(FOR_B, f"{role} round-1 claim") for role in SPECIALISTS}


def _mesh(dist: dict[str, float], *exchange: tuple[str, str, str], claim: str = "revised claim") -> str:
    """A step-2 reply: ``exchange`` is ``(peer, stance, point)`` triples."""
    return json.dumps({"exchange": [{"peer": p, "stance": s, "point": t} for p, s, t in exchange],
                       "findings": ["step-2 finding"], "distribution": dist, "claims": [claim]})


def _collaborative(**replies: str) -> tuple[RunResult, object]:
    client = _client(triage=_triage("HIGH"), **{**ROUND1, **replies})
    return DynaClinicPipeline(client).run(CASE), client


def test_every_specialist_reads_every_peer_round_one_entry_and_its_own_once() -> None:
    result, client = _collaborative()
    for role in SPECIALISTS:
        [user] = _prompts(client, MESH_ROLES[role])
        for peer in SPECIALISTS:
            assert user.count(f"{peer} round-1 claim") == 1, (role, peer)
            assert f"[step 1] {peer} (hypothesis)" in user
        own, peers = user.split("Your peers' round-1 entries")
        assert f"{role} round-1 claim" in own and f"{role} round-1 claim" not in peers
        assert CASE.vignette in user  # grounded in the same case view as round 1
    [system] = [s for r, s, _ in client.prompts if r == MESH_ROLES[IMAGING]]
    assert "adopt" in system and "dispute" in system and '"exchange"' in system and '"distribution"' in system
    assert "mesh_exchange:imaging,pathology,pharmacology" in _stages(result)


def test_conflict_detector_runs_on_round_one_before_the_exchange_and_is_not_recomputed() -> None:
    # step 2 would disagree (A vs B): a detector re-run would switch to adversarial
    result, _ = _collaborative(**{MESH_ROLES[IMAGING]: _mesh(FOR_A, (PATHOLOGY, "disputes", "x"))})
    stages = _stages(result)
    divergences = [stage for stage in stages if stage.startswith("divergence:")]
    assert divergences == ["divergence:0.00:stay"]
    assert stages.index(divergences[0]) < stages.index("mesh_exchange:imaging,pathology,pharmacology")
    assert result.mode == "collaborative" and result.switch is False
    assert {role: max(d, key=d.get) for role, d in result.distributions.items()} == dict.fromkeys(SPECIALISTS, "B")
    assert stages[-2:] == ["synthesizer", "safety_gate:pass"] and "critic" not in stages


def test_consensus_builder_reads_both_rounds_and_integrates_them() -> None:
    reply = _mesh(FOR_B, (PATHOLOGY, "adopts", "the positive antigen test"), (PHARMACOLOGY, "disputes", "dose"))
    _, client = _collaborative(**{MESH_ROLES[IMAGING]: reply})
    [user] = _prompts(client, SYNTHESIZER)
    assert "[step 1] imaging (hypothesis)" in user and "[step 2] imaging (hypothesis)" in user
    assert "adopts pathology: the positive antigen test" in user and "disputes pharmacology: dose" in user
    assert "unified differential" in user


def test_a_failed_or_malformed_mesh_reply_leaves_that_specialist_out_with_a_warning() -> None:
    result, client = _collaborative(**{MESH_ROLES[PATHOLOGY]: "I agree with everyone."})
    assert "mesh_exchange:imaging,pharmacology" in _stages(result)
    assert any(w.startswith("pathology: mesh reply") for w in result.warnings)
    assert "[step 2] pathology" not in _prompts(client, SYNTHESIZER)[0]
    assert result.final_answer == "B" and result.error is None


def test_mesh_needs_two_round_one_entries() -> None:
    result, client = _collaborative(**{IMAGING: "no json", PATHOLOGY: "no json"})
    assert "mesh_exchange:skipped" in _stages(result) and not any(r in MESH_ROLES.values() for r, _, _ in client.prompts)
    assert any(w.startswith("mesh_exchange: ") for w in result.warnings)


def test_open_ended_mesh_posts_revised_leading_diagnoses() -> None:
    same = {role: _asserting("COVID-19") for role in SPECIALISTS}
    revised = json.dumps({"exchange": [{"peer": PATHOLOGY, "stance": "adopts", "point": "hypoxia risk"}],
                          "findings": ["f"], "claims": []}) + "\nLEADING DIAGNOSIS: COVID-19 pneumonia\n" \
        "DOMAIN RECOMMENDATION: Chest radiograph."
    client = _client(triage=_triage("HIGH"), synthesizer=WRITE_UP, **same, **{MESH_ROLES[IMAGING]: revised},
                     **{MESH_ROLES[role]: _asserting("COVID-19") for role in (PATHOLOGY, PHARMACOLOGY)})
    result = DynaClinicPipeline(client).run(OPEN_CASE)
    assert result.mode == "collaborative" and result.assertions == dict.fromkeys(SPECIALISTS, "COVID-19")
    [system] = [s for r, s, _ in client.prompts if r == MESH_ROLES[IMAGING]]
    assert "LEADING DIAGNOSIS:" in system and '"distribution"' not in system
    assert "  leading diagnosis: COVID-19 pneumonia" in _prompts(client, SYNTHESIZER)[0]


@pytest.mark.parametrize(
    ("votes", "differential", "h1", "h2", "basis"),
    [
        (["B", "B", "A"], ["C", "B"], "B", "A", "team plurality (2 of 3 specialists)"),  # H2: the dissenter
        (["B", "B", "B"], ["B", "C"], "B", "C", "team plurality (3 of 3 specialists)"),  # H2: next differential
        (["A", "B"], ["C", "A"], "C", "A", "the generalist sweep's top differential (no team plurality)"),
        (["A", "B"], ["B", "A"], "B", "A", "the generalist sweep's top differential (no team plurality)"),
        (["A", "B"], [], "A", "B", "the first specialist's hypothesis (no team plurality, no sweep differential)"),
        ([], ["X", "Y"], "X", "Y", "the generalist sweep's top differential (no team plurality)"),
        # open-ended: diagnoses vote after case/punctuation folding
        (["Pulmonary embolism", "pulmonary embolism.", "Acute coronary syndrome"], [], "Pulmonary embolism",
         "Acute coronary syndrome", "team plurality (2 of 3 specialists)"),
    ],
)
def test_h1_is_the_team_plurality_else_the_sweep_top_and_h2_the_strongest_alternative(
    votes: list[str], differential: list[str], h1: str, h2: str, basis: str
) -> None:
    assert select_hypotheses(votes, differential) == (h1, h2, basis)


def test_no_hypothesis_at_all_selects_nothing() -> None:
    assert select_hypotheses([], [])[:2] == (None, None)


PE, SUSPECTED_PE, PE_LIKELY = "Pulmonary embolism", "Suspected pulmonary embolism", "Pulmonary embolism, likely"
ACS, DISSECTION = "Acute coronary syndrome", "Aortic dissection"
# cosine distances: PE / SUSPECTED_PE ~0.05, PE / PE_LIKELY ~0.02, every other pair >= 0.69 (fake embedder tau 0.595)
VECTORS = {PE: [1.0, 0.0, 0.0], SUSPECTED_PE: [0.95, 0.31, 0.0], PE_LIKELY: [0.98, 0.2, 0.0],
           ACS: [0.0, 0.0, 1.0], DISSECTION: [0.0, 1.0, 0.0]}


def _open_debate(diagnoses: list[str], differential: list[str], *, fail: bool = False) -> tuple[RunResult, list]:
    """HIGH open-ended case forced adversarial (tau_semantic 0); returns the result and every embed call's texts."""
    calls: list[list[str]] = []

    def embed(texts: list[str]) -> list[list[float]]:
        calls.append(list(texts))
        if fail:
            raise LLMError("scripted embedder outage")
        return [VECTORS[text] for text in texts]

    sweep = json.dumps({"differential": [{"hypothesis": h, "probability": 1 / len(differential)} for h in differential]})
    script = {**SCRIPT, TRIAGE: _triage("HIGH"), GENERALIST: sweep, SYNTHESIZER: WRITE_UP,
              **{role: _asserting(text) for role, text in zip(SPECIALISTS, diagnoses, strict=True)}}
    return DynaClinicPipeline(FakeLLM(script, embed), tau_semantic=0.0).run(OPEN_CASE), calls


def _h1_h2_basis(result: RunResult) -> tuple[str, str, str]:
    return result.debate["h1"], result.debate["h2"], result.debate["basis"]


def test_paraphrased_diagnoses_form_one_h1_and_h2_is_a_different_diagnosis() -> None:
    result, calls = _open_debate([PE, SUSPECTED_PE, ACS], [DISSECTION, ACS])
    assert _h1_h2_basis(result) == (PE, ACS, "team plurality (2 of 3 specialists, 2 wordings)")
    assert calls[-1] == [PE, SUSPECTED_PE, ACS, DISSECTION]  # votes and differential in one call, each wording once


def test_distinct_diagnoses_are_not_merged() -> None:
    result, _ = _open_debate([PE, ACS, DISSECTION], [DISSECTION, PE])
    assert _h1_h2_basis(result) == (DISSECTION, PE, "the generalist sweep's top differential (no team plurality)")


def test_a_differential_paraphrasing_h1_is_skipped_for_h2() -> None:
    result, _ = _open_debate([PE, SUSPECTED_PE, PE], [PE_LIKELY, DISSECTION])
    assert _h1_h2_basis(result) == (PE, DISSECTION, "team plurality (3 of 3 specialists, 2 wordings)")


def test_a_failed_embedder_groups_by_the_hashing_fallback_with_a_warning() -> None:
    result, calls = _open_debate([PE, SUSPECTED_PE, ACS], [DISSECTION])
    failed, failed_calls = _open_debate([PE, SUSPECTED_PE, ACS], [DISSECTION], fail=True)
    assert failed_calls == calls and _h1_h2_basis(failed) == _h1_h2_basis(result)  # hashing: PE / SUSPECTED_PE d 0.18
    assert any(w.startswith("proponent: embedder fake failed") and w.endswith("used hashing") for w in failed.warnings)


def test_multiple_choice_hypotheses_match_exactly_without_an_embed_call() -> None:
    calls: list[list[str]] = []
    client = FakeLLM({**SCRIPT, TRIAGE: _triage("HIGH"), IMAGING: _specialist(FOR_A)}, lambda t: calls.append(t) or [])
    result = DynaClinicPipeline(client).run(CASE)
    assert (_h1_h2_basis(result), calls) == (("B", "A", "team plurality (2 of 3 specialists)"), [])


def _adversarial(**replies: str) -> tuple[RunResult, object]:
    """HIGH case, imaging dissents (A) from pathology and pharmacology (B): adversarial by conflict."""
    client = _client(triage=_triage("HIGH"), imaging=_specialist(FOR_A, "Amoxicillin is first-line"), **replies)
    return DynaClinicPipeline(client).run(CASE), client


def test_an_abstaining_specialist_does_not_vote_for_h1() -> None:
    # imaging A vs pathology B tie once the near-uniform pharmacologist is left out: the sweep's top (B) breaks it
    result, _ = _adversarial(pharmacology=_specialist(dict.fromkeys("ABC", 1 / 3)))
    assert result.debate["h1"] == "B" and result.debate["basis"].startswith("the generalist sweep's top")


def test_adversarial_debate_runs_proponent_then_opponent_then_mediator() -> None:
    result, client = _adversarial(synthesizer="SURVIVING HYPOTHESIS: H1 - no penicillin exposure.\nFINAL ANSWER: B")
    stages = _stages(result)
    assert stages[-5].endswith(":switch") and stages[-4:] == ["proponent", "critic", "synthesizer", "safety_gate:pass"]
    [proponent] = _prompts(client, PROPONENT)
    assert "H1 (primary hypothesis; team plurality (2 of 3 specialists)): B. Oral azithromycin" in proponent
    assert "H2 (strongest alternative): A. Oral amoxicillin" in proponent
    assert "Amoxicillin is first-line" in proponent and CASE.vignette in proponent  # Blackboard + case (shared_core)
    [(system, opponent)] = [(s, u) for r, s, u in client.prompts if r == CRITIC]
    assert system.startswith(SYSTEM_PROMPTS[CRITIC]) and "Opponent" in system and '"against_h1"' in system
    assert "H1 (primary hypothesis): B. Oral azithromycin" in opponent and "H2 (strongest alternative): A." in opponent
    assert PROPONENT_CASE in opponent
    assert result.debate == {"h1": "B", "h2": "A", "basis": "team plurality (2 of 3 specialists)",
                             "proponent": PROPONENT_CASE, "opponent": OPPONENT}
    assert result.final_answer == "B"  # the SURVIVING HYPOTHESIS line leaves FINAL ANSWER parsing alone


def test_mediator_reads_the_whole_debate_transcript_and_names_the_surviving_hypothesis() -> None:
    _, client = _adversarial()
    [user] = _prompts(client, SYNTHESIZER)
    assert PROPONENT_CASE in user
    assert all(point in user for points in OPPONENT.values() for point in points)
    assert "Flagged claims (do not rely on these):" in user
    assert "SURVIVING HYPOTHESIS: <H1|H2|neither>" in user
    assert user.index(PROPONENT_CASE) < user.index(OPPONENT["H1"][0]) < user.index("SURVIVING HYPOTHESIS")


def test_open_ended_debate_argues_the_leading_diagnoses() -> None:
    diagnoses = {IMAGING: "Pulmonary embolism", PATHOLOGY: "Pulmonary embolism.", PHARMACOLOGY: "Acute coronary syndrome"}
    client = _client(triage=_triage("HIGH"), synthesizer=WRITE_UP,
                     **{role: _asserting(text) for role, text in diagnoses.items()})
    result = DynaClinicPipeline(client, tau_semantic=0.0).run(OPEN_CASE)
    assert (result.mode, result.debate["h1"], result.debate["h2"]) == (
        "adversarial", "Pulmonary embolism", "Acute coronary syndrome")
    assert "H1 (primary hypothesis; team plurality (2 of 3 specialists)): Pulmonary embolism" in _prompts(
        client, PROPONENT)[0]


def test_a_failed_proponent_leaves_the_classic_critic_review() -> None:
    client = _failing(PROPONENT, triage=_triage("HIGH"), imaging=_specialist(FOR_A))
    result = DynaClinicPipeline(client).run(CASE)
    assert [s for r, s, _ in client.prompts if r == CRITIC] == [SYSTEM_PROMPTS[CRITIC]]
    assert result.debate == {} and any(w.startswith("proponent: call failed") for w in result.warnings)
    assert "SURVIVING HYPOTHESIS" not in _prompts(client, SYNTHESIZER)[0]


def test_static_team_never_debates() -> None:
    client = _client(imaging=_specialist(FOR_A))
    result = StaticTeamPipeline(client).run(CASE)
    assert PROPONENT not in {r for r, _, _ in client.prompts} and result.debate == {}
    assert [s for r, s, _ in client.prompts if r == CRITIC] == [SYSTEM_PROMPTS[CRITIC]]
