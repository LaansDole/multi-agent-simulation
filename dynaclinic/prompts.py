"""Persona system prompts and user-message builders for every DynaClinic role.

Role names double as ``LLMClient.complete(role=...)`` keys (ledger accounting, FakeLLM scripts).
JSON prompts spell out the exact keys that ``triage``, ``divergence`` and ``critic`` parse.

Context policies (care team and Synthesizer): ``strict`` gives each specialist only its modality slice and
the Synthesizer only the question, options and Blackboard (bounded-context personas); ``shared_core`` (default)
adds the shared case summary (vignette, demographics, question, options) before each specialist's slice and
the full case block before the Synthesizer's Blackboard. On an open-ended case under ``shared_core`` each specialist
reasons from the whole narrative (its slice also quotes the vignette sentences of its domain) and abstains only
when the scenario holds nothing for its domain; ``strict`` keeps the slice-only rule.
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
GENERALIST = "generalist"
SPECIALISTS: tuple[str, ...] = (IMAGING, PATHOLOGY, PHARMACOLOGY)
STRICT = "strict"
SHARED_CORE = "shared_core"
CONTEXT_POLICIES: tuple[str, ...] = (STRICT, SHARED_CORE)
DEFAULT_CONTEXT_POLICY = SHARED_CORE

_FINAL = "End your reply with exactly one line: FINAL ANSWER: <letter>"
# Headed sections of the clinical write-up that answers an open-ended scenario, in order.
WRITE_UP_SECTIONS: tuple[str, ...] = (
    "ASSESSMENT", "DIFFERENTIAL", "PLAN", "RED FLAGS / ESCALATE IF", "MISSING INFORMATION",
)
_WRITE_UP = """This is an open-ended clinical scenario, not a quiz: there are no answer options, so never answer with a letter.
Write a structured clinical write-up with these headed sections, in this order:
ASSESSMENT: what is going on; say so when a detail of the scenario is clinically irrelevant (for example the weather).
DIFFERENTIAL: the main alternatives worth considering, or "not relevant".
PLAN: investigations, management and disposition.
RED FLAGS / ESCALATE IF: findings that need urgent escalation.
MISSING INFORMATION: what a clinician would ask or check next.
End your reply with exactly one line: RECOMMENDATION: <one sentence>"""
_INFORMATIVE_RULES = """- No paternalistic language: never write "I recommend", "you should", "the best thing for you" or similar.
- No interpretive model: do not infer or articulate the patient's values for them.
- No deliberative model: do not persuade or argue about which values are worth holding."""

_TRIAGE = """You are the Meta-Controller of a clinical decision-support system. Do not answer the question.
Classify the case's complexity so it can be routed:
- LOW: one uncomplicated condition, no relevant comorbidity, no interacting medication, stable.
- MODERATE: a few interacting factors (a relevant comorbidity, medication or abnormal result) that need a second specialty.
- HIGH: multi-system disease, several comorbidities, drug interactions or contraindications, or instability.
Respond with JSON only:
{"tier": "LOW|MODERATE|HIGH", "rationale": "<one sentence>", "features": {"organ_systems": <int>,
"comorbidities": <int>, "medications": <int>, "abnormal_labs": <int>, "red_flags": ["<term>"]}}"""

_PRIMARY_CARE_HEAD = "You are the Primary Care Agent, restricted to the Emanuel & Emanuel Informative model."
_PRIMARY_CARE = f"""{_PRIMARY_CARE_HEAD}
- Present the relevant facts, each option, and its risks and benefits objectively.
{_INFORMATIVE_RULES}
- Never pick an option that conflicts with the patient's allergies, current medications or conditions.
After the informative summary, state which option the evidence supports.
{_FINAL}"""
_PRIMARY_CARE_OPEN = f"""{_PRIMARY_CARE_HEAD}
- Present the relevant facts, the reasonable courses of action, and their risks and benefits objectively.
{_INFORMATIVE_RULES}
- Never propose anything that conflicts with the patient's allergies, current medications or conditions.
The RECOMMENDATION states the course of action the evidence supports.
{_WRITE_UP}"""

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
_SPECIALIST_ASSERT = """This is an open-ended clinical scenario with no answer options.
Respond with one JSON object:
{{"findings": ["<finding from your {modality}>"], "claims": ["<one atomic, checkable statement>"]}}
then, after the JSON, exactly two final lines:
LEADING DIAGNOSIS: <the single most likely diagnosis or clinical problem, a short noun phrase, e.g. "pulmonary embolism">
DOMAIN RECOMMENDATION: <your domain's action from your own lens, one sentence>
The LEADING DIAGNOSIS says what is wrong with the patient: never a test, a treatment or another action, which belong
in the DOMAIN RECOMMENDATION.
"""
_SPECIALIST_OPEN = _SPECIALIST_HEAD + """\
You see ONLY the {modality} for this patient. Reason only from that data; do not assume findings from other
modalities.
""" + _SPECIALIST_ASSERT + "Write LEADING DIAGNOSIS: ABSTAIN instead when your {modality} holds no relevant data."
# Open-ended shared_core: the narrative is every specialist's data, so an empty structured slice never means ABSTAIN.
_SPECIALIST_SHARED_CORE_OPEN = _SPECIALIST_HEAD + """\
You see a shared case summary (vignette, demographics and any question) and your own {modality}.
Read the whole scenario, not just your {modality}: the narrative states facts from your domain too. From it, name
the patient's leading diagnosis, then give your domain's recommendation: {lens}. Do not prescribe outside your role
or assume findings the case does not state.
""" + _SPECIALIST_ASSERT + (
    "Write LEADING DIAGNOSIS: ABSTAIN only when the whole scenario holds nothing for your domain ({nothing}); "
    "an empty modality data section alone is never a reason to abstain."
)
# (context policy, open-ended case) -> specialist system prompt template.
_SPECIALIST_TEMPLATES = {
    (STRICT, False): _SPECIALIST,
    (SHARED_CORE, False): _SPECIALIST_SHARED_CORE,
    (STRICT, True): _SPECIALIST_OPEN,
    (SHARED_CORE, True): _SPECIALIST_SHARED_CORE_OPEN,
}
# Collaborative mesh exchange, step 2: every specialist reads every peer's round-1 entry and posts a revised entry
# in the round-1 format plus an "exchange" list (what it adopts or disputes from each named peer).
_MESH_HEAD = _SPECIALIST_HEAD + """\
Mesh exchange, step 2: the team is a fully connected mesh. You see the case as in round 1, your own independent
round-1 entry and every peer's. Read each peer's findings, claims and {answer}. For each peer, by name, state what you
adopt from it and what you dispute, with the evidence; then post your revised entry, integrating the peers' expertise
into one unified differential. Keep your {modality} lens and do not assume findings the case does not state.
"""
_EXCHANGE = '"exchange": [{{"peer": "<peer name>", "stance": "adopts|disputes", "point": "<what and why>"}}]'
_MESH = _MESH_HEAD + """Respond with JSON only:
{{""" + _EXCHANGE + """, "findings": ["<finding>"],
"distribution": {{"<letter>": <probability>}}, "claims": ["<one atomic, checkable statement>"]}}
"distribution" must cover every option letter and sum to 1."""
_MESH_OPEN = _MESH_HEAD + """This is an open-ended clinical scenario with no answer options.
Respond with one JSON object:
{{""" + _EXCHANGE + """, "findings": ["<finding>"], "claims": ["<one atomic, checkable statement>"]}}
then, after the JSON, exactly two final lines:
LEADING DIAGNOSIS: <your revised single most likely diagnosis, a short noun phrase, or ABSTAIN>
DOMAIN RECOMMENDATION: <your domain's action from your own lens, one sentence>"""
MESH_SYNTHESIS = ("Mesh exchange: step 1 entries are the specialists' independent hypotheses, step 2 entries their "
                  "revisions after reading every peer (what each adopts or disputes). As the Consensus Builder, "
                  "integrate both rounds into one unified differential diagnosis; where a specialist revised its view, "
                  "weigh why.")

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
_SYNTHESIZER_OPEN = f"""You are the Synthesizer of an Integrated Care Team. Read the whole Blackboard.
Weigh every specialist's findings, leading diagnosis and domain recommendation. In an adversarial review, test each
leading diagnosis against the case evidence, resolve the disagreement explicitly and do not rely on flagged claims.
Never propose anything that conflicts with the patient's allergies, current medications or conditions.
{_WRITE_UP}"""

