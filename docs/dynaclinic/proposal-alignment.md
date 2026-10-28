# DynaClinic vs the reviewed proposal (DynamiClinic)

The implementation was built from an extended draft of the proposal (5 layers: FHIR/Neo4j ingestion, MCTS control plane, Blackboard, A_SAD/S_NAP/T_SAD safety gates, BioBERT/Qdrant memory). This page checks it against the **reviewed** proposal, *"DynamiClinic: A Dynamic Architecture Switching Multi-Agent Framework in Healthcare Settings"* (Do Le Long An; reviewed by A/Prof. Arthur Tang and Dr. Linh Tran), which is shorter and defines the system differently: layers L0 to L4, three communication modes, a complexity score and an uncertainty score, and a Conflict Detector between two hypotheses.

Checked on 2026-10-27 against the code at commit 7c83807 and with real runs on OpenAI gpt-6-luna, then re-checked after the fixes it led to (f11 to f13, commits ac19ad6 to 302f550), and again on 2026-10-28 after the Meta-Controller and the three modes were aligned with the proposal (f14 and f15, commits 9ace5a6 to 2cf1567). The repo keeps the name DynaClinic; the reviewed proposal spells it DynamiClinic.

Status key: **matches**: the code does what the proposal says. **partial**: the idea is there but the mechanism differs. **differs**: the code does something else. **missing**: not in the code. **extra**: in the code, not in the reviewed proposal.

## Architecture layers (proposal Table 1)

| Layer (proposal) | Proposal components | In the code | Status |
|---|---|---|---|
| L0 Clinical Input Gateway | Query intake, Context Vector Builder | `CaseInput` passthrough, `case_from_text` (JSON, plain text, free text), `FHIRLiteIngestor` stub that turns structured fields into text sections | partial: intake yes, no context vector |
| L1 Meta-Controller Orchestration | Meta-Controller, Complexity Score, Uncertainty Score, Triage | `dynaclinic/triage.py` (LLM tier plus a deterministic feature score) gives the Complexity Score C; `dynaclinic/uncertainty.py` and the `GeneralistSweep` node give the Uncertainty Score U; one rule over both picks the mode | matches; LOW / MODERATE / HIGH tiers kept as an extension (below) |
| L2 Dynamic Communication Topology | Hierarchical (hub-spoke), Collaborative (mesh), Adversarial (proponent/opponent/mediator) | Modes `hierarchical` (Primary Care hub, up to 2 consulted specialists), `collaborative` (care team + one mesh exchange round), `adversarial` (Proponent, Clinical Critic as Opponent, Synthesizer as Mediator) | matches, one round each (below) |
| L3 Agent Execution and Processing | Primary Care Agent; ICT (Imaging, Pathology, Pharmacology); Conflict Detector; Consensus Builder; Clinical Critic; Conflict Resolver | `dc_primary_care`; `dc_care_team` (3 specialists); `dc_divergence_gate`; `dc_mesh_exchange`; `dc_proponent`; `dc_critic` (Opponent); `dc_synthesizer` (Consensus Builder, or Mediator / Conflict Resolver in adversarial mode) | matches, with one node playing both Consensus Builder and Conflict Resolver |
| L4 Data and Infrastructure | Medical process models, institutional protocols, persistent state, trace store | `kb.py` (small illustrative drug/precedence KB), per-run state (`global_state["dynaclinic"]`, Blackboard), trace store = DevAll run folder (`node_outputs.yaml`, `execution_logs.json`) | partial: no process models or institutional protocols |
| DevAll runtime (Figure 1) | WebSocket server, Runtime SDK, GraphExecutor, CycleManager, TopologyBuilder | Runs as `yaml_instance/dynaclinic_mvp.yaml` on DevAll; 3D office view in `the-delegation/` | matches |

## Mechanisms

