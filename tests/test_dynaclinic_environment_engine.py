"""dynaclinic/environment: scenario validation, and the seeded engine's patterns and invariants
(spec 2026-11-14 section 8)."""

import random
from statistics import mean
from typing import Any

import pytest

from dynaclinic.environment.config import RESOURCES, SEED_MAX, EnvironmentConfigError, presets, resolve_scenario
from dynaclinic.environment.engine import EnvironmentState, Patient, initial_state, snapshot, step_day


def test_presets_are_the_four_named_scenarios() -> None:
    assert presets() == ["baseline", "flu_surge", "short_staffed", "trauma_cluster"]


def test_overrides_win_over_the_preset_which_wins_over_baseline() -> None:
    config, seed = resolve_scenario("short_staffed", {"staffing": {"staff_short": 2}, "seed": 11})
    assert config["staffing"] == {"p_short": 0.8, "staff_day": 5, "staff_short": 2}
    assert seed == 11
    baseline, _ = resolve_scenario("baseline", {})
    assert baseline["staffing"]["p_short"] == 0.33


def test_a_missing_seed_is_drawn() -> None:
    _, seed = resolve_scenario("baseline", None)
    assert isinstance(seed, int) and 0 <= seed <= SEED_MAX


def test_whole_number_keys_become_ints() -> None:
    config, _ = resolve_scenario("baseline", {"arrivals": {"age_min": 30.0}})
    assert type(config["arrivals"]["age_min"]) is int


@pytest.mark.parametrize(("preset", "overrides", "message"), [
    ("monsoon", {}, "unknown preset 'monsoon'"),
    ("../baseline", {}, "unknown preset"),
    ("baseline", {"arrivals": {"surge": 1}}, "unknown key arrivals.surge"),
    ("baseline", {"arrivals": {"rate_per_day": -1}}, "arrivals.rate_per_day=-1 is outside [0, 500]"),
    ("baseline", {"arrivals": {"rate_per_day": "high"}}, "arrivals.rate_per_day must be a number"),
    ("baseline", {"arrivals": {"rate_per_day": {"x": 1}}}, "arrivals.rate_per_day must be a scalar"),
    ("baseline", {"arrivals": 3}, "arrivals must be a mapping"),
    ("baseline", {"staffing": {"p_short": 1.5}}, "staffing.p_short=1.5 is outside [0, 1]"),
    ("baseline", {"beds": {"capacity": 0}}, "beds.capacity=0 is outside"),
    ("baseline", {"beds": {"capacity": 40.5}}, "beds.capacity must be a whole number"),
    ("baseline", {"stock": {"use_prob": {"high": {"imaging": 2}}}}, "stock.use_prob.high.imaging=2 is outside [0, 1]"),
    ("baseline", {"focus": {"acuity_weight": {"low": 0}}}, "focus.acuity_weight.low=0 is outside"),
    ("baseline", {"arrivals": {"age_min": 80, "age_max": 20}}, "arrivals.age_min=80 is above arrivals.age_max=20"),
    ("baseline", {"staffing": {"staff_short": 9}}, "staffing.staff_short=9 is above staffing.staff_day=5"),
    ("baseline", {"arrivals": {"acuity_mix": {"high": 0, "medium": 0, "low": 0}}}, "arrivals.acuity_mix needs a positive weight"),
    ("baseline", {"events": {"flu_surge": {"weight": 0}, "trauma_cluster": {"weight": 0}}}, "events need a positive weight"),
    ("baseline", {"events": {"start_with": "earthquake"}}, "events.start_with must be one of"),
    ("baseline", {"events": {"flu_surge": {"organ_weight": {"skin": 2}}}}, "unknown key events.flu_surge.organ_weight.skin"),
    ("baseline", {"events": {"flu_surge": {"rate_multiplier": 11}}}, "events.flu_surge.rate_multiplier=11 is outside [0, 10]"),
    ("baseline", {"seed": "x"}, "seed must be a whole number"),
    ("baseline", {"seed": True}, "seed must be a whole number"),
    ("baseline", [1], "overrides must be a mapping"),
])
def test_invalid_scenarios_name_the_key(preset: str, overrides: object, message: str) -> None:
    with pytest.raises(EnvironmentConfigError) as error:
        resolve_scenario(preset, overrides)  # type: ignore[arg-type]
    assert message in str(error.value)


