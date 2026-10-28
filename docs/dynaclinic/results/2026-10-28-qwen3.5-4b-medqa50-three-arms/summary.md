# DynaClinic evaluation: qwen-medqa50

- Generated: 2026-10-28T09:55:57+00:00; mode: live, primary model qwen3.5-4b
- Dataset: medqa (50 cases, limit all, seed none); arms: single, dynamic, static; cache: off; concurrency: 3; context policy: shared_core
- Accuracy: errors count as wrong; 95% Wilson interval. Triage: Meta-Controller tier vs gold tier (dynamic only).
- Adv. switch: share of all cases where the divergence rule fired (static records what the rule would have done; it always runs the critic). Team margin loss: BCE + hinge on the specialists' mean distribution (calibration; lower is better).
- Safety viol.: final answer is one of the case's unsafe options, counted even when the gate blocked it.
- Cost: only from DYNACLINIC_PRICE_<MODEL>_IN/_OUT (USD per 1M tokens) for every model used, else n/a.

## Per arm

| arm | n | accuracy [95% CI] | triage acc. | routes | adv. switch | mean div. | team margin loss | safety viol. | blocked | errors | calls/case | tokens/case (prompt + completion) | latency mean / p50 (s) | models (fallback calls) | cost (USD) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| single | 50 | 68.0% [54.2%, 79.2%] | n/a | single 50 | n/a | n/a | n/a | 0 (0.0%) | 0 (0.0%) | 1 | 0.98 | 284 + 467 | 21.0 / 14.7 | qwen3.5-4b x49 (0) | n/a |
| dynamic | 50 | 60.0% [46.2%, 72.4%] | n/a | adversarial 49, hierarchical 1 | 34.0% | 0.183 | 0.869 | 0 (0.0%) | 0 (0.0%) | 0 | 8.32 | 6140 + 2136 | 76.5 / 72.9 | qwen3.5-4b x416 (0) | n/a |
| static | 50 | 62.0% [48.2%, 74.1%] | n/a | adversarial 50 | 30.0% | 0.163 | 0.852 | 0 (0.0%) | 1 (2.0%) | 1 | 6.00 | 3170 + 1187 | 48.0 / 37.8 | qwen3.5-4b x300 (0) | n/a |

## Meta-Controller

C: Complexity Score, max(LLM tier level, feature density), tau_c 0.5. U: Uncertainty Score, normalised entropy of the generalist differential; tau_u per input form (default 0.15 multiple choice, 0.59 open-ended: 75th percentile on held-out MedQA-50 + synthetic-24 and the same vignettes without options; calibrated, not validated against outcomes). Mode rule: U > tau_u adversarial, else C <= tau_c hierarchical, else collaborative; modes are counted under routes. Adversarial entry: by uncertainty (U > tau_u) or by conflict (the Conflict Detector switched a collaborative team).

| arm | mean C | mean U | U not measured | tau_u used | adversarial by U / by conflict |
|---|---|---|---|---|---|
| dynamic | 0.769 | 0.613 | 0 | multiple choice 0.15 | 49 / 0 |

## Accuracy by gold tier

| tier | single | dynamic | static |
|---|---|---|---|
| none | 34/50 (68.0%) | 30/50 (60.0%) | 31/50 (62.0%) |

## Per case

Cell: final answer (`-` = none), then `ok` / `x`; `err` marks a run error.

| case | gold tier | gold | single | dynamic | static |
|---|---|---|---|---|---|
| medqa-test-0005 | none | D | B x | B x | B x |
| medqa-test-0023 | none | D | A x | C x | A x |
| medqa-test-0050 | none | D | D ok | D ok | D ok |
| medqa-test-0156 | none | B | B ok | B ok | B ok |
| medqa-test-0165 | none | B | C x | A x | A x |
| medqa-test-0183 | none | D | D ok | D ok | C x |
| medqa-test-0185 | none | D | A x | A x | A x |
| medqa-test-0200 | none | A | A ok | B x | B x |
| medqa-test-0210 | none | C | C ok | C ok | C ok |
| medqa-test-0226 | none | C | C ok | C ok | C ok |
| medqa-test-0243 | none | A | A ok | A ok | A ok |
| medqa-test-0288 | none | B | B ok | B ok | C x |
| medqa-test-0430 | none | A | A ok | B x | A ok |
| medqa-test-0457 | none | B | B ok | B ok | B ok |
| medqa-test-0491 | none | A | A ok | A ok | A ok |
| medqa-test-0515 | none | D | B x | B x | A x |
| medqa-test-0588 | none | A | A ok | A ok | A ok |
| medqa-test-0589 | none | D | A x | D ok | A x |
| medqa-test-0598 | none | B | B ok | B ok | B ok |
| medqa-test-0632 | none | D | D ok | D ok | D ok |
| medqa-test-0643 | none | D | C x | C x | C x |
| medqa-test-0654 | none | A | D x | D x | A ok |
| medqa-test-0697 | none | D | D ok | D ok | D ok |
| medqa-test-0712 | none | C | C ok | C ok | C ok |
| medqa-test-0730 | none | D | - x err | D ok | - x err |
| medqa-test-0744 | none | C | C ok | C ok | C ok |
| medqa-test-0755 | none | C | C ok | C ok | C ok |
| medqa-test-0770 | none | B | B ok | D x | B ok |
| medqa-test-0813 | none | C | C ok | C ok | C ok |
| medqa-test-0861 | none | B | D x | D x | D x |
| medqa-test-0864 | none | D | D ok | B x | D ok |
| medqa-test-0903 | none | B | B ok | B ok | B ok |
| medqa-test-0920 | none | A | A ok | A ok | B x |
| medqa-test-0936 | none | B | B ok | B ok | B ok |
| medqa-test-0944 | none | D | B x | B x | B x |
| medqa-test-1004 | none | C | B x | B x | B x |
| medqa-test-1005 | none | D | D ok | A x | D ok |
| medqa-test-1029 | none | A | A ok | A ok | A ok |
| medqa-test-1048 | none | B | D x | D x | D x |
| medqa-test-1051 | none | C | A x | B x | B x |
| medqa-test-1101 | none | A | A ok | A ok | A ok |
| medqa-test-1121 | none | A | A ok | A ok | A ok |
| medqa-test-1139 | none | A | A ok | D x | D x |
| medqa-test-1141 | none | B | B ok | B ok | B ok |
| medqa-test-1172 | none | D | B x | B x | D ok |
| medqa-test-1182 | none | A | A ok | A ok | A ok |
| medqa-test-1201 | none | C | C ok | C ok | C ok |
| medqa-test-1230 | none | D | D ok | D ok | D ok |
| medqa-test-1257 | none | D | C x | C x | C x |
| medqa-test-1272 | none | C | C ok | C ok | C ok |
