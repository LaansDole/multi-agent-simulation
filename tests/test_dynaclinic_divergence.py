"""Tests for dynaclinic.divergence (tier-2 conflict-aware routing math)."""

import itertools
import math

import numpy as np
import pytest

from dynaclinic.divergence import (
    TAU,
    assess,
    conflict_set,
    js_distance,
    margin_loss,
    mean_pairwise_divergence,
    normalize,
    should_switch,
    top1,
    top1_disagreement,
)
from tests.dynaclinic_fixtures import no_network  # noqa: F401

LETTERS = ["A", "B", "C", "D", "E"]


def _random_dists(count: int, seed: int = 7) -> list[dict[str, float]]:
    rng = np.random.default_rng(seed)
    return [dict(zip(LETTERS, rng.dirichlet(np.ones(len(LETTERS))).tolist(), strict=True)) for _ in range(count)]


def test_identical_distributions_have_zero_distance() -> None:
    for dist in [*_random_dists(5), {"A": 1.0}]:
        assert js_distance(dist, dict(dist), LETTERS) == pytest.approx(0.0, abs=1e-9)


def test_disjoint_one_hots_have_distance_one() -> None:
    assert js_distance({"A": 1.0}, {"B": 1.0}, LETTERS) == pytest.approx(1.0, abs=1e-4)


def test_js_distance_is_symmetric_bounded_and_a_metric() -> None:
    dists = _random_dists(6)
    for p, q in itertools.combinations(dists, 2):
        d = js_distance(p, q, LETTERS)
        assert 0.0 <= d <= 1.0
        assert d == pytest.approx(js_distance(q, p, LETTERS), abs=1e-12)
    for p, q, r in itertools.permutations(dists[:4], 3):
        assert js_distance(p, r, LETTERS) <= js_distance(p, q, LETTERS) + js_distance(q, r, LETTERS) + 1e-12


def test_js_distance_uses_base_two() -> None:
    # JSD({A:1}, {A:.5,B:.5}) = 1.5 - 0.75*log2(3) bits; distance is its square root.
    expected = math.sqrt(1.5 - 0.75 * math.log2(3))
    assert js_distance({"A": 1.0}, {"A": 0.5, "B": 0.5}, ["A", "B"]) == pytest.approx(expected, abs=1e-4)


def test_normalize_survives_garbage_and_returns_a_distribution_over_letters() -> None:
    dist = normalize({"a": 60, "B": "40", "C": -5, "D": "x", "E": float("nan"), "Z": 99}, LETTERS)
    assert list(dist) == LETTERS
    assert sum(dist.values()) == pytest.approx(1.0)
    assert dist["A"] == pytest.approx(0.6, abs=1e-4) and dist["B"] == pytest.approx(0.4, abs=1e-4)
    assert all(dist[letter] > 0 for letter in LETTERS)  # epsilon smoothing keeps logs finite


@pytest.mark.parametrize("raw", [None, {}, {"A": 0, "B": 0}, "not a dict"])
def test_normalize_empty_input_is_uniform(raw: object) -> None:
    assert normalize(raw, LETTERS) == pytest.approx({letter: 0.2 for letter in LETTERS})  # type: ignore[arg-type]


def test_mean_pairwise_divergence_averages_all_pairs() -> None:
    dists = _random_dists(3)
    pairs = [js_distance(p, q, LETTERS) for p, q in itertools.combinations(dists, 2)]
    assert mean_pairwise_divergence(dists, LETTERS) == pytest.approx(sum(pairs) / 3)
    assert mean_pairwise_divergence(dists[:1], LETTERS) == 0.0
    assert mean_pairwise_divergence([], LETTERS) == 0.0


def test_top1_breaks_ties_by_option_order() -> None:
    assert top1({"B": 0.5, "A": 0.5}, LETTERS) == "A"
    assert top1_disagreement([{"A": 0.5, "B": 0.5}, {"B": 0.5, "A": 0.5}], LETTERS) is False
    assert top1_disagreement([{"A": 0.6, "B": 0.4}, {"A": 0.4, "B": 0.6}], LETTERS) is True
    assert top1_disagreement([{"A": 1.0}], LETTERS) is False