| Proposal (section) | What it says | What the code does | Status |
|---|---|---|---|
| Triage classes (3) | Two classes: LOW, HIGH | Three: LOW, MODERATE (2 specialists), HIGH (3) | differs (extension) |
| LOW path (3) | Single Primary Care Agent, bypasses MAS collaboration | Same | matches |
| HIGH path (3) | ICT in parallel, synthesized by a Consensus Builder | Same; specialists run concurrently and post to a Blackboard, synthesizer answers | matches |
| Complexity score C (2) | Density of clinical context: comorbidities, conflicting labs, multimodal inputs | Feature score from structured fields and LLM-extracted counts | matches in spirit; cut-offs not validated |
| Uncertainty score U (2) | Normalized entropy of the initial distribution over top-k differentials from a baseline generalist sweep | `GeneralistSweep`: one generalist call returns a top-k differential with probabilities (k = number of options for multiple choice, 5 for open-ended); U is its normalized entropy. tau_u per input form: 0.15 multiple choice, 0.59 open-ended, each the 75th percentile of U on MedQA-50 + synthetic-24 (and the same vignettes without options) | matches; thresholds calibrated in-sample, not validated against outcomes |
| Piecewise mode selection from C and U (2) | One rule over both scores chooses Hierarchical / Collaborative / Adversarial | `select_mode`: U > tau_u adversarial; else C <= tau_c (0.5) hierarchical; else collaborative. The Conflict Detector can still switch a collaborative team to adversarial afterwards | matches, plus the detector as a second entry point |
| Hierarchical mode (1) | Meta-Controller as hub querying subordinate specialists, no inter-agent talk | Primary Care is the hub; it may name up to 2 `CONSULT:` specialists, who answer independently and never see each other | matches (Primary Care, not the Meta-Controller, is the hub) |
| Collaborative mode (1) | Fully connected mesh; agents share intermediate reasoning | After an independent round 1 (which the Conflict Detector measures), `MeshExchange` gives every specialist all peers' round-1 entries; each states what it adopts or disputes from each named peer and posts a revised entry. The Consensus Builder integrates both rounds | matches, one exchange round |
| Conflict Detector (4) | Normalized semantic distance between the primary diagnostic assertions of two hypotheses, threshold tau | Multiple choice: mean pairwise Jensen-Shannon distance over answer distributions, tau 0.25, plus top-1 disagreement. Open-ended (since f11 to f13): each specialist states a LEADING DIAGNOSIS; mean pairwise cosine distance of their embeddings (text-embedding-3-small, hashing fallback), tau_semantic 0.35 (not validated) | matches for open-ended cases; threshold not validated |
| Adversarial mode (1, 4) | Proponent team vs Opponent team, Mediator adjudicates; Clinical Critic does destructive, evidence-grounded testing of both hypotheses, Conflict Resolver synthesizes | H1 = the team's plurality hypothesis (else the sweep's top differential), H2 = the strongest alternative. `Proponent` argues for H1 and states what would falsify it; the Clinical Critic, as Opponent, keeps its atomic-claim scoring and adds counterevidence against H1 and H2; the Synthesizer, as Mediator, reads the transcript and states the SURVIVING HYPOTHESIS before answering | matches, one agent per role and one round (the proposal says teams) |
| Input form (2, 3, Figures 2-3) | Free-text clinical queries | Multiple-choice cases, and since f11 any open-ended scenario (bare narrative, optional Labs/Meds/Imaging lines) answered with ASSESSMENT, DIFFERENTIAL, PLAN, RED FLAGS, MISSING INFORMATION and RECOMMENDATION, no letter | matches |
| Counterfactual grounding loss (2) | Opponent maximizes the distance between the proposed diagnostic embedding and verified medical constraints | Closest analogue: KB veto and grounding score inside the critic. No embedding-space objective | missing |
| Safety gates A_SAD / S_NAP / T_SAD | Not in the reviewed proposal | Implemented (A_SAD, T_SAD) and stubbed (S_NAP) from the extended draft | extra |
| MCTS control plane, FHIR/Neo4j, BioBERT/Qdrant memory, semantic cache | Not in the reviewed proposal | Stubs from the extended draft | extra (stubs) |

## The proposal's own examples, run for real

The reviewed proposal gives four example queries (Figures 2 and 3). Each was run twice through `dynaclinic_mvp.yaml` on gpt-6-luna before the fixes (commit 7c83807, run folders `WareHouse/pdf-before_*`) and twice after them (commit 302f550, `WareHouse/f13run1_*`, `f13run2_*`), with the user's own open-ended example added.

