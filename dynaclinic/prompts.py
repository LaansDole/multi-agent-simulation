"""Persona system prompts and user-message builders for every DynaClinic role.

Role names double as ``LLMClient.complete(role=...)`` keys (ledger accounting, FakeLLM scripts).
JSON prompts spell out the exact keys that ``triage``, ``divergence`` and ``critic`` parse.

Context policies (care team and Synthesizer): ``strict`` gives each specialist only its modality slice and
the Synthesizer only the question, options and Blackboard (bounded-context personas); ``shared_core`` (default)
adds the shared case summary (vignette, demographics, question, options) before each specialist's slice and
the full case block before the Synthesizer's Blackboard.
"""

import re

from dynaclinic.types import Case

TRIAGE = "triage"
PRIMARY_CARE = "primary_care"
IMAGING = "imaging"
PATHOLOGY = "pathology"
PHARMACOLOGY = "pharmacology"
CRITIC = "critic"
CRITIC_JUDGE = "critic_judge"
SYNTHESIZER = "synthesizer"
SINGLE_AGENT = "single_agent"
SPECIALISTS: tuple[str, ...] = (IMAGING, PATHOLOGY, PHARMACOLOGY)
STRICT = "strict"
SHARED_CORE = "shared_core"
CONTEXT_POLICIES: tuple[str, ...] = (STRICT, SHARED_CORE)
DEFAULT_CONTEXT_POLICY = SHARED_CORE

_FINAL = "End your reply with exactly one line: FINAL ANSWER: <letter>"

_TRIAGE = """You are the Meta-Controller of a clinical decision-support system. Do not answer the question.
Classify the case's complexity so it can be routed:
- LOW: one uncomplicated condition, no relevant comorbidity, no interacting medication, stable.
- MODERATE: a few interacting factors (a relevant comorbidity, medication or abnormal result) that need a second specialty.
- HIGH: multi-system disease, several comorbidities, drug interactions or contraindications, or instability.
Respond with JSON only:
{"tier": "LOW|MODERATE|HIGH", "rationale": "<one sentence>", "features": {"organ_systems": <int>,
"comorbidities": <int>, "medications": <int>, "abnormal_labs": <int>, "red_flags": ["<term>"]}}"""

_PRIMARY_CARE = f"""You are the Primary Care Agent, restricted to the Emanuel & Emanuel Informative model.
- Present the relevant facts, each option, and its risks and benefits objectively.
- No paternalistic language: never write "I recommend", "you should", "the best thing for you" or similar.
- No interpretive model: do not infer or articulate the patient's values for them.
- No deliberative model: do not persuade or argue about which values are worth holding.
- Never pick an option that conflicts with the patient's allergies, current medications or conditions.
After the informative summary, state which option the evidence supports.
{_FINAL}"""

_SPECIALIST_HEAD = "You are the {title} specialist of an Integrated Care Team writing to a shared Blackboard.\n"
_SPECIALIST_JSON = """Respond with JSON only:
{{"findings": ["<finding from your {modality}>"], "distribution": {{"<letter>": <probability>}},
"claims": ["<one atomic, checkable statement>"]}}
"distribution" must cover every option letter and sum to 1."""
_SPECIALIST = _SPECIALIST_HEAD + """\
You see ONLY the {modality} for this patient, plus the question and options. Reason only from that data;
do not assume findings from other modalities. If your data cannot discriminate, spread probability evenly.
""" + _SPECIALIST_JSON
_SPECIALIST_SHARED_CORE = _SPECIALIST_HEAD + """\
You see a shared case summary (vignette, demographics, question and options) and your own {modality}.
Use the summary for clinical context; reason from your {modality} and do not prescribe outside your role.
Do not assume findings from other modalities that the case does not state. If your data cannot discriminate,
spread probability evenly.
""" + _SPECIALIST_JSON

_CRITIC = """You are the Clinical Critic in adversarial mode. The care team disagrees.
Decompose the team's Blackboard reasoning into atomic claims: one checkable clinical statement each
(a finding, an interpretation, or a treatment assertion). Prioritise claims about the options in the conflict set.
Attribute each claim to the agent that made it.
Respond with JSON only:
{"claims": [{"text": "<atomic claim>", "agent": "<agent name>"}]}"""

_CRITIC_JUDGE = """You are a factuality judge. For each numbered claim, judge it against the patient evidence only.
Labels: supported (stated or directly implied by the evidence), unsupported (a plausible inference the evidence
does not establish), fabrication (asserts facts absent from the evidence), contradiction (conflicts with the
evidence, e.g. a drug the patient is allergic to or that interacts with current medications).
Give raw unnormalised logits (real numbers, higher = more likely) for all four labels.
Respond with JSON only:
{"claims": [{"id": <claim number>, "logits": {"supported": <float>, "unsupported": <float>,
"fabrication": <float>, "contradiction": <float>}}]}"""