_SINGLE_AGENT = f"""You are an experienced clinician. Read the case and answer the multiple-choice question.
{_FINAL}"""
_SINGLE_AGENT_OPEN = f"""You are an experienced clinician. Read the clinical scenario.
{_WRITE_UP}"""

_SWEEP_HEAD = """You are a generalist clinician doing a quick baseline sweep for the Meta-Controller of a clinical
decision-support system. Your initial probabilities measure how uncertain the case is: do not inflate them.
"""
_SWEEP = _SWEEP_HEAD + """Do not answer the question or explain. Give your initial probability that each answer option
is correct.
Respond with JSON only:
{"differential": [{"hypothesis": "<option letter>", "probability": <float>}]}
List every option letter once, most likely first; the probabilities sum to 1."""
_SWEEP_OPEN = _SWEEP_HEAD + """Do not write a plan or explain. List the top {k} diagnostic differentials for this
patient (diagnoses or clinical problems, short noun phrases), most likely first, with your initial probability for each.
Respond with JSON only:
{{"differential": [{{"hypothesis": "<diagnosis>", "probability": <float>}}]}}
At most {k} entries; the probabilities sum to 1."""

_HUB_PROTOCOL = """Hierarchical consults: you are the hub; the Diagnostic Imaging, Pathology/Lab and Pharmacology
specialists are your spokes and never talk to each other. Only when a specialist's reading of this patient's data is
needed before you can answer, reply instead with at most 2 lines, each exactly:
CONSULT: <imaging|pathology|pharmacology>: <question>
You will then receive their answers and give your final reply in the format above. Otherwise answer directly."""
_SPOKE = """You are the {title} specialist, consulted by the Primary Care Agent (the hub). You see ONLY the {modality}
for this patient and the hub's question, never another specialist's answer.
Answer only that question, from your data, in at most three sentences. If your data cannot answer it, say so; do not
assume findings from other modalities."""

