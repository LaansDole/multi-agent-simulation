# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Thesis and research reviewers of the DynamiClinic project: the supervisor and examiners (the reviewed proposal is by Do Le Long An, reviewed by A/Prof. Arthur Tang and Dr. Linh Tran). They open the GitHub Pages site (https://laansdole.github.io/multi-agent-simulation/) to judge whether the prototype does what the proposal claims and whether the evidence holds up.

## Product Purpose

The site is the evidence package for a research prototype. A reviewer should come away having seen DynamiClinic switch between its three communication modes (hierarchical, collaborative, adversarial) on the Meta-Controller's Complexity Score C and Uncertainty Score U, backed by real recorded runs and the MedQA-50 and synthetic benchmark results, and knowing exactly where the code matches, partially matches, or departs from the reviewed proposal.

## Positioning

DynamiClinic picks the multi-agent architecture per case instead of fixing one: a Meta-Controller scores C and U and routes to a single Primary Care hub, a collaborative care team with a mesh exchange, or an adversarial Proponent / Opponent / Mediator debate. It runs on DevAll (a fork of OpenBMB ChatDev 2.0) and can be watched live as characters in a three.js 3D office.

## Operating Context

- Pages: the 3D runbook demo video with a clickable step list (index/demo), benchmark results, the fact check against the reviewed proposal (alignment), the demo_hospital 3D run, and a presentation deck (slides, plus its PDF).
- Deployed by `.github/workflows/pages.yml` from `docs/dynaclinic/runbook/`; that workflow greps each page for a title string, so page titles and the workflow's checks change together.
- Static HTML with inline CSS, no build step; media (mp4, png, pdf) sit beside the pages.

## Capabilities and Constraints

- Naming: DynamiClinic is the system name. DynaClinic appears only where it names code (the `dynaclinic/` package, `dynaclinic_*.yaml` workflows, CLI commands).
- Research prototype, not for clinical use. Every page says so.
- The slides deck keeps its own presentation style; it is a deck, not a web page.
- Results are reported with their confidence intervals and caveats (tau_u calibrated on the same vignettes, not validated). No claim beyond what the recorded runs show.

## Evidence on Hand

- Recorded runs: `docs/dynaclinic/runbook/dynaclinic-3d-runbook-demo.mp4`, `demo-hospital-3d.mp4`, screenshots `*.png` in the same folder.
- Benchmark results: `docs/dynaclinic/results/` (MedQA-50 and synthetic-24 on gpt-6-luna; qwen3.5-4b three-arm and calibration runs).
- Proposal check: `docs/dynaclinic/proposal-alignment.md`, rendered as `alignment.html`.
- Deck: `slides.html`, `dynamiclinic-slides.pdf`.
- No user studies, clinical validation, or deployment exist; never imply them.

## Product Principles

- Evidence before assertion: a claim links to the run, results folder, or commit that backs it.
- Honest status: matches, partial, differs, missing, extra are stated as plainly as the wins.
- The mechanism is the story: C, U, and the mode rule are what a reviewer must be able to follow.
- Reviewers read closely; density is fine when it is navigable.

## Accessibility & Inclusion

WCAG AA contrast for body text and tables; video steps are reachable by keyboard.
