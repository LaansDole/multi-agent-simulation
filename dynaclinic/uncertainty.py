"""Meta-Controller Uncertainty Score U and the proposal's piecewise mode rule.

U is the normalised entropy of the initial probability distribution over the top-k diagnostic differentials of
one baseline generalist sweep (``prompts.GENERALIST``): ``U = H(p) / ln(k)`` in [0, 1]. A multiple-choice case's
hypotheses are its options (k = number of options). Differentials beyond the k most probable are dropped, fewer
than k count the rest as zero mass, and the kept probabilities are renormalised to sum to 1.

Mode rule (``select_mode``), with the Complexity Score C of ``triage.complexity``:
hierarchical if C <= tau_c and U <= tau_u; collaborative if C > tau_c and U <= tau_u; adversarial if U > tau_u.

tau_u depends on the input form (``tau_u_for``), since k and so the scale of U differ, and on the model: U's scale
is model-specific, so ``TAU_U_BY_MODEL`` holds one row per model (``tau_u_row``). Each value is the 75th percentile
of U on held-out cases (``python -m dynaclinic.eval.calibrate``); calibrated, not validated against outcomes, and not
tuned on the proposal's examples. A model without a row falls back to ``FALLBACK_MODEL``'s with a warning.
"""

import math
import re
from collections.abc import Sequence
from typing import NamedTuple

from dynaclinic.parsing import extract_json
from dynaclinic.types import Case, Mode


class TauU(NamedTuple):
    """One model's uncertainty thresholds per input form and where they come from."""

    mcq: float  # multiple choice, k = the options
    open: float  # open-ended, k = DEFAULT_K differentials
    provenance: str


FALLBACK_MODEL = "gpt-6-luna"
# Model id as the client sends it -> its thresholds. Add a row per model from `python -m dynaclinic.eval.calibrate`
# (it prints the row). qwen3.5-4b is calibrated on synthetic-24 only: MedQA-50 was NOT used, so it stays held out for qwen.
TAU_U_BY_MODEL: dict[str, TauU] = {
    "gpt-6-luna": TauU(0.15, 0.59, "p75 of U on held-out MedQA-50 + synthetic-24 (n = 74; multiple choice p50 0.086, "
                       "p90 0.342) and the same vignettes without options or question (k = 5; p50 0.385, p90 0.744)"),
    "qwen3.5-4b": TauU(0.81, 0.77, "p75 of U on synthetic (multiple choice, n = 24, p50 0.653, p90 0.819) and the same "
                       "vignettes without options or question (k = 5, n = 24, p50 0.685, p90 0.857); "
                       "dynaclinic.eval.calibrate 2026-10-28"),
}
TAU_U_MCQ, TAU_U_OPEN, _ = TAU_U_BY_MODEL[FALLBACK_MODEL]
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


def tau_u_for(case_or_open_ended: Case | bool, tau_u_mcq: float = TAU_U_MCQ, tau_u_open: float = TAU_U_OPEN) -> float:
    """The tau_u of a case's input form (or of ``open_ended``): ``tau_u_open`` without options, else ``tau_u_mcq``."""
    open_ended = case_or_open_ended.open_ended if isinstance(case_or_open_ended, Case) else case_or_open_ended
    return tau_u_open if open_ended else tau_u_mcq


def tau_u_row(model: str | None) -> tuple[TauU, str, str | None]:
    """``(row, source, warning)`` for the client's ``model``: its calibrated row, else ``FALLBACK_MODEL``'s with a
    warning; a client without a model id (``FakeLLM``) gets the fallback row without one."""
    if model in TAU_U_BY_MODEL:
        return TAU_U_BY_MODEL[model], f"calibrated for {model}", None
    row = TAU_U_BY_MODEL[FALLBACK_MODEL]
    if model is None:
        return row, f"{FALLBACK_MODEL}'s (no model id)", None
    return row, f"uncalibrated: fallback to {FALLBACK_MODEL}'s", f"tau_u not calibrated for {model}; using {FALLBACK_MODEL}'s"


def select_mode(c: float, u: float, tau_c: float, tau_u: float) -> Mode:
    """The piecewise rule: adversarial if ``u > tau_u`` (regardless of C), else collaborative if ``c > tau_c``, else
    hierarchical. Equalities fall on the ``<=`` side."""
    if u > tau_u:
        return "adversarial"
    return "collaborative" if c > tau_c else "hierarchical"
