"""Tests for dynaclinic.critic (Clinical Critic: claims, rule score, judge, adaptive hybrid)."""

import itertools
import json
import math

import numpy as np
import pytest

from dynaclinic.blackboard import Blackboard
from dynaclinic.critic import (
    KB_CONFIRMED_SCORE,
    LABELS,
    ClinicalCritic,
    adaptive_lambda,
    grounding,
    judge_probs,
    rule_score,
)
from dynaclinic.eval.cases import load_synthetic
from dynaclinic.llm import FakeLLM
from dynaclinic.prompts import CRITIC, CRITIC_JUDGE, SYSTEM_PROMPTS
from dynaclinic.types import BlackboardEntry, Case, Option
from tests.dynaclinic_fixtures import no_network  # noqa: F401

CASE = Case(
    id="strep",
    source="synthetic",
    vignette=(
        "A 19-year-old woman has 2 days of sore throat and fever. Temperature is 38.6 C. Tonsillar exudates are "
        "present and a rapid streptococcal antigen test is positive. She had anaphylaxis after penicillin as a child."
    ),
    question="Which is the most appropriate treatment?",
    options=[Option("A", "Oral amoxicillin"), Option("B", "Oral azithromycin"), Option("C", "No antibiotic")],
    answer="B",
    structured={
        "demographics": {"age": 19, "sex": "female"},
        "history": [],
        "meds": [],
        "allergies": ["penicillin (anaphylaxis)"],
        "labs": [{"name": "rapid streptococcal antigen test", "value": "positive"}],
        "imaging": [],
    },
    unsafe_options=["A"],
)
GROUNDED = "The rapid streptococcal antigen test is positive"
UNSAFE = "Oral amoxicillin is first-line therapy"
INVENTED = "She has a history of rheumatic heart disease"


def _blackboard() -> Blackboard:
    board = Blackboard()
    board.write(BlackboardEntry("pharmacology", "hypothesis", "Macrolide given allergy", {"B": 0.8, "A": 0.2},
                                ["Azithromycin avoids the penicillin allergy"], 1))
    board.write(BlackboardEntry("pathology", "hypothesis", "Strep positive", {"A": 0.7, "B": 0.3}, [UNSAFE], 1))
    return board


def _logits(**overrides: float) -> dict[str, float]:
    return {label: overrides.get(label, 0.0) for label in LABELS}


def _decomposition(*texts: str) -> str:
    return json.dumps({"claims": [{"text": text, "agent": "pathology"} for text in texts]})


def _judge(*logits: dict[str, float]) -> str:
    return json.dumps({"claims": [{"id": i, "logits": z} for i, z in enumerate(logits, 1)]})


def _sigmoid(x: float) -> float:
    return 1 / (1 + math.exp(-x))


# --- rule score ---------------------------------------------------------------------------------


def test_kb_contraindicated_claim_scores_zero() -> None:
    assert rule_score(UNSAFE, CASE) == 0.0
    assert rule_score("Give IV piperacillin-tazobactam", CASE) == 0.0


def test_negated_drug_mention_is_not_a_kb_violation() -> None:
    assert rule_score("Avoid amoxicillin because of penicillin anaphylaxis", CASE) > 0.0


def test_caution_level_kb_hit_is_not_zeroed() -> None:
    rash = Case.from_dict({**CASE.to_dict(), "structured": {**CASE.structured, "allergies": ["penicillin (rash)"]}})
    # cephalosporin after a non-anaphylactic penicillin reaction is "caution" in the KB, not contraindicated
    assert rule_score("Oral cephalexin for the positive streptococcal test", rash) > 0.0
    assert rule_score("Oral cephalexin for the positive streptococcal test", CASE) == 0.0


# syn-high-03: on phenelzine (MAOI) with renal colic; B meperidine and C tramadol are the KB interaction traps
MAOI_CASE = next(case for case in load_synthetic() if case.id == "syn-high-03")
MAOI_WARNING = "Phenelzine is a monoamine oxidase inhibitor, making meperidine and tramadol inappropriate choices"


def test_kb_confirmed_warning_is_credited_but_asserting_the_drug_is_still_vetoed() -> None:
    assert grounding(MAOI_WARNING, MAOI_CASE.vignette) < 0.5  # the live claim barely overlaps the case text
    assert rule_score(MAOI_WARNING, MAOI_CASE) >= KB_CONFIRMED_SCORE
    assert rule_score("Meperidine is inappropriate with phenelzine", MAOI_CASE) >= KB_CONFIRMED_SCORE
    assert rule_score("Give meperidine", MAOI_CASE) == 0.0


@pytest.mark.parametrize("claim", [INVENTED, "Avoid ketorolac in this patient"])
def test_claims_without_a_kb_confirmed_warning_keep_their_low_grounding(claim: str) -> None:
    # unrelated, and a warning against a drug the KB holds nothing against (the gold analgesic)
    assert rule_score(claim, MAOI_CASE) < 0.5


