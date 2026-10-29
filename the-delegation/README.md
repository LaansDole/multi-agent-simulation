<p align="center">
  <img src="public/images/the-delegation.svg" width="256" alt="The Delegation Logo">
</p>

<p align="center">
  <a href="https://arturitu.github.io/the-delegation/"><b>Launch The Delegation · Full Experience *</b></a>
</p>

> [!IMPORTANT]
> **\*** This experience requires **BYOK (Bring Your Own Key)**. You will need a **[Gemini API key](https://aistudio.google.com/app/apikey)** to run the simulation. Deep integration enables native support for text, and multimodal generation (**Nano Banana**, **Lyria 3**, **Veo 3.1**). You can also **clone or fork** this repository to run it locally.
<div align="center">
  <img src="public/images/the-delegation-UI.jpg" width="100%" alt="The Delegation Hero">
</div>

<br/>

## What is The Delegation?

# A no-code 3D playground to explore, design, and interact with Agentic AI systems

This project is designed for **AI enthusiasts, educators, and creative developers** looking to understand multi-agent collaboration in a living 3D office without writing a single line of code.

## Getting Started

1. **Install dependencies:**

```bash
npm install
```

2. **Run the development server:**

```bash
npm run dev
```

3. **Open the app:** Navigate to the local URL shown in your terminal (usually `http://localhost:3000/the-delegation`).

The app talks to the DevAll backend at port 6400 on the page's host; set `VITE_BACKEND_URL` (e.g. `VITE_BACKEND_URL=http://localhost:6500 npm run dev`) to point it elsewhere.

## Features

### Agentic AI System (v0.2.0)

- **Team Editor (React Flow):** Create your own [multi-agent design patterns](https://developers.googleblog.com/developers-guide-to-multi-agent-patterns-in-adk/) using an interactive node-based interface.
- **6 Predefined Teams:** Industry-specific templates (Creative Agency, Film Studio, PR Agency, etc.) to get you started.
- **Multimodal Outputs:** Generate professional assets including text, image (Nano Banana), music (Lyria 3), and video (Veo 3.1) directly from your agent teams.
- **Per-Agent LLM:** Assign different [Gemini Models](https://ai.google.dev/gemini-api/docs/models) to specific roles (e.g., Flash for speed, Pro for reasoning).
- **Cost & Token Tracking:** Real-time estimation of usage costs and token consumption for transparency.
- **PR-style Workflows:** Learn about Pull Request and Review workflows where agents with `human-in-the-loop` properties require your approval to proceed.
- **Guardrails:** Controlled generation with the `Auto-approve output` option, ensuring quality before final asset production.
- **Technical Logs:** Improved visibility into raw LLM traces, tool calls, and structured agent responses.

### Embodied Simulation

- **Hybrid GPU/CPU Architecture:** A high-performance **3D simulation** built with **Three.js WebGPU** where autonomous LLM-powered characters collaborate in a shared physical workspace.
- **Intelligent Pathfinding:** NPCs utilize a NavMesh to navigate the office, finding and claiming specific "Points of Interest" (desks, seats, computers) based on their current task. Pathfinding is powered by [three-pathfinding](https://github.com/donmccurdy/three-pathfinding).
- **Dynamic State Machine:** Characters transition naturally between walking, sitting, working, and talking, with sync'ed 3D speech bubbles and expressions.

### Interactive UI

- **Team Flow Visualizer:** Real-time node-based view of your agent hierarchy and task flows.
- **Simulated PR Reviews:** Interactive modals for reviewing agent proposals, providing feedback, and merging tasks.
- **Real-time 3D Overlay:** Status indicators and interaction menus projected from 3D space into a polished UI.
- **Agent Inspector:** Select any agent to view their "thoughts", mission, and history.
- **Kanban & Action Logs:** Complete transparency into the agency's progress and tool-level interactions.
- **Benchmark replay:** The **Benchmark** header button opens a panel that replays a recorded MedQA benchmark run from `docs/dynaclinic/results/` (served by `GET /api/benchmarks`). Pick a run: the `slide8-gpt-6-luna` preset combines the single and static arms of the shared-core run with the F15 dynamic run (94 / 96 / 90%); other entries are the raw run folders. Play, step, 1x/4x and skip to end fill a scoreboard of each arm's answer against the key with running accuracy, and filters narrow the table (arms disagree, adversarial, dynamic wrong); click a row for the question, options, mode reason and the path taken. With `dynaclinic_mvp` loaded (Play loads it), the characters act out the dynamic arm's recorded path through the same event path as a live run. It only replays recorded JSON: no workflow run, no model calls.

## Tech Stack Deep Dive

- **Engine:** [Three.js](https://threejs.org/) (WebGPU & TSL) for advanced rendering and compute.
- **UI:** [React](https://react.dev/) & [React Flow](https://reactflow.dev/) for node-based team visualization.
- **AI:** [Gemini API](https://deepmind.google/technologies/gemini/) is the core LLM provider. We follow official prompting best practices for:
    - **Images:** [Nano Banana Prompt Guide](https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-nano-banana)
    - **Video:** [Veo 3.1 Prompt Guide](https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-veo-3-1)
    - **Music:** [Lyria 3 Prompt Guide](https://deepmind.google/models/lyria/prompt-guide/)
- **State:** [Zustand](https://github.com/pmndrs/zustand) for a unified, reactive store across the 3D world and React UI.
- **3D Assets:** Custom models and animations rigged in [Blender](https://blender.org), using an instanced animation system.

## Roadmap

- **World Building**
    - [ ] **Office/3D Space Editor:** Drag-and-drop workspace layout and POI customization.
    - [ ] **Dynamic Environment:** Real-time prop generation and environment modification by agents.
- **Advanced Interactions**
    - [ ] **Advanced Embodied AI:** Deeper integration between agent reasoning and physical 3D world actions.
    - [ ] **Enhanced Animations:** Richer character expressions and more fluid, context-aware animations.
    - [ ] **Human-Agent Spatial Interaction:** Direct collaboration and richer multi-party interactions in the 3D office.
    - [ ] **Inter-Agent Knowledge Sharing:** Long-term memory for agent teams across projects.
- **Refinement**
    - [ ] **Architecture Decoupling:** Further separation of core logic from the simulation environment.
    - [ ] **UX/UI Overhaul:** Unified CSS styling based on "The Delegation" brand identity.

## Developer Note

This release (**v0.2.0**) was developed entirely using **Google Antigravity** as the primary IDE and powered by **Gemini 3 Flash**.

## License & IP

This project follows a dual-licensing model:

- **Source Code (MIT):** All logic, shaders, and UI code are free to use, modify, and distribute.
- **3D Models & Assets (CC BY-NC 4.0):** The custom 3D office and character models are Copyright © 2026 **Arturo Paracuellos ([unboring.net](https://unboring.net))**. They are free for personal and educational use but _cannot_ be used for commercial purposes without permission.

Developed with ❤️ by [Arturo Paracuellos](https://unboring.net)
