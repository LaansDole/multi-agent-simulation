"""Environment edge processors for the DynaClinic hospital day loop (spec 2026-11-14 sections 5-7).

The world is computed by the seeded engine in dynaclinic/environment; these processors connect it to the
graph. global_state['environment'] holds the flat keys the clinical nodes read and change during a consult
(dynaclinic/devall_nodes.py: stock and fatigue); global_state['environment_engine'] holds preset, seed, config,
RNG and engine state. Both persist across LoopGate iterations of one run and reset with each run_workflow call."""

import json
import logging
import random
import re
from typing import Any, Dict

from dynaclinic.environment.config import RESOURCES, resolve_scenario
from dynaclinic.environment.engine import initial_state, snapshot, step_day
from functions.edge_processor.day_counter import inject_day_to_message

STATE_KEY = "environment"
ENGINE_KEY = "environment_engine"
_SCENARIO_LINE = re.compile(r"^Scenario: (.*)$\n?", re.M)
_log = logging.getLogger(__name__)


def _compact(payload: Dict[str, Any]) -> str:
    return json.dumps(payload, separators=(",", ":"))


def _start_engine(data: str, global_state: Dict[str, Any]) -> Dict[str, Any] | None:
    """Day 1: build config, seed and RNG from the Scenario line; None (logged) when the scenario is invalid."""
    match = _SCENARIO_LINE.search(data)
    try:
        scenario = json.loads(match.group(1)) if match else {"preset": "baseline"}
        if not isinstance(scenario, dict) or set(scenario) - {"preset", "overrides"}:
            raise ValueError('the Scenario line must be {"preset": <name>, "overrides": {...}}')
        preset = scenario.get("preset", "baseline")
        config, seed = resolve_scenario(preset, scenario.get("overrides"))
    except ValueError as exc:  # EnvironmentConfigError and json.JSONDecodeError are ValueErrors
        _log.error("DynaClinic environment: invalid scenario, the run stops: %s", exc)
        return None
    if not match:
        _log.warning("DynaClinic environment: no Scenario line, running preset baseline with seed %d", seed)
    rng = random.Random(seed)
    engine = {"preset": preset, "seed": seed, "config": config, "rng": rng, "state": initial_state(config, rng)}
    global_state[ENGINE_KEY] = engine
    return engine


def inject_day_and_start_shift(data: str, global_state: Dict[str, Any]) -> str | None:
    """DayStart -> PatientDataGenerator: day-prefixes the message, steps the engine one day and appends the
    day's state as one `Environment: {json}` line (the-delegation/src/integration/api/clinicEnvironment.ts
    parses it). Returns None, dropping the message and so ending the run, when the scenario is invalid."""
    engine = global_state.get(ENGINE_KEY) or _start_engine(data, global_state)
    if engine is None:
        return None
    state, config = engine["state"], engine["config"]
    first_day = state.day == 0
    text = inject_day_to_message(_SCENARIO_LINE.sub("", data).rstrip("\n"), global_state)
    environment = global_state.setdefault(STATE_KEY, {})
    # dc_care_team spends stock and adds fatigue during the day; the engine continues from there.
    if "resource_availability" in environment:
        state.stock = {resource: environment["resource_availability"].get(resource, 0) for resource in RESOURCES}
    if "staff_fatigue" in environment:
        state.fatigue = environment["staff_fatigue"]
    step_day(state, config, engine["rng"])
    environment.clear()
    environment.update(snapshot(state, config))
    payload = {**environment, **({"preset": engine["preset"], "seed": engine["seed"], "config": config}
                                 if first_day else {})}
    return f"{text}\nEnvironment: {_compact(payload)}"


def inject_day_and_attach_environment(data: str, global_state: Dict[str, Any]) -> str:
    """PatientDataGenerator -> DailySummary: day-prefixes the admission and appends the day's environment as
    it stood at day start, so the summary reports the engine's numbers, not invented ones."""
    text = inject_day_to_message(data, global_state)
    environment = global_state.get(STATE_KEY)
    return f"{text}\nEnvironment: {_compact(environment)}" if environment else text



# The Report template emits header, gates (ending in the Meta-Controller line), then the write-up under one of these.
_WRITE_UP = re.compile(r"\n\n(?:Answer|Assessment and plan):\n")


def inject_day_and_flag_governance(data: str, global_state: Dict[str, Any]) -> str:
    """Report -> DailySummary: day-prefixes the message (unchanged `inject_day_to_message`
    behaviour) and appends a governance note when the day's consult went adversarial or was
    blocked. Not real voting or enforcement (design spec 4.5 ponytail stub) - a log line for the
    daily summary and, through it, the final report to surface. The mode is read only from the
    gates block the template emits before the write-up, so write-up text cannot trigger it."""
    text = inject_day_to_message(data, global_state)
    adversarial = "Meta-Controller: MODE ADVERSARIAL" in _WRITE_UP.split(data, maxsplit=1)[0]
    blocked = data.startswith("DynaClinic report (GATE: BLOCKED)")
    if not (adversarial or blocked):
        return text
    day = global_state["hospital_day_counter"]
    reason = "gate blocked" if blocked else "adversarial mode"
    note = f"Day {day}: {reason} - flagged for protocol review (not enforced, prototype)."
    return f"{text}\n\nGovernance note: {note}"
