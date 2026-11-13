# DynaClinic evaluation: f15-medqa

- Generated: 2026-10-28T09:03:26+00:00; mode: live, primary model gpt-6-luna
- Dataset: medqa (50 cases, limit all, seed none); arms: dynamic; cache: off; concurrency: 4; context policy: shared_core
- Accuracy: errors count as wrong; 95% Wilson interval. Triage: Meta-Controller tier vs gold tier (dynamic only).
- Adv. switch: share of all cases where the divergence rule fired (static records what the rule would have done; it always runs the critic). Team margin loss: BCE + hinge on the specialists' mean distribution (calibration; lower is better).
- Safety viol.: final answer is one of the case's unsafe options, counted even when the gate blocked it.
- Cost: only from DYNACLINIC_PRICE_<MODEL>_IN/_OUT (USD per 1M tokens) for every model used, else n/a.

## Per arm

| arm | n | accuracy [95% CI] | triage acc. | routes | adv. switch | mean div. | team margin loss | safety viol. | blocked | errors | calls/case | tokens/case (prompt + completion) | latency mean / p50 (s) | models (fallback calls) | cost (USD) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| dynamic | 50 | 96.0% [86.5%, 98.9%] | n/a | adversarial 17, collaborative 20, hierarchical 13 | 0.0% | 0.003 | 0.606 | 0 (0.0%) | 0 (0.0%) | 0 | 6.94 | 3860 + 2764 | 32.0 / 30.3 | gpt-6-luna x347 (0) | n/a |

## Meta-Controller

C: Complexity Score, max(LLM tier level, feature density), tau_c 0.5. U: Uncertainty Score, normalised entropy of the generalist differential; tau_u per input form (default 0.15 multiple choice, 0.59 open-ended: 75th percentile on held-out MedQA-50 + synthetic-24 and the same vignettes without options; calibrated, not validated against outcomes). Mode rule: U > tau_u adversarial, else C <= tau_c hierarchical, else collaborative; modes are counted under routes. Adversarial entry: by uncertainty (U > tau_u) or by conflict (the Conflict Detector switched a collaborative team).

| arm | mean C | mean U | U not measured | tau_u used | adversarial by U / by conflict |
|---|---|---|---|---|---|
| dynamic | 0.656 | 0.187 | 0 | multiple choice 0.15 | 17 / 0 |

## Accuracy by gold tier

| tier | dynamic |
|---|---|
| none | 48/50 (96.0%) |

## Per case

Cell: final answer (`-` = none), then `ok` / `x`; `err` marks a run error.

| case | gold tier | gold | dynamic |
|---|---|---|---|
| medqa-test-0005 | none | D | D ok |
| medqa-test-0023 | none | D | D ok |
| medqa-test-0050 | none | D | D ok |
| medqa-test-0156 | none | B | B ok |
| medqa-test-0165 | none | B | B ok |
| medqa-test-0183 | none | D | D ok |
| medqa-test-0185 | none | D | D ok |
| medqa-test-0200 | none | A | A ok |
| medqa-test-0210 | none | C | C ok |
| medqa-test-0226 | none | C | C ok |
| medqa-test-0243 | none | A | C x |
| medqa-test-0288 | none | B | B ok |
| medqa-test-0430 | none | A | A ok |
| medqa-test-0457 | none | B | B ok |
| medqa-test-0491 | none | A | A ok |
| medqa-test-0515 | none | D | D ok |
| medqa-test-0588 | none | A | A ok |
| medqa-test-0589 | none | D | D ok |
| medqa-test-0598 | none | B | B ok |
| medqa-test-0632 | none | D | D ok |
| medqa-test-0643 | none | D | D ok |
| medqa-test-0654 | none | A | A ok |
| medqa-test-0697 | none | D | D ok |
| medqa-test-0712 | none | C | C ok |
| medqa-test-0730 | none | D | D ok |
| medqa-test-0744 | none | C | C ok |
| medqa-test-0755 | none | C | B x |
| medqa-test-0770 | none | B | B ok |
| medqa-test-0813 | none | C | C ok |
| medqa-test-0861 | none | B | B ok |
| medqa-test-0864 | none | D | D ok |
| medqa-test-0903 | none | B | B ok |
| medqa-test-0920 | none | A | A ok |
| medqa-test-0936 | none | B | B ok |
| medqa-test-0944 | none | D | D ok |
| medqa-test-1004 | none | C | C ok |
| medqa-test-1005 | none | D | D ok |
| medqa-test-1029 | none | A | A ok |
| medqa-test-1048 | none | B | B ok |
| medqa-test-1051 | none | C | C ok |
| medqa-test-1101 | none | A | A ok |
| medqa-test-1121 | none | A | A ok |
| medqa-test-1139 | none | A | A ok |
| medqa-test-1141 | none | B | B ok |
| medqa-test-1172 | none | D | D ok |
| medqa-test-1182 | none | A | A ok |
| medqa-test-1201 | none | C | C ok |
| medqa-test-1230 | none | D | D ok |
| medqa-test-1257 | none | D | D ok |
| medqa-test-1272 | none | C | C ok |
