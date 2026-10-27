# DynaClinic live walkthrough (DevAll UI)

Captured 2026-10-27 against local servers: backend `server_main.py --port 6400`, frontend Vite on `http://localhost:5173`, model gpt-6-luna, workflow `yaml_instance/dynaclinic_mvp.yaml`, case `syn-high-03` (Case JSON pasted as the task prompt).

Case: 48-year-old on phenelzine (MAOI) with renal colic; question asks for the analgesic. Gold D (IV ketorolac). Traps: B meperidine and C tramadol, both of which interact dangerously with an MAOI.

## 1. Workflow graph (Workflows page)

![workflow graph](01-workflow-graph.png)

CaseInput -> Triage -> [dc_route_low] PrimaryCare | [dc_route_team] CareTeam -> DivergenceGate -> [dc_mode_collaborative] Synthesizer | [dc_mode_adversarial] Critic -> Synthesizer -> SafetyGate -> Report. The auto-layout draws CareTeam slightly over PrimaryCare. The edges are correct; you can check them in the accessibility tree.

## 2. Launch page with the case loaded

![launch](02-launch-case-loaded.png)

## 3. Running

![running](03-running.png)

## 4. Trace: triage, care team Blackboard, divergence switch

![trace](05-trace-triage-team-divergence.png)

- Triage: `ROUTE: HIGH`. The LLM tier was HIGH and the deterministic tier MODERATE (feature score 7).
- CareTeam Blackboard entries:
  - Imaging: uniform distribution (0.20 each). The CT doesn't decide which analgesic to give.
  - Pathology: D = 0.96.
  - Pharmacology: D = 0.98. Its claim: "Phenelzine is a monoamine oxidase inhibitor, making meperidine and tramadol inappropriate choices".
- DivergenceGate: `MODE: ADVERSARIAL`. Divergence was 0.50, against tau 0.25. Top-1 answers: imaging A, pathology D, pharmacology D. Conflict set: D.

## 5. Critic -> Synthesizer -> SafetyGate -> Report

![critic and gate](06-critic-synthesizer-gate.png)

The final answer is `FINAL ANSWER: D` (IV ketorolac), and the SafetyGate passed: A_SAD pass, T_SAD pass, S_NAP stub.

![completed](04-completed-graph.png)

## Findings from this capture (all fixed; see "After the fixes" below)

1. **The switch to adversarial mode was spurious.** Imaging abstained with a uniform distribution, but its tie-broken top-1 counted as "A". That created a top-1 disagreement and raised the divergence to 0.50, although the two informative specialists agreed on D. Uniform or near-uniform distributions should count as abstentions in `divergence.assess` (excluded from the top-1 vote and from the pairwise JS mean).
2. **The Critic flags true pharmacology as unsupported.** For example, "Phenelzine is a monoamine oxidase inhibitor" was labelled `[fabrication]` in one run, and "Meperidine is inappropriate with phenelzine" `[unsupported]`. The judge only checks claims against the case text, and the rule score doesn't credit claims that the KB confirms (here, the meperidine/tramadol-MAOI interaction is in kb.py). KB-confirmed warnings should raise the rule score.
3. **One Launch click ran the workflow twice.** The backend log shows two `POST /api/workflow/execute` requests 12 ms apart for session d36c5201, so every node and every LLM call ran twice. `LaunchView.vue` `launchWorkflow()` has no in-flight guard. This is a pre-existing DevAll frontend issue, not specific to DynaClinic, and it doubles cost.
4. The final answer stayed correct and safe despite 1 and 2. They inflate cost (an unneeded critic round) and add noise to the trace.

## Three.js view (the-delegation)

Captured on 2026-10-27 at `http://localhost:3100/the-delegation/` (`npx vite --port=3100`, because :3000 is taken by another project). The browser was a sandbox headless Chrome driven over raw CDP; the agent's default Camofox browser renders the WebGL canvas blank. Case: `syn-high-06`, submitted through the Lead Agent chat.

![3D office, default team](3d-01-office-default-team.png)
![dynaclinic imported](3d-02-dynaclinic-imported.png)
![design view](3d-03-design-view-placeholder.png)
![lead agent chat](3d-04-lead-agent-chat.png)
![run: kanban shows DynaClinic stages](3d-05-run-kanban-stages.png)
![final output modal](3d-06-final-output-modal.png)

