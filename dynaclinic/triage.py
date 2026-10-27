"""Meta-Controller tier 1: complexity triage -> LOW | MODERATE | HIGH.

Two signals are combined and both are kept on the result for logging:

- LLM tier: one ``triage`` call returning ``{"tier", "rationale", "features"}`` JSON.
- Deterministic feature score: ``organ_systems + comorbidities + medications + abnormal_labs + red_flags``
  (unweighted counts, see ``feature_score``), mapped to a tier by ``score_tier``.

Final tier = LLM tier, except LLM ``LOW`` with ``score >= escalate_threshold`` becomes ``MODERATE``
(safety-biased: the score can only escalate, by one level, and never de-escalates). A malformed or
invalid LLM reply falls back to the deterministic tier and is recorded in ``error``.

The keyword maps, reference ranges and cut-offs are illustrative; ``MODERATE_SCORE``/``HIGH_SCORE`` were
chosen by inspecting the 24 synthetic vignettes and are not validated on held-out data.

Complexity Score C (``complexity``) is the continuous form of the same two signals for the Meta-Controller's mode
rule; ``C > TAU_C`` holds exactly when the tier above is not LOW.
"""

import re
from dataclasses import dataclass, field
from typing import Any

from dynaclinic.interfaces import sections_from_structured
from dynaclinic.llm import LLMClient
from dynaclinic.parsing import extract_json
from dynaclinic.prompts import SYSTEM_PROMPTS, TRIAGE, case_block
from dynaclinic.types import TIERS, CallRecord, Case, Tier

MODERATE_SCORE = 6
HIGH_SCORE = 12
# Mode-rule threshold on C: fixed by construction (the LOW vs team boundary), not a tuned value.
TAU_C = 0.5
_LLM_LEVEL: dict[str | None, float] = {"LOW": 0.0, "MODERATE": 0.75, "HIGH": 1.0}

# Organ systems are counted in the vignette, history and imaging (meds and labs are scored separately).
_ORGAN_SYSTEMS = {
    name: re.compile(pattern, re.IGNORECASE)
    for name, pattern in {
        "cardiovascular": r"heart|cardi|coronar|chest pain|atrial|arrhythm|hypertens|myocard|troponin|\becg\b|\bekg\b|"
                          r"murmur|syncope|angina",
        "respiratory": r"lung|pulmonar|pneumon|asthma|copd|bronch|dyspnea|shortness of breath|cough|wheez|hypox|"
                       r"oxygen saturation",
        "renal": r"kidney|renal|egfr|dialysis|nephr|proteinuria|hematuria",
        "gastrointestinal": r"liver|hepat|cirrho|gastr|bowel|colon|abdomin|pancrea|duoden|esophag|melena|hematemesis|"
                            r"diarrh|vomit|jaundice",
        "neurologic": r"neuro|stroke|seizure|confus|mental status|weakness|headache|myasthenia|dementia|parkinson|"
                      r"numbness",
        "endocrine": r"diabet|insulin|thyroid|\btsh\b|glucose|a1c|adrenal|cortisol|ketone",
        "hematologic": r"anemi|hemoglobin|platelet|bleed|coagul|\binr\b|anticoag|thrombo|ferritin|b12",
        "infectious": r"fever|infect|sepsis|septic|cultures?|abscess|antibiotic|cellulitis|streptococ|pharyngitis",
        "musculoskeletal": r"joint|arthr|gout|fracture|osteo|back pain|synovial|muscle",
        "psychiatric": r"depress|anxiety|bipolar|schizo|psychos|suicid|panic",
        "obstetric": r"pregnan|gestation|postpartum|trimester",
        "dermatologic": r"rash|skin|erythema|eczema|psoria|urticaria",
    }.items()
}
_RED_FLAGS = re.compile(
    r"hypotension|shock|sepsis|septic|altered mental status|confus|syncope|unresponsive|hemoptysis|hematemesis|"
    r"melena|respiratory distress|hypoxi|seizure|peaked t waves|chest pain",
    re.IGNORECASE,
)
# Illustrative adult reference ranges (low, high) by lower-case lab name; unknown or non-numeric labs are skipped.
_REFERENCE_RANGES: dict[str, tuple[float | None, float | None]] = {
    "potassium": (3.5, 5.0), "sodium": (135, 145), "serum creatinine": (0.6, 1.3), "creatinine": (0.6, 1.3),
    "egfr": (60, None), "blood urea nitrogen": (7, 20), "bicarbonate": (22, 29), "anion gap": (None, 12),
    "glucose": (70, 140), "hemoglobin a1c": (None, 6.4), "hemoglobin": (12.0, 17.5),
    "white blood cell count": (4.0, 11.0), "platelet count": (150, 450), "inr": (None, 1.2), "lactate": (None, 2.0),
    "high-sensitivity troponin": (None, 14), "troponin": (None, 14), "tsh": (0.4, 4.0), "free t4": (0.8, 1.8),
    "arterial ph": (7.35, 7.45), "paco2": (35, 45), "pao2": (80, None), "ferritin": (15, 300),
    "mean corpuscular volume": (80, 100), "vitamin b12": (200, None),
}
_NUMBER = re.compile(r"-?\d+(?:\.\d+)?")


