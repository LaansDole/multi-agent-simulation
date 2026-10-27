"""DynaClinic pipelines: the dynamic arm (design spec section 5) and two baselines.

Every arm's ``run(case)`` resets the client ledger, fills ``RunResult.calls`` from it, measures
latency and never raises on model errors: a failed answering call (primary care, synthesizer,
single agent) or a care team in which every specialist failed sets ``error`` and leaves
``final_answer`` None; degraded stages (some specialists failed or malformed, triage fallback, critic
or regeneration failure) go to ``warnings`` and the run continues.

Route entries are stable identifiers: ``ingest``, ``cache_lookup:off|miss|rejected``, ``cache_hit``,
``triage:<TIER>``, ``primary_care``, ``care_team:<roles>``, ``care_team:failed``,
``divergence:<d>:switch|stay``, ``critic``, ``synthesizer``, ``regenerate``, ``safety_gate:pass|blocked``,
``single_agent``. In the dynamic arm every
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
from dynaclinic.divergence import TAU, assess, normalize
from dynaclinic.interfaces import (
    FHIRLiteIngestor,
    GreedyPlanner,
    SemanticCache,
    sections_from_structured,
)
from dynaclinic.llm import LLMClient, LLMError
from dynaclinic.parsing import extract_final_answer, extract_json
from dynaclinic.prompts import (
    DEFAULT_CONTEXT_POLICY,
    IMAGING,
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
    modality_data,
    question_block,
    specialist_block,
    specialist_system,
)
from dynaclinic.safety import SafetyReport, run_gates
from dynaclinic.triage import (
    MODERATE_SCORE,
    TriageResult,
    feature_score,
    score_tier,
    triage_case,
)
from dynaclinic.types import BlackboardEntry, Case, RunResult

BLOCKED_PREFIX = "BLOCKED FOR MANUAL REVIEW"
# MODERATE takes the first two specialists that have data for the case, in this order: Pharmacology
# first so it is always included when meds or allergies are listed.
_MODERATE_ORDER = (PHARMACOLOGY, PATHOLOGY, IMAGING)
_TRIAGE_FIELDS = ("llm_tier", "deterministic_tier", "score", "features", "escalated", "rationale", "llm_features")


def _strings(value: object) -> list[str]:
    return [str(item) for item in value] if isinstance(value, list) else []


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
    ``RECOMMENDATION:`` instead of a FINAL ANSWER letter, specialists need no distribution and divergence is
    not measurable (adversarial review, safety-biased). ``context_policy`` (``prompts``: strict |
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
        r.triage = {name: getattr(triage, name) for name in _TRIAGE_FIELDS}
        if triage.error:
            r.warnings.append(f"triage: {triage.error}")
        r.route.append(f"triage:{triage.tier}")

    def primary_care(self, samples: int = 1) -> None:
        """Informative-model answer; ``samples > 1`` majority-votes (ties: earliest sample)."""
        r = self.result
        r.mode = "single"
        r.route.append("primary_care")
        user = case_block(self.case, self.sections)
        system = answer_system(PRIMARY_CARE, self.case)
        texts = [self.client.complete(PRIMARY_CARE, system, user)[0] for _ in range(samples)]
        answers = [extract_final_answer(text, self.case.letters()) for text in texts]
        votes = Counter(answer for answer in answers if answer)
        text = texts[answers.index(votes.most_common(1)[0][0])] if votes else texts[0]
        self.conf = max(votes.values(), default=0) / len(texts)
        _set_answer(r, text, self.case.letters(), PRIMARY_CARE)
        self.board.write(BlackboardEntry(PRIMARY_CARE, "verdict", text, step=1))  # read by a regeneration

    def team_roles(self) -> list[str]:
        """MODERATE: the first two of ``_MODERATE_ORDER`` with data for the case; otherwise every specialist."""
        if self.result.tier != "MODERATE":
            return list(SPECIALISTS)
        chosen = sorted(_MODERATE_ORDER, key=lambda role: not modality_data(role, self.case, self.sections))[:2]
        return [role for role in SPECIALISTS if role in chosen]

    def care_team(self, roles: Sequence[str]) -> None:
        """Run ``roles`` concurrently; entries are posted in role order once all have answered.

        Raises ``LLMError("all specialists failed")`` (route ``care_team:failed``) when no specialist
        posts an entry: an empty Blackboard would otherwise read as agreement (divergence 0).
        """
        self.result.route.append(f"care_team:{','.join(roles)}")
        with ThreadPoolExecutor(max_workers=len(roles)) as pool:
            replies = list(pool.map(self._consult, roles))
        for role, reply in zip(roles, replies, strict=True):
            if isinstance(reply, str):
                self.result.warnings.append(reply)
            else:
                self.board.write(reply)
                if reply.distribution is not None:
                    self.result.distributions[role] = reply.distribution
        if all(isinstance(reply, str) for reply in replies):
            self.result.route.append("care_team:failed")
            raise LLMError("all specialists failed")
        dists, letters = list(self.result.distributions.values()), self.case.letters()
        self.conf = max(sum(d[letter] for d in dists) / len(dists) for letter in letters) if dists and letters else 0.0

    def _consult(self, role: str) -> BlackboardEntry | str:
        """One specialist call (worker thread): its entry, or a warning when the call or reply fails."""
        user = specialist_block(role, self.case, self.sections, self.context_policy)
        try:
            text, _ = self.client.complete(role, specialist_system(role, self.context_policy), user, json_mode=True)
        except LLMError as err:
            return f"{role}: call failed ({err}); excluded from the team"
        data = extract_json(text)
        letters = self.case.letters()
        distribution = (data or {}).get("distribution")
        if letters and (not isinstance(distribution, dict) or not distribution):
            return f"{role}: reply has no distribution; excluded from the team"
        if data is None:
            return f"{role}: reply is not JSON; excluded from the team"
        findings = "; ".join(_strings(data.get("findings"))) or "(no findings)"
        dist = normalize(distribution, letters) if letters else None
        return BlackboardEntry(role, "hypothesis", findings, dist, _strings(data.get("claims")), step=1)

    def divergence(self, tau: float) -> None:
        """Tier 2 switch; without options divergence is not measurable and the team goes adversarial."""
        r = self.result
        if not self.case.letters():
            r.switch, r.mode = True, "adversarial"
            r.route.append("divergence:n/a:switch")
            return
        report = assess(r.distributions, self.case.letters(), tau)
        r.divergence, r.top1, r.disagreement = report.divergence, report.top1, report.disagreement
        r.conflict_set, r.switch, self.abstainers = report.conflict_set, report.switch, report.abstainers
        r.mode = "adversarial" if report.switch else "collaborative"
        r.route.append(f"divergence:{report.divergence:.2f}:{'switch' if report.switch else 'stay'}")

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
        if r.mode == "adversarial":
            parts.append("Adversarial review: test each specialist's assertion against the case evidence."
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
    """Dynamic arm: cache -> triage -> primary care | care team -> divergence -> critic? -> synthesizer -> gate.

    The ``GreedyPlanner`` stub picks every stage and its reward per stage is logged in the route.
    ``max_rollbacks`` bounds safety-gate backtracks (regenerations); the adversarial round runs at most
    once by construction. Only gate-verified answers are cached, and a cache hit is re-gated against
    the new case so a near-duplicate with a different allergy or med list is recomputed.
    """

    arm = "dynamic"

    def __init__(
        self,
        client: LLMClient,
        *,
        tau: float = TAU,
        escalate_threshold: int = MODERATE_SCORE,
        cache: SemanticCache | None = None,
        pca_samples: int = 1,
        max_rollbacks: int = 1,
        context_policy: str = DEFAULT_CONTEXT_POLICY,
    ) -> None:
        if pca_samples < 1 or max_rollbacks < 0:
            raise ValueError(f"need pca_samples >= 1 and max_rollbacks >= 0, got {pca_samples}, {max_rollbacks}")
        super().__init__(client, context_policy=context_policy)
        self.tau = tau
        self.escalate_threshold = escalate_threshold
        self.cache = cache
        self.pca_samples = pca_samples
        self.max_rollbacks = max_rollbacks
        self.ingestor = FHIRLiteIngestor()

    def _run(self, case: Case, result: RunResult) -> None:
        run = CaseRun(self.client, case, result, self.ingestor.ingest(case), self.context_policy)
        result.route.append("ingest")
        key = case_block(case, run.sections)
        stages: dict[str, Callable[[], None]] = {
            "cache_lookup": lambda: self._cache_lookup(run, key),
            "triage": lambda: run.triage(self.escalate_threshold),
            "primary_care": lambda: run.primary_care(self.pca_samples),
            "care_team": lambda: run.care_team(run.team_roles()),
            "divergence": lambda: run.divergence(self.tau),
            "critic": run.critic,
            "synthesizer": run.synthesize,
            "safety_gate": run.gate,
        }
        planner = GreedyPlanner(max_regenerations=self.max_rollbacks)
        stage, regenerations = "start", 0
        while True:
            step = planner.next_step(
                stage, tier=result.tier, mode=result.mode, cache_hit=result.cache_hit,
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
