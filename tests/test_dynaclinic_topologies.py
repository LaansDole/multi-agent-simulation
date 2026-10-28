"""Team topologies per the reviewed proposal: the collaborative mesh exchange (FakeLLM only, no network)."""

import json

from dynaclinic.pipeline import DynaClinicPipeline
from dynaclinic.prompts import (
    IMAGING,
    MESH_ROLES,
    PATHOLOGY,
    PHARMACOLOGY,
    SPECIALISTS,
    SYNTHESIZER,
)
from dynaclinic.types import RunResult
from tests.dynaclinic_fixtures import no_network  # noqa: F401
from tests.test_dynaclinic_pipeline import (
    CASE,
    FOR_A,
    FOR_B,
    OPEN_CASE,
    WRITE_UP,
    _asserting,
    _client,
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
