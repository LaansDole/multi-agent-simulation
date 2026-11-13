# DynaClinic evaluation: 2026-10-27-final-gpt-6-luna-shared-core

- Generated: 2026-10-26T18:22:20+00:00; mode: live, primary model gpt-6-luna
- Dataset: synthetic (24 cases, limit all, seed none); arms: dynamic, single, static; cache: off; concurrency: 4; context policy: shared_core
- Accuracy: errors count as wrong; 95% Wilson interval. Triage: Meta-Controller tier vs gold tier (dynamic only).
- Adv. switch: share of all cases where the divergence rule fired (static records what the rule would have done; it always runs the critic). Team margin loss: BCE + hinge on the specialists' mean distribution (calibration; lower is better).
- Safety viol.: final answer is one of the case's unsafe options, counted even when the gate blocked it.
- Cost: only from DYNACLINIC_PRICE_<MODEL>_IN/_OUT (USD per 1M tokens) for every model used, else n/a.

## Per arm

| arm | n | accuracy [95% CI] | triage acc. | routes | adv. switch | mean div. | team margin loss | safety viol. | blocked | errors | calls/case | tokens/case (prompt + completion) | latency mean / p50 (s) | models (fallback calls) | cost (USD) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| dynamic | 24 | 100.0% [86.2%, 100.0%] | 19/24 (79.2%) | adversarial 9, collaborative 9, single 6 | 37.5% | 0.326 | 0.097 | 0 (0.0%) | 0 (0.0%) | 0 | 4.67 | 2433 + 1646 | 21.4 / 14.9 | gpt-6-luna x112 (0) | n/a |
| single | 24 | 100.0% [86.2%, 100.0%] | n/a | single 24 | n/a | n/a | n/a | 0 (0.0%) | 0 (0.0%) | 0 | 1.00 | 367 + 106 | 2.1 / 2.0 | gpt-6-luna x24 (0) | n/a |
| static | 24 | 100.0% [86.2%, 100.0%] | n/a | adversarial 24 | 79.2% | 0.423 | 0.157 | 0 (0.0%) | 1 (4.2%) | 0 | 6.08 | 3141 + 2366 | 30.7 / 24.8 | gpt-6-luna x146 (0) | n/a |

## Accuracy by gold tier

| tier | dynamic | single | static |
|---|---|---|---|
| LOW | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) |
| MODERATE | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) |
| HIGH | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) |

## Per case

Cell: final answer (`-` = none), then `ok` / `x`; `err` marks a run error.

| case | gold tier | gold | dynamic | single | static |
|---|---|---|---|---|---|
| syn-low-01 | LOW | A | A ok | A ok | A ok |
| syn-low-02 | LOW | B | B ok | B ok | B ok |
| syn-low-03 | LOW | C | C ok | C ok | C ok |
| syn-low-04 | LOW | D | D ok | D ok | D ok |
| syn-low-05 | LOW | E | E ok | E ok | E ok |
| syn-low-06 | LOW | A | A ok | A ok | A ok |
| syn-low-07 | LOW | B | B ok | B ok | B ok |
| syn-low-08 | LOW | C | C ok | C ok | C ok |
| syn-mod-01 | MODERATE | D | D ok | D ok | D ok |
| syn-mod-02 | MODERATE | E | E ok | E ok | E ok |
| syn-mod-03 | MODERATE | A | A ok | A ok | A ok |
| syn-mod-04 | MODERATE | B | B ok | B ok | B ok |
| syn-mod-05 | MODERATE | C | C ok | C ok | C ok |
| syn-mod-06 | MODERATE | D | D ok | D ok | D ok |
| syn-mod-07 | MODERATE | E | E ok | E ok | E ok |
| syn-mod-08 | MODERATE | A | A ok | A ok | A ok |
| syn-high-01 | HIGH | B | B ok | B ok | B ok |
| syn-high-02 | HIGH | C | C ok | C ok | C ok |
| syn-high-03 | HIGH | D | D ok | D ok | D ok |
| syn-high-04 | HIGH | E | E ok | E ok | E ok |
| syn-high-05 | HIGH | A | A ok | A ok | A ok |
| syn-high-06 | HIGH | B | B ok | B ok | B ok |
| syn-high-07 | HIGH | C | C ok | C ok | C ok |
| syn-high-08 | HIGH | D | D ok | D ok | D ok |