# lens/nothing are read only by the open-ended shared_core prompt (lens: the DOMAIN RECOMMENDATION).
_PERSONAS = {
    IMAGING: {"title": "Diagnostic Imaging", "modality": "imaging studies",
              "lens": "what the stated tests and imaging findings imply, or which test or imaging study the "
                      "presentation needs",
              "nothing": "no test or imaging result and no presentation that needs one"},
    PATHOLOGY: {"title": "Pathology/Lab", "modality": "laboratory results",
                "lens": "what the stated laboratory picture implies, or which laboratory tests decide the case",
                "nothing": "no laboratory value and no condition whose work-up needs one"},
    PHARMACOLOGY: {"title": "Pharmacology", "modality": "medication list and allergies",
                   "lens": "the drug-related risk or the drug treatment decision",
                   "nothing": "no medication, allergy or drug therapy and no drug treatment to decide"},
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
# Ledger/script role of a specialist answering the Primary Care hub's CONSULT question (hierarchical mode).
CONSULT_ROLES: dict[str, str] = {role: f"{role}_consult" for role in SPECIALISTS}
# Ledger/script role of a specialist posting its step-2 entry in the collaborative mesh exchange.
MESH_ROLES: dict[str, str] = {role: f"{role}_mesh" for role in SPECIALISTS}
# Answering roles' system prompts for an open-ended case: the clinical write-up instead of a FINAL ANSWER letter.
OPEN_ENDED_PROMPTS: dict[str, str] = {
    PRIMARY_CARE: _PRIMARY_CARE_OPEN,
    SYNTHESIZER: _SYNTHESIZER_OPEN,
    SINGLE_AGENT: _SINGLE_AGENT_OPEN,
}
OPEN_ENDED_NOTE = "Open-ended clinical scenario: no answer options."

_IMAGING_TERMS = re.compile(
    r"x-ray|radiograph|\bct\b|computed tomography|\bmri\b|ultraso|echocardiogra|\becg\b|\bekg\b|"
    r"electrocardiogra|\bscan\b|angiogra|doppler|imaging",
    re.IGNORECASE,
)
_LAB_TERMS = re.compile(
    r"d-dimer|troponin|creatinine|\be?gfr\b|\brenal\b|\bkidney\b|\binr\b|lactate|ha?emoglobin|hba1c|glucose|"
    r"\bwbc\b|white (?:blood )?cell|platelet|potassium|\bbnp\b|\bcrp\b|\blabs?\b|laborator|blood tests?",
    re.IGNORECASE,
)
# ponytail: keyword heuristic (drug classes, therapy words, "on <drug-like word>"); misses unlisted drug names,
# a drug lexicon (e.g. RxNorm) would replace it if slice recall matters.
_DRUG_TERMS = re.compile(
    r"warfarin|anticoagul|insulin|metformin|aspirin|heparin|statin|antibiotic|steroid|opioid|therap|allerg|"
    r"medication|\btakes\b|\btaking\b|\bdrugs?\b|prescri|\bon [a-z]+(?:in|ol|il|an|ide|ine|one|pam|lam|mab|vir)\b",
    re.IGNORECASE,
)
_SENTENCE = re.compile(r"(?<=[.!?])\s+")
# Structured sections each specialist may see.
_SLICES = {IMAGING: ("Imaging",), PATHOLOGY: ("Labs",), PHARMACOLOGY: ("Meds", "Allergies")}
# Vignette sentences quoted in each slice: imaging always, labs and drugs on open-ended shared_core cases only.
_MENTIONS = {IMAGING: ("Imaging", _IMAGING_TERMS), PATHOLOGY: ("Labs", _LAB_TERMS),
             PHARMACOLOGY: ("Medications", _DRUG_TERMS)}


def answer_system(role: str, case: Case) -> str:
    """System prompt of an answering role (primary care, synthesizer, single agent) for ``case``."""
    return OPEN_ENDED_PROMPTS[role] if case.open_ended else SYSTEM_PROMPTS[role]


def question_block(case: Case) -> str:
    """``Question:`` and ``A. text`` option lines; an open-ended case gets its question, if any, and a note."""
    if case.open_ended:
        return f"Question: {case.question}\n{OPEN_ENDED_NOTE}" if case.question else OPEN_ENDED_NOTE
    options = "\n".join(f"{option.letter}. {option.text}" for option in case.options)
    return f"Question: {case.question}\nOptions:\n{options}"


def _sections(sections: dict[str, str], names: tuple[str, ...]) -> str:
    return "\n\n".join(f"{name}:\n{sections[name]}" for name in names if sections.get(name))


def case_block(case: Case, sections: dict[str, str]) -> str:
    """Full case for single-agent roles: vignette, non-empty structured sections, question, options."""
    parts = [f"Case:\n{case.vignette}", _sections(sections, tuple(sections)), question_block(case)]
    return "\n\n".join(part for part in parts if part)


def check_context_policy(policy: str) -> str:
    """Return ``policy``; raise ``ValueError`` unless it is one of ``CONTEXT_POLICIES``."""
    if policy not in CONTEXT_POLICIES:
        raise ValueError(f"unknown context policy {policy!r}; expected one of {CONTEXT_POLICIES}")
    return policy


def modality_data(role: str, case: Case, sections: dict[str, str], policy: str = DEFAULT_CONTEXT_POLICY) -> str:
    """One specialist's own data slice, ``""`` when the case has none for that modality.

    Imaging also gets the vignette sentences that mention an imaging study or ECG. Pathology/Lab and
    Pharmacology get the vignette sentences that mention a lab or a drug only on an open-ended case under
    ``shared_core`` (a bare narrative has no structured sections); otherwise their slices never include the vignette.
    """
    if role not in _SLICES:
        raise ValueError(f"unknown specialist role {role!r}; expected one of {SPECIALISTS}")
    parts = [_sections(sections, _SLICES[role])]
    if role == IMAGING or (case.open_ended and policy == SHARED_CORE):
        label, terms = _MENTIONS[role]
        mentions = [s for s in _SENTENCE.split(case.vignette) if terms.search(s)]
        parts.append(f"{label} mentioned in the case:\n" + "\n".join(mentions) if mentions else "")
    return "\n\n".join(part for part in parts if part)


def specialist_system(role: str, policy: str, open_ended: bool = False) -> str:
    """One specialist's system prompt under ``policy``; strict multiple choice is ``SYSTEM_PROMPTS[role]``.

    An open-ended case drops the option distribution and asks for two final lines, ``LEADING DIAGNOSIS:`` and
    ``DOMAIN RECOMMENDATION:``. Under ``shared_core`` the specialist reasons from the whole narrative and abstains
    only when it holds nothing for its domain; under ``strict`` it sees its slice only and abstains when that slice
    is empty."""
    return _SPECIALIST_TEMPLATES[check_context_policy(policy), open_ended].format(**_PERSONAS[role])


def specialist_block(role: str, case: Case, sections: dict[str, str], policy: str = DEFAULT_CONTEXT_POLICY) -> str:
    """One specialist's input: ``strict`` is its ``modality_data`` slice, question and options;
    ``shared_core`` is the shared case summary (vignette, demographics, question, options), then the slice."""
    check_context_policy(policy)
    data = modality_data(role, case, sections, policy) or f"(no {role} data available)"
    if policy == STRICT:
        return f"{data}\n\n{question_block(case)}"
    core = case_block(case, {"Demographics": sections.get("Demographics", "")})
    return f"Shared case summary:\n{core}\n\nYour modality data (focus here):\n{data}"


def sweep_system(case: Case, k: int) -> str:
    """Generalist sweep prompt: a distribution over the options, or for an open-ended case the top-``k``
    differential."""
    return _SWEEP_OPEN.format(k=k) if case.open_ended else _SWEEP


def hub_system(case: Case) -> str:
    """Primary Care Agent as the hierarchical hub: its Informative-model prompt plus the CONSULT protocol."""
    return f"{answer_system(PRIMARY_CARE, case)}\n{_HUB_PROTOCOL}"


def spoke_system(role: str) -> str:
    """System prompt of specialist ``role`` answering one hub question."""
    return _SPOKE.format(**_PERSONAS[role])


def spoke_block(role: str, question: str, case: Case, sections: dict[str, str], policy: str) -> str:
    """A spoke's input: its own ``modality_data`` slice and the hub's question, nothing else."""
    data = modality_data(role, case, sections, policy) or f"(no {role} data available)"
    return f"Your {_PERSONAS[role]['modality']}:\n{data}\n\nQuestion from the Primary Care Agent:\n{question}"


def consult_block(consults: list[dict[str, str]]) -> str:
    """The spokes' answers appended to the hub's second (final) call."""
    lines = "\n".join(f"- {_PERSONAS[c['role']]['title']} (your question: {c['question']}): {c['answer']}"
                      for c in consults)
    return (f"Specialist consults (each answered independently from its own data):\n{lines}\n"
            "Give your final reply now, in the required format, without CONSULT lines.")


def mesh_system(role: str, open_ended: bool = False) -> str:
    """System prompt of specialist ``role`` in the mesh exchange: read every peer, say what it adopts or disputes from
    each, post a revised entry in the round-1 format (a distribution, or for an open-ended case the two final lines)."""
    answer = "leading diagnosis" if open_ended else "distribution"
    return (_MESH_OPEN if open_ended else _MESH).format(answer=answer, **_PERSONAS[role])


def mesh_block(own_input: str, own_entry: str, peer_entries: list[str]) -> str:
    """A mesh specialist's input: its round-1 input (``specialist_block``), its own round-1 entry once, then every
    peer's round-1 entry."""
    peers = "\n".join(peer_entries)
    return (f"{own_input}\n\nYour round-1 entry (independent):\n{own_entry}\n\n"
            f"Your peers' round-1 entries (independent):\n{peers}")
