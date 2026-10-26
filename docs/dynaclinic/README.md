# DynaClinic MVP

DynaClinic is the research target of this fork, from the proposal *"DynaClinic: A Dynamic Architecture Switching Multi-Agent Framework in Healthcare Settings"*. It claims that a clinical decision-support system should switch architecture per case. A Meta-Controller sends simple cases to a single Primary Care Agent and complex ones to an Integrated Care Team that shares a Blackboard. When the team disagrees, a Clinical Critic takes over in adversarial mode, and safety gates check every answer before release. This MVP makes that switching runnable and measurable on synthetic multiple-choice vignettes. It is a research prototype and not clinical advice.

Code: `dynaclinic/` (pure-Python pipeline and eval harness), `yaml_instance/dynaclinic_mvp.yaml` with `dynaclinic/devall_nodes.py` (DevAll workflow), and `data/dynaclinic/synthetic_cases.jsonl` (24 hand-authored cases).

## Proposal component -> module

Status key: **implemented** means the behaviour is in code. **prompt-level** means it rests only on an LLM prompt. **stub** means a simplified stand-in behind the proposal's interface. **not implemented** means absent.

| Proposal component | Module | Status | Notes |
|---|---|---|---|
| Meta-Controller tier 1: complexity triage | `dynaclinic/triage.py` | implemented | LLM tier plus a deterministic feature score. An LLM LOW is bumped to MODERATE when the score is high, and never lowered. |
| Primary Care Agent, Emanuel & Emanuel Informative model | `prompts.py` (`_PRIMARY_CARE`), `pipeline.CaseRun.primary_care` | prompt-level | Paternalistic and interpretive language is forbidden by the prompt only. No checker enforces it. |
| Integrated Care Team (Imaging, Pathology/Lab, Pharmacology) | `prompts.specialist_block`, `pipeline.CaseRun.care_team` | implemented | Each specialist gets its modality slice, plus the shared case summary under the default `shared_core` context policy (see [Context policy](#context-policy)). Specialists run concurrently. MODERATE uses 2 specialists, HIGH uses 3. |
| L3 shared Blackboard | `dynaclinic/blackboard.py` | implemented | In-memory, append-only, one per case. Specialists never see each other's entries. |
| Meta-Controller tier 2: conflict-aware routing (divergence, Conflict Set, tau) | `dynaclinic/divergence.py` | implemented | Mean pairwise Jensen-Shannon distance. Switches if `>= tau` or the top-1 answers disagree. |
| Multi-label margin loss | `divergence.margin_loss`, `eval/grade.py` | implemented (eval only) | Calibration metric on the team's mean distribution. It needs the gold answer, so it is never used for live routing. |
| Clinical Critic: atomic-claim decomposition | `dynaclinic/critic.py`, `prompts.py` | prompt-level | One LLM call splits the Blackboard into claims. A malformed reply falls back to the specialists' own claims. |
| Adaptive hybrid rule / LLM-judge estimator | `dynaclinic/critic.py` | implemented | Rule score = token grounding plus a KB veto. The judge's logits are temperature-scaled, and `lambda = sigmoid(k (var(r) - v0))`. The judge itself is an LLM call. |
| L1 FHIR ingestion into Neo4j | `interfaces.FHIRLiteIngestor`, `InMemoryGraphStore` | stub | Flat `structured` dict fields become text sections plus an in-memory dict graph. No FHIR parsing and no Neo4j. |
| L2 MCTS control plane (PUCT, reward, backtracking) | `interfaces.GreedyPlanner` | stub | A fixed greedy policy picks each stage. Reward `alpha*dMissing + beta*dConf - gamma*stagnation` is logged in the route only. No tree search. |
| L4 A_SAD (activity precedence) | `safety.py`, `kb.precedence_violations` | implemented | Regex rules over a small hand-written precedence list. |
| L4 T_SAD (trace rules) | `safety.py`, `kb.patient_conflicts` | implemented | Allergy class, contraindication and interaction checks against an illustrative KB. A block triggers 1 regeneration, then `BLOCKED FOR MANUAL REVIEW`. |
| L4 S_NAP (next-activity predictor) | `safety.py` | stub | Always passes, with the note "not implemented (stub)". |
| L4 trust-region constraint | none | not implemented | |
| L5 working memory | `pipeline.CaseRun` / `RunResult`; DevAll `global_state["dynaclinic"]` | stub | Per-case run state only. |
| L5 experience memory (BioBERT + Qdrant) | `interfaces.HashingEmbeddingMemory`, `kb.py` | stub | Hashing-trick bag-of-words vectors with exact cosine search, plus a static hand-written KB. No BioBERT, no Qdrant, no learning. |
| L5 verified semantic cache | `interfaces.InMemorySemanticCache` | stub | In-memory, stores gate-verified answers only, hit at cosine >= 0.97, re-gated on hit. Off in eval unless `--cache` is passed. |
| CSEDB safety metrics | none | not implemented | The eval reports *safety violation*: the final answer is one of the case's hand-labelled `unsafe_options`. That is not a CSEDB score. |
| Baselines | `pipeline.SingleAgentPipeline`, `pipeline.StaticTeamPipeline` | implemented | Single generic clinician, and an always-full team with Critic and gate (exhaustive consensus). |
| DevAll workflow | `devall_nodes.py`, `register.py`, `functions/edge/dynaclinic_conditions.py`, `yaml_instance/dynaclinic_mvp.yaml` | implemented | 7 `dc_*` node types. Edges route only on first-line markers `ROUTE:` / `MODE:` / `GATE:`. |
| Evaluation harness | `dynaclinic/eval/` (`cases.py`, `grade.py`, `harness.py`) | implemented | Synthetic set in the repo. The MedQA-format loader exists, but no sample is in the repo. |

## Dynamic pipeline

```mermaid
flowchart TD
    IN[Case: vignette, question, options, FHIR-lite fields] --> ING[Ingest - FHIRLiteIngestor stub]
    ING --> CACHE{Semantic cache stub<br/>off in eval by default}
    CACHE -- hit, re-gated for this patient --> OUT[Final answer]
    CACHE -- miss / off --> TRI[Meta-Controller triage<br/>LLM tier + feature score, escalate only]
    TRI -- LOW --> PCA[Primary Care Agent<br/>Informative model]
    TRI -- "MODERATE (2 specialists) / HIGH (3)" --> TEAM[Integrated Care Team<br/>Imaging / Pathology-Lab / Pharmacology]
    TEAM --> BB[(Blackboard)]
    BB --> DIV{Divergence >= tau 0.25<br/>or top-1 disagreement?}
    DIV -- no: COLLABORATIVE --> SYN[Synthesizer]
    DIV -- yes: ADVERSARIAL --> CRIT[Clinical Critic<br/>atomic claims, hybrid rule/judge, KB veto]
    CRIT -- flagged claims --> SYN
    PCA --> GATE{L4 gates: A_SAD, T_SAD, S_NAP stub}
    SYN --> GATE
    GATE -- PASS --> OUT
    GATE -- "BLOCKED (first time)" --> REGEN[Regenerate via Synthesizer<br/>with violations listed]
    REGEN --> GATE
    GATE -- still BLOCKED --> MANUAL[Final text prefixed<br/>BLOCKED FOR MANUAL REVIEW]
```

In the pure pipeline, the `GreedyPlanner` stub picks each stage and logs its reward as `planner:<action>:<reward>` in `RunResult.route`. In DevAll, the graph itself is the policy, and the planner and cache are not used.

## How to run

All commands run from the repo root. `.env` provides `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `DYNACLINIC_MODEL` and the comma list `DYNACLINIC_FALLBACK_MODELS`. If the primary model is missing or unavailable, the client switches to the next model for the rest of the run (sticky fallback).

**Pure pipeline (Python):**

```python
from dynaclinic.eval.cases import load_synthetic
from dynaclinic.llm import client_from_env
from dynaclinic.pipeline import DynaClinicPipeline, SingleAgentPipeline, StaticTeamPipeline

case = next(c for c in load_synthetic() if c.id == "syn-high-06")
result = DynaClinicPipeline(client_from_env()).run(case)  # never raises on model errors; see result.error
print(result.tier, result.mode, result.final_answer, result.blocked, [c.model for c in result.calls])
```

**DevAll workflow (SDK):** the task prompt is the case as free text, or as one `Case` JSON object. The parent coordinator verified this invocation live on gpt-6-luna: `syn-low-02` and `syn-high-06` were both answered correctly, with all gates PASS.

```python
import json
from dynaclinic.eval.cases import load_synthetic
from runtime.sdk import run_workflow

case = next(c for c in load_synthetic() if c.id == "syn-low-02")
run = run_workflow("yaml_instance/dynaclinic_mvp.yaml", task_prompt=json.dumps(case.to_dict()), session_name="dc_syn_low_02")
print(run.final_message.text_content())  # Report node; run.meta_info.output_dir holds node_outputs.yaml
```

**DevAll workflow (CLI):** `run.py` reads one line from stdin, so pass a JSONL line or free text:

```bash
grep '"syn-high-06"' data/dynaclinic/synthetic_cases.jsonl | env -u PYTHONPATH -u VIRTUAL_ENV uv run python run.py --path yaml_instance/dynaclinic_mvp.yaml --name dc_mvp
```

**Eval harness:**

```bash
# offline plumbing check: FakeLLM with valid, pseudo-random scripted replies
env -u PYTHONPATH -u VIRTUAL_ENV uv run python -m dynaclinic.eval.harness --dry-run --out /tmp/dc_dry
# live run of all three arms over the 24 synthetic cases
env -u PYTHONPATH -u VIRTUAL_ENV uv run python -m dynaclinic.eval.harness --arms dynamic,single,static --dataset synthetic --concurrency 4
```

Harness flags:

- `--limit N`: run only the first N cases.
- `--seed S`: shuffle the cases before `--limit`.
- `--cache`: enable the semantic cache.
- `--out DIR`: output directory. Default: `docs/dynaclinic/results/<UTC timestamp>-<model>`.
- `--context-policy strict|shared_core`: what the care team and Synthesizer see (dynamic and static arms). Default: `shared_core`.
- `--dataset synthetic,medqa`: add the MedQA sample. If `data/dynaclinic/medqa_sample.jsonl` is absent, the harness prints `no MedQA sample at <path>; skipping`.

Outputs:

- `results.jsonl`: one row per (case, arm), holding `RunResult` plus grades and the run's `context_policy`. No prompts; API key values are redacted.
- `summary.json`: run settings (including `context_policy`, also in the `summary.md` header) and the metrics below.
- `summary.md`: a per-arm table (accuracy with 95% Wilson CI, triage accuracy, routes, adversarial-switch rate, divergence, team margin loss, safety violations, blocked, errors, calls, tokens, latency, models and fallback calls, cost), accuracy per gold tier, and a case x arm answer matrix.

Behaviour:

- **Resume:** rerun with the same `--out`. Pairs already present are skipped, including errored ones (errors are measured outcomes).
- **Concurrency:** each worker thread owns its own client, because `run()` resets the client's call ledger.
- **Cost:** reported only when `DYNACLINIC_PRICE_<MODEL>_IN` and `DYNACLINIC_PRICE_<MODEL>_OUT` (USD per 1M tokens) are set for every model used. For example, `DYNACLINIC_PRICE_GPT_6_LUNA_IN` (non-alphanumerics become `_`). Otherwise cost is `n/a`.

## Context policy

`context_policy` sets how much of the case the Integrated Care Team and the Synthesizer see. It is a `DynaClinicPipeline` / `StaticTeamPipeline` argument, the harness flag `--context-policy`, and an optional `context_policy` field on the `dc_care_team` and `dc_synthesizer` nodes (the `dc_synthesizer` value also applies to `dc_safety_gate` regenerations).

- `strict`: each specialist sees only its modality slice (Imaging: imaging studies and the vignette sentences that mention imaging; Pathology/Lab: labs; Pharmacology: meds and allergies), plus the question and options. The Synthesizer sees the question, options and Blackboard. This mirrors the proposal's bounded-context personas.
- `shared_core` (default): each specialist first gets a "Shared case summary" (vignette, demographics, question, options), then its slice under "Your modality data (focus here)". The persona still has to reason from its modality and not prescribe outside its role. The Synthesizer gets the full case block (vignette, every structured section, question, options) before the Blackboard.

`shared_core` is the default because the strict baseline eval (`results/2026-10-27-full-gpt-6-luna/`) lost information. Under `strict`, case facts that sit only in the vignette, such as presenting symptoms, reached no specialist, and the Synthesizer (question, options and Blackboard only) could not recover them. The Critic does not depend on the policy: decomposition reads the Blackboard, and the judge and rule score always use the full case.

## Key thresholds

| Parameter | Default | Where |
|---|---|---|
| tau (adversarial switch on divergence) | 0.25 | `divergence.TAU`; `DynaClinicPipeline(tau=)`; `dc_divergence_gate` config `tau` |
| Conflict Set spread | 0.3 | `divergence.SPREAD_THRESHOLD` |
| Margin (margin loss) | 0.2 | `divergence.MARGIN` |
| Feature-score tier cut-offs / escalation | MODERATE >= 6, HIGH >= 12; escalate LLM LOW at >= 6 | `triage.MODERATE_SCORE`, `triage.HIGH_SCORE`; `DynaClinicPipeline(escalate_threshold=)`; `dc_triage` config |
| Judge temperature T | 1.5 | `critic.JUDGE_TEMPERATURE` |
| Hybrid weight `lambda = sigmoid(k (var(r) - v0))` | k = 10, v0 = 0.05 | `critic.LAMBDA_K`, `critic.LAMBDA_V0` |
| Claim flag threshold (hybrid) | < 0.5, or any KB contradiction | `critic.FLAG_THRESHOLD` |
| Safety-gate regenerations | 1 | `DynaClinicPipeline(max_rollbacks=)`; `dc_safety_gate` config `max_rollbacks` |
| Primary-care self-consistency samples | 1 | `DynaClinicPipeline(pca_samples=)`; `dc_primary_care` config |
| Semantic-cache hit | cosine >= 0.97 | `InMemorySemanticCache(threshold=)` |
| Planner reward weights | alpha 1.0, beta 1.0, gamma 0.5 | `GreedyPlanner` |

## Known limitations

- **Thresholds are not validated.** The triage cut-offs (`MODERATE_SCORE` / `HIGH_SCORE`) were chosen by inspecting the same 24 synthetic vignettes the eval uses, so triage accuracy on that set is in-sample. tau and the critic constants are the proposal's or hand-picked values and have not been tuned or validated on held-out data.
- **Small synthetic dataset.** The cases are 24 hand-authored textbook vignettes (8 per tier), so confidence intervals are wide. No MedQA sample is in the repo.
- **The KB is illustrative.** `kb.py` is a small, hand-written list of drug classes, interactions, contraindications and precedence rules. T_SAD and A_SAD catch only what it lists.
- **Negation handling is heuristic.** Regex patterns ("no", "not", "avoid", "instead of") decide whether a drug is asserted. Unusual phrasing can produce false gate blocks or misses.
- **The Critic, judge, triage and specialists are LLM-prompted.** Their quality depends on the model. The Informative-model constraint and the claim decomposition are not checked by code.
- **Single-run variance.** Each case is run once per arm. The pipelines never set a temperature, so provider defaults apply, and the client drops `temperature` for models that reject it. Repeated runs can differ.
- **Stubs.** No FHIR, Neo4j, MCTS, BioBERT, Qdrant, S_NAP, trust region or CSEDB. The MVP reports no scores for any of them.
- **Safety-violation definition.** A final answer in `unsafe_options` counts as a violation even when the gate blocked it. The blocked rate is reported separately.

## Results

Full evaluation results: see docs/dynaclinic/results/ (added by the coordinator).
