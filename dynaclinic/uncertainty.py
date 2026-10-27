"""Meta-Controller Uncertainty Score U and the proposal's piecewise mode rule.

U is the normalised entropy of the initial probability distribution over the top-k diagnostic differentials of
one baseline generalist sweep (``prompts.GENERALIST``): ``U = H(p) / ln(k)`` in [0, 1]. A multiple-choice case's
hypotheses are its options (k = number of options). Differentials beyond the k most probable are dropped, fewer
than k count the rest as zero mass, and the kept probabilities are renormalised to sum to 1.

Mode rule (``select_mode``), with the Complexity Score C of ``triage.complexity``:
hierarchical if C <= tau_c and U <= tau_u; collaborative if C > tau_c and U <= tau_u; adversarial if U > tau_u.

``TAU_U`` = 0.8 is an assumed value, not validated (and not tuned on the proposal's examples).
"""

import math
import re
from collections.abc import Sequence

from dynaclinic.parsing import extract_json
from dynaclinic.types import Mode

TAU_U = 0.8  # assumed, not validated
DEFAULT_K = 5
_OPTION = re.compile(r"\(?([A-Z])(?:[.):\s]|$)")


def normalized_entropy(probabilities: Sequence[float], k: int) -> float:
    """``H(p) / ln(k)`` of ``probabilities`` (non-negative, positive sum) renormalised to sum 1, clamped to [0, 1];
    0 when ``k < 2`` (nothing to be uncertain about)."""
    if k < 2:
        return 0.0
    total = sum(probabilities)
    entropy = sum(p / total * math.log(total / p) for p in probabilities if p > 0)
    return min(max(entropy / math.log(k), 0.0), 1.0)


def parse_sweep(text: str, letters: Sequence[str], k: int) -> tuple[dict[str, float] | None, str | None]:
    """``(differential, error)`` of a sweep reply ``{"differential": [{"hypothesis", "probability"}]}``.

    ``differential`` maps the k most probable hypotheses (multiple choice: option letters; others ignored) to
    renormalised probabilities, most probable first. ``None`` with the reason when the reply is malformed: no JSON or
    differential list, a probability that is not a non-negative number, or no positive mass on a valid hypothesis.
    """
    data = extract_json(text)
    entries = (data or {}).get("differential")
    if not isinstance(entries, list) or not entries:
        return None, "reply has no differential list"
    mass: dict[str, float] = {}
    for entry in entries:
        if not isinstance(entry, dict):
            return None, f"differential entry {entry!r} is not an object"
        hypothesis, probability = str(entry.get("hypothesis", "")).strip(), entry.get("probability")
        if isinstance(probability, bool) or not isinstance(probability, int | float) or not probability >= 0:
            return None, f"probability {probability!r} of {hypothesis!r} is not a non-negative number"
        if letters:
            option = _OPTION.match(hypothesis)
            hypothesis = option.group(1) if option and option.group(1) in letters else ""
        if hypothesis:
            mass[hypothesis] = mass.get(hypothesis, 0.0) + float(probability)
    top = sorted(mass.items(), key=lambda item: item[1], reverse=True)[:k]
    total = sum(p for _, p in top)
    if not math.isfinite(total) or total <= 0:
        return None, "no probability mass on a valid hypothesis"
    return {hypothesis: p / total for hypothesis, p in top}, None


def select_mode(c: float, u: float, tau_c: float, tau_u: float) -> Mode:
    """The piecewise rule: adversarial if ``u > tau_u`` (regardless of C), else collaborative if ``c > tau_c``, else
    hierarchical. Equalities fall on the ``<=`` side."""
    if u > tau_u:
        return "adversarial"
    return "collaborative" if c > tau_c else "hierarchical"
