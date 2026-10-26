"""Meta-Controller tier 2: conflict-aware routing over the care team's option distributions.

Every distribution is first ``normalize``d over the case's option letters:
``p_i = (max(x_i, 0) + eps) / sum_j (max(x_j, 0) + eps)`` (non-numeric / non-finite / unknown-letter entries
count as 0; an empty distribution becomes uniform), so every log below is finite.

- JS distance (base 2, in [0, 1]): ``d(P, Q) = sqrt(JSD(P, Q))`` with
  ``JSD = 1/2 KL(P || M) + 1/2 KL(Q || M)``, ``M = (P + Q) / 2``, ``KL(P || M) = sum_i p_i log2(p_i / m_i)``.
- Divergence: mean of ``d`` over all unordered agent pairs (0 with fewer than two agents).
- Top-1 disagreement: agents' argmax letters differ (ties go to the earlier option letter).
- Conflict Set: letters in at least one agent's top-2 whose spread ``max_a p_a(l) - min_a p_a(l)``
  is ``>= spread_threshold`` (default 0.3).
- Switch to adversarial mode iff ``divergence >= tau`` (default 0.25) OR top-1 disagreement.

``margin_loss`` is the proposal's multi-label margin objective (BCE + hinge margin). It needs the gold
answer, so it is a calibration metric for evaluation and tests only; it is NOT used for live routing.
"""

import itertools
import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

import numpy as np

EPS = 1e-6
TAU = 0.25
SPREAD_THRESHOLD = 0.3
MARGIN = 0.2

Distribution = Mapping[str, Any]


def _as_float(value: Any) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return 0.0
    return number if math.isfinite(number) and number > 0 else 0.0


def _vector(dist: Distribution | None, letters: Sequence[str], eps: float) -> np.ndarray:
    raw = {str(k).strip().upper(): _as_float(v) for k, v in dist.items()} if isinstance(dist, Mapping) else {}
    vector = np.array([raw.get(letter, 0.0) for letter in letters]) + eps
    return vector / vector.sum()


def normalize(dist: Distribution | None, letters: Sequence[str], eps: float = EPS) -> dict[str, float]:
    """Return an epsilon-smoothed probability distribution over ``letters`` (see module docstring)."""
    return dict(zip(letters, _vector(dist, letters, eps).tolist(), strict=True))


def js_distance(p: Distribution, q: Distribution, letters: Sequence[str], eps: float = EPS) -> float:
    """Jensen-Shannon distance ``sqrt(JSD)`` in bits: 0 for identical, ~1 for disjoint distributions."""
    pv, qv = _vector(p, letters, eps), _vector(q, letters, eps)
    m = (pv + qv) / 2
    jsd = 0.5 * float(np.sum(pv * np.log2(pv / m))) + 0.5 * float(np.sum(qv * np.log2(qv / m)))
    return math.sqrt(min(max(jsd, 0.0), 1.0))


def mean_pairwise_divergence(dists: Sequence[Distribution], letters: Sequence[str], eps: float = EPS) -> float:
    """Mean JS distance over all unordered pairs; 0.0 for fewer than two distributions."""
    pairs = [js_distance(p, q, letters, eps) for p, q in itertools.combinations(dists, 2)]
    return sum(pairs) / len(pairs) if pairs else 0.0


def _ranked(dist: Distribution, letters: Sequence[str], eps: float) -> list[str]:
    probs = _vector(dist, letters, eps)
    return [letters[i] for i in sorted(range(len(letters)), key=lambda i: (-probs[i], i))]


def top1(dist: Distribution, letters: Sequence[str], eps: float = EPS) -> str:
    """Most probable letter; ties go to the earlier letter in ``letters``."""
    return _ranked(dist, letters, eps)[0]


def top1_disagreement(dists: Sequence[Distribution], letters: Sequence[str], eps: float = EPS) -> bool:
    """True when the agents' top-1 letters are not all the same."""
    return len({top1(dist, letters, eps) for dist in dists}) > 1


def conflict_set(
    dists: Sequence[Distribution], letters: Sequence[str], spread_threshold: float = SPREAD_THRESHOLD, eps: float = EPS
) -> list[str]:
    """Letters in someone's top-2 whose cross-agent probability spread is ``>= spread_threshold``, in option order."""
    if not dists:
        return []
    candidates = {letter for dist in dists for letter in _ranked(dist, letters, eps)[:2]}
    matrix = np.stack([_vector(dist, letters, eps) for dist in dists])
    spread = matrix.max(axis=0) - matrix.min(axis=0)
    return [letter for i, letter in enumerate(letters) if letter in candidates and spread[i] >= spread_threshold]


def should_switch(divergence: float, disagreement: bool, tau: float = TAU) -> bool:
    """Adversarial switch rule: ``divergence >= tau`` OR top-1 disagreement."""
    return divergence >= tau or disagreement


@dataclass
class DivergenceReport:
    """Tier-2 routing decision for one care-team round."""

    divergence: float
    top1: dict[str, str]  # agent -> top-1 letter
    disagreement: bool
    conflict_set: list[str]
    switch: bool


def assess(
    distributions: Mapping[str, Distribution],
    letters: Sequence[str],
    tau: float = TAU,
    spread_threshold: float = SPREAD_THRESHOLD,
    eps: float = EPS,
) -> DivergenceReport:
    """Compute divergence, top-1 disagreement, Conflict Set and the switch decision for ``{agent: distribution}``."""
    dists = list(distributions.values())
    divergence = mean_pairwise_divergence(dists, letters, eps)
    disagreement = top1_disagreement(dists, letters, eps)
    return DivergenceReport(
        divergence=divergence,
        top1={agent: top1(dist, letters, eps) for agent, dist in distributions.items()},
        disagreement=disagreement,
        conflict_set=conflict_set(dists, letters, spread_threshold, eps),
        switch=should_switch(divergence, disagreement, tau),
    )


def margin_loss(
    probs: Distribution, gold: str, margin: float = MARGIN, letters: Sequence[str] | None = None, eps: float = EPS
) -> float:
    """Multi-label margin loss ``L = L_BCE + L_margin`` for one prediction (calibration metric, needs gold).

    With ``p`` = normalized ``probs`` over ``letters`` (default: sorted keys of ``probs``) and one-hot gold ``y``:
    ``L_BCE = -1/n sum_i [y_i log p_i + (1 - y_i) log(1 - p_i)]`` and
    ``L_margin = max(0, margin - (p_gold - max_{j != gold} p_j))``.
    """
    letters = list(letters) if letters is not None else sorted(str(k).strip().upper() for k in probs)
    if gold not in letters:
        raise ValueError(f"gold letter {gold!r} is not one of {letters}")
    p = np.clip(_vector(probs, letters, eps), eps, 1 - eps)
    y = np.array([letter == gold for letter in letters], dtype=float)
    bce = -float(np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))
    gold_index = letters.index(gold)
    competitors = np.delete(p, gold_index)
    hinge = max(0.0, margin - (p[gold_index] - competitors.max())) if competitors.size else 0.0
    return bce + float(hinge)
