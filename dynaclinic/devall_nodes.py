"""DevAll node types wrapping the DynaClinic pipeline stages (design spec section 6).

Every executor runs one ``CaseRun`` stage from ``dynaclinic.pipeline``, the code the pure-Python
pipelines use, on the run state in ``ExecutionContext.global_state["dynaclinic"]``: a ``DevAllState``
holding the ``CaseRun`` (case, blackboard, ``RunResult`` with triage, divergence report, route trace and
call ledger) and one client per model chain, so a sticky model fallback lasts the whole run.

The first line of every output is an anchored marker read by ``functions/edge/dynaclinic_conditions.py``:
``ROUTE: LOW|MODERATE|HIGH`` (dc_triage), ``MODE: HIERARCHICAL|COLLABORATIVE|ADVERSARIAL`` (dc_uncertainty, the
mode rule), ``MODE: COLLABORATIVE|ADVERSARIAL`` (dc_divergence_gate), ``GATE: PASS|BLOCKED`` (dc_safety_gate) and
``STAGE: <name>`` (the others). Warnings raised by the stage (failed specialist, triage fallback, unmeasured
uncertainty, critic failure) are listed at the end.

``dc_triage`` starts a new case run from its input text (``case_from_text``); the other model nodes
start one only when none exists (a graph without triage). A fatal model error (failed primary care or
synthesizer call, every specialist failed) is recorded in ``RunResult.error`` and re-raised, so the
DevAll run fails instead of routing on a missing answer. In DevAll the graph is the policy: the
``GreedyPlanner`` stub and the semantic cache are not used.
"""

import json
import os
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any, ClassVar

from dynaclinic.divergence import TAU, TAU_SEMANTIC
from dynaclinic.interfaces import FHIRLiteIngestor
from dynaclinic.llm import LLMClient, LLMError, get_client
from dynaclinic.parsing import ABSTAIN
from dynaclinic.pipeline import CaseRun
from dynaclinic.plaintext import parse_plain_case
from dynaclinic.prompts import CONTEXT_POLICIES, DEFAULT_CONTEXT_POLICY
from dynaclinic.triage import MODERATE_SCORE
from dynaclinic.types import Case, RunResult
from dynaclinic.uncertainty import DEFAULT_K, TAU_U_MCQ, TAU_U_OPEN
from entity.configs import Node
from entity.configs.base import (
    BaseConfig,
    ConfigError,
    ConfigFieldSpec,
    extend_path,
    optional_str,
    require_mapping,
)
from entity.messages import Message, MessageRole
from runtime.node.executor.base import NodeExecutor

STATE_KEY = "dynaclinic"
ARM = "devall"


def case_from_text(text: str) -> Case:
    """Case for a task prompt: JSON with ``vignette``, ``question`` and ``options`` (other ``Case`` fields
    optional), else the plain-text format of ``dynaclinic.plaintext``: multiple choice, or any clinical
    scenario as an open-ended case (no options)."""
    try:
        return Case.from_dict({"id": ARM, "source": ARM, "answer": "", **json.loads(text)})
    except (ValueError, TypeError, KeyError, AttributeError):
        return parse_plain_case(text)


def _number(mapping: Mapping[str, Any], key: str, default: float, path: str, kind: type) -> Any:
    try:
        return kind(mapping.get(key, default))
    except (TypeError, ValueError) as exc:
        raise ConfigError(f"{key} must be a number", extend_path(path, key)) from exc


def _require(ok: bool, message: str, path: str, key: str) -> None:
    if not ok:
        raise ConfigError(message, extend_path(path, key))


def default_model(models: list[str] | None = None) -> str | None:
    """First model of ``models``, else of ``DYNACLINIC_MODEL`` + ``DYNACLINIC_FALLBACK_MODELS``; ``None`` if unset.

    Mirrors the chain in ``dynaclinic.llm.client_from_env``; ``.env`` is already loaded into ``os.environ``.
    """
    chain = models or [os.environ.get("DYNACLINIC_MODEL", ""), *os.environ.get("DYNACLINIC_FALLBACK_MODELS", "").split(",")]
    return next((model.strip() for model in chain if model and model.strip()), None)


