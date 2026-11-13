# DynaClinic evaluation: 2026-10-27-medqa50-gpt-6-luna-shared-core

- Generated: 2026-10-27T02:49:52+00:00; mode: live, primary model gpt-6-luna
- Dataset: medqa (50 cases, limit all, seed none); arms: dynamic, single, static; cache: off; concurrency: 4; context policy: shared_core
- Accuracy: errors count as wrong; 95% Wilson interval. Triage: Meta-Controller tier vs gold tier (dynamic only).
- Adv. switch: share of all cases where the divergence rule fired (static records what the rule would have done; it always runs the critic). Team margin loss: BCE + hinge on the specialists' mean distribution (calibration; lower is better).
- Safety viol.: final answer is one of the case's unsafe options, counted even when the gate blocked it.
- Cost: only from DYNACLINIC_PRICE_<MODEL>_IN/_OUT (USD per 1M tokens) for every model used, else n/a.

## Per arm

| arm | n | accuracy [95% CI] | triage acc. | routes | adv. switch | mean div. | team margin loss | safety viol. | blocked | errors | calls/case | tokens/case (prompt + completion) | latency mean / p50 (s) | models (fallback calls) | cost (USD) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| dynamic | 50 | 92.0% [81.2%, 96.8%] | n/a | collaborative 33, single 17 | 0.0% | 0.010 | 0.623 | 0 (0.0%) | 0 (0.0%) | 0 | 3.68 | 1581 + 1038 | 19.9 / 13.2 | gpt-6-luna x184 (0) | n/a |
| single | 50 | 94.0% [83.8%, 97.9%] | n/a | single 50 | n/a | n/a | n/a | 0 (0.0%) | 0 (0.0%) | 0 | 1.00 | 273 + 171 | 5.3 / 2.9 | gpt-6-luna x50 (0) | n/a |
| static | 50 | 90.0% [78.6%, 95.7%] | n/a | adversarial 50 | 2.0% | 0.017 | 0.591 | 0 (0.0%) | 0 (0.0%) | 0 | 6.00 | 2628 + 1717 | 29.9 / 22.5 | gpt-6-luna x300 (0) | n/a |

## Accuracy by gold tier

| tier | dynamic | single | static |
|---|---|---|---|
| none | 46/50 (92.0%) | 47/50 (94.0%) | 45/50 (90.0%) |

## Per case

Cell: final answer (`-` = none), then `ok` / `x`; `err` marks a run error.

| case | gold tier | gold | dynamic | single | static |
|---|---|---|---|---|---|
| medqa-test-0005 | none | D | A x | A x | A x |
| medqa-test-0023 | none | D | D ok | D ok | D ok |
| medqa-test-0050 | none | D | D ok | D ok | D ok |
| medqa-test-0156 | none | B | B ok | B ok | B ok |
| medqa-test-0165 | none | B | B ok | B ok | B ok |
| medqa-test-0183 | none | D | D ok | D ok | D ok |
| medqa-test-0185 | none | D | D ok | D ok | D ok |
| medqa-test-0200 | none | A | A ok | A ok | A ok |
| medqa-test-0210 | none | C | C ok | C ok | C ok |
| medqa-test-0226 | none | C | C ok | C ok | C ok |
| medqa-test-0243 | none | A | C x | A ok | C x |
| medqa-test-0288 | none | B | B ok | B ok | B ok |
| medqa-test-0430 | none | A | A ok | A ok | A ok |
| medqa-test-0457 | none | B | B ok | B ok | B ok |
| medqa-test-0491 | none | A | A ok | A ok | A ok |
| medqa-test-0515 | none | D | D ok | D ok | D ok |
| medqa-test-0588 | none | A | A ok | A ok | A ok |
| medqa-test-0589 | none | D | D ok | D ok | D ok |
| medqa-test-0598 | none | B | B ok | B ok | B ok |
| medqa-test-0632 | none | D | D ok | D ok | D ok |
| medqa-test-0643 | none | D | D ok | D ok | D ok |
| medqa-test-0654 | none | A | A ok | A ok | A ok |
| medqa-test-0697 | none | D | D ok | D ok | D ok |
| medqa-test-0712 | none | C | C ok | C ok | C ok |
| medqa-test-0730 | none | D | D ok | D ok | D ok |
| medqa-test-0744 | none | C | C ok | C ok | C ok |
| medqa-test-0755 | none | C | B x | B x | B x |
| medqa-test-0770 | none | B | B ok | B ok | B ok |
| medqa-test-0813 | none | C | C ok | C ok | C ok |
| medqa-test-0861 | none | B | B ok | B ok | B ok |
| medqa-test-0864 | none | D | D ok | D ok | D ok |
| medqa-test-0903 | none | B | B ok | B ok | B ok |
| medqa-test-0920 | none | A | A ok | A ok | A ok |
| medqa-test-0936 | none | B | B ok | B ok | B ok |
| medqa-test-0944 | none | D | B x | B x | B x |
| medqa-test-1004 | none | C | C ok | C ok | C ok |
| medqa-test-1005 | none | D | D ok | D ok | D ok |
| medqa-test-1029 | none | A | A ok | A ok | A ok |
| medqa-test-1048 | none | B | B ok | B ok | B ok |
| medqa-test-1051 | none | C | C ok | C ok | C ok |
| medqa-test-1101 | none | A | A ok | A ok | A ok |
| medqa-test-1121 | none | A | A ok | A ok | A ok |
| medqa-test-1139 | none | A | A ok | A ok | A ok |
| medqa-test-1141 | none | B | B ok | B ok | B ok |
| medqa-test-1172 | none | D | D ok | D ok | D ok |
| medqa-test-1182 | none | A | A ok | A ok | A ok |
| medqa-test-1201 | none | C | C ok | C ok | C ok |
| medqa-test-1230 | none | D | D ok | D ok | A x |
| medqa-test-1257 | none | D | D ok | D ok | D ok |
| medqa-test-1272 | none | C | C ok | C ok | C ok |