def test_neutral_judge_does_not_flag_a_kb_confirmed_warning() -> None:
    # single claim: zero rule variance gives the judge its largest weight
    client = FakeLLM({CRITIC: _decomposition(MAOI_WARNING), CRITIC_JUDGE: _judge(_logits())})
    report = ClinicalCritic(client).review(MAOI_CASE, Blackboard(), ["D"])
    [claim] = report.claims
    assert (claim.label, report.flagged) == ("supported", [])


def test_grounding_is_content_token_overlap_with_case_evidence() -> None:
    evidence = "Potassium 6.9 mEq/L with peaked T waves."
    assert grounding("The potassium is 6.9", evidence) == 1.0
    assert grounding("Peaked waves suggest hypercalcemia", evidence) == pytest.approx(2 / 4)
    assert grounding("Rheumatic carditis", evidence) == 0.0
    assert grounding("The and of", evidence) == 0.0


def test_rule_score_uses_structured_sections_as_evidence() -> None:
    assert rule_score(GROUNDED, CASE) == 1.0
    assert rule_score(INVENTED, CASE) < 0.5


# --- judge temperature and adaptive lambda -------------------------------------------------------


def test_judge_probs_is_temperature_scaled_softmax() -> None:
    logits = _logits(supported=3.0, unsupported=1.0, fabrication=-1.0)
    plain = judge_probs(logits, temperature=1.0)
    z = np.array([logits[label] for label in LABELS])
    expected = np.exp(z) / np.exp(z).sum()
    assert [plain[label] for label in LABELS] == pytest.approx(expected.tolist())


def test_temperature_above_one_flattens_the_judge() -> None:
    logits = _logits(supported=3.0, contradiction=1.0)
    probs = [judge_probs(logits, temperature=t) for t in (1.0, 1.5, 3.0)]
    tops = [p["supported"] for p in probs]
    assert tops[0] > tops[1] > tops[2] > 0.25
    assert all(sum(p.values()) == pytest.approx(1.0) for p in probs)
    assert all(max(p, key=p.get) == "supported" for p in probs)  # ranking preserved


def test_judge_probs_rejects_non_positive_temperature() -> None:
    with pytest.raises(ValueError, match="temperature"):
        judge_probs(_logits(), temperature=0.0)


def test_lambda_is_sigmoid_of_rule_score_variance() -> None:
    assert adaptive_lambda([0.0, 1.0]) == pytest.approx(_sigmoid(10 * (0.25 - 0.05)))
    assert adaptive_lambda([0.4, 0.4, 0.4]) == pytest.approx(_sigmoid(-0.5))
    assert adaptive_lambda([]) == pytest.approx(_sigmoid(-0.5))
    assert adaptive_lambda([0.5 - math.sqrt(0.05), 0.5 + math.sqrt(0.05)]) == pytest.approx(0.5)


def test_lambda_is_in_open_unit_interval_and_monotone_in_variance() -> None:
    score_sets = [[0.5, 0.5], [0.4, 0.6], [0.3, 0.7], [0.2, 0.8], [0.1, 0.9], [0.0, 1.0]]
    lambdas = [adaptive_lambda(scores) for scores in score_sets]
    assert all(0.0 < lam < 1.0 for lam in lambdas)
    assert all(a < b for a, b in itertools.pairwise(lambdas))


# --- ClinicalCritic.review -----------------------------------------------------------------------


def test_review_scores_flags_and_labels_claims() -> None:
    client = FakeLLM({
        CRITIC: _decomposition(GROUNDED, UNSAFE, INVENTED),
        CRITIC_JUDGE: _judge(_logits(supported=4.0), _logits(supported=4.0), _logits(fabrication=4.0)),
    })
    report = ClinicalCritic(client).review(CASE, _blackboard(), ["A", "B"])

    rules = [rule_score(text, CASE) for text in (GROUNDED, UNSAFE, INVENTED)]
    lam = adaptive_lambda(rules)
    assert report.lambda_ == pytest.approx(lam)
    for claim, rule in zip(report.claims, rules, strict=True):
        assert claim.rule_score == pytest.approx(rule)
        expected_probs = judge_probs(_logits(**{max(claim.judge_probs, key=claim.judge_probs.get): 4.0}), 1.5)
        assert claim.judge_probs == pytest.approx(expected_probs)
        assert claim.hybrid == pytest.approx(lam * rule + (1 - lam) * claim.judge_probs["supported"])
        assert claim.agent == "pathology"

    grounded, unsafe, invented = report.claims
    assert (grounded.label, unsafe.label, invented.label) == ("supported", "contradiction", "fabrication")
    assert [c.text for c in report.flagged] == [UNSAFE, INVENTED]
    assert all(c.hybrid < 0.5 for c in report.flagged) and grounded.hybrid >= 0.5
    assert [r.role for r in report.calls] == [CRITIC, CRITIC_JUDGE]
    assert report.errors == []


