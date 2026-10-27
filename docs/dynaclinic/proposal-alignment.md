# DynaClinic vs the reviewed proposal (DynamiClinic)

The implementation was built from an extended draft of the proposal (5 layers: FHIR/Neo4j ingestion, MCTS control plane, Blackboard, A_SAD/S_NAP/T_SAD safety gates, BioBERT/Qdrant memory). This page checks it against the **reviewed** proposal, *"DynamiClinic: A Dynamic Architecture Switching Multi-Agent Framework in Healthcare Settings"* (Do Le Long An; reviewed by A/Prof. Arthur Tang and Dr. Linh Tran), which is shorter and defines the system differently: layers L0 to L4, three communication modes, a complexity score and an uncertainty score, and a Conflict Detector between two hypotheses.

Checked on 2026-10-27 against the code at commit 7c83807 and with real runs on OpenAI gpt-6-luna. The repo keeps the name DynaClinic; the reviewed proposal spells it DynamiClinic.

Status key: **matches**: the code does what the proposal says. **partial**: the idea is there but the mechanism differs. **differs**: the code does something else. **missing**: not in the code. **extra**: in the code, not in the reviewed proposal.

## Architecture layers (proposal Table 1)

| Layer (proposal) | Proposal components | In the code | Status |
|---|---|---|---|
| L0 Clinical Input Gateway | Query intake, Context Vector Builder | `CaseInput` passthrough, `case_from_text` (JSON, plain text, free text), `FHIRLiteIngestor` stub that turns structured fields into text sections | partial: intake yes, no context vector |
| L1 Meta-Controller Orchestration | Meta-Controller, Complexity Score, Uncertainty Score, Triage | `dynaclinic/triage.py`: LLM tier plus a deterministic feature score (comorbidities, medications, abnormal labs, red flags), escalate-only | partial: complexity yes, uncertainty no (below) |
| L2 Dynamic Communication Topology | Hierarchical (hub-spoke), Collaborative (mesh), Adversarial (proponent/opponent/mediator) | Routes `single`, `collaborative`, `adversarial` | partial (below) |
| L3 Agent Execution and Processing | Primary Care Agent; ICT (Imaging, Pathology, Pharmacology); Conflict Detector; Consensus Builder; Clinical Critic; Conflict Resolver | `dc_primary_care`; `dc_care_team` (3 specialists); `dc_divergence_gate`; `dc_synthesizer`; `dc_critic`; the synthesizer again after the critic | matches, with one node playing both Consensus Builder and Conflict Resolver |
| L4 Data and Infrastructure | Medical process models, institutional protocols, persistent state, trace store | `kb.py` (small illustrative drug/precedence KB), per-run state (`global_state["dynaclinic"]`, Blackboard), trace store = DevAll run folder (`node_outputs.yaml`, `execution_logs.json`) | partial: no process models or institutional protocols |
| DevAll runtime (Figure 1) | WebSocket server, Runtime SDK, GraphExecutor, CycleManager, TopologyBuilder | Runs as `yaml_instance/dynaclinic_mvp.yaml` on DevAll; 3D office view in `the-delegation/` | matches |

## Mechanisms

