"""DynaClinic pipelines: the dynamic arm (design spec section 5) and two baselines.

Every arm's ``run(case)`` resets the client ledger, fills ``RunResult.calls`` from it, measures
latency and never raises on model errors: a failed answering call (primary care, synthesizer,
single agent) or a care team in which every specialist failed sets ``error`` and leaves
``final_answer`` None; degraded stages (some specialists failed or malformed, triage fallback, critic
or regeneration failure) go to ``warnings`` and the run continues.

Route entries are stable identifiers: ``ingest``, ``cache_lookup:off|miss|rejected``, ``cache_hit``,
``triage:<TIER>``, ``uncertainty:<U>|n/a``, ``mode:hierarchical|collaborative|adversarial:uncertainty``,
``primary_care``, ``hub_consult:<roles>``, ``care_team:<roles>``, ``care_team:failed``,
``divergence:<d>:switch|stay``, ``mesh_exchange:<roles>|none|skipped``, ``critic``, ``synthesizer``, ``regenerate``,
``safety_gate:pass|blocked``, ``single_agent``. In the dynamic arm every
stage is chosen by the planner and followed by ``planner:<action>:<reward>``; the run ends with
``planner:terminal``.

Stubs: ``GreedyPlanner`` stands in for the L2 MCTS control plane (fixed policy, reward logged only);
ingestion and the semantic cache are the in-memory stubs from ``interfaces``.
"""

import time
from collections import Counter
from collections.abc import Callable, Sequence
from concurrent.futures import ThreadPoolExecutor

from dynaclinic.blackboard import Blackboard
from dynaclinic.critic import ClinicalCritic
from dynaclinic.divergence import (
    HASHING_EMBEDDER,
    TAU,
    assess,
    normalize,
    semantic_divergence,
    semantic_tau,
)
from dynaclinic.interfaces import (
    FHIRLiteIngestor,
    GreedyPlanner,
    HashingEmbeddingMemory,
    SemanticCache,
    sections_from_structured,
)
from dynaclinic.llm import LLMClient, LLMError
from dynaclinic.parsing import (
    ABSTAIN,
    DOMAIN_RECOMMENDATION,
    LEADING_DIAGNOSIS,
    PRIMARY_ASSERTION,
    consult_requests,
    extract_diagnosis,
    extract_final_answer,
    extract_json,
    extract_line,
)
from dynaclinic.prompts import (
    CONSULT_ROLES,
    DEFAULT_CONTEXT_POLICY,
    GENERALIST,
    IMAGING,
    MESH_ROLES,
    MESH_SYNTHESIS,
    PATHOLOGY,
    PHARMACOLOGY,
    PRIMARY_CARE,
    SINGLE_AGENT,
    SPECIALISTS,
    STRICT,
    SYNTHESIZER,
    answer_system,
    case_block,
    check_context_policy,
    consult_block,
    hub_system,
    mesh_block,
    mesh_system,
    modality_data,
    question_block,
    specialist_block,
    specialist_system,
    spoke_block,
    spoke_system,
    sweep_system,
)
from dynaclinic.safety import SafetyReport, run_gates
from dynaclinic.triage import (
    MODERATE_SCORE,
    TAU_C,
    TriageResult,
    complexity,
    feature_score,
    score_tier,
    triage_case,
)
from dynaclinic.types import BlackboardEntry, Case, RunResult
from dynaclinic.uncertainty import (
    DEFAULT_K,
    TAU_U_MCQ,
    TAU_U_OPEN,
    normalized_entropy,
    parse_sweep,
    select_mode,
    tau_u_for,
)

BLOCKED_PREFIX = "BLOCKED FOR MANUAL REVIEW"
# MODERATE takes the first two specialists that have data for the case, in this order: Pharmacology
# first so it is always included when meds or allergies are listed.
_MODERATE_ORDER = (PHARMACOLOGY, PATHOLOGY, IMAGING)
_TRIAGE_FIELDS = ("llm_tier", "deterministic_tier", "score", "features", "escalated", "rationale", "llm_features")


def _strings(value: object) -> list[str]:
    return [str(item) for item in value] if isinstance(value, list) else []


