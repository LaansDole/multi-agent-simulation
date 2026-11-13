# Multi-Agent Simulation

A research fork of [ChatDev 2.0 (DevAll)](https://github.com/OpenBMB/ChatDev), the zero-code multi-agent orchestration platform from OpenBMB. This fork builds **DynamiClinic**, a clinical decision-support prototype that switches its multi-agent architecture per case, and a **3D office** in which any DevAll workflow can be watched as characters that walk, meet and talk.

- Project site (demo video, benchmark results, fact check, slides): https://laansdole.github.io/multi-agent-simulation/
- Upstream: [OpenBMB/ChatDev](https://github.com/OpenBMB/ChatDev) (`main`). The Chinese README ([README-zh.md](./README-zh.md)) is upstream's and describes the base platform only.
- Working branch: `threejs-devall`

> DynamiClinic is a research prototype. It is not a medical device and must not be used for clinical decisions.

## On the project site

| Page | What it shows |
|---|---|
| [Runbook demo](https://laansdole.github.io/multi-agent-simulation/) | One continuous recording of the runbook in the 3D office: three real mock cases on gpt-6-luna, one per mode, with a clickable step list. |
| [Benchmark results](https://laansdole.github.io/multi-agent-simulation/results.html) | Single agent vs DynamiClinic (dynamic) vs the always-on team (static) on MedQA-50 and 24 synthetic vignettes, with 95% intervals. |
| [Fact check](https://laansdole.github.io/multi-agent-simulation/alignment.html) | The code checked, layer by layer, against the reviewed proposal: matches, partial, differs, missing, extra. |
| [demo_hospital in 3D](https://laansdole.github.io/multi-agent-simulation/demo-hospital.html) | A generic DevAll workflow (six agents looping over hospital days) in the 3D office. |
| [Slides](https://laansdole.github.io/multi-agent-simulation/slides.html) ([PDF](https://laansdole.github.io/multi-agent-simulation/dynamiclinic-slides.pdf)) | From the scoping review (PRISMA-ScR) to the working prototype. |

The site is built from `docs/dynaclinic/runbook/` by `.github/workflows/pages.yml`.

## What this fork adds

### DynamiClinic (`dynaclinic/`)

A Meta-Controller scores each case for complexity C and uncertainty U (normalised entropy of a generalist's differential) and picks one of three communication modes:

| Mode | When | Who talks |
|---|---|---|
| Hierarchical | C <= 0.5 and U <= tau_u | A Primary Care hub, which may consult up to two specialists |
| Collaborative | C > 0.5 and U <= tau_u | Imaging, Pathology/Lab and Pharmacology specialists on a shared Blackboard, plus one mesh exchange round |
| Adversarial | U > tau_u, or the Conflict Detector finds divergent hypotheses | Proponent, Clinical Critic as Opponent, Synthesizer as Mediator |

Around that: atomic-claim decomposition with a hybrid rule / LLM-judge score, rule-based safety gates (A_SAD, T_SAD; S_NAP is a stub), semantic conflict detection for free-text cases, per-model tau_u calibration, mock clinical scenarios, and an eval harness with single-agent and static-team baselines. FHIR/Neo4j ingestion, MCTS planning and BioBERT/Qdrant memory are stubs behind the proposal's interfaces. The full component map with status is in [docs/dynaclinic/README.md](docs/dynaclinic/README.md); the check against the reviewed proposal is in [docs/dynaclinic/proposal-alignment.md](docs/dynaclinic/proposal-alignment.md).

It runs two ways: as a pure-Python pipeline, and as a DevAll workflow (`yaml_instance/dynaclinic_mvp.yaml`, ten `dc_*` node types from `dynaclinic/devall_nodes.py`). `yaml_instance/dynaclinic_hospital.yaml` runs a DynamiClinic consult inside the hospital simulation.

Results so far (details and raw output on the [results page](https://laansdole.github.io/multi-agent-simulation/results.html)):

- On gpt-6-luna every arm is near ceiling (MedQA-50: dynamic 96%, 95% CI 86.5 to 98.9), so the benchmarks do not separate single-agent from multi-agent yet.
- On qwen3.5-4b there is headroom, but the single agent (68%) leads dynamic (60%) and static (62%); the differences are not significant at n = 50.
- tau_u does not transfer across models. It is calibrated per model on the synthetic set, not validated against outcomes.

### 3D office (`the-delegation/`)

A React 19 + three.js playground, adapted from [The Delegation](https://github.com/arturitu/the-delegation) and wired to the DevAll backend:

- Import and run any workflow from `yaml_instance/` (searchable import modal); every agent node gets a character with a role nameplate.
- Characters meet on free spots and talk on each hand-off, with readable speech bubbles for JSON and Markdown output.
- Mock scenario picker, final-output modal, team design view, and a benchmark replay panel with a scoreboard.

### Platform changes (DevAll)

- Server: `/api/models`, a workflow graph serializer (`/api/workflows/{filename}/graph`), demo scenarios (`/api/workflows/{filename}/scenarios`), a read-only benchmark results API.
- Runtime: `{{run_dir}}` placeholder for per-run memory paths, function and template edge processors (`process:`; the old `processor:` key is rejected), temperature dropped for models that reject it, `python -m check.check --path` restored with a non-zero exit on failure.
- Vue console: spatial layout editor and a contagion simulation sandbox ([guide](docs/user_guide/en/contagion_simulation.md)), collapsible chat panel.
- Workflows: `demo_hospital.yaml`, `simulation_hospital.yaml`, `dynaclinic_*.yaml`, RLM memory demos.

## Quick start

Requirements: Python 3.12 (not 3.13), [uv](https://docs.astral.sh/uv/), Node.js 18+, `make`. PDF reports need cairo (`brew install cairo pkg-config`, or `apt-get install libcairo2-dev pkg-config`).

```bash
uv sync
(cd frontend && npm install)
(cd the-delegation && npm install)
cp .env.example .env   # set API_KEY and BASE_URL; DynamiClinic also reads OPENAI_API_KEY and DYNACLINIC_MODEL
```

Run the backend and the Vue console (http://localhost:5173):

```bash
make dev
```

Run the 3D office against the same backend (http://localhost:3000/the-delegation/):

```bash
cd the-delegation && npm run dev
```

Run a DynamiClinic case headless, or the eval harness:

```bash
grep '"syn-high-06"' data/dynaclinic/synthetic_cases.jsonl | uv run python run.py --path yaml_instance/dynaclinic_mvp.yaml --name dc_mvp
uv run python -m dynaclinic.eval.harness --dry-run --out /tmp/dc_dry      # offline, scripted model
uv run python -m dynaclinic.eval.harness --arms dynamic,single,static --dataset synthetic --concurrency 4
```

Each run writes to `WareHouse/<session>_<timestamp>/` (`node_outputs.yaml`, `workflow_summary.yaml`, logs, token usage). The step-by-step walk through the 3D office is [docs/dynaclinic/runbook/README.md](docs/dynaclinic/runbook/README.md).

Checks:

```bash
uv run pytest -m "not cline"
make validate-yamls
```

Docker (`docker compose up --build`), LM Studio, OpenClaw and the upstream workflow collection are unchanged; see [upstream's README](https://github.com/OpenBMB/ChatDev#quick-start). The DevAll user guide is in [docs/user_guide/en/](docs/user_guide/en/index.md).

## Repository map

| Path | Contents |
|---|---|
| `dynaclinic/` | DynamiClinic pipeline, DevAll nodes, eval harness |
| `data/dynaclinic/` | 24 synthetic vignettes, MedQA-USMLE 50-question sample |
| `docs/dynaclinic/` | MVP README, proposal fact check, results, runbook and the Pages site |
| `the-delegation/` | 3D office (React + three.js) |
| `frontend/` | Vue 3 web console |
| `server/`, `runtime/`, `workflow/`, `entity/` | DevAll backend, executors, graph execution, config schema |
| `yaml_instance/` | Workflows |

Notes for coding agents are in [AGENTS.md](AGENTS.md).

## Upstream and credits

This fork tracks OpenBMB's ChatDev 2.0 and merges upstream periodically. The platform, the web console, the workflow format and most of `yaml_instance/` are theirs; see the [upstream README](https://github.com/OpenBMB/ChatDev) for its news, contributors and acknowledgments. The 3D office starts from [The Delegation](https://github.com/arturitu/the-delegation). The MedQA-USMLE sample is from Jin et al. 2021 (CC-BY-4.0).

<details>
<summary>Citing ChatDev</summary>

```
@article{chatdev,
    title = {ChatDev: Communicative Agents for Software Development},
    author = {Chen Qian and Wei Liu and Hongzhang Liu and Nuo Chen and Yufan Dang and Jiahao Li and Cheng Yang and Weize Chen and Yusheng Su and Xin Cong and Juyuan Xu and Dahai Li and Zhiyuan Liu and Maosong Sun},
    journal = {arXiv preprint arXiv:2307.07924},
    url = {https://arxiv.org/abs/2307.07924},
    year = {2023}
}

@article{puppeteer,
    title = {Multi-Agent Collaboration via Evolving Orchestration},
    author = {Yufan Dang and Chen Qian and Xueheng Luo and Jingru Fan and Zihao Xie and Ruijie Shi and Weize Chen and Cheng Yang and Xiaoyin Che and Ye Tian and Xuantang Xiong and Lei Han and Zhiyuan Liu and Maosong Sun},
    journal = {arXiv preprint arXiv:2505.19591},
    url = {https://arxiv.org/abs/2505.19591},
    year = {2025}
}
```

</details>

## License

Apache-2.0, as upstream ([LICENSE](LICENSE)).
