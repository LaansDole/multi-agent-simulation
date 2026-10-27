"""Core DynaClinic data model (design spec section 3).

Every type serialises with ``to_dict()`` to plain JSON-safe values and
rebuilds with ``from_dict()``.
"""

from dataclasses import asdict, dataclass, field
from typing import Any, Literal, Self

Tier = Literal["LOW", "MODERATE", "HIGH"]
Route = Tier  # Meta-Controller routing decision (``ROUTE: LOW|MODERATE|HIGH``)
Mode = Literal["single", "collaborative", "adversarial"]
EntryKind = Literal["finding", "hypothesis", "critique", "verdict"]
ClaimLabel = Literal["supported", "unsupported", "fabrication", "contradiction"]
GateName = Literal["A_SAD", "T_SAD", "S_NAP"]

TIERS: tuple[str, ...] = ("LOW", "MODERATE", "HIGH")


class _Serializable:
    """``to_dict``/``from_dict`` for dataclasses whose fields are JSON-safe."""

    def to_dict(self) -> dict[str, Any]:
        """Return a deep, JSON-safe copy of this object."""
        return asdict(self)  # type: ignore[call-overload]

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Self:
        """Rebuild an object from ``to_dict()`` output."""
        return cls(**data)


@dataclass
class Option(_Serializable):
    """One multiple-choice option."""

    letter: str
    text: str


@dataclass
class Case(_Serializable):
    """A clinical vignette with options, gold answer and optional FHIR-lite fields.

    ``structured`` keys (all optional): demographics, history, meds, allergies,
    labs (``[{name, value, unit, time}]``), imaging.
    ``unsafe_options`` lists letters that are safety traps for this patient.
    A case without options is an open-ended clinical scenario (``open_ended``); its ``question`` may be empty.
    """

    id: str
    source: Literal["synthetic", "medqa", "devall"]  # devall: task prompt of a DevAll run (see devall_nodes)
    vignette: str
    question: str
    options: list[Option]
    answer: str
    gold_tier: Tier | None = None
    structured: dict[str, Any] = field(default_factory=dict)
    unsafe_options: list[str] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)

    def letters(self) -> list[str]:
        """Return the option letters in order."""
        return [option.letter for option in self.options]

    @property
    def open_ended(self) -> bool:
        """True without answer options: answered with a clinical write-up, never a letter."""
        return not self.options

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Self:
        """Rebuild a case, restoring ``Option`` objects."""
        return cls(**{**data, "options": [Option.from_dict(o) for o in data["options"]]})


@dataclass
class CallRecord(_Serializable):
    """Accounting for one LLM call."""

    role: str
    model: str
    prompt_tokens: int
    completion_tokens: int
    latency_s: float
    fallback_used: bool


@dataclass
class BlackboardEntry(_Serializable):
    """One agent contribution to the shared Blackboard."""

    agent: str
    kind: EntryKind
    content: str
    distribution: dict[str, float] | None = None
    claims: list[str] = field(default_factory=list)
    step: int = 0


@dataclass
class Claim(_Serializable):
    """An atomic claim scored by the Clinical Critic."""

    text: str
    agent: str
    rule_score: float
    judge_probs: dict[str, float]
    hybrid: float
    label: ClaimLabel


@dataclass
class GateResult(_Serializable):
    """Outcome of one Layer-4 safety gate."""

    name: GateName
    passed: bool
    violations: list[str] = field(default_factory=list)
    note: str = ""


@dataclass
class RunResult(_Serializable):
    """Outcome of one case run through one pipeline arm.

    ``error`` is a fatal failure (no answer); ``warnings`` are degraded but completed stages
    (failed specialist, triage fallback, malformed critic reply, failed regeneration).
    """

    case_id: str
    arm: str
    route: list[str] = field(default_factory=list)
    tier: Tier | None = None
    mode: Mode | None = None
    divergence: float | None = None
    conflict_set: list[str] = field(default_factory=list)
    final_answer: str | None = None
    final_text: str = ""
    gates: list[GateResult] = field(default_factory=list)
    blocked: bool = False
    calls: list[CallRecord] = field(default_factory=list)
    latency_s: float = 0.0
    cache_hit: bool = False
    error: str | None = None
    # Meta-Controller tier 1: llm_tier, deterministic_tier, score, features, escalated, rationale, llm_features.
    triage: dict[str, Any] = field(default_factory=dict)
    # Tier 2 divergence report beyond ``divergence``/``conflict_set``; ``distributions`` feed margin_loss in eval.
    distributions: dict[str, dict[str, float]] = field(default_factory=dict)
    top1: dict[str, str] = field(default_factory=dict)
    disagreement: bool | None = None
    switch: bool | None = None
    flagged_claims: list[str] = field(default_factory=list)
    gate_disagreement: float | None = None
    caution: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Self:
        """Rebuild a result, restoring ``GateResult`` and ``CallRecord`` objects."""
        return cls(
            **{
                **data,
                "gates": [GateResult.from_dict(g) for g in data.get("gates", [])],
                "calls": [CallRecord.from_dict(c) for c in data.get("calls", [])],
            }
        )