What works:
- Browse Workflows -> `dynaclinic_mvp.yaml` imports. Lead Agent -> "Chat about the brief" -> pasting the Case JSON starts a real backend run of the original YAML. There was exactly one `POST /api/workflow/execute`, so the double-launch bug from the Vue UI does not occur here.
- The kanban board tracks the DynaClinic stages live. They move to In Progress and then Done: CaseInput, Triage, CareTeam, DivergenceGate, Critic, Synthesizer, SafetyGate, Report (8 done). The backend log shows the HIGH -> care team -> adversarial critic path, final answer B (correct, gold B).

What did not work at capture time (findings, both fixed below):
5. **There are no 3D characters for the DynaClinic agents.** `server/services/workflow_graph_serializer.py` sets `is_agent = node.type == "agent"`, and every DynaClinic node is a custom `dc_*` type, so the importer maps nothing to a character. The office shows one placeholder "Workflow" lead agent, and the design view shows `User -> Workflow` instead of the Triage / CareTeam / Critic graph. Fix: mark LLM-backed `dc_*` node types as agent-like (e.g. a registry capability flag the serializer reads), and map the three ICT specialists to three separate characters.
6. **The final output modal shows the graph summary instead of the report.** "FINAL TEXT DELIVERABLE" reads "Workflow finished with 9 node outputs (1 terminal nodes)." rather than the Report node's text (`DynaClinic report (GATE: PASS) ... FINAL ANSWER: B`). The delegation client shows the run-summary message; it should show the terminal node's output.

## After the fixes

Recaptured 2026-10-27 at 9ef6d86 with the same servers and model (gpt-6-luna).

| Finding | Fix (commit) | Live check |
|---|---|---|
| 1. Spurious adversarial switch | Near-uniform specialist distributions (normalized entropy >= `divergence.ABSTAIN_ENTROPY` = 0.95) count as abstentions: their top-1 is shown with "(abstains)" but they do not vote and are left out of the divergence and the Conflict Set (b742fab) | syn-high-03 in the Vue UI: `MODE: COLLABORATIVE Divergence 0.00 (tau 0.25); top-1: pathology A (abstains), pharmacology D`. No critic round; final answer D (gold D), gate PASS. |
| 2. Critic penalises KB-confirmed pharmacology | `critic.rule_score` raises a claim to `KB_CONFIRMED_SCORE` = 0.95 when it warns against a drug the KB marks contraindicated for this patient (87293b5) | Covered by unit tests; this live run skipped the critic (no switch). |
| 3. One Launch click ran the workflow twice | `useSingleFlight` in-flight guard around `launchWorkflow`, Launch disabled while pending (9ef6d86) | Two programmatic clicks on Launch -> exactly one `POST /api/workflow/execute` in the backend log. |
| 5. No 3D characters | `NodeCapabilities.agent_like` + `sub_agents`; Triage, PrimaryCare, CareTeam, Critic, Synthesizer are agent-like; CareTeam yields three characters (a1b536d) | Badge shows 5 agents; hierarchy shows Triage (lead) over PrimaryCare, Diagnostic Imaging, Pathology/Lab, Pharmacology. |
| 6. Final output modal showed the run summary | `workflow_completed` carries `final_text` (end-node output); the-delegation shows it, falling back to `summary` (e62910c) | Modal reads "DynaClinic report (GATE: PASS) ... FINAL ANSWER: B" (gold B). |

![divergence with abstention](07-divergence-abstention-after-fix.png)
![team hierarchy](3d-07-team-hierarchy-after-fix.png)
![characters](3d-08-characters-after-fix.png)
![final output](3d-09-final-output-after-fix.png)

Remaining limitations seen in this capture:
- Only 5 character slots (`MAX_AGENT_SLOTS`), and DynaClinic has 7 agent-like characters. Critic and Synthesizer land under "Unmapped Agents" and get no 3D body.
- After re-importing a workflow, the 3D scene keeps the old characters until the page is reloaded.
- PrimaryCare is labelled "Primarycare" (the existing `titleize` helper).
- Not captured: characters in the "working" state mid-run. The headless run finished before a screenshot was taken. The animation path is covered by f2's smoke check (all three specialists go to working on the CareTeam `node_started` event).