def test_conflict_set_keeps_top2_letters_whose_spread_reaches_the_threshold() -> None:
    dists = [{"A": 0.6, "B": 0.3, "C": 0.1}, {"A": 0.1, "B": 0.2, "C": 0.7}]
    # top-2 union = {A, B, C}; spreads A=.5, B=.1, C=.6
    assert conflict_set(dists, LETTERS) == ["A", "C"]
    assert conflict_set(dists, LETTERS, spread_threshold=0.55) == ["C"]


def test_conflict_set_ignores_letters_outside_every_agents_top2() -> None:
    dists = [{"A": 0.35, "B": 0.33, "C": 0.32}, {"A": 0.5, "B": 0.5}]
    # C spreads by 0.32 >= 0.3 but is nobody's top-2; A/B spreads are < 0.3.
    assert conflict_set(dists, LETTERS) == []


@pytest.mark.parametrize(
    ("divergence", "disagreement", "expected"),
    [(TAU, False, True), (TAU - 1e-9, False, False), (0.0, True, True), (0.9, True, True)],
)
def test_should_switch_on_divergence_or_top1_disagreement(divergence: float, disagreement: bool, expected: bool) -> None:
    assert should_switch(divergence, disagreement) is expected


def test_assess_agreeing_team_stays_collaborative() -> None:
    report = assess({"imaging": {"A": 0.7, "B": 0.3}, "pathology": {"A": 0.8, "B": 0.2}}, LETTERS)
    assert report.top1 == {"imaging": "A", "pathology": "A"}
    assert report.divergence < TAU
    assert (report.disagreement, report.conflict_set, report.switch) == (False, [], False)


def test_assess_top1_disagreement_switches_even_at_low_divergence() -> None:
    report = assess({"imaging": {"A": 0.52, "B": 0.48}, "pharmacology": {"A": 0.48, "B": 0.52}}, LETTERS)
    assert report.divergence < TAU
    assert report.disagreement is True and report.switch is True


def test_assess_divergent_team_reports_conflict_set() -> None:
    report = assess({"imaging": {"A": 0.9, "B": 0.1}, "pathology": {"B": 0.9, "A": 0.1}}, LETTERS, tau=0.99)
    assert report.divergence == pytest.approx(js_distance({"A": 0.9, "B": 0.1}, {"B": 0.9, "A": 0.1}, LETTERS))
    assert report.conflict_set == ["A", "B"]
    assert report.switch is True  # via top-1 disagreement even though tau is not reached


def test_margin_loss_decreases_as_gold_margin_grows() -> None:
    losses = []
    for gold_p in np.linspace(0.2, 0.96, 12):
        rest = (1 - gold_p) / 4
        losses.append(margin_loss({"A": gold_p, **{letter: rest for letter in LETTERS[1:]}}, "A", letters=LETTERS))
    assert all(a > b for a, b in itertools.pairwise(losses))


def test_margin_loss_is_bce_plus_hinge() -> None:
    probs = {"A": 0.5, "B": 0.4, "C": 0.1}
    bce = -(math.log(0.5) + math.log(1 - 0.4) + math.log(1 - 0.1)) / 3
    hinge = 0.2 - (0.5 - 0.4)
    assert margin_loss(probs, "A", margin=0.2, letters=["A", "B", "C"]) == pytest.approx(bce + hinge, abs=1e-4)
    # beyond the margin only BCE remains
    probs = {"A": 0.8, "B": 0.1, "C": 0.1}
    bce = -(math.log(0.8) + 2 * math.log(0.9)) / 3
    assert margin_loss(probs, "A", margin=0.2, letters=["A", "B", "C"]) == pytest.approx(bce, abs=1e-4)


def test_margin_loss_penalises_a_wrong_top1() -> None:
    right = margin_loss({"A": 0.6, "B": 0.4}, "A", letters=["A", "B"])
    wrong = margin_loss({"A": 0.4, "B": 0.6}, "A", letters=["A", "B"])
    assert wrong > right


def test_margin_loss_rejects_gold_outside_letters() -> None:
    with pytest.raises(ValueError, match="gold"):
        margin_loss({"A": 1.0}, "F", letters=LETTERS)