@dataclass
class TriageResult:
    """Final tier plus both signals that produced it."""

    tier: Tier
    llm_tier: Tier | None  # None when the LLM reply was malformed or invalid
    deterministic_tier: Tier
    score: int
    features: dict[str, int]
    escalated: bool  # LLM LOW bumped to MODERATE by the deterministic score
    rationale: str = ""
    llm_features: dict[str, Any] = field(default_factory=dict)
    error: str | None = None
    calls: list[CallRecord] = field(default_factory=list)


def _abnormal(lab: dict[str, Any]) -> bool:
    bounds = _REFERENCE_RANGES.get(str(lab.get("name", "")).strip().lower())
    number = _NUMBER.search(str(lab.get("value", "")).replace(",", ""))
    if not bounds or not number:
        return False
    value, (low, high) = float(number.group()), bounds
    return (low is not None and value < low) or (high is not None and value > high)


def feature_score(case: Case) -> tuple[int, dict[str, int]]:
    """Return ``(score, features)``; ``score`` is the unweighted sum of the five feature counts.

    organ_systems: systems whose keywords appear in vignette/history/imaging; comorbidities: history items;
    medications: current meds; abnormal_labs: distinct lab names with any value outside the reference range;
    red_flags: distinct red-flag terms in vignette/imaging.
    """
    structured = case.structured
    sections = sections_from_structured(structured)
    text = "\n".join((case.vignette, sections["History"], sections["Imaging"]))
    features = {
        "organ_systems": sum(bool(regex.search(text)) for regex in _ORGAN_SYSTEMS.values()),
        "comorbidities": len(structured.get("history") or []),
        "medications": len(structured.get("meds") or []),
        "abnormal_labs": len({str(lab["name"]).lower() for lab in structured.get("labs") or [] if _abnormal(lab)}),
        "red_flags": len({m.group().lower() for m in _RED_FLAGS.finditer(f"{case.vignette}\n{sections['Imaging']}")}),
    }
    return sum(features.values()), features


def score_tier(score: int) -> Tier:
    """Deterministic tier: ``HIGH`` if ``score >= HIGH_SCORE``, ``MODERATE`` if ``>= MODERATE_SCORE``, else ``LOW``."""
    return "HIGH" if score >= HIGH_SCORE else "MODERATE" if score >= MODERATE_SCORE else "LOW"


def complexity(score: int, llm_tier: Tier | None, threshold: int = MODERATE_SCORE) -> float:
    """Complexity Score C in [0, 1]: ``max(LLM tier level, feature density)``.

    Level: LLM LOW 0, MODERATE 0.75, HIGH 1; ``None`` (malformed reply or failed call) 0, so only the density counts.
    Density: ``(score + 0.5) / (2 * threshold)`` capped at 1, which crosses ``TAU_C`` halfway between the last LOW
    score (``threshold - 1``) and the score that escalates (``threshold``); ``threshold`` 0 escalates every score
    (density 1). ``threshold`` is the cut-off the tier rule applied: ``escalate_threshold`` for a valid LLM tier,
    ``MODERATE_SCORE`` for the deterministic fallback. Hence ``C > TAU_C`` iff the final tier is not LOW.
    """
    density = min((score + 0.5) / (2 * threshold), 1.0) if threshold > 0 else 1.0
    return max(_LLM_LEVEL.get(llm_tier, 0.0), density)


def triage_case(client: LLMClient, case: Case, escalate_threshold: int = MODERATE_SCORE) -> TriageResult:
    """Run one triage call and combine it with the deterministic score (see module docstring)."""
    score, features = feature_score(case)
    deterministic = score_tier(score)
    text, record = client.complete(
        TRIAGE, SYSTEM_PROMPTS[TRIAGE], case_block(case, sections_from_structured(case.structured)), json_mode=True
    )
    data = extract_json(text) or {}
    raw_tier = data.get("tier")
    llm_tier = raw_tier.strip().upper() if isinstance(raw_tier, str) else None
    if llm_tier not in TIERS:
        return TriageResult(
            deterministic, None, deterministic, score, features, False,
            error=f"malformed triage reply (tier={raw_tier!r}); used deterministic tier", calls=[record],
        )
    escalated = llm_tier == "LOW" and score >= escalate_threshold
    rationale = data.get("rationale")
    llm_features = data.get("features")
    return TriageResult(
        "MODERATE" if escalated else llm_tier, llm_tier, deterministic, score, features, escalated,
        rationale=rationale if isinstance(rationale, str) else "",
        llm_features=llm_features if isinstance(llm_features, dict) else {},
        calls=[record],
    )
