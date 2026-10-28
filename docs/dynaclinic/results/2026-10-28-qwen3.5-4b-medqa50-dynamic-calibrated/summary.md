# DynaClinic evaluation: qwen-medqa50-calibrated

- Generated: 2026-10-28T11:35:21+00:00; mode: live, primary model qwen3.5-4b
- Dataset: medqa (50 cases, limit all, seed none); arms: dynamic; cache: off; concurrency: 3; context policy: shared_core
- Accuracy: errors count as wrong; 95% Wilson interval. Triage: Meta-Controller tier vs gold tier (dynamic only).
- Adv. switch: share of all cases where the divergence rule fired (static records what the rule would have done; it always runs the critic). Team margin loss: BCE + hinge on the specialists' mean distribution (calibration; lower is better).
- Safety viol.: final answer is one of the case's unsafe options, counted even when the gate blocked it.
- Cost: only from DYNACLINIC_PRICE_<MODEL>_IN/_OUT (USD per 1M tokens) for every model used, else n/a.

## Per arm

| arm | n | accuracy [95% CI] | triage acc. | routes | adv. switch | mean div. | team margin loss | safety viol. | blocked | errors | calls/case | tokens/case (prompt + completion) | latency mean / p50 (s) | models (fallback calls) | cost (USD) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| dynamic | 50 | 60.0% [46.2%, 72.4%] | n/a | adversarial 22, collaborative 21, hierarchical 7 | 34.0% | 0.186 | 0.914 | 0 (0.0%) | 0 (0.0%) | 0 | 7.44 | 5304 + 1930 | 73.1 / 73.2 | qwen3.5-4b x372 (0) | n/a |

## Meta-Controller

C: Complexity Score, max(LLM tier level, feature density), tau_c 0.5. U: Uncertainty Score, normalised entropy of the generalist differential; tau_u per input form and per model (the model's calibrated row, 75th percentile of U from dynaclinic.eval.calibrate; a model without one falls back to gpt-6-luna's 0.15 multiple choice, 0.59 open-ended; source in brackets; calibrated, not validated against outcomes). Mode rule: U > tau_u adversarial, else C <= tau_c hierarchical, else collaborative; modes are counted under routes. Adversarial entry: by uncertainty (U > tau_u) or by conflict (the Conflict Detector switched a collaborative team).

| arm | mean C | mean U | U not measured | tau_u used | adversarial by U / by conflict |
|---|---|---|---|---|---|
| dynamic | 0.764 | 0.608 | 0 | multiple choice 0.81 (calibrated for qwen3.5-4b) | 10 / 12 |

## Accuracy by gold tier

| tier | dynamic |
|---|---|
| none | 30/50 (60.0%) |

## Per case

Cell: final answer (`-` = none), then `ok` / `x`; `err` marks a run error.

| case | gold tier | gold | dynamic |
|---|---|---|---|
| medqa-test-0005 | none | D | B x |
| medqa-test-0023 | none | D | A x |
| medqa-test-0050 | none | D | D ok |
| medqa-test-0156 | none | B | B ok |
| medqa-test-0165 | none | B | A x |
| medqa-test-0183 | none | D | C x |
| medqa-test-0185 | none | D | A x |
| medqa-test-0200 | none | A | B x |
| medqa-test-0210 | none | C | C ok |
| medqa-test-0226 | none | C | C ok |
| medqa-test-0243 | none | A | A ok |
| medqa-test-0288 | none | B | C x |
| medqa-test-0430 | none | A | B x |
| medqa-test-0457 | none | B | B ok |
| medqa-test-0491 | none | A | A ok |
| medqa-test-0515 | none | D | B x |
| medqa-test-0588 | none | A | A ok |
| medqa-test-0589 | none | D | D ok |
| medqa-test-0598 | none | B | B ok |
| medqa-test-0632 | none | D | D ok |
| medqa-test-0643 | none | D | B x |
| medqa-test-0654 | none | A | D x |
| medqa-test-0697 | none | D | D ok |
| medqa-test-0712 | none | C | C ok |
| medqa-test-0730 | none | D | D ok |
| medqa-test-0744 | none | C | C ok |
| medqa-test-0755 | none | C | C ok |
| medqa-test-0770 | none | B | B ok |
| medqa-test-0813 | none | C | C ok |
| medqa-test-0861 | none | B | D x |
| medqa-test-0864 | none | D | B x |
| medqa-test-0903 | none | B | B ok |
| medqa-test-0920 | none | A | A ok |
| medqa-test-0936 | none | B | B ok |
| medqa-test-0944 | none | D | B x |
| medqa-test-1004 | none | C | C ok |
| medqa-test-1005 | none | D | D ok |
| medqa-test-1029 | none | A | A ok |
| medqa-test-1048 | none | B | - x |
| medqa-test-1051 | none | C | B x |
| medqa-test-1101 | none | A | A ok |
| medqa-test-1121 | none | A | A ok |
| medqa-test-1139 | none | A | D x |
| medqa-test-1141 | none | B | D x |
| medqa-test-1172 | none | D | B x |
| medqa-test-1182 | none | A | A ok |
| medqa-test-1201 | none | C | C ok |
| medqa-test-1230 | none | D | D ok |
| medqa-test-1257 | none | D | C x |
| medqa-test-1272 | none | C | C ok |
