"""Environment-state edge processors for the DynaClinic hospital day-loop (ABM environmental
factors, design spec section 4.7). global_state['environment'] holds the clinic's shared ABM
state: bed_occupancy, staffing_level, resource_availability (per care-team role), case_mix_context
and staff_fatigue. It persists across LoopGate iterations within one run (same global_state dict)
and resets with each new run_workflow call, same as every other global_state key — not a
cross-invocation store (use a literal-path memory store for that, see Task 5)."""

from typing import Any, Dict

from functions.edge_processor.day_counter import inject_day_to_message

STATE_KEY = "environment"
# ponytail: scripted day-based cycles, not live data feeds (spec explicitly excludes live external grounding).
STAFFING_CYCLE = ("day", "day", "short")  # every 3rd simulated day is short-staffed
CASE_MIX_CYCLE = ("baseline", "baseline", "baseline", "baseline", "flu_surge")  # every 5th day
RESOURCE_QUOTA = {"imaging": 2, "pathology": 3, "pharmacology": 3}
# One admission per day: a daily reset could never deplete anything, so stock restocks every 4th day.
RESTOCK_EVERY_DAYS = 4
BED_OCCUPANCY_CAP = 100
BED_OCCUPANCY_FLOOR = 0
ADMISSION_DELTA = 8
DISCHARGE_DELTA = 5


def inject_day_and_start_shift(data: str, global_state: Dict[str, Any]) -> str:
    """DayStart -> PatientDataGenerator: day-prefixes the message (unchanged `inject_day_to_message`
    behaviour) and starts the new day's shift: cycles staffing and case-mix, restocks resources
    only every RESTOCK_EVERY_DAYS days (or when unseeded), and decays staff fatigue by one.
    Appends an Environment line so PatientDataGenerator's prompt can bias the presentation toward
    the day's case mix."""
    text = inject_day_to_message(data, global_state)
    day = global_state["hospital_day_counter"]
    environment = global_state.setdefault(STATE_KEY, {})
    environment["staffing_level"] = STAFFING_CYCLE[(day - 1) % len(STAFFING_CYCLE)]
    if (day - 1) % RESTOCK_EVERY_DAYS == 0 or "resource_availability" not in environment:
        environment["resource_availability"] = dict(RESOURCE_QUOTA)
    environment["case_mix_context"] = CASE_MIX_CYCLE[(day - 1) % len(CASE_MIX_CYCLE)]
    environment.setdefault("bed_occupancy", 20)
    # Overnight rest: fatigue decays by one per day, so only exhaustion days (+2) accumulate toward the clamp.
    environment["staff_fatigue"] = max(0, environment.get("staff_fatigue", 0) - 1)
    return f"{text}\nEnvironment: case_mix_context={environment['case_mix_context']}"


def inject_day_and_record_admission(data: str, global_state: Dict[str, Any]) -> str:
    """PatientDataGenerator -> DailySummary: day-prefixes the message (unchanged
    `inject_day_to_message` behaviour) and records today's admission against bed occupancy."""
    text = inject_day_to_message(data, global_state)
    environment = global_state.setdefault(STATE_KEY, {})
    environment["bed_occupancy"] = min(BED_OCCUPANCY_CAP, environment.get("bed_occupancy", 20) + ADMISSION_DELTA)
    return text


def record_discharge(data: str, global_state: Dict[str, Any]) -> str:
    """DailySummary -> LoopGate: scripted end-of-day discharge count against bed occupancy."""
    environment = global_state.setdefault(STATE_KEY, {})
    environment["bed_occupancy"] = max(BED_OCCUPANCY_FLOOR, environment.get("bed_occupancy", 20) - DISCHARGE_DELTA)
    return data


def inject_day_and_flag_governance(data: str, global_state: Dict[str, Any]) -> str:
    """Report -> DailySummary: day-prefixes the message (unchanged `inject_day_to_message`
    behaviour) and appends a governance note when the day's consult went adversarial or was
    blocked. Not real voting or enforcement (design spec 4.5 ponytail stub) - a log line for the
    daily summary and, through it, the final report to surface."""
    text = inject_day_to_message(data, global_state)
    adversarial = "Meta-Controller: MODE ADVERSARIAL" in data
    blocked = data.startswith("DynaClinic report (GATE: BLOCKED)")
    if not (adversarial or blocked):
        return text
    day = global_state["hospital_day_counter"]
    reason = "gate blocked" if blocked else "adversarial mode"
    note = f"Day {day}: {reason} - flagged for protocol review (not enforced, prototype)."
    global_state.setdefault("governance_notes", []).append(note)
    return f"{text}\n\nGovernance note: {note}"