def test_kb_violation_is_flagged_even_when_the_judge_outvotes_the_rule() -> None:
    client = FakeLLM({CRITIC: _decomposition(UNSAFE), CRITIC_JUDGE: _judge(_logits(supported=10.0))})
    report = ClinicalCritic(client).review(CASE, _blackboard(), ["A"])
    [claim] = report.claims
    assert claim.rule_score == 0.0
    assert claim.hybrid >= 0.5  # the fused score alone would let it through
    assert claim.label == "contradiction"
    assert report.flagged == [claim]


def test_prompts_carry_blackboard_conflict_set_and_numbered_claims() -> None:
    client = FakeLLM({CRITIC: _decomposition(GROUNDED, UNSAFE), CRITIC_JUDGE: _judge(_logits(), _logits())})
    ClinicalCritic(client).review(CASE, _blackboard(), ["A", "B"])
    (_, decompose_system, decompose_user), (_, judge_system, judge_user) = client.prompts
    assert decompose_system == SYSTEM_PROMPTS[CRITIC] and judge_system == SYSTEM_PROMPTS[CRITIC_JUDGE]
    assert "Azithromycin avoids the penicillin allergy" in decompose_user
    assert "A. Oral amoxicillin" in decompose_user and "Conflict set: A, B" in decompose_user
    assert f"1. {GROUNDED}" in judge_user and f"2. {UNSAFE}" in judge_user
    assert "penicillin (anaphylaxis)" in judge_user


def test_judge_temperature_is_configurable() -> None:
    def supported(temperature: float) -> float:
        client = FakeLLM({CRITIC: _decomposition(GROUNDED), CRITIC_JUDGE: _judge(_logits(supported=2.0))})
        [claim] = ClinicalCritic(client, judge_temperature=temperature).review(CASE, _blackboard(), []).claims
        return claim.judge_probs["supported"]

    assert supported(1.0) > supported(3.0)


@pytest.mark.parametrize("reply", ["the claims look fine", '{"verdict": "ok"}', '{"claims": "all supported"}'])
def test_malformed_judge_reply_degrades_to_rule_only_scoring(reply: str) -> None:
    client = FakeLLM({CRITIC: _decomposition(GROUNDED, UNSAFE, INVENTED), CRITIC_JUDGE: reply})
    report = ClinicalCritic(client).review(CASE, _blackboard(), ["A"])
    assert [c.hybrid for c in report.claims] == [c.rule_score for c in report.claims]
    assert all(c.judge_probs == {} for c in report.claims)
    assert [c.label for c in report.claims] == ["supported", "contradiction", "unsupported"]
    assert [c.text for c in report.flagged] == [UNSAFE, INVENTED]
    assert report.errors and "judge" in report.errors[0]


def test_claim_missing_from_judge_reply_is_scored_rule_only() -> None:
    bad_logits = {"supported": "high"}
    client = FakeLLM({
        CRITIC: _decomposition(GROUNDED, INVENTED, UNSAFE),
        CRITIC_JUDGE: json.dumps({"claims": [{"id": 1, "logits": _logits(supported=2.0)}, {"id": 3, "logits": bad_logits}]}),
    })
    report = ClinicalCritic(client).review(CASE, _blackboard(), ["A"])
    first, second, third = report.claims
    assert first.judge_probs and first.hybrid != first.rule_score
    assert (second.judge_probs, second.hybrid) == ({}, second.rule_score)
    assert (third.judge_probs, third.hybrid) == ({}, third.rule_score)
    assert len(report.errors) == 1 and "2, 3" in report.errors[0]


@pytest.mark.parametrize("reply", ["no json here", '{"claims": []}', '{"claims": [{"agent": "x"}, 7]}'])
def test_malformed_decomposition_falls_back_to_blackboard_claims(reply: str) -> None:
    client = FakeLLM({CRITIC: reply, CRITIC_JUDGE: _judge(_logits(supported=1.0), _logits(supported=1.0))})
    report = ClinicalCritic(client).review(CASE, _blackboard(), ["A"])
    assert [(c.agent, c.text) for c in report.claims] == [
        ("pharmacology", "Azithromycin avoids the penicillin allergy"),
        ("pathology", UNSAFE),
    ]
    assert report.errors and "decomposition" in report.errors[0]
    assert [r.role for r in report.calls] == [CRITIC, CRITIC_JUDGE]


def test_no_claims_anywhere_skips_the_judge() -> None:
    client = FakeLLM({CRITIC: "{}"})
    report = ClinicalCritic(client).review(CASE, Blackboard(), [])
    assert (report.claims, report.flagged) == ([], [])
    assert [r.role for r in report.calls] == [CRITIC]
    assert report.lambda_ == pytest.approx(adaptive_lambda([]))
