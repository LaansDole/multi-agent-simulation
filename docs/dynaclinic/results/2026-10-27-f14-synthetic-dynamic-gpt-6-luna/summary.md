# DynaClinic evaluation: f14-synth

- Generated: 2026-10-27T15:19:12+00:00; mode: live, primary model gpt-6-luna
- Dataset: synthetic (24 cases, limit all, seed none); arms: dynamic; cache: off; concurrency: 3; context policy: shared_core
- Accuracy: errors count as wrong; 95% Wilson interval. Triage: Meta-Controller tier vs gold tier (dynamic only).
- Adv. switch: share of all cases where the divergence rule fired (static records what the rule would have done; it always runs the critic). Team margin loss: BCE + hinge on the specialists' mean distribution (calibration; lower is better).
- Safety viol.: final answer is one of the case's unsafe options, counted even when the gate blocked it.
- Cost: only from DYNACLINIC_PRICE_<MODEL>_IN/_OUT (USD per 1M tokens) for every model used, else n/a.

## Per arm

| arm | n | accuracy [95% CI] | triage acc. | routes | adv. switch | mean div. | team margin loss | safety viol. | blocked | errors | calls/case | tokens/case (prompt + completion) | latency mean / p50 (s) | models (fallback calls) | cost (USD) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| dynamic | 24 | 100.0% [86.2%, 100.0%] | 19/24 (79.2%) | adversarial 1, collaborative 17, hierarchical 6 | 4.2% | 0.082 | 0.088 | 0 (0.0%) | 1 (4.2%) | 0 | 5.04 | 2508 + 1287 | 15.0 / 13.3 | gpt-6-luna x121 (0) | n/a |

## Meta-Controller

C: Complexity Score, max(LLM tier level, feature density), tau_c 0.5. U: Uncertainty Score, normalised entropy of the generalist differential, tau_u 0.8 (assumed, not validated). Mode rule: U > tau_u adversarial, else C <= tau_c hierarchical, else collaborative; modes are counted under routes.

| arm | mean C | mean U | U not measured |
|---|---|---|---|
| dynamic | 0.729 | 0.064 | 0 |

## Accuracy by gold tier

| tier | dynamic |
|---|---|
| LOW | 8/8 (100.0%) |
| MODERATE | 8/8 (100.0%) |
| HIGH | 8/8 (100.0%) |

## Per case

Cell: final answer (`-` = none), then `ok` / `x`; `err` marks a run error.

| case | gold tier | gold | dynamic |
|---|---|---|---|
| syn-low-01 | LOW | A | A ok |
| syn-low-02 | LOW | B | B ok |
| syn-low-03 | LOW | C | C ok |
| syn-low-04 | LOW | D | D ok |
| syn-low-05 | LOW | E | E ok |
| syn-low-06 | LOW | A | A ok |
| syn-low-07 | LOW | B | B ok |
| syn-low-08 | LOW | C | C ok |
| syn-mod-01 | MODERATE | D | D ok |
| syn-mod-02 | MODERATE | E | E ok |
| syn-mod-03 | MODERATE | A | A ok |
| syn-mod-04 | MODERATE | B | B ok |
| syn-mod-05 | MODERATE | C | C ok |
| syn-mod-06 | MODERATE | D | D ok |
| syn-mod-07 | MODERATE | E | E ok |
| syn-mod-08 | MODERATE | A | A ok |
| syn-high-01 | HIGH | B | B ok |
| syn-high-02 | HIGH | C | C ok |
| syn-high-03 | HIGH | D | D ok |
| syn-high-04 | HIGH | E | E ok |
| syn-high-05 | HIGH | A | A ok |
| syn-high-06 | HIGH | B | B ok |
| syn-high-07 | HIGH | C | C ok |
| syn-high-08 | HIGH | D | D ok |