| Example | Proposal expects | Before: route / conflict routing | After: route / conflict routing |
|---|---|---|---|
| "Patient presents with sore throat and mild fever for 2 days." | LOW | LOW, LOW / not reached | LOW, LOW / not reached |
| "68-year-old diabetic patient with chest pain, renal insufficiency, and concurrent warfarin therapy." | HIGH | HIGH, HIGH / adversarial by the "not measurable without options" fallback | HIGH, HIGH / all three specialists: acute coronary syndrome; divergence 0.11, 0.12, collaborative |
| "Young adult with fever, sore throat, and cervical lymphadenopathy." | likely CONSENSUS | LOW, LOW / not reached | LOW, LOW / not reached (triage keeps it with Primary Care) |
| "55-year-old with acute chest pain, normal ECG, elevated D-dimer, and recent long flight." | likely CONFLICT | HIGH, HIGH / adversarial by the same fallback | MODERATE, HIGH / every specialist: pulmonary embolism; divergence 0.05, 0.14, collaborative |
| "a patient has COVID-19 in a sunny day" (user's example) | (open-ended) | LOW / report ended "FINAL ANSWER: A" | LOW, LOW / six-section write-up, weather called irrelevant, no letter |

Triage matched the proposal on every run. Before the fixes, conflict routing never measured anything on these queries and reports ended in meaningless letters. Two intermediate states were also run and rejected (`WareHouse/after*`, `f12run*`): first every specialist abstained because its structured data section was empty (fixed in f12: specialists read the narrative), then the distance compared each specialist's own next step ("order CT", "check troponin", "avoid NSAIDs") and crossed tau although all three agreed on the diagnosis (fixed in f13: the distance uses only the LEADING DIAGNOSIS line, as the proposal specifies).

After the fixes the detector measures what the proposal defines, and on these examples gpt-6-luna's specialists agree, so the "likely conflict" example stays collaborative. That is a property of the model and the example, not a fallback; nothing was tuned to change it. tau_semantic 0.35 for text-embedding-3-small is an assumed value, not validated.

### After f14 and f15 (uncertainty score, mode rule, mesh, debate)

Same five queries, twice each, on gpt-6-luna: f14 (commit be596a7, tau_u 0.8 assumed, `WareHouse/f14run1_*`, `f14run2_*`) and f15 (commit 2cf1567, tau_u 0.59 for open-ended input, `WareHouse/f15run1_*`, `f15run2_*`). Cells: route / mode (U).

| Example | Proposal expects | f14 run 1, run 2 | f15 run 1, run 2 | f15 Mediator verdict |
|---|---|---|---|---|
| Sore throat and mild fever | LOW | LOW / hierarchical (0.60), hierarchical (0.65) | LOW / adversarial (0.71), adversarial (0.65) | H1 acute pharyngitis, both runs |
| 68-year-old diabetic, chest pain, renal insufficiency, warfarin | HIGH | HIGH / adversarial (0.93), adversarial (0.92) | HIGH / adversarial (0.94), adversarial (0.92) | H1 suspected ACS, both runs |
| Young adult, fever, sore throat, cervical lymphadenopathy | likely CONSENSUS | LOW / adversarial (0.88), hierarchical (0.78) | LOW / adversarial (0.91), adversarial (0.84) | H1 acute pharyngitis; run 2 "neither" (cause undetermined) |
| 55-year-old, chest pain, normal ECG, high D-dimer, long flight | likely CONFLICT | HIGH / adversarial (0.94), adversarial (0.92) | HIGH / adversarial (0.91), adversarial (0.94) | H2, both runs: H1 and H2 were both pulmonary embolism, worded differently |
| "a patient has COVID-19 in a sunny day" | (open-ended) | LOW / hierarchical, hierarchical | LOW / hierarchical (0.04), adversarial (0.63) | run 2: H1 COVID-19 |

- Complexity triage still matches the proposal on every run. The Uncertainty Score does not: on these short queries the generalist spreads probability over several differentials, so U is high (0.6 to 0.94) and every proposal example, including the LOW and "likely consensus" ones, goes adversarial under tau_u 0.59. This was predicted from the calibration (the sore-throat example sat above the open-ended p75) and nothing was tuned to avoid it.
- U is noisy on very short queries: the COVID example gave U 0.04 in one run and 0.63 in the other.
- The debate ran for real. In the D-dimer example the team plurality (H1) and the alternative (H2) were the same diagnosis in different words, because H1/H2 votes match only after case and punctuation folding; the Mediator said so and picked H2. Paraphrase-aware matching is needed.
- Safety gates passed on all 10 f15 runs.

### Benchmarks after f15 (dynamic arm only, gpt-6-luna)

Results in `results/2026-10-28-f15-medqa50-dynamic-gpt-6-luna/` and `results/2026-10-28-f15-synthetic-dynamic-gpt-6-luna/`; f14 baselines in the matching `2026-10-27-f14-*` folders. The single and static arms did not change (identical prompt hashes before and after f15) and were not re-run.

| Set | f14 accuracy | f15 accuracy [95% CI] | f15 modes | calls / case (f14 -> f15) | mean latency (f14 -> f15) |
|---|---|---|---|---|---|
| MedQA-50 | 94% (47/50) | 96% (48/50) [86.5, 98.9] | adversarial 17, collaborative 20, hierarchical 13 | 4.66 -> 6.94 | 14.9 s -> 32.0 s |
| Synthetic-24 | 100% (24/24) | 95.8% (23/24) [79.8, 99.3] | adversarial 1, collaborative 18, hierarchical 5 | 5.04 -> 7.12 | 15.0 s -> 24.9 s |

- MedQA now exercises the adversarial path (17 of 50, was 0), all entered by uncertainty, none by the Conflict Detector. 15 of the 17 were answered correctly; both misses (medqa-test-0243, 0755) are adversarial cases. The Mediator kept H1 in 16 and answered "neither" once.
- The +1 question on MedQA and the -1 case on synthetic are inside the intervals and within run-to-run variance; they are not evidence for or against the new modes.
- The synthetic miss, syn-high-02, is a collaborative case where round 1's plurality was the correct answer (C); after the mesh exchange the Consensus Builder answered D, the safety gate blocked it twice and the case ended with no answer.
- In 11 of the 20 collaborative MedQA cases every specialist abstained in round 1 (uniform distribution; MedQA vignettes have no structured data for the specialists' modalities), so the mesh had nothing to exchange and the Consensus Builder answered alone.


## Citations checked (web, 2026-10-27)

- MDAgents [3]: NeurIPS 2024; best on 7 of 10 benchmarks, up to +4.2% over prior best (arXiv 2404.15155). Matches the proposal's description.
- DynamiCare [5]: arXiv 2507.02616, multi-round interactive specialist team on MIMIC-Patient. Matches.
- Dialectic-Med [11]: published in **Findings of ACL 2026** (pages 36877-36894, DOI 10.18653/v1/2026.findings-acl.1837), not the main ACL 2026 conference as the reference list says, and it is evaluated on medical visual question answering (MIMIC-CXR-VQA, VQA-RAD, PathVQA). The proposal's "proves that adversarial communication is strictly necessary ... guarantee patient safety" is stronger than the paper's claim.

## What follows for the research

- The two gaps named before f14 (uncertainty score at triage, mesh collaborative mode) are closed, and the proposal's single rule over C and U now chooses all three modes. Each mode is one round with one agent per role; the proposal's Proponent and Opponent *teams* and multi-round debate are not built.
- tau_u is calibrated in-sample (75th percentile on the eval's own vignettes) and sends every proposal example to adversarial. It needs validating against outcomes on a held-out set, and U itself needs more than one generalist sample to be stable on short queries.
- The adversarial mode now runs on a third of MedQA, but accuracy did not move outside the confidence interval while calls per case rose about 50%. A harder benchmark with real expert disagreement, or a weaker base model, is still needed to show whether the debate helps.
- A weaker base model (qwen3.5-4b, MedQA-50, three arms) gave headroom but no benefit: single 68%, dynamic 60%, static 62% (paired differences not significant), and tau_u calibrated on gpt-6-luna sent 49 of 50 questions to adversarial. tau_u has to be calibrated per model (or replaced by a model-independent rule).
- H1/H2 selection needs paraphrase-aware matching (the D-dimer example split one diagnosis into two hypotheses).
- tau_semantic still needs validating on labelled agree/disagree diagnosis pairs embedded with the production embedder.
