# Contagion Simulation Guide

The contagion sandbox lets you run real-time infection-spread simulations on top of any spatial layout. Agents move, infect each other, contaminate floor tiles, and eventually recover or die—all governed by configurable parameters.

## Table of Contents

- [Quick Start](#quick-start)
- [State Machine](#state-machine)
- [Simulation Controls](#simulation-controls)
- [Configurable Parameters](#configurable-parameters)
- [Parameter Priority](#parameter-priority)
- [Transmission Mechanics](#transmission-mechanics)
- [Mutation Mechanic](#mutation-mechanic)
- [HUD Stats Overlay](#hud-stats-overlay)
- [Debug Logging](#debug-logging)

---

## Quick Start

1. **Select a workflow YAML** that places agents on a spatial layout (agents must be on the canvas).
2. Switch to the **Spatial** view.
3. Click the **⚠️ biohazard** toggle (or equivalent sandbox button) to activate sandbox mode — all agents are set to HEALTHY.
4. **Click an agent** to seed an initial infection (the agent turns INFECTED with a 🤒 emote).
5. Press **▶ Play** to start the simulation. Infection spreads automatically each tick.
6. Use **⏸ Pause** and **⏭ Step** to inspect individual ticks.
7. Click the sandbox toggle again to exit and return all agents to normal IDLE status.

---

## State Machine

Each agent cycles through four health states:

```
          infection              recovery timer
HEALTHY ──────────► INFECTED ──────────┬──► RECOVERED ──► HEALTHY
                        │              │       (after immunity expires)
                        │ mutation     │ fatality
                        ▼              ▼
                     DECEASED       DECEASED
```

| State | Visual | Description |
|-------|--------|-------------|
| **HEALTHY** | Default sprite | Susceptible to infection via proximity or floor contamination |
| **INFECTED** | 🤒 emote | Can transmit infection; timer starts counting toward recovery |
| **RECOVERED** | 😊 emote | Temporary immunity; cannot be re-infected during immunity window |
| **DECEASED** | 💀 emote | Permanently removed from simulation (no movement, no interactions) |

**Transitions**:
- **HEALTHY → INFECTED**: Proximity contact with an infected agent, floor contamination exposure, or manual seed
- **INFECTED → RECOVERED**: Recovery timer expires and fatality roll fails
- **INFECTED → DECEASED**: Recovery timer expires and fatality roll succeeds, or mutation triggers
- **RECOVERED → HEALTHY**: Immunity duration expires

---

## Simulation Controls

| Control | Function |
|---------|----------|
| **Toggle Sandbox** | Activates/deactivates the contagion sandbox. Requires agents on canvas. |
| **Seed Infection** | Click a HEALTHY agent to manually infect it |
| **Cure Agent** | Click an INFECTED agent to manually cure it |
| **Play** | Start continuous simulation ticks |
| **Pause** | Freeze simulation (agents keep positions) |
| **Step** | Advance exactly one tick (~16.67ms at 60fps) |
| **Reset** | Reset all agents to HEALTHY and restore initial floor contamination |

---

## Configurable Parameters

Open the **Settings** modal (gear icon) → expand **Contagion Simulation** to view and edit these parameters. Changes persist across sessions via localStorage.

### Transmission

| Parameter | Default | Unit | Description |
|-----------|---------|------|-------------|
| **Infection Radius** | `120` | px | Maximum distance for proximity-based infection spread |
| **Infection Probability** | `0.7` | /sec | Per-second chance of a healthy agent catching infection from a nearby infected agent |
| **Floor Infection Probability** | `0.15` | /sec | Per-second chance of infection from standing on a contaminated floor tile |

### Disease Progression

| Parameter | Default | Unit | Description |
|-----------|---------|------|-------------|
| **Recovery Time** | `60000` | ms | Duration from infection to recovery/fatality check |
| **Fatality Probability** | `0.05` | 0–1 | Chance of death (vs recovery) when recovery timer expires |
| **Mutation Probability** | `0.001` | /sec | Per-second chance of a rare lethal mutation while infected (100% fatal) |

### Environment

| Parameter | Default | Unit | Description |
|-----------|---------|------|-------------|
| **Contamination Decay** | `10000` | ms | Interval for floor contamination to decay one level (severe → moderate → mild → clean) |

### Post-recovery

| Parameter | Default | Unit | Description |
|-----------|---------|------|-------------|
| **Immunity Duration** | `30000` | ms | Temporary immunity window after recovery before the agent can be re-infected |

---

## Parameter Priority

Parameters are resolved per-tick in this order (highest wins):

1. **Spatial config overrides** — the `"simulation"` key inside your layout JSON file (e.g. `simulation_hospital.json`)
2. **User settings** — values set via the Settings modal, stored in `configStore` / localStorage
3. **Inline defaults** — hardcoded fallbacks in the engine (the values shown in the table above)

This means you can override individual parameters per-layout (for example, a hospital layout could set `infectionRadius: 80` for tighter wards) while other parameters fall back to your global user settings.

**Example** — layout JSON override:
```json
{
  "simulation": {
    "infectionRadius": 80,
    "fatalityProbability": 0.15
  }
}
```

---

## Transmission Mechanics

### Proximity-based Transmission

Each tick, for every INFECTED agent, the engine checks all HEALTHY agents within `infectionRadius` pixels. Each pair rolls against `infectionProbability` scaled by the time delta:

```
scaledProbability = 1 - (1 - infectionProbability) ^ (deltaMs / 1000)
```

If the roll succeeds, the healthy agent becomes INFECTED and the floor tile they occupy gets contaminated (level incremented up to 3 — severe).

### Floor Contamination Transmission

Infected agents leave contamination on floor tiles they occupy. Healthy agents standing on contaminated tiles roll against `floorInfectionProbability` (also time-scaled). Contamination levels:

| Level | Color | Label |
|-------|-------|-------|
| 0 | 🟢 Green | Clean |
| 1 | 🟡 Yellow | Mild |
| 2 | 🟠 Orange | Moderate |
| 3 | 🔴 Red | Severe |

Contamination decays one level every `contaminationDecayMs` milliseconds.

---

## Mutation Mechanic

Each tick, every INFECTED agent has a small chance (`mutationProbability`, time-scaled) of a lethal mutation. If triggered, the agent immediately transitions to DECEASED with a 💀🧬 emote — bypassing the normal recovery timer entirely.

---

## HUD Stats Overlay

When the sandbox is active, a heads-up display shows real-time counts:

| Stat | Description |
|------|-------------|
| **Healthy** | Agents in HEALTHY state |
| **Infected** | Agents currently INFECTED |
| **Recovered** | Agents in RECOVERED (immune) state |
| **Deceased** | Agents permanently deceased |

These stats update reactively each time an agent's condition changes.

---

## Debug Logging

Toggle debug logging to inspect simulation internals:

1. Click the **bug icon** or call `toggleDebugLog()` to enable.
2. The engine logs timestamped entries for: lifecycle events, infection seeds, transmission events, heartbeats (every 2s while running), and state snapshots.
3. View logs in the browser DevTools console (prefixed `[Contagion:category]`).
4. Logs are capped at 200 entries to prevent memory growth.
5. Use `clearLog()` to reset the log buffer.

---

## Related Documentation

- [Spatial Layouts](../../spatial_layouts.md) — Layout catalog and custom layout creation
- [Web UI Quick Start](web_ui_guide.md) — Frontend interface operations