def _exchange(value: object) -> list[str]:
    """``"<stance> <peer>: <point>"`` lines of a mesh reply's ``exchange`` list; malformed items are skipped."""
    items = value if isinstance(value, list) else []
    keys = ("stance", "peer", "point")
    return [f"{item['stance'].strip().lower()} {item['peer'].strip()}: {item['point'].strip()}" for item in items
            if isinstance(item, dict) and all(isinstance(item.get(key), str) and item[key].strip() for key in keys)]


def _leading_diagnosis(role: str, text: str) -> tuple[str, str | None]:
    """``(diagnosis or ABSTAIN, warning)`` of an open-ended specialist reply: its ``LEADING DIAGNOSIS`` line, else
    a pre-F13 ``PRIMARY ASSERTION`` line (warned), else ``ABSTAIN`` (warned)."""
    diagnosis = extract_diagnosis(text)
    if diagnosis is not None:
        return diagnosis, None
    legacy = extract_diagnosis(text, PRIMARY_ASSERTION)
    if legacy is not None:
        return legacy, f"{role}: no {LEADING_DIAGNOSIS} line; read its {PRIMARY_ASSERTION} line as the diagnosis"
    return ABSTAIN, f"{role}: no {LEADING_DIAGNOSIS} line; counted as abstaining"


def _set_answer(result: RunResult, text: str, letters: list[str], role: str) -> None:
    """Record ``text`` and its FINAL ANSWER; an open-ended case (no options) has none."""
    result.final_text = text
    result.final_answer = extract_final_answer(text, letters)
    if result.final_answer is None and letters:
        result.warnings.append(f"{role}: no valid FINAL ANSWER in reply")