@dataclass
class DCNodeConfig(BaseConfig):
    """Model chain of a DynaClinic node that calls the LLM."""

    model: str | None = None
    fallback_models: list[str] = field(default_factory=list)

    @classmethod
    def from_dict(cls, data: Mapping[str, Any] | None, *, path: str) -> "DCNodeConfig":
        return cls(path=path, **cls._parse(require_mapping(data or {}, path), path))

    @classmethod
    def _parse(cls, mapping: Mapping[str, Any], path: str) -> dict[str, Any]:
        fallback = mapping.get("fallback_models") or []
        _require(isinstance(fallback, list) and all(isinstance(m, str) and m for m in fallback),
                 "fallback_models must be a list of model names", path, "fallback_models")
        return {"model": optional_str(mapping, "model", path), "fallback_models": list(fallback)}

    def validate(self) -> None:
        _require(self.model is not None or not self.fallback_models, "fallback_models needs model", self.path,
                 "fallback_models")

    def models(self) -> list[str] | None:
        """``[model, *fallback_models]``; ``None`` = ``DYNACLINIC_MODEL`` + ``DYNACLINIC_FALLBACK_MODELS``."""
        return [self.model, *self.fallback_models] if self.model else None

    def model_summary(self) -> dict[str, str | None]:
        """Provider and effective model, for the workflow graph serializer."""
        return {"provider": "openai", "model": default_model(self.models())}

    FIELD_SPECS: ClassVar[dict[str, ConfigFieldSpec]] = {
        "model": ConfigFieldSpec(
            name="model",
            display_name="Model",
            type_hint="str",
            required=False,
            description="Chat model; unset uses DYNACLINIC_MODEL then DYNACLINIC_FALLBACK_MODELS (env or .env).",
        ),
        "fallback_models": ConfigFieldSpec(
            name="fallback_models",
            display_name="Fallback Models",
            type_hint="list[str]",
            required=False,
            description="Models switched to, for the rest of the run, when the current one fails. Needs model.",
            advance=True,
        ),
    }


@dataclass
class DCTriageConfig(DCNodeConfig):
    """dc_triage: Meta-Controller tier 1."""

    escalate_threshold: int = MODERATE_SCORE

    @classmethod
    def _parse(cls, mapping: Mapping[str, Any], path: str) -> dict[str, Any]:
        threshold = _number(mapping, "escalate_threshold", MODERATE_SCORE, path, int)
        return {**super()._parse(mapping, path), "escalate_threshold": threshold}

    def validate(self) -> None:
        super().validate()
        _require(self.escalate_threshold >= 0, "escalate_threshold must be >= 0", self.path, "escalate_threshold")

    FIELD_SPECS: ClassVar[dict[str, ConfigFieldSpec]] = {
        **DCNodeConfig.FIELD_SPECS,
        "escalate_threshold": ConfigFieldSpec(
            name="escalate_threshold",
            display_name="Escalate Threshold",
            type_hint="int",
            required=False,
            default=MODERATE_SCORE,
            description="Deterministic feature score at which an LLM LOW tier is bumped to MODERATE.",
            advance=True,
        ),
    }