| Proposal (section) | What it says | What the code does | Status |
|---|---|---|---|
| Triage classes (3) | Two classes: LOW, HIGH | Three: LOW, MODERATE (2 specialists), HIGH (3) | differs (extension) |
| LOW path (3) | Single Primary Care Agent, bypasses MAS collaboration | Same | matches |
| HIGH path (3) | ICT in parallel, synthesized by a Consensus Builder | Same; specialists run concurrently and post to a Blackboard, synthesizer answers | matches |
| Complexity score C (2) | Density of clinical context: comorbidities, conflicting labs, multimodal inputs | Feature score from structured fields and LLM-extracted counts | matches in spirit; cut-offs not validated |
| Uncertainty score U (2) | Normalized entropy of the initial distribution over top-k differentials from a baseline generalist sweep | Not computed at triage. Normalized entropy is used only later, to mark a specialist as abstaining (>= 0.95) | missing |
| Piecewise mode selection from C and U (2) | One rule over both scores chooses Hierarchical / Collaborative / Adversarial | Two separate steps: triage on C chooses single vs team; after the team answers, divergence chooses collaborative vs adversarial | differs |
| Hierarchical mode (1) | Meta-Controller as hub querying subordinate specialists, no inter-agent talk | The care team works this way: specialists answer independently and never see each other's Blackboard entries; the synthesizer is the hub | present, but labelled "collaborative" |
| Collaborative mode (1) | Fully connected mesh; agents share intermediate reasoning | Not implemented: no agent reads another's reasoning before answering | missing |
| Conflict Detector (4) | Normalized semantic distance between the primary diagnostic assertions of two hypotheses, threshold tau | Mean pairwise Jensen-Shannon distance over the specialists' multiple-choice answer distributions, tau 0.25, plus top-1 disagreement. Free-text cases (no options) cannot be measured and always go adversarial | partial; free-text gap being fixed (f11) |
| Adversarial mode (1, 4) | Proponent team vs Opponent team, Mediator adjudicates; Clinical Critic does destructive, evidence-grounded testing of both hypotheses, Conflict Resolver synthesizes | Clinical Critic splits the Blackboard into atomic claims and scores each with a rule/KB check plus an LLM judge; flagged claims go to the synthesizer, which resolves. No separate proponent/opponent teams, one round | partial |
| Counterfactual grounding loss (2) | Opponent maximizes the distance between the proposed diagnostic embedding and verified medical constraints | Closest analogue: KB veto and grounding score inside the critic. No embedding-space objective | missing |
| Safety gates A_SAD / S_NAP / T_SAD | Not in the reviewed proposal | Implemented (A_SAD, T_SAD) and stubbed (S_NAP) from the extended draft | extra |
| MCTS control plane, FHIR/Neo4j, BioBERT/Qdrant memory, semantic cache | Not in the reviewed proposal | Stubs from the extended draft | extra (stubs) |

## The proposal's own examples, run for real

The reviewed proposal gives four example queries (Figures 2 and 3). Each was run twice through `dynaclinic_mvp.yaml` (gpt-6-luna, commit 7c83807; run folders `WareHouse/pdf-before_*`).

| Example | Proposal expects | Route (2 runs) | Conflict routing (2 runs) |
|---|---|---|---|
| "Patient presents with sore throat and mild fever for 2 days." | LOW | LOW, LOW | not reached |
| "68-year-old diabetic patient with chest pain, renal insufficiency, and concurrent warfarin therapy." | HIGH | HIGH, HIGH (LLM tier HIGH; the rule score alone said LOW, 4) | ADVERSARIAL, by the "not measurable without options" fallback |
| "Young adult with fever, sore throat, and cervical lymphadenopathy." | likely CONSENSUS | LOW, LOW | not reached: triage keeps it with Primary Care |
| "55-year-old with acute chest pain, normal ECG, elevated D-dimer, and recent long flight." | likely CONFLICT | HIGH, HIGH | ADVERSARIAL, by the same fallback, not by a measured distance |

Triage matched the proposal on all four. Conflict-aware routing never measured anything on these queries, because they have no answer options, and free-text reports ended with meaningless letter answers. Dispatch f11 adds the proposal's semantic distance for free-text cases; the results after the fix are added below when it lands.

## Citations checked (web, 2026-10-27)

- MDAgents [3]: NeurIPS 2024; best on 7 of 10 benchmarks, up to +4.2% over prior best (arXiv 2404.15155). Matches the proposal's description.
- DynamiCare [5]: arXiv 2507.02616, multi-round interactive specialist team on MIMIC-Patient. Matches.
- Dialectic-Med [11]: published in **Findings of ACL 2026** (pages 36877-36894, DOI 10.18653/v1/2026.findings-acl.1837), not the main ACL 2026 conference as the reference list says, and it is evaluated on medical visual question answering (MIMIC-CXR-VQA, VQA-RAD, PathVQA). The proposal's "proves that adversarial communication is strictly necessary ... guarantee patient safety" is stronger than the paper's claim.

## What follows for the research

- The two gaps that matter most for the proposal's thesis are the **uncertainty score** at triage and a **real mesh collaborative mode**: today the system switches between one agent and a parallel team, and between a consensus and a critic round, but not between three topologies chosen by one rule over C and U.
- The MedQA and synthetic benchmarks do not exercise conflict routing (adversarial switch 0% on MedQA): a benchmark with real expert disagreement is needed before claiming the adversarial mode helps.
