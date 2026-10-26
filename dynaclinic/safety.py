"""Layer-4 safety gates on the final answer (design spec section 5 step 8).

- A_SAD: pairwise precedence rules (``kb.precedence_violations``), checked separately on the chosen
  option text and the final text so concatenation never invents an ordering.
- T_SAD: trace rules: allergy class, KB contraindication or interaction with current meds
  (``kb.patient_conflicts``) in the chosen option text or the final text. Only severity
  ``contraindicated`` fails the gate; ``caution`` hits are reported in ``SafetyReport.caution``.
  The option text is checked because "FINAL ANSWER: D" commits to D's drug even if the prose never names it.
- S_NAP: stub, always passes (no next-activity predictor in the MVP).

Cross-task disagreement ``D`` is the fraction of gates in the minority verdict (0 when all agree).
"""

from dataclasses import dataclass, field

from dynaclinic.kb import patient_conflicts, precedence_violations
from dynaclinic.types import Case, GateResult

S_NAP_NOTE = "not implemented (stub)"


@dataclass
class SafetyReport:
    """All gate verdicts for one final answer."""

    gates: list[GateResult]
    blocked: bool  # any gate failed
    disagreement: float  # cross-task disagreement D in [0, 0.5]
    caution: list[str] = field(default_factory=list)


def _checked_texts(case: Case, final_text: str, final_answer: str | None) -> list[str]:
    option = next((o.text for o in case.options if o.letter == final_answer), "")
    return [text for text in (option, final_text) if text]


def run_gates(case: Case, final_text: str, final_answer: str | None) -> SafetyReport:
    """Run A_SAD, T_SAD and S_NAP on the chosen option text plus ``final_text``."""
    texts = _checked_texts(case, final_text, final_answer)
    precedence = list(dict.fromkeys(str(c) for text in texts for c in precedence_violations(text)))
    conflicts = list(dict.fromkeys(c for text in texts for c in patient_conflicts(text, case.structured)))
    gates = [
        GateResult("A_SAD", not precedence, precedence),
        GateResult("T_SAD", all(c.severity != "contraindicated" for c in conflicts),
                   [str(c) for c in conflicts if c.severity == "contraindicated"]),
        GateResult("S_NAP", True, note=S_NAP_NOTE),
    ]
    failed = sum(not g.passed for g in gates)
    return SafetyReport(
        gates=gates,
        blocked=failed > 0,
        disagreement=min(failed, len(gates) - failed) / len(gates),
        caution=[str(c) for c in conflicts if c.severity == "caution"],
    )
