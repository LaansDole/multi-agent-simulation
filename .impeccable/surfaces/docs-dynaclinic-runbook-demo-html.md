---
version: 1
slug: "docs-dynaclinic-runbook-demo-html"
primary_target: "docs/dynaclinic/runbook/demo.html"
related_targets: ["docs/dynaclinic/runbook/results.html","docs/dynaclinic/runbook/alignment.html","docs/dynaclinic/runbook/demo-hospital.html"]
---

## Scope

GitHub Pages site for DynamiClinic: index/demo (runbook recording), results, alignment (fact check), demo-hospital. Slides keep their own deck style. Visitor mode: Read.

## Audience and job

Thesis supervisor and examiners judging whether the prototype does what the reviewed proposal claims, and whether the evidence holds.

## Direction contract

THESIS: The site is the evidence section of a thesis review: every claim sits beside its interval, its recorded run, or its status mark. It refuses the incumbent dark dashboard of rounded panels with a blue accent, and the centred project-page hero.

OWN-WORLD: White paper ground, near-black ink, one plum (#6b1f4f) for the masthead rule, links, point estimates and status marks; warm grey hairlines. Source Serif 4 for the reading column, Source Sans 3 for the apparatus (nav, tables, captions, labels), Source Code Pro for code and ids. Components: forest-plot rows (diamond estimate, interval bar, gridded axis), four-dot status marks, booktabs tables (rules, no zebra, no cards), numbered figures and one numbered equation.

STORY: The reviewer learns the claim (C and U pick the mode), watches it happen in the recording, sees results with intervals that do not yet favour the team, and sees where the code departs from the proposal. They trust it because the bad news is set as plainly as the good.

FIRST VIEWPORT: Masthead: DynamiClinic wordmark and a research-prototype line left, five-page nav right with the current page underlined in plum, a 3px plum rule beneath. Title and an abstract-style lead with a Bottom line run-in. Then the mode rule as Equation 1, and Figure 1 (the recording) with the step table beside it at desktop width, stacked below on narrow screens.

FORM: Evidence apparatus (systematic-review summary-of-findings tables and forest plots), position 1 on the ordered list, chosen as the pick card. seed:025a6bf06f444e16

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Constraints

- Static HTML, one shared stylesheet, no build step; `.github/workflows/pages.yml` greps each page's title and copies files explicitly.
- Every page states: research prototype, not for clinical use.
- No hue-only meaning: status and right/wrong carry a mark or weight as well as colour.
