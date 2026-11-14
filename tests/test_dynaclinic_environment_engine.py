"""dynaclinic/environment: scenario validation, and the seeded engine's patterns and invariants
(spec 2026-11-14 section 8)."""

import pytest

from dynaclinic.environment.config import SEED_MAX, EnvironmentConfigError, presets, resolve_scenario


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
    ("baseline", {"arrivals": {"rate_per_day": {"x": 1}}}, "arrivals.rate_per_day must be a number"),
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