def test_event_weights_accept_any_organ_or_acuity_key() -> None:
    config, _ = resolve_scenario("baseline", {"events": {"flu_surge": {"organ_weight": {"cardiovascular": 2}}}})
    assert config["events"]["flu_surge"]["organ_weight"] == {"respiratory": 3, "cardiovascular": 2}


SEEDS = range(200)
DAYS = 30
SNAPSHOT_KEYS = {
    "day", "staffing_level", "staff_on_shift", "case_mix_context", "event_days_left", "arrivals", "admitted",
    "discharged", "beds_capacity", "beds_occupied", "bed_occupancy", "waiting", "resource_availability",
    "staff_fatigue", "fatigue_threshold", "focus_case",
}


def _trajectory(overrides: dict, seed: int, days: int = DAYS, preset: str = "baseline"
                ) -> list[tuple[dict[str, Any], list[Patient]]]:
    """(snapshot, today's arrivals) for each simulated day."""
    config, _ = resolve_scenario(preset, overrides)
    rng = random.Random(seed)
    state = initial_state(config, rng)
    days_out = []
    for _ in range(days):
        step_day(state, config, rng)
        days_out.append((snapshot(state, config), list(state.today)))
    return days_out


def _mean(overrides: dict, key: str) -> float:
    return mean(snap[key] for seed in SEEDS for snap, _ in _trajectory(overrides, seed))


def test_more_arrivals_fill_beds_and_the_queue() -> None:
    quiet, busy = {"arrivals": {"rate_per_day": 8}}, {"arrivals": {"rate_per_day": 20}}
    assert _mean(busy, "beds_occupied") > _mean(quiet, "beds_occupied")
    assert _mean(busy, "waiting") > _mean(quiet, "waiting")


def test_more_short_shifts_mean_more_fatigue() -> None:
    assert _mean({"staffing": {"p_short": 0.8}}, "staff_fatigue") > _mean({"staffing": {"p_short": 0.1}}, "staff_fatigue")


def test_a_flu_surge_raises_the_respiratory_share() -> None:
    overrides = {"events": {"p_start": 0.3, "trauma_cluster": {"weight": 0}}}
    counts = {"flu_surge": [0, 0], "baseline": [0, 0]}  # [respiratory, all] arrivals
    for seed in SEEDS:
        for snap, today in _trajectory(overrides, seed):
            tally = counts[snap["case_mix_context"]]
            tally[0] += sum(patient.organ_system == "respiratory" for patient in today)
            tally[1] += len(today)
    flu, baseline = (respiratory / total for respiratory, total in (counts["flu_surge"], counts["baseline"]))
    assert flu > baseline + 0.15  # measured about 0.40 against 0.18 with the sourced organ mix


def test_fatigue_rises_on_heavy_days_and_recovers_on_empty_days() -> None:
    heavy, _ = resolve_scenario("baseline", {"arrivals": {"rate_per_day": 40}, "staffing": {"p_short": 1}})
    empty, _ = resolve_scenario("baseline", {"arrivals": {"rate_per_day": 0}})
    for seed in range(50):
        rng = random.Random(seed)
        state = initial_state(heavy, rng)
        step_day(state, heavy, rng)
        assert state.fatigue > 1  # about 40 arrivals x 0.25 over 3 staff
        before = state.fatigue
        step_day(state, empty, rng)
        assert state.fatigue == max(0, round(before - 1, 2))


