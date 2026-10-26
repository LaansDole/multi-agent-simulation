"""Clinical Critic (adversarial mode): atomic claims scored by an adaptive rule/LLM-judge hybrid.

1. Decomposition (role ``critic``): Blackboard + Conflict Set -> ``{"claims": [{"text", "agent"}]}``.
   A malformed or empty reply falls back to the claims the specialists posted on the Blackboard (recorded).
2. Rule score ``r`` in [0, 1]: 0 if the claim asserts a drug the KB marks ``contraindicated`` for this patient
   (``kb.patient_conflicts``: allergy class, interaction with current meds, condition contraindication);
   otherwise grounding ``|T(claim) & T(evidence)| / |T(claim)|`` over lower-case content tokens (stop-words and
   one-letter words dropped), evidence = vignette + structured sections (options excluded).
3. Judge (role ``critic_judge``): logits ``z`` over (supported, unsupported, fabrication, contradiction);
   ``probs = softmax(z / T)`` with ``T = judge_temperature`` (default 1.5); ``judge_supported = probs["supported"]``.
4. ``lambda = sigmoid(k * (var(r) - v0))``, ``k = 10``, ``v0 = 0.05``, ``var`` = population variance of the rule
   scores in this review; ``hybrid = lambda * r + (1 - lambda) * judge_supported``.
   Direction: high variance means the rules separate the claims decisively (some grounded, some ungrounded or
   KB-violating), so rules weigh more; low variance means the rules cannot discriminate (e.g. uniformly weak
   grounding), so the judge dominates - the proposal's "weak rule grounding -> rely on the judge".
5. A claim is flagged iff ``hybrid < 0.5`` or it has a KB contradiction (hard veto: a deterministic
   allergy/interaction/contraindication hit is never outvoted by the judge).
   Label: unflagged -> ``supported``; KB hit -> ``contradiction``; else the judge's most likely non-supported
   label, or ``unsupported`` without judge output.

A malformed judge reply, or missing/invalid logits for a claim, scores that claim rule-only (``hybrid = r``,
``judge_probs = {}``) and is recorded in ``CriticReport.errors``.
"""

import math
import re
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any, get_args

import numpy as np

from dynaclinic.blackboard import Blackboard
from dynaclinic.interfaces import sections_from_structured
from dynaclinic.kb import patient_conflicts
from dynaclinic.llm import LLMClient
from dynaclinic.parsing import extract_json
from dynaclinic.prompts import (
    CRITIC,
    CRITIC_JUDGE,
    SYSTEM_PROMPTS,
    case_block,
    options_block,
)
from dynaclinic.types import CallRecord, Case, Claim, ClaimLabel

LABELS: tuple[str, ...] = get_args(ClaimLabel)  # supported, unsupported, fabrication, contradiction
JUDGE_TEMPERATURE = 1.5
LAMBDA_K = 10.0
LAMBDA_V0 = 0.05
FLAG_THRESHOLD = 0.5

_TOKEN = re.compile(r"[a-z0-9]+(?:\.[0-9]+)?")
_STOPWORDS = frozenset({
    "a", "an", "the", "and", "or", "but", "of", "to", "in", "on", "at", "for", "with", "by", "from", "as", "is", "are",
    "was", "were", "be", "been", "being", "has", "have", "had", "do", "does", "did", "this", "that", "these", "those",
    "it", "its", "he", "she", "his", "her", "they", "their", "them", "patient", "patients", "which", "who", "whom",
    "than", "then", "there", "no", "not", "can", "could", "may", "might", "should", "would", "will", "shall",
})


@dataclass
class CriticReport:
    """Outcome of one adversarial review."""

    claims: list[Claim]
    flagged: list[Claim]
    lambda_: float
    calls: list[CallRecord] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


def _content_tokens(text: str) -> set[str]:
    return {t for t in _TOKEN.findall(text.lower()) if t not in _STOPWORDS and (len(t) > 1 or t.isdigit())}


def grounding(claim: str, evidence: str) -> float:
    """Fraction of the claim's content tokens that appear in ``evidence`` (0.0 for a claim with none)."""
    tokens = _content_tokens(claim)
    return len(tokens & _content_tokens(evidence)) / len(tokens) if tokens else 0.0


def _evidence(case: Case) -> str:
    return "\n".join([case.vignette, *sections_from_structured(case.structured).values()])


def _kb_contradicts(claim: str, case: Case) -> bool:
    return any(c.severity == "contraindicated" for c in patient_conflicts(claim, case.structured))


def rule_score(claim: str, case: Case) -> float:
    """0.0 if the claim asserts a KB-contraindicated drug for this patient, else its grounding in the case."""
    return 0.0 if _kb_contradicts(claim, case) else grounding(claim, _evidence(case))


def judge_probs(logits: Mapping[str, float], temperature: float = JUDGE_TEMPERATURE) -> dict[str, float]:
    """``softmax(z / T)`` over ``LABELS``; ``T > 1`` flattens, ``T < 1`` sharpens (ranking is unchanged)."""
    if temperature <= 0:
        raise ValueError(f"judge temperature must be > 0, got {temperature}")
    z = np.array([float(logits[label]) for label in LABELS]) / temperature
    weights = np.exp(z - z.max())
    return dict(zip(LABELS, (weights / weights.sum()).tolist(), strict=True))


