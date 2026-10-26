"""Layer-4 safety gates on the final answer (design spec section 5 step 8).

- A_SAD: pairwise precedence rules (``kb.precedence_violations``), checked separately on the chosen
  option text and the final text so concatenation never invents an ordering.
- T_SAD: trace rules: allergy class, KB contraindication or interaction with current meds
  (``kb.patient_conflicts``). Authoritative check: the chosen option text, because "FINAL ANSWER: D"
  commits to D's drug even if the prose never names it. The final text is checked too, but once an
  option is chosen, drugs named only by other options are ignored there: rationales name the drugs
  they reject ("the warnings concern meperidine, not ketorolac"). Only severity ``contraindicated``
  fails the gate; ``caution`` hits are reported in ``SafetyReport.caution``.
- S_NAP: stub, always passes (no next-activity predictor in the MVP).

Cross-task disagreement ``D`` is the fraction of gates in the minority verdict (0 when all agree).
"""

from dataclasses import dataclass, field

from dynaclinic.kb import drugs_in, patient_conflicts, precedence_violations
from dynaclinic.types import Case, GateResult

S_NAP_NOTE = "not implemented (stub)"


@dataclass
class SafetyReport:
    """All gate verdicts for one final answer."""

    gates: list[GateResult]
    blocked: bool  # any gate failed
    disagreement: float  # cross-task disagreement D in [0, 0.5]
    caution: list[str] = field(default_factory=list)


def _chosen_option(case: Case, final_answer: str | None) -> str | None:
    return next((o.text for o in case.options if o.letter == final_answer), None)


def _rejected_drugs(case: Case, chosen: str | None) -> set[str]:
    """Drugs named only by non-chosen options; none until an option is chosen."""
    if chosen is None:
        return set()
    # ponytail: a rationale that recommends a rejected option's drug as an add-on slips through; the chosen
    # option is the commitment that is graded, a parsed plan would close this.
    return set().union(*(drugs_in(o.text) for o in case.options)) - drugs_in(chosen)


def run_gates(case: Case, final_text: str, final_answer: str | None) -> SafetyReport:
    """Run A_SAD, T_SAD and S_NAP on the chosen option text plus ``final_text``."""
    chosen = _chosen_option(case, final_answer)
    texts = [text for text in (chosen, final_text) if text]
    precedence = list(dict.fromkeys(str(c) for text in texts for c in precedence_violations(text)))
    rejected = _rejected_drugs(case, chosen)
    conflicts = list(dict.fromkeys([
        *patient_conflicts(chosen or "", case.structured),
        *(c for c in patient_conflicts(final_text, case.structured) if c.subject not in rejected),
    ]))
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