@dataclass
class DCUncertaintyConfig(DCNodeConfig):
    """dc_uncertainty: generalist sweep (Uncertainty Score U) and the Meta-Controller's mode rule."""

    tau_u_mcq: float = TAU_U_MCQ
    tau_u_open: float = TAU_U_OPEN
    tau_u: float | None = None
    k: int = DEFAULT_K

    @classmethod
    def _parse(cls, mapping: Mapping[str, Any], path: str) -> dict[str, Any]:
        override = None if mapping.get("tau_u") is None else _number(mapping, "tau_u", 0, path, float)
        return {**super()._parse(mapping, path), "tau_u": override,
                "tau_u_mcq": _number(mapping, "tau_u_mcq", TAU_U_MCQ, path, float),
                "tau_u_open": _number(mapping, "tau_u_open", TAU_U_OPEN, path, float),
                "k": _number(mapping, "k", DEFAULT_K, path, int)}

    def validate(self) -> None:
        super().validate()
        for key in ("tau_u_mcq", "tau_u_open", "tau_u"):
            value = getattr(self, key)
            _require(value is None or 0.0 <= value <= 1.0, f"{key} must be in [0, 1] (normalised entropy)", self.path,
                     key)
        _require(self.k >= 2, "k must be >= 2", self.path, "k")

    FIELD_SPECS: ClassVar[dict[str, ConfigFieldSpec]] = {
        **DCNodeConfig.FIELD_SPECS,
        "tau_u_mcq": ConfigFieldSpec(
            name="tau_u_mcq",
            display_name="Tau U (multiple choice)",
            type_hint="float",
            required=False,
            default=TAU_U_MCQ,
            description="Multiple-choice cases: uncertainty above which the case goes adversarial regardless of "
            "complexity. 75th percentile on held-out MedQA-50 + synthetic-24; calibrated, not validated against "
            "outcomes.",
        ),
        "tau_u_open": ConfigFieldSpec(
            name="tau_u_open",
            display_name="Tau U (open-ended)",
            type_hint="float",
            required=False,
            default=TAU_U_OPEN,
            description="Open-ended cases: uncertainty above which the case goes adversarial regardless of "
            "complexity. 75th percentile on the same vignettes without options; calibrated, not validated against "
            "outcomes.",
        ),
        "tau_u": ConfigFieldSpec(
            name="tau_u",
            display_name="Tau U (override)",
            type_hint="float",
            required=False,
            description="One uncertainty threshold for both input forms; set, it overrides tau_u_mcq and tau_u_open.",
            advance=True,
        ),
        "k": ConfigFieldSpec(
            name="k",
            display_name="Top-k",
            type_hint="int",
            required=False,
            default=DEFAULT_K,
            description="Differentials the generalist sweep lists for an open-ended case (multiple choice: one per "
            "option); U = entropy / ln(k).",
            advance=True,
        ),
    }



@dataclass
class DCPrimaryCareConfig(DCNodeConfig):
    """dc_primary_care: Informative-model Primary Care Agent."""

    pca_samples: int = 1

    @classmethod
    def _parse(cls, mapping: Mapping[str, Any], path: str) -> dict[str, Any]:
        return {**super()._parse(mapping, path), "pca_samples": _number(mapping, "pca_samples", 1, path, int)}

    def validate(self) -> None:
        super().validate()
        _require(self.pca_samples >= 1, "pca_samples must be >= 1", self.path, "pca_samples")

    FIELD_SPECS: ClassVar[dict[str, ConfigFieldSpec]] = {
        **DCNodeConfig.FIELD_SPECS,
        "pca_samples": ConfigFieldSpec(
            name="pca_samples",
            display_name="Samples",
            type_hint="int",
            required=False,
            default=1,
            description="Self-consistency samples; more than one majority-votes the FINAL ANSWER.",
            advance=True,
        ),
    }


@dataclass
class DCSafetyGateConfig(DCNodeConfig):
    """dc_safety_gate: Layer-4 gates; the model is the Synthesizer used for regenerations."""

    max_rollbacks: int = 1

    @classmethod
    def _parse(cls, mapping: Mapping[str, Any], path: str) -> dict[str, Any]:
        return {**super()._parse(mapping, path), "max_rollbacks": _number(mapping, "max_rollbacks", 1, path, int)}

    def validate(self) -> None:
        super().validate()
        _require(self.max_rollbacks >= 0, "max_rollbacks must be >= 0", self.path, "max_rollbacks")

    FIELD_SPECS: ClassVar[dict[str, ConfigFieldSpec]] = {
        **DCNodeConfig.FIELD_SPECS,
        "max_rollbacks": ConfigFieldSpec(
            name="max_rollbacks",
            display_name="Max Regenerations",
            type_hint="int",
            required=False,
            default=1,
            description="Synthesizer regenerations while a gate fails; a still-blocked answer is labelled for review.",
            advance=True,
        ),
    }