def adaptive_lambda(rule_scores: Sequence[float], k: float = LAMBDA_K, v0: float = LAMBDA_V0) -> float:
    """``sigmoid(k * (var(rule_scores) - v0))``; an empty review has variance 0."""
    variance = float(np.var(rule_scores)) if len(rule_scores) else 0.0
    return 1.0 / (1.0 + math.exp(-k * (variance - v0)))


def _valid_logits(value: Any) -> dict[str, float] | None:
    if not isinstance(value, Mapping):
        return None
    try:
        logits = {label: float(value[label]) for label in LABELS}
    except (KeyError, TypeError, ValueError):
        return None
    return logits if all(math.isfinite(z) for z in logits.values()) else None


def _parse_judge(text: str, count: int) -> dict[int, dict[str, float]]:
    """Map 1-based claim number -> valid logits; claims without valid logits are absent."""
    items = (extract_json(text) or {}).get("claims")
    found: dict[int, dict[str, float]] = {}
    for item in items if isinstance(items, list) else []:
        if not isinstance(item, Mapping):
            continue
        try:
            number = int(item.get("id"))
        except (TypeError, ValueError):
            continue
        logits = _valid_logits(item.get("logits"))
        if logits is not None and 1 <= number <= count:
            found[number] = logits
    return found


def _parse_claims(text: str) -> list[tuple[str, str]]:
    """``(agent, text)`` pairs from a decomposition reply; items without text are dropped."""
    items = (extract_json(text) or {}).get("claims")
    claims = []
    for item in items if isinstance(items, list) else []:
        if isinstance(item, str):
            item = {"text": item}
        if isinstance(item, Mapping) and isinstance(item.get("text"), str) and item["text"].strip():
            agent = item.get("agent")
            claims.append((agent if isinstance(agent, str) and agent else "consensus", item["text"].strip()))
    return claims


class ClinicalCritic:
    """Adversarial-mode critic: decompose the Blackboard into claims, score them, flag the unreliable ones."""

    def __init__(
        self,
        client: LLMClient,
        judge_temperature: float = JUDGE_TEMPERATURE,
        k: float = LAMBDA_K,
        v0: float = LAMBDA_V0,
        flag_threshold: float = FLAG_THRESHOLD,
    ) -> None:
        if judge_temperature <= 0:
            raise ValueError(f"judge temperature must be > 0, got {judge_temperature}")
        self.client = client
        self.judge_temperature = judge_temperature
        self.k = k
        self.v0 = v0
        self.flag_threshold = flag_threshold

    def review(self, case: Case, blackboard: Blackboard, conflict_set: Iterable[str]) -> CriticReport:
        """Run decomposition + judge calls and return scored, flagged claims (see module docstring)."""
        calls: list[CallRecord] = []
        errors: list[str] = []
        conflicts = ", ".join(conflict_set) or "none"
        user = (
            f"Question: {case.question}\nOptions:\n{options_block(case)}\n\n"
            f"Conflict set: {conflicts}\n\nBlackboard:\n{blackboard.snapshot()}"
        )
        text, record = self.client.complete(CRITIC, SYSTEM_PROMPTS[CRITIC], user, json_mode=True)
        calls.append(record)
        pairs = _parse_claims(text)
        if not pairs:
            pairs = [(entry.agent, claim) for entry in blackboard.entries() for claim in entry.claims]
            errors.append(f"malformed or empty decomposition; used {len(pairs)} Blackboard claims")
        kb_hits = [_kb_contradicts(claim, case) for _, claim in pairs]
        evidence = _evidence(case)
        rules = [0.0 if hit else grounding(claim, evidence) for (_, claim), hit in zip(pairs, kb_hits, strict=True)]
        lambda_ = adaptive_lambda(rules, self.k, self.v0)
        if not pairs:
            return CriticReport([], [], lambda_, calls, errors)

        numbered = "\n".join(f"{i}. {claim}" for i, (_, claim) in enumerate(pairs, 1))
        user = f"{case_block(case, sections_from_structured(case.structured))}\n\nClaims:\n{numbered}"
        text, record = self.client.complete(CRITIC_JUDGE, SYSTEM_PROMPTS[CRITIC_JUDGE], user, json_mode=True)
        calls.append(record)
        logits = _parse_judge(text, len(pairs))
        if not logits:
            errors.append("malformed judge reply; all claims scored rule-only")
        elif missing := [i for i in range(1, len(pairs) + 1) if i not in logits]:
            errors.append(f"judge gave no valid logits for claims {', '.join(map(str, missing))}; scored rule-only")

        claims = []
        for number, ((agent, claim), rule, kb_hit) in enumerate(zip(pairs, rules, kb_hits, strict=True), 1):
            probs = judge_probs(logits[number], self.judge_temperature) if number in logits else {}
            hybrid = lambda_ * rule + (1 - lambda_) * probs["supported"] if probs else rule
            if kb_hit:
                label: ClaimLabel = "contradiction"
            elif hybrid >= self.flag_threshold:
                label = "supported"
            elif probs:
                label = max(LABELS[1:], key=probs.__getitem__)  # type: ignore[assignment]
            else:
                label = "unsupported"
            claims.append(Claim(claim, agent, rule, probs, hybrid, label))
        return CriticReport(claims, [c for c in claims if c.label != "supported"], lambda_, calls, errors)