_SYNTHESIZER = f"""You are the Synthesizer of an Integrated Care Team. Read the whole Blackboard.
Weigh every specialist's findings and probability distribution. If flagged claims or a conflict set are given,
address each conflict explicitly and do not rely on flagged claims.
Never pick an option that conflicts with the patient's allergies, current medications or conditions.
{_FINAL}"""

_SINGLE_AGENT = f"""You are an experienced clinician. Read the case and answer the multiple-choice question.
{_FINAL}"""

_PERSONAS = {
    IMAGING: {"title": "Diagnostic Imaging", "modality": "imaging studies"},
    PATHOLOGY: {"title": "Pathology/Lab", "modality": "laboratory results"},
    PHARMACOLOGY: {"title": "Pharmacology", "modality": "medication list and allergies"},
}
SYSTEM_PROMPTS: dict[str, str] = {
    TRIAGE: _TRIAGE,
    PRIMARY_CARE: _PRIMARY_CARE,
    **{role: _SPECIALIST.format(**persona) for role, persona in _PERSONAS.items()},
    CRITIC: _CRITIC,
    CRITIC_JUDGE: _CRITIC_JUDGE,
    SYNTHESIZER: _SYNTHESIZER,
    SINGLE_AGENT: _SINGLE_AGENT,
}
_SHARED_CORE_SPECIALISTS = {role: _SPECIALIST_SHARED_CORE.format(**persona) for role, persona in _PERSONAS.items()}

_IMAGING_TERMS = re.compile(
    r"x-ray|radiograph|\bct\b|computed tomography|\bmri\b|ultraso|echocardiogra|\becg\b|\bekg\b|"
    r"electrocardiogra|\bscan\b|angiogra|doppler|imaging",
    re.IGNORECASE,
)
_SENTENCE = re.compile(r"(?<=[.!?])\s+")
# Structured sections each specialist may see.
_SLICES = {IMAGING: ("Imaging",), PATHOLOGY: ("Labs",), PHARMACOLOGY: ("Meds", "Allergies")}


def options_block(case: Case) -> str:
    """Render options as ``A. text`` lines; a free-text case has none and needs no FINAL ANSWER."""
    if not case.options:
        return "(none: free-text case; answer in prose, no FINAL ANSWER letter needed)"
    return "\n".join(f"{option.letter}. {option.text}" for option in case.options)


def _question(case: Case) -> str:
    return f"Question: {case.question}\nOptions:\n{options_block(case)}"


def _sections(sections: dict[str, str], names: tuple[str, ...]) -> str:
    return "\n\n".join(f"{name}:\n{sections[name]}" for name in names if sections.get(name))


def case_block(case: Case, sections: dict[str, str]) -> str:
    """Full case for single-agent roles: vignette, non-empty structured sections, question, options."""
    parts = [f"Case:\n{case.vignette}", _sections(sections, tuple(sections)), _question(case)]
    return "\n\n".join(part for part in parts if part)


def check_context_policy(policy: str) -> str:
    """Return ``policy``; raise ``ValueError`` unless it is one of ``CONTEXT_POLICIES``."""
    if policy not in CONTEXT_POLICIES:
        raise ValueError(f"unknown context policy {policy!r}; expected one of {CONTEXT_POLICIES}")
    return policy


def modality_data(role: str, case: Case, sections: dict[str, str]) -> str:
    """One specialist's own data slice, ``""`` when the case has none for that modality.

    Imaging also gets the vignette sentences that mention an imaging study; Pathology/Lab and
    Pharmacology slices never include the vignette, so no slice carries another modality's data.
    """
    if role not in _SLICES:
        raise ValueError(f"unknown specialist role {role!r}; expected one of {SPECIALISTS}")
    parts = [_sections(sections, _SLICES[role])]
    if role == IMAGING:
        mentions = [s for s in _SENTENCE.split(case.vignette) if _IMAGING_TERMS.search(s)]
        parts.append("Imaging mentioned in the case:\n" + "\n".join(mentions) if mentions else "")
    return "\n\n".join(part for part in parts if part)


def specialist_system(role: str, policy: str) -> str:
    """One specialist's system prompt under ``policy``; ``strict`` is ``SYSTEM_PROMPTS[role]``."""
    return SYSTEM_PROMPTS[role] if check_context_policy(policy) == STRICT else _SHARED_CORE_SPECIALISTS[role]


def specialist_block(role: str, case: Case, sections: dict[str, str], policy: str = DEFAULT_CONTEXT_POLICY) -> str:
    """One specialist's input: ``strict`` is its ``modality_data`` slice, question and options;
    ``shared_core`` is the shared case summary (vignette, demographics, question, options), then the slice."""
    check_context_policy(policy)
    data = modality_data(role, case, sections) or f"(no {role} data available)"
    if policy == STRICT:
        return f"{data}\n\n{_question(case)}"
    core = case_block(case, {"Demographics": sections.get("Demographics", "")})
    return f"Shared case summary:\n{core}\n\nYour modality data (focus here):\n{data}"