class CaseRun:
    """One case's state and every stage, shared by the pipelines and the DevAll nodes (``devall_nodes``).

    Each stage appends its route id. Stages call ``client``, which DevAll nodes swap per node config.
    An open-ended case (no options) is supported: the answering roles write a clinical write-up ending in
    ``RECOMMENDATION:`` instead of a FINAL ANSWER letter, and specialists post a ``LEADING DIAGNOSIS`` and a
    ``DOMAIN RECOMMENDATION`` instead of a distribution, so divergence is the semantic distance between the
    diagnoses (embedded by the client, or the hashing stub when it cannot). ``context_policy`` (``prompts``: strict |
    shared_core) decides how much of the case the specialists and Synthesizer see.
    """

    def __init__(
        self, client: LLMClient, case: Case, result: RunResult, sections: dict[str, str],
        context_policy: str = DEFAULT_CONTEXT_POLICY,
    ) -> None:
        self.client = client
        self.case = case
        self.result = result
        self.sections = sections
        self.context_policy = context_policy
        self.board = Blackboard()
        self.safety: SafetyReport | None = None
        self.conf = 0.0  # confidence in the leading answer (planner reward input)
        self.abstainers: list[str] = []  # near-uniform specialists left out of the last divergence vote
        self.tau_semantic: float | None = None  # threshold of the last semantic divergence (open-ended case)
        self.by_uncertainty = False  # adversarial mode entered by U > tau_u: divergence reports, never switches back

    def progress(self) -> tuple[float, float, str | None]:
        """``(missing, conf, answer)``; ``missing`` is the open fraction of {tier, answer, gate-verified}."""
        r = self.result
        verified = self.safety is not None and not self.safety.blocked
        return ((r.tier is None) + (r.final_answer is None) + (not verified)) / 3, self.conf, r.final_answer

    def triage(self, escalate_threshold: int = MODERATE_SCORE) -> None:
        """Meta-Controller tier 1; a failed call falls back to the deterministic tier (warning)."""
        try:
            triage = triage_case(self.client, self.case, escalate_threshold)
        except LLMError as err:
            score, features = feature_score(self.case)
            tier = score_tier(score)
            triage = TriageResult(tier, None, tier, score, features, False,
                                  error=f"call failed ({err}); used deterministic tier")
        r = self.result
        r.tier = triage.tier
        threshold = escalate_threshold if triage.llm_tier else MODERATE_SCORE  # the cut-off the tier rule applied
        r.complexity, r.tau_c = complexity(triage.score, triage.llm_tier, threshold), TAU_C
        r.triage = {name: getattr(triage, name) for name in _TRIAGE_FIELDS}
        if triage.error:
            r.warnings.append(f"triage: {triage.error}")
        r.route.append(f"triage:{triage.tier}")

    def uncertainty(
        self, tau_u: float | None = None, k: int = DEFAULT_K, tau_u_mcq: float = TAU_U_MCQ,
        tau_u_open: float = TAU_U_OPEN,
    ) -> None:
        """Meta-Controller mode rule: one generalist sweep gives U (a multiple-choice case's k is its option count),
        then ``select_mode`` with the triage C and the tau_u of the case's input form (``tau_u_mcq`` or ``tau_u_open``;
        ``tau_u``, when set, overrides both). A failed or malformed sweep leaves U unmeasured with a warning and the
        rule reads U = 0 (C-only routing), so a missing sweep never makes a case adversarial."""
        r = self.result
        if r.complexity is None or r.tau_c is None:
            raise ValueError("the mode rule needs the triage Complexity Score: run triage first")
        if tau_u is None:
            tau_u = tau_u_for(self.case, tau_u_mcq, tau_u_open)
        letters = self.case.letters()
        k = len(letters) or k
        try:
            text, _ = self.client.complete(GENERALIST, sweep_system(self.case, k), case_block(self.case, self.sections),
                                           json_mode=True)
            differential, error = parse_sweep(text, letters, k)
        except LLMError as err:
            differential, error = None, f"call failed ({err})"
        if differential is None:
            r.warnings.append(f"{GENERALIST}: {error}; U not measured, routed on C only")
        r.uncertainty = None if differential is None else normalized_entropy(list(differential.values()), k)
        r.differential, r.tau_u, r.top_k = differential or {}, tau_u, k
        r.mode = select_mode(r.complexity, r.uncertainty or 0.0, r.tau_c, tau_u)
        self.by_uncertainty = r.mode == "adversarial"
        c, u = f"C {r.complexity:.2f}", "U n/a (not measured, read as 0)" if r.uncertainty is None else f"U {r.uncertainty:.2f}"
        if self.by_uncertainty:
            r.mode_reason = f"{u} > tau_u {tau_u:g}: adversarial, entered by uncertainty regardless of {c}"
        else:
            side = ">" if r.mode == "collaborative" else "<="
            r.mode_reason = f"{c} {side} tau_c {r.tau_c:g} and {u} <= tau_u {tau_u:g}: {r.mode}"
        r.route.append(f"uncertainty:{'n/a' if r.uncertainty is None else f'{r.uncertainty:.2f}'}")
        r.route.append(f"mode:{r.mode}{':uncertainty' if self.by_uncertainty else ''}")

    def primary_care(self, samples: int = 1) -> None:
        """Hierarchical mode: the Informative-model Primary Care Agent as hub. A reply may end in up to
        ``MAX_CONSULTS`` ``CONSULT: <role>: <question>`` lines instead of an answer: each named specialist (spoke)
        answers only its question from its own slice, concurrently and independently, and a second hub call finalises
        with their answers. No CONSULT lines: one call. ``samples > 1`` majority-votes each hub call's replies (ties:
        earliest sample); consults are read from the first reply that has any."""
        r = self.result
        r.mode = "hierarchical"
        r.route.append("primary_care")
        system, user = hub_system(self.case), case_block(self.case, self.sections)
        texts = self._hub(system, user, samples)
        requests, warnings = next(
            (parsed for parsed in (consult_requests(text, SPECIALISTS) for text in texts) if any(parsed)), ([], []))
        r.warnings.extend(f"{PRIMARY_CARE}: {warning}" for warning in warnings)
        if requests:
            r.route.append(f"hub_consult:{','.join(role for role, _ in requests)}")
            with ThreadPoolExecutor(max_workers=len(requests)) as pool:
                replies = list(pool.map(self._spoke, requests))
            r.consults = [consult for consult, _ in replies]
            r.warnings.extend(warning for _, warning in replies if warning)
            texts = self._hub(system, f"{user}\n\n{consult_block(r.consults)}", samples)
        answers = [extract_final_answer(text, self.case.letters()) for text in texts]
        votes = Counter(answer for answer in answers if answer)
        text = texts[answers.index(votes.most_common(1)[0][0])] if votes else texts[0]
        self.conf = max(votes.values(), default=0) / len(texts)
        _set_answer(r, text, self.case.letters(), PRIMARY_CARE)
        self.board.write(BlackboardEntry(PRIMARY_CARE, "verdict", text, step=1))  # read by a regeneration

    def _hub(self, system: str, user: str, samples: int) -> list[str]:
        return [self.client.complete(PRIMARY_CARE, system, user)[0] for _ in range(samples)]

    def _spoke(self, request: tuple[str, str]) -> tuple[dict[str, str], str | None]:
        """One spoke call (worker thread): ``({role, question, answer}, warning)``; it sees only its own slice and
        the hub's question."""
        role, question = request
        user = spoke_block(role, question, self.case, self.sections, self.context_policy)
        try:
            answer, warning = self.client.complete(CONSULT_ROLES[role], spoke_system(role), user)[0].strip(), None
        except LLMError as err:
            answer, warning = "(no answer: the call failed)", f"{CONSULT_ROLES[role]}: call failed ({err})"
        return {"role": role, "question": question, "answer": answer}, warning

    def team_roles(self) -> list[str]:
        """MODERATE, or LOW (a LOW case reaches the team only in adversarial mode entered by uncertainty): the first
        two of ``_MODERATE_ORDER`` with data for the case (under ``context_policy``, as the specialists see it);
        otherwise (HIGH, or no tier) every specialist."""
        if self.result.tier not in ("LOW", "MODERATE"):
            return list(SPECIALISTS)
        policy = self.context_policy
        chosen = sorted(_MODERATE_ORDER, key=lambda role: not modality_data(role, self.case, self.sections, policy))[:2]
        return [role for role in SPECIALISTS if role in chosen]

    def care_team(self, roles: Sequence[str]) -> None:
        """Run ``roles`` concurrently; entries are posted in role order once all have answered.

        Raises ``LLMError("all specialists failed")`` (route ``care_team:failed``) when no specialist
        posts an entry: an empty Blackboard would otherwise read as agreement (divergence 0).
        """
        self.result.route.append(f"care_team:{','.join(roles)}")
        with ThreadPoolExecutor(max_workers=len(roles)) as pool:
            replies = list(pool.map(self._consult, roles))
        for role, (entry, warning) in zip(roles, replies, strict=True):
            if warning:
                self.result.warnings.append(warning)
            if entry is None:
                continue
            if self.case.open_ended:
                self.result.assertions[role] = entry.assertion
            self.board.write(entry)
            if entry.distribution is not None:
                self.result.distributions[role] = entry.distribution
        if all(entry is None for entry, _ in replies):
            self.result.route.append("care_team:failed")
            raise LLMError("all specialists failed")
        dists, letters = list(self.result.distributions.values()), self.case.letters()
        self.conf = max(sum(d[letter] for d in dists) / len(dists) for letter in letters) if dists and letters else 0.0

    def _consult(self, role: str) -> tuple[BlackboardEntry | None, str | None]:
        """One specialist call (worker thread): ``(entry, warning)``; no entry when the call or reply fails.

        An open-ended case asks for findings, claims and two final lines, ``LEADING DIAGNOSIS:`` (what is wrong
        with the patient, or ABSTAIN) and ``DOMAIN RECOMMENDATION:``, instead of a distribution, so the reply is
        not forced into JSON mode. Only the diagnosis feeds the divergence; the recommendation goes on the board."""
        user = specialist_block(role, self.case, self.sections, self.context_policy)
        system = specialist_system(role, self.context_policy, self.case.open_ended)
        return self._post(role, role, system, user, step=1, call="", failed="excluded from the team")

    def _post(
        self, role: str, called: str, system: str, user: str, *, step: int, call: str, failed: str,
    ) -> tuple[BlackboardEntry | None, str | None]:
        """Call ``called`` and parse the reply (round-1 format) into ``role``'s Blackboard entry for ``step``, with a
        mesh reply's ``exchange`` lines; ``(None, warning)`` naming the ``call`` kind and ``failed`` outcome when the
        call fails or the reply is malformed."""
        open_ended = self.case.open_ended
        try:
            text, _ = self.client.complete(called, system, user, json_mode=not open_ended)
        except LLMError as err:
            return None, f"{role}: {call}call failed ({err}); {failed}"
        data = extract_json(text)
        letters = self.case.letters()
        distribution = (data or {}).get("distribution")
        if letters and (not isinstance(distribution, dict) or not distribution):
            return None, f"{role}: {call}reply has no distribution; {failed}"
        if data is None:
            return None, f"{role}: {call}reply is not JSON; {failed}"
        findings = "; ".join(_strings(data.get("findings"))) or "(no findings)"
        dist = normalize(distribution, letters) if letters else None
        entry = BlackboardEntry(role, "hypothesis", findings, dist, _strings(data.get("claims")), step=step,
                                exchange=_exchange(data.get("exchange")))
        if not open_ended:
            return entry, None
        entry.assertion, warning = _leading_diagnosis(role, text)
        entry.recommendation = extract_line(text, DOMAIN_RECOMMENDATION)
        return entry, warning

    def divergence(self, tau: float, tau_semantic: float | None = None) -> None:
        """Tier 2 switch (Conflict Detector): JS divergence of the option distributions, or for an open-ended case
        the semantic divergence of the leading diagnoses (``tau_semantic`` None: the embedder's ``TAU_SEMANTIC``).
        In adversarial mode entered by uncertainty it is measured and reported, but the mode stays adversarial."""
        r = self.result
        if self.case.open_ended:
            self._semantic_divergence(tau_semantic)
        else:
            report = assess(r.distributions, self.case.letters(), tau)
            r.divergence, r.top1, r.disagreement = report.divergence, report.top1, report.disagreement
            r.conflict_set, r.switch, self.abstainers = report.conflict_set, report.switch, report.abstainers
            r.mode = "adversarial" if report.switch else "collaborative"
            r.route.append(f"divergence:{report.divergence:.2f}:{'switch' if report.switch else 'stay'}")
        if self.by_uncertainty:
            r.mode = "adversarial"

    def _semantic_divergence(self, tau: float | None) -> None:
        """Switch iff the mean pairwise cosine distance of the non-abstaining leading diagnoses is ``>= tau``; with
        fewer than two diagnoses it is not measurable and the team goes adversarial (safety-biased)."""
        r = self.result
        asserted = [assertion for assertion in r.assertions.values() if assertion != ABSTAIN]
        if len(asserted) < 2:
            r.switch, r.mode = True, "adversarial"
            r.route.append("divergence:n/a:switch")
            return
        r.embedder, vectors = self._embed(asserted)
        self.tau_semantic = semantic_tau(r.embedder, tau)
        r.divergence = semantic_divergence(vectors)
        r.switch = r.divergence >= self.tau_semantic
        r.mode = "adversarial" if r.switch else "collaborative"
        r.route.append(f"divergence:{r.divergence:.2f}:{'switch' if r.switch else 'stay'}")

    def _embed(self, texts: list[str]) -> tuple[str, list[Sequence[float]]]:
        """``(embedder, vectors)`` from the client's embedder; the hashing stub when it has none or it fails."""
        model = self.client.embedding_model
        if model:
            try:
                return model, list(self.client.embed(texts))
            except LLMError as err:
                self.result.warnings.append(f"divergence: embedder {model} failed ({err}); used {HASHING_EMBEDDER}")
        memory = HashingEmbeddingMemory()
        return HASHING_EMBEDDER, [memory.embed(text) for text in texts]

    def mesh_exchange(self) -> None:
        """Collaborative mode, after the Conflict Detector (which keeps the independent round-1 hypotheses): every
        specialist with a round-1 entry reads every peer's round-1 entry, concurrently, and posts a step-2 entry in the
        round-1 format plus what it adopts or disputes from each peer. A failed or malformed reply posts nothing
        (warning); fewer than two round-1 entries leave nobody to exchange with (``mesh_exchange:skipped``)."""
        r = self.result
        entries = {entry.agent: entry for entry in self.board.entries(kind="hypothesis") if entry.step == 1}
        roles = [role for role in SPECIALISTS if role in entries]
        if len(roles) < 2:
            r.warnings.append(f"mesh_exchange: {len(roles)} round-1 entry, no peer to exchange with; skipped")
            r.route.append("mesh_exchange:skipped")
            return
        snapshots = {role: self.board.snapshot(agent=role, kind="hypothesis") for role in roles}

        def post(role: str) -> tuple[BlackboardEntry | None, str | None]:
            own = specialist_block(role, self.case, self.sections, self.context_policy)
            user = mesh_block(own, snapshots[role], [snapshots[peer] for peer in roles if peer != role])
            return self._post(role, MESH_ROLES[role], mesh_system(role, self.case.open_ended), user, step=2,
                              call="mesh ", failed="no step-2 entry, its round-1 entry stands")

        with ThreadPoolExecutor(max_workers=len(roles)) as pool:
            replies = list(pool.map(post, roles))
        posted = []
        for role, (entry, warning) in zip(roles, replies, strict=True):
            if warning:
                r.warnings.append(warning)
            if entry is not None:
                self.board.write(entry)
                posted.append(role)
        r.route.append(f"mesh_exchange:{','.join(posted) or 'none'}")

    def critic(self) -> None:
        self.result.route.append("critic")
        try:
            report = ClinicalCritic(self.client).review(self.case, self.board, self.result.conflict_set)
        except LLMError as err:
            self.result.warnings.append(f"critic: call failed ({err}); resolving without flagged claims")
            return
        self.result.warnings.extend(f"critic: {error}" for error in report.errors)
        self.result.flagged_claims = [f"[{c.label}] {c.agent}: {c.text}" for c in report.flagged]
        if report.claims:
            self.conf *= 1 - len(report.flagged) / len(report.claims)

    def synthesize(self) -> None:
        """Synthesizer call; after a blocked gate it is the regeneration, with the violations listed."""
        r = self.result
        regenerate = self.safety is not None and self.safety.blocked
        r.route.append("regenerate" if regenerate else "synthesizer")
        case = question_block(self.case) if self.context_policy == STRICT else case_block(self.case, self.sections)
        parts = [case, f"Blackboard:\n{self.board.snapshot()}"]
        if any(entry.step == 2 for entry in self.board.entries(kind="hypothesis")):
            parts.append(MESH_SYNTHESIS)
        if r.mode == "adversarial":
            parts.append("Adversarial review: test each specialist's leading diagnosis against the case evidence."
                         if self.case.open_ended else f"Conflict set: {', '.join(r.conflict_set) or 'none'}")
            if r.flagged_claims:
                parts.append("Flagged claims (do not rely on these):\n" + "\n".join(f"- {c}" for c in r.flagged_claims))
        if regenerate:
            violations = "\n".join(f"- {g.name}: {v}" for g in self.safety.gates for v in g.violations)
            parts.append(f"Your previous write-up failed the safety gate:\n{violations}\nRevise it without these violations."
                         if self.case.open_ended else
                         f"Your previous answer ({r.final_answer or 'none'}) failed the safety gate:\n{violations}\n"
                         "Choose an option without these violations.")
        try:
            text, _ = self.client.complete(SYNTHESIZER, answer_system(SYNTHESIZER, self.case), "\n\n".join(parts))
        except LLMError as err:
            if not regenerate:
                raise
            r.warnings.append(f"regenerate: call failed ({err}); keeping the blocked answer")
            return
        _set_answer(r, text, self.case.letters(), SYNTHESIZER)

    def record_safety(self, report: SafetyReport) -> None:
        self.safety = report
        r = self.result
        r.gates, r.blocked, r.gate_disagreement, r.caution = report.gates, report.blocked, report.disagreement, report.caution

    def gate(self) -> None:
        self.record_safety(run_gates(self.case, self.result.final_text, self.result.final_answer))
        self.result.route.append(f"safety_gate:{'blocked' if self.result.blocked else 'pass'}")

    def safety_gate(self, max_rollbacks: int) -> None:
        """Gate; while blocked, up to ``max_rollbacks`` synthesizer regenerations, each re-gated; then ``finish``."""
        self.gate()
        for _ in range(max_rollbacks):
            if not self.result.blocked:
                break
            self.synthesize()
            self.gate()
        self.finish()

    def finish(self) -> None:
        """Label an answer that is still blocked; it is kept for grading."""
        if self.result.blocked:
            self.result.final_text = f"{BLOCKED_PREFIX}\n{self.result.final_text}"


