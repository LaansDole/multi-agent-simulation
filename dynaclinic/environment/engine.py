"""Seeded hospital environment for the DynaClinic day loop (spec 2026-11-14 section 4).

Pure: no I/O, no LLM. Every random draw comes from the passed-in random.Random in a fixed order, so one seed
replays one run. No draw depends on stock or fatigue, which the consults change from outside the engine.
"""

import math
import random
from dataclasses import dataclass, field
from typing import Any

from dynaclinic.environment.config import ACUITIES, EVENT_KINDS, RESOURCES


@dataclass
class Patient:
    """One arrival; discharge_day is set when the patient takes a bed."""

    acuity: str
    organ_system: str
    age: int
    sex: str
    arrived_day: int
    discharge_day: int = 0

    def describe(self) -> dict[str, Any]:
        """The focus-case fields the consult's presentation must match."""
        return {"acuity": self.acuity, "organ_system": self.organ_system, "age": self.age, "sex": self.sex}


@dataclass
class EnvironmentState:
    """Everything the engine carries from one day to the next."""

    day: int = 0
    staffing_level: str = "day"
    staff_on_shift: int = 0
    event: str | None = None
    event_days_left: int = 0
    inpatients: list[Patient] = field(default_factory=list)
    queue: list[Patient] = field(default_factory=list)
    today: list[Patient] = field(default_factory=list)
    stock: dict[str, int] = field(default_factory=dict)
    fatigue: float = 0.0
    admitted: int = 0
    discharged: int = 0
    focus_case: Patient | None = None


def initial_state(config: dict[str, Any], rng: random.Random) -> EnvironmentState:
    """Day 0: beds filled to start_occupancy with patients part-way through their stay, full stock, and the
    preset's event (if any) active."""
    state = EnvironmentState(stock=dict(config["stock"]["capacity"]))
    beds = config["beds"]
    for _ in range(round(beds["capacity"] * beds["start_occupancy"])):
        patient = _sample_patient(rng, config, None, 0)
        patient.discharge_day = 1 + rng.randint(1, _length_of_stay(rng, config, patient.acuity))
        state.inpatients.append(patient)
    events = config["events"]
    if events["start_with"] != "none":
        state.event, state.event_days_left = events["start_with"], events["duration_days"]
    return state


def step_day(state: EnvironmentState, config: dict[str, Any], rng: random.Random) -> EnvironmentState:
    """Advance one day in the spec's fixed order: discharges, staffing, event, arrivals and admission, stock,
    fatigue, focus case."""
    state.day += 1
    day = state.day

    staying = [patient for patient in state.inpatients if patient.discharge_day > day]
    state.discharged = len(state.inpatients) - len(staying)
    state.inpatients = staying

    staffing = config["staffing"]
    short = rng.random() < staffing["p_short"]
    state.staffing_level = "short" if short else "day"
    state.staff_on_shift = staffing["staff_short"] if short else staffing["staff_day"]

    events = config["events"]
    if state.event_days_left == 0:
        state.event = None
        if rng.random() < events["p_start"]:
            state.event = _pick(rng, {kind: events[kind]["weight"] for kind in EVENT_KINDS})
            state.event_days_left = events["duration_days"]

    multiplier = events[state.event]["rate_multiplier"] if state.event else 1
    arrivals = _poisson(rng, config["arrivals"]["rate_per_day"] * multiplier)
    state.today = [_sample_patient(rng, config, state.event, day) for _ in range(arrivals)]
    state.queue.extend(state.today)
    state.admitted = _admit(state, config, rng)

    stock = config["stock"]
    if (day - 1) % stock["restock_every_days"] == 0:
        state.stock = dict(stock["capacity"])
    for patient in state.today:
        for resource in RESOURCES:
            if rng.random() < stock["use_prob"][patient.acuity][resource]:  # drawn even at 0 stock
                state.stock[resource] = max(0, state.stock[resource] - 1)

    fatigue = config["fatigue"]
    load = fatigue["gain_per_load"] * len(state.today) / state.staff_on_shift
    state.fatigue = round(max(0.0, state.fatigue - fatigue["recovery_per_day"]) + load, 2)

    # ponytail: one focus consult per day; more need an intra-day loop in the graph, add when cost allows.
    if state.today:
        weights = config["focus"]["acuity_weight"]
        state.focus_case = rng.choices(state.today, weights=[weights[p.acuity] for p in state.today])[0]
    elif state.queue:
        state.focus_case = state.queue[0]  # _admit sorted it: highest acuity, earliest arrival
    else:
        state.focus_case = _sample_patient(rng, config, state.event, day)

    if state.event_days_left > 0:
        state.event_days_left -= 1
    return state