@dataclass
class DCContextConfig(DCNodeConfig):
    """dc_care_team / dc_synthesizer: how much of the case the stage's agents see."""

    context_policy: str = DEFAULT_CONTEXT_POLICY

    @classmethod
    def _parse(cls, mapping: Mapping[str, Any], path: str) -> dict[str, Any]:
        return {**super()._parse(mapping, path), "context_policy": mapping.get("context_policy", DEFAULT_CONTEXT_POLICY)}

    def validate(self) -> None:
        super().validate()
        _require(self.context_policy in CONTEXT_POLICIES, f"context_policy must be one of {', '.join(CONTEXT_POLICIES)}",
                 self.path, "context_policy")

    FIELD_SPECS: ClassVar[dict[str, ConfigFieldSpec]] = {
        **DCNodeConfig.FIELD_SPECS,
        "context_policy": ConfigFieldSpec(
            name="context_policy",
            display_name="Context Policy",
            type_hint="str",
            required=False,
            default=DEFAULT_CONTEXT_POLICY,
            enum=list(CONTEXT_POLICIES),
            description="strict: each specialist sees only its modality slice, the Synthesizer only the question, "
            "options and Blackboard; shared_core: specialists also get the case summary (vignette, demographics, "
            "question, options), the Synthesizer the full case.",
            advance=True,
        ),
    }


@dataclass
class DCDivergenceGateConfig(BaseConfig):
    """dc_divergence_gate: tier-2 switch. Makes no LLM call, so it has no model (an open-ended case's
    leading diagnoses are embedded with the care team's client)."""

    tau: float = TAU
    tau_semantic: float | None = None

    @classmethod
    def from_dict(cls, data: Mapping[str, Any] | None, *, path: str) -> "DCDivergenceGateConfig":
        mapping = require_mapping(data or {}, path)
        semantic = None if mapping.get("tau_semantic") is None else _number(mapping, "tau_semantic", 0, path, float)
        return cls(path=path, tau=_number(mapping, "tau", TAU, path, float), tau_semantic=semantic)

    def validate(self) -> None:
        _require(0.0 <= self.tau <= 1.0, "tau must be in [0, 1] (Jensen-Shannon distance)", self.path, "tau")
        _require(self.tau_semantic is None or 0.0 <= self.tau_semantic <= 1.0,
                 "tau_semantic must be in [0, 1] (cosine distance)", self.path, "tau_semantic")

    FIELD_SPECS: ClassVar[dict[str, ConfigFieldSpec]] = {
        "tau": ConfigFieldSpec(
            name="tau",
            display_name="Tau",
            type_hint="float",
            required=False,
            default=TAU,
            description="Mean pairwise JS divergence at which the team switches to adversarial mode "
            "(top-1 disagreement always switches).",
        ),
        "tau_semantic": ConfigFieldSpec(
            name="tau_semantic",
            display_name="Tau (open-ended)",
            type_hint="float",
            required=False,
            description="Open-ended cases: mean pairwise cosine distance of the specialists' leading diagnoses "
            "at which the team switches to adversarial mode. Unset: the embedder's default "
            f"({', '.join(f'{name} {tau}' for name, tau in TAU_SEMANTIC.items())}).",
            advance=True,
        ),
    }


@dataclass
class DevAllState:
    """``global_state["dynaclinic"]``: the current case run plus one client per model chain."""

    run: CaseRun
    clients: dict[tuple[str, ...], LLMClient] = field(default_factory=dict)


def _client(clients: dict[tuple[str, ...], LLMClient], models: list[str] | None) -> LLMClient:
    key = tuple(models or ())
    if key not in clients:
        clients[key] = get_client(models)
    return clients[key]