class _Pipeline:
    """Shared ``run``: ledger reset, latency and call accounting; model errors are recorded, not raised.

    ``context_policy`` is used by the team arms only; the single agent always reads the full case.
    """

    arm = ""

    def __init__(self, client: LLMClient, *, context_policy: str = DEFAULT_CONTEXT_POLICY) -> None:
        self.client = client
        self.context_policy = check_context_policy(context_policy)

    def run(self, case: Case) -> RunResult:
        """Run one case and return its result (never raises ``LLMError``)."""
        self.client.reset_ledger()
        result = RunResult(case.id, self.arm)
        start = time.perf_counter()
        try:
            self._run(case, result)
        except LLMError as err:
            result.error = str(err)
            result.final_answer = None
        result.calls = self.client.reset_ledger()
        result.latency_s = time.perf_counter() - start
        return result

    def _run(self, case: Case, result: RunResult) -> None:
        raise NotImplementedError


class DynaClinicPipeline(_Pipeline):
    """Dynamic arm: cache -> triage (C) -> generalist sweep (U) and the mode rule -> hierarchical: primary care hub |
    collaborative or adversarial: care team -> divergence -> collaborative: mesh exchange | adversarial: critic ->
    synthesizer -> gate.

    The ``GreedyPlanner`` stub picks every stage and its reward per stage is logged in the route.
    ``max_rollbacks`` bounds safety-gate backtracks (regenerations); the adversarial round runs at most
    once by construction. Only gate-verified answers are cached, and a cache hit is re-gated against
    the new case so a near-duplicate with a different allergy or med list is recomputed. ``tau_semantic``
    is the open-ended switch threshold; None uses the embedder's ``divergence.TAU_SEMANTIC``. ``tau_u_mcq`` and
    ``tau_u_open`` (calibrated per input form, ``uncertainty``; ``tau_u`` overrides both) and ``top_k`` (open-ended
    cases) parametrise the Uncertainty Score.
    """

    arm = "dynamic"

    def __init__(
        self,
        client: LLMClient,
        *,
        tau: float = TAU,
        tau_semantic: float | None = None,
        escalate_threshold: int = MODERATE_SCORE,
        cache: SemanticCache | None = None,
        pca_samples: int = 1,
        max_rollbacks: int = 1,
        context_policy: str = DEFAULT_CONTEXT_POLICY,
        tau_u: float | None = None,
        tau_u_mcq: float = TAU_U_MCQ,
        tau_u_open: float = TAU_U_OPEN,
        top_k: int = DEFAULT_K,
    ) -> None:
        if pca_samples < 1 or max_rollbacks < 0:
            raise ValueError(f"need pca_samples >= 1 and max_rollbacks >= 0, got {pca_samples}, {max_rollbacks}")
        thresholds = {"tau_u": 0.0 if tau_u is None else tau_u, "tau_u_mcq": tau_u_mcq, "tau_u_open": tau_u_open}
        if not all(0.0 <= value <= 1.0 for value in thresholds.values()) or top_k < 2:
            raise ValueError(f"need 0 <= tau_u, tau_u_mcq, tau_u_open <= 1 and top_k >= 2, got {thresholds}, {top_k}")
        super().__init__(client, context_policy=context_policy)
        self.tau = tau
        self.tau_semantic = tau_semantic
        self.escalate_threshold = escalate_threshold
        self.cache = cache
        self.pca_samples = pca_samples
        self.max_rollbacks = max_rollbacks
        self.tau_u, self.tau_u_mcq, self.tau_u_open = tau_u, tau_u_mcq, tau_u_open
        self.top_k = top_k
        self.ingestor = FHIRLiteIngestor()

    def _run(self, case: Case, result: RunResult) -> None:
        run = CaseRun(self.client, case, result, self.ingestor.ingest(case), self.context_policy)
        result.route.append("ingest")
        key = case_block(case, run.sections)
        stages: dict[str, Callable[[], None]] = {
            "cache_lookup": lambda: self._cache_lookup(run, key),
            "triage": lambda: run.triage(self.escalate_threshold),
            "uncertainty": lambda: run.uncertainty(self.tau_u, self.top_k, self.tau_u_mcq, self.tau_u_open),
            "primary_care": lambda: run.primary_care(self.pca_samples),
            "care_team": lambda: run.care_team(run.team_roles()),
            "divergence": lambda: run.divergence(self.tau, self.tau_semantic),
            "mesh_exchange": run.mesh_exchange,
            "critic": run.critic,
            "synthesizer": run.synthesize,
            "safety_gate": run.gate,
        }
        planner = GreedyPlanner(max_regenerations=self.max_rollbacks)
        stage, regenerations = "start", 0
        while True:
            step = planner.next_step(
                stage, mode=result.mode, cache_hit=result.cache_hit,
                gate_passed=run.safety is not None and not run.safety.blocked, regenerations=regenerations,
            )
            if step.action == "terminal":
                break
            regenerations += step.action == "backtrack"
            before = run.progress()
            stages[step.stage]()
            after = run.progress()
            reward = planner.record(step.stage, before[0] - after[0], after[1] - before[1], float(before == after))
            result.route.append(f"planner:{step.action}:{reward:.2f}")
            stage = step.stage
        result.route.append("planner:terminal")
        run.finish()
        if self.cache is not None and not result.cache_hit:
            payload = {k: getattr(result, k) for k in ("final_answer", "final_text", "tier", "mode")}
            self.cache.store(key, payload, verified=result.final_answer is not None and not result.blocked)

    def _cache_lookup(self, run: CaseRun, key: str) -> None:
        r = run.result
        cached = self.cache.lookup(key) if self.cache is not None else None
        if cached is None:
            r.route.append("cache_lookup:off" if self.cache is None else "cache_lookup:miss")
            return
        report = run_gates(run.case, cached["final_text"], cached["final_answer"])
        if report.blocked:
            r.route.append("cache_lookup:rejected")
            r.warnings.append("cache: near-duplicate answer fails this case's safety gates; recomputing")
            return
        r.route.append("cache_hit")
        r.cache_hit = True
        r.final_answer, r.final_text, r.tier, r.mode = (cached[k] for k in ("final_answer", "final_text", "tier", "mode"))
        run.record_safety(report)


class StaticTeamPipeline(_Pipeline):
    """Exhaustive-consensus baseline: all specialists + Critic + Synthesizer + safety gate on every case.

    No triage and no switching; divergence is computed for reporting only (``switch`` records what the
    dynamic arm would have done). One regeneration on a blocked gate, as in the dynamic arm's default.
    """

    arm = "static"

    def _run(self, case: Case, result: RunResult) -> None:
        run = CaseRun(self.client, case, result, sections_from_structured(case.structured), self.context_policy)
        result.route.append("ingest")
        run.care_team(SPECIALISTS)
        run.divergence(TAU)
        result.mode = "adversarial"
        run.critic()
        run.synthesize()
        run.safety_gate(max_rollbacks=1)


class SingleAgentPipeline(_Pipeline):
    """Baseline: one generic-clinician call on the full case; no team, critic or gate."""

    arm = "single"

    def _run(self, case: Case, result: RunResult) -> None:
        result.mode = "single"
        result.route.append("single_agent")
        user = case_block(case, sections_from_structured(case.structured))
        text, _ = self.client.complete(SINGLE_AGENT, answer_system(SINGLE_AGENT, case), user)
        _set_answer(result, text, case.letters(), SINGLE_AGENT)