@pytest.mark.parametrize("preset", ["baseline", "flu_surge", "short_staffed", "trauma_cluster"])
def test_every_day_keeps_the_invariants(preset: str) -> None:
    overrides = {"arrivals": {"rate_per_day": 30}}
    config, _ = resolve_scenario(preset, overrides)
    for seed in range(50):
        for snap, today in _trajectory(overrides, seed, preset=preset):
            assert set(snap) == SNAPSHOT_KEYS
            assert 0 <= snap["beds_occupied"] <= snap["beds_capacity"]
            assert snap["waiting"] >= 0
            if snap["waiting"]:
                assert snap["beds_occupied"] == snap["beds_capacity"], "nobody waits while a bed is free"
            assert all(0 <= snap["resource_availability"][r] <= config["stock"]["capacity"][r] for r in RESOURCES)
            assert set(snap["focus_case"]) == {"acuity", "organ_system", "age", "sex"}
            if today:
                assert snap["focus_case"] in [patient.describe() for patient in today]
            assert snap["arrivals"] == len(today)


def test_a_preset_event_is_active_from_day_one() -> None:
    [(day_one, _)] = _trajectory({"events": {"duration_days": 2}}, 0, days=1, preset="flu_surge")
    assert day_one["case_mix_context"] == "flu_surge" and day_one["event_days_left"] == 1


def test_a_seed_replays_its_run() -> None:
    overrides = {"events": {"p_start": 0.3}}
    first = [snap for snap, _ in _trajectory(overrides, 7)]
    assert first == [snap for snap, _ in _trajectory(overrides, 7)]
    assert first != [snap for snap, _ in _trajectory(overrides, 8)]


def test_no_draw_depends_on_stock_or_fatigue() -> None:
    """The consults change stock and fatigue from outside the engine; the RNG stream must not notice."""
    config, _ = resolve_scenario("baseline", {"arrivals": {"rate_per_day": 20}})
    runs = []
    for tamper in (False, True):
        rng = random.Random(3)
        state = initial_state(config, rng)
        days = []
        for _ in range(30):
            step_day(state, config, rng)
            snap = snapshot(state, config)
            del snap["resource_availability"], snap["staff_fatigue"]
            days.append(snap)
            if tamper:
                state.stock = dict.fromkeys(state.stock, 0)
                state.fatigue = 9.0
        runs.append(days)
    assert runs[0] == runs[1]


def test_admission_takes_highest_acuity_then_earliest_arrival() -> None:
    config, _ = resolve_scenario("baseline", {"beds": {"capacity": 1, "start_occupancy": 0},
                                              "arrivals": {"rate_per_day": 0}})
    low, high, medium = (Patient(acuity, "respiratory", 50, "female", arrived)
                         for acuity, arrived in (("low", 1), ("high", 2), ("medium", 1)))
    state = EnvironmentState(queue=[low, high, medium])
    step_day(state, config, random.Random(0))
    assert len(state.inpatients) == 1 and state.inpatients[0] is high
    assert [p.acuity for p in state.queue] == ["medium", "low"]


def test_the_baseline_hospital_stays_within_capacity() -> None:
    """The default scenario is a busy but working hospital: the queue stays short and stock runs out on a minority
    of days, so surge presets have room to look worse."""
    waiting, depleted_days = [], []
    for seed in SEEDS:
        days = _trajectory({}, seed)
        waiting.append(days[-1][0]["waiting"])
        depleted_days += [0 in snap["resource_availability"].values() for snap, _ in days]
    assert mean(waiting) < 5  # measured 0.95
    assert mean(depleted_days) < 0.3  # measured 0.21


def test_the_starting_occupancy_holds_on_day_one() -> None:
    occupancy = [_trajectory({"arrivals": {"rate_per_day": 0}}, seed, days=1)[0][0]["beds_occupied"] for seed in SEEDS]
    assert mean(occupancy) == 24  # 0.6 x 40 beds; nobody seeded at day 0 leaves before day 2