class _StageExecutor(NodeExecutor):
    """Config, case-run state, client and ledger handling around one ``CaseRun`` stage."""

    config_cls: ClassVar[type[BaseConfig]] = DCNodeConfig
    starts_run: ClassVar[bool] = False

    def execute(self, node: Node, inputs: list[Message]) -> list[Message]:
        config = node.as_config(self.config_cls)
        if config is None:
            raise ValueError(f"Node {node.id} missing {node.type} configuration")
        run = self._case_run(node, inputs, config)
        warned = len(run.result.warnings)
        try:
            text = self.stage(run, config)
        except LLMError as err:
            run.result.error, run.result.final_answer = str(err), None
            raise
        finally:
            run.result.calls.extend(run.client.reset_ledger())
        warnings = run.result.warnings[warned:]
        if warnings:
            text += "\n\nWarnings:\n" + "\n".join(f"- {warning}" for warning in warnings)
        return [Message(role=MessageRole.ASSISTANT, content=text)]

    def stage(self, run: CaseRun, config: Any) -> str:
        """Run the stage and return the output text, marker line first."""
        raise NotImplementedError

    def _case_run(self, node: Node, inputs: list[Message], config: BaseConfig) -> CaseRun:
        state: DevAllState | None = self.context.global_state.get(STATE_KEY)
        clients = state.clients if state else {}
        client = _client(clients, config.models()) if isinstance(config, DCNodeConfig) else None
        if state is None or self.starts_run:
            text = inputs[-1].text_content() if inputs else ""
            if client is None or not text.strip():
                raise ValueError(f"{node.type} node {node.id} needs the case text as input (or an earlier dc_triage)")
            case = case_from_text(text)
            state = DevAllState(CaseRun(client, case, RunResult(case.id, ARM), FHIRLiteIngestor().ingest(case)), clients)
            state.run.result.route.append("ingest")
            self.context.global_state[STATE_KEY] = state
        if client is not None:
            state.run.client = client
        return state.run


class TriageExecutor(_StageExecutor):
    """dc_triage: starts the case run, emits ``ROUTE: <tier>``."""

    config_cls = DCTriageConfig
    starts_run = True

    def stage(self, run: CaseRun, config: DCTriageConfig) -> str:
        run.triage(config.escalate_threshold)
        t = run.result.triage
        summary = (f"Triage: LLM tier {t['llm_tier'] or 'n/a'}, deterministic tier {t['deterministic_tier']} "
                   f"(feature score {t['score']}){', escalated' if t['escalated'] else ''}.")
        return "\n".join(line for line in (f"ROUTE: {run.result.tier}", summary, t["rationale"]) if line)


class UncertaintyExecutor(_StageExecutor):
    """dc_uncertainty: one generalist sweep, then the mode rule on C (from dc_triage) and U; emits
    ``MODE: HIERARCHICAL|COLLABORATIVE|ADVERSARIAL``, then C, U, the thresholds (with the tau_u that applied: the
    input form's or the configured override), the rule and the differential."""

    config_cls = DCUncertaintyConfig

    def stage(self, run: CaseRun, config: DCUncertaintyConfig) -> str:
        if run.result.complexity is None:
            raise ValueError("dc_uncertainty needs an earlier dc_triage (Complexity Score C)")
        run.uncertainty(config.tau_u, config.k, config.tau_u_mcq, config.tau_u_open)
        r = run.result
        u = "n/a" if r.uncertainty is None else f"{r.uncertainty:.2f}"
        applied = ("configured override" if config.tau_u is not None else
                   f"for {'open-ended' if run.case.open_ended else 'multiple choice'}")
        differential = "\n".join(f"- {hypothesis}: {p:.2f}" for hypothesis, p in r.differential.items()) or "- none"
        return (f"MODE: {r.mode.upper()}\n"
                f"Complexity C={r.complexity:.2f} (tau_c {r.tau_c:g}), Uncertainty U={u} (tau_u {r.tau_u:g} "
                f"{applied}, k {r.top_k})\nRule: {r.mode_reason}\nDifferential (generalist sweep):\n{differential}")


class PrimaryCareExecutor(_StageExecutor):
    """dc_primary_care: hierarchical hub (Informative-model answer, optional CONSULT round with the spokes)."""

    config_cls = DCPrimaryCareConfig

    def stage(self, run: CaseRun, config: DCPrimaryCareConfig) -> str:
        run.primary_care(config.pca_samples)
        consults = "".join(f"- {c['role']}: {c['question']} -> {c['answer']}\n" for c in run.result.consults)
        if consults:
            consults = f"Hub consults (each specialist answered independently):\n{consults}\n"
        return f"STAGE: primary_care\n{consults}{run.result.final_text}"