def snapshot(state: EnvironmentState, config: dict[str, Any]) -> dict[str, Any]:
    """The day's state as the flat dict of spec section 5 (the Environment line and global_state['environment'])."""
    capacity = config["beds"]["capacity"]
    occupied = len(state.inpatients)
    return {
        "day": state.day,
        "staffing_level": state.staffing_level,
        "staff_on_shift": state.staff_on_shift,
        "case_mix_context": state.event or "baseline",
        "event_days_left": state.event_days_left,
        "arrivals": len(state.today),
        "admitted": state.admitted,
        "discharged": state.discharged,
        "beds_capacity": capacity,
        "beds_occupied": occupied,
        "bed_occupancy": round(100 * occupied / capacity),
        "waiting": len(state.queue),
        "resource_availability": dict(state.stock),
        "staff_fatigue": state.fatigue,
        "fatigue_threshold": config["fatigue"]["threshold"],
        "focus_case": state.focus_case.describe() if state.focus_case else None,
    }


def _pick(rng: random.Random, weights: dict[str, float]) -> str:
    keys = list(weights)
    return rng.choices(keys, weights=[weights[key] for key in keys])[0]


def _poisson(rng: random.Random, rate: float) -> int:
    if rate <= 0:
        return 0
    if rate > 30:  # ponytail: normal approximation above 30; Knuth's loop grows with the rate
        return max(0, round(rng.gauss(rate, math.sqrt(rate))))
    limit, count, product = math.exp(-rate), 0, rng.random()
    while product > limit:
        count += 1
        product *= rng.random()
    return count


def _adjusted(config: dict[str, Any], event: str | None, group: str, base: dict[str, float]) -> dict[str, float]:
    if event is None:
        return dict(base)
    adjust = config["events"][event][group]
    return {key: weight * adjust.get(key, 1) for key, weight in base.items()}


def _sample_patient(rng: random.Random, config: dict[str, Any], event: str | None, day: int) -> Patient:
    arrivals = config["arrivals"]
    return Patient(
        acuity=_pick(rng, _adjusted(config, event, "acuity_weight", arrivals["acuity_mix"])),
        organ_system=_pick(rng, _adjusted(config, event, "organ_weight", arrivals["organ_mix"])),
        age=rng.randint(arrivals["age_min"], arrivals["age_max"]),
        sex=rng.choice(("female", "male")),
        arrived_day=day,
    )


def _length_of_stay(rng: random.Random, config: dict[str, Any], acuity: str) -> int:
    beds = config["beds"]
    return max(1, math.ceil(rng.lognormvariate(math.log(beds["los_median_days"][acuity]), beds["los_sigma"])))


def _admit(state: EnvironmentState, config: dict[str, Any], rng: random.Random) -> int:
    """Waiting patients take free beds, highest acuity first, then earliest arrival; returns how many."""
    state.queue.sort(key=lambda patient: (ACUITIES.index(patient.acuity), patient.arrived_day))  # stable
    free = config["beds"]["capacity"] - len(state.inpatients)
    if free <= 0:
        return 0
    taken, state.queue = state.queue[:free], state.queue[free:]
    for patient in taken:
        patient.discharge_day = state.day + _length_of_stay(rng, config, patient.acuity)
    state.inpatients.extend(taken)
    return len(taken)