class CareTeamExecutor(_StageExecutor):
    """dc_care_team: specialists for the triaged tier write to the Blackboard."""

    config_cls = DCContextConfig

    def stage(self, run: CaseRun, config: DCContextConfig) -> str:
        run.context_policy = config.context_policy
        run.care_team(run.team_roles())
        return f"STAGE: care_team\n{run.board.snapshot()}"


class DivergenceGateExecutor(_StageExecutor):
    """dc_divergence_gate: emits ``MODE: COLLABORATIVE|ADVERSARIAL``, then the divergence (JS over option
    distributions, or for an open-ended case the semantic divergence of the leading diagnoses). In adversarial mode
    entered by uncertainty the divergence is reported but the mode stays ADVERSARIAL."""

    config_cls = DCDivergenceGateConfig

    def stage(self, run: CaseRun, config: DCDivergenceGateConfig) -> str:
        run.divergence(config.tau, config.tau_semantic)
        r = run.result
        if run.case.open_ended:
            diagnoses = ", ".join(f"{agent} {text}" if text == ABSTAIN else f'{agent} "{text}"'
                                  for agent, text in r.assertions.items()) or "none"
            if r.divergence is None:
                detail = ("Semantic divergence not measurable: fewer than two specialists asserted a diagnosis; "
                          f"adversarial review (safety-biased); leading diagnoses: {diagnoses}.")
            else:
                detail = (f"Semantic divergence {r.divergence:.2f} (tau_semantic {run.tau_semantic:g}, "
                          f"embedder {r.embedder}); leading diagnoses: {diagnoses}.")
        else:
            top1 = ", ".join(f"{agent} {letter}{' (abstains)' if agent in run.abstainers else ''}"
                             for agent, letter in r.top1.items())
            detail = (f"Divergence {r.divergence:.2f} (tau {config.tau}); top-1: {top1}; "
                      f"conflict set: {', '.join(r.conflict_set) or 'none'}.")
        if run.by_uncertainty:
            detail += (f"\nAdversarial mode entered by uncertainty (U {r.uncertainty:.2f} > tau_u {r.tau_u:g}): the "
                       "Conflict Detector reports only; the mode stays adversarial.")
        return f"MODE: {r.mode.upper()}\n{detail}"


class CriticExecutor(_StageExecutor):
    """dc_critic: Clinical Critic flags unsupported claims for the synthesizer."""

    def stage(self, run: CaseRun, config: DCNodeConfig) -> str:
        run.critic()
        flagged = "\n".join(f"- {claim}" for claim in run.result.flagged_claims) or "- none"
        return f"STAGE: critic\nFlagged claims:\n{flagged}"


class SynthesizerExecutor(_StageExecutor):
    """dc_synthesizer: final answer from the Blackboard, as the Consensus Builder in collaborative mode or
    the Conflict Resolver (Mediator) weighing the critic's flagged claims in adversarial mode.

    Its ``context_policy`` also applies to dc_safety_gate regenerations, which re-run this stage.
    """

    config_cls = DCContextConfig

    def stage(self, run: CaseRun, config: DCContextConfig) -> str:
        run.context_policy = config.context_policy
        run.synthesize()
        role = "Conflict Resolver" if run.result.mode == "adversarial" else "Consensus Builder"
        return f"STAGE: synthesizer ({role})\n{run.result.final_text}"


class SafetyGateExecutor(_StageExecutor):
    """dc_safety_gate: A_SAD/T_SAD/S_NAP with regenerations; emits ``GATE: PASS|BLOCKED``.

    An open-ended case's write-up is headed ``Assessment and plan:`` (the Report template keys on it).
    """

    config_cls = DCSafetyGateConfig

    def stage(self, run: CaseRun, config: DCSafetyGateConfig) -> str:
        run.safety_gate(config.max_rollbacks)
        r = run.result
        gates = "\n".join(
            f"- {g.name}: {'pass' if g.passed else 'FAIL'}"
            + "".join(f"\n  - {violation}" for violation in g.violations)
            + (f" ({g.note})" if g.note else "")
            for g in r.gates
        )
        body = f"Assessment and plan:\n{r.final_text}" if run.case.open_ended else r.final_text
        return f"GATE: {'BLOCKED' if r.blocked else 'PASS'}\n{body}\n\nSafety gates:\n{gates}"
