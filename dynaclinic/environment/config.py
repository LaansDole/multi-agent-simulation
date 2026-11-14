"""Scenario parameters for the DynaClinic hospital environment (spec 2026-11-14 sections 4-5).

A scenario is a preset name plus overrides. resolve_scenario merges presets/baseline.yaml, the preset and the
overrides into one plain dict, validates every value, and returns it with the run's seed.
"""

import random
from pathlib import Path
from typing import Any

import yaml

ACUITIES = ("high", "medium", "low")  # admission priority order
ORGAN_SYSTEMS = ("abdominal", "respiratory", "cardiovascular", "neurological", "renal_metabolic", "infectious")
RESOURCES = ("imaging", "pathology", "pharmacology")
EVENT_KINDS = ("flu_surge", "trauma_cluster")
PRESETS_DIR = Path(__file__).resolve().parent / "presets"
SEED_MAX = 2**53 - 1  # the seed travels through JSON to JavaScript, which rounds larger integers
# Inclusive bounds by dotted key; _bounds covers the rest.
RANGES = {
    "arrivals.rate_per_day": (0, 500),
    "arrivals.age_min": (0, 120),
    "arrivals.age_max": (0, 120),
    "staffing.p_short": (0, 1),
    "staffing.staff_day": (1, 1000),
    "staffing.staff_short": (1, 1000),
    "events.p_start": (0, 1),
    "events.duration_days": (1, 365),
    "beds.capacity": (1, 100_000),
    "beds.start_occupancy": (0, 1),
    "beds.los_sigma": (0, 3),
    "stock.restock_every_days": (1, 365),
    "fatigue.gain_per_load": (0, 10),
    "fatigue.recovery_per_day": (0, 100),
    "fatigue.threshold": (0, 1000),
}
WHOLE = {"arrivals.age_min", "arrivals.age_max", "staffing.staff_day", "staffing.staff_short",
         "events.duration_days", "beds.capacity", "stock.restock_every_days"}


class EnvironmentConfigError(ValueError):
    """An unknown preset, an unknown key or an out-of-range value; the message names the key."""


def presets() -> list[str]:
    """Names of the shipped scenarios."""
    return sorted(path.stem for path in PRESETS_DIR.glob("*.yaml"))


def resolve_scenario(preset: str, overrides: dict[str, Any] | None) -> tuple[dict[str, Any], int]:
    """Merge baseline, preset and overrides (later wins), validate, and return (config, seed).

    Raises:
        EnvironmentConfigError: unknown preset or key, wrong type, value out of range, or bad seed.
    """
    if preset not in presets():
        raise EnvironmentConfigError(f"unknown preset {preset!r}; choose one of {', '.join(presets())}")
    overrides = {} if overrides is None else overrides
    if not isinstance(overrides, dict):
        raise EnvironmentConfigError("overrides must be a mapping")
    overrides = dict(overrides)
    seed = overrides.pop("seed", None)
    config = _read("baseline")
    if preset != "baseline":
        config = _merge(config, _read(preset), "")
    config = _merge(config, overrides, "")
    _validate(config, "")
    _check_relations(config)
    if seed is None:
        seed = random.SystemRandom().randrange(SEED_MAX)
    elif isinstance(seed, bool) or not isinstance(seed, int) or not 0 <= seed <= SEED_MAX:
        raise EnvironmentConfigError(f"seed must be a whole number in [0, {SEED_MAX}], got {seed!r}")
    return config, seed


def _read(name: str) -> dict[str, Any]:
    return yaml.safe_load((PRESETS_DIR / f"{name}.yaml").read_text()) or {}


def _open_key(path: str, key: object) -> bool:
    """Event adjustments may name any organ system or acuity, not only those baseline lists."""
    return (path.startswith("events.") and path.endswith(".organ_weight") and key in ORGAN_SYSTEMS) or (
        path.startswith("events.") and path.endswith(".acuity_weight") and key in ACUITIES)


def _merge(base: dict[str, Any], override: object, path: str) -> dict[str, Any]:
    if not isinstance(override, dict):
        raise EnvironmentConfigError(f"{path or 'overrides'} must be a mapping")
    merged = dict(base)
    for key, value in override.items():
        where = f"{path}.{key}" if path else str(key)
        if key not in base and not _open_key(path, key):
            raise EnvironmentConfigError(f"unknown key {where}")
        if isinstance(base.get(key), dict):
            merged[key] = _merge(base[key], value, where)
        elif isinstance(value, dict):
            raise EnvironmentConfigError(f"{where} must be a number, got a mapping")
        else:
            merged[key] = value
    return merged


def _bounds(where: str) -> tuple[float, float]:
    if where in RANGES:
        return RANGES[where]
    if ".use_prob." in where:
        return (0, 1)
    if where.endswith(".rate_multiplier"):
        return (0, 10)  # with rate_per_day <= 500 this caps a day at a few thousand arrivals
    if where.startswith(("focus.", "beds.los_median_days.")) or ".organ_weight." in where or ".acuity_weight." in where:
        return (0.01, 1000)  # strictly positive: a zero here can leave a weighted draw with nothing to pick
    return (0, 1_000_000)


def _validate(node: dict[str, Any], path: str) -> None:
    for key, value in node.items():
        where = f"{path}.{key}" if path else key
        if isinstance(value, dict):
            _validate(value, where)
        elif where == "events.start_with":
            if value not in ("none", *EVENT_KINDS):
                raise EnvironmentConfigError(
                    f"events.start_with must be one of none, {', '.join(EVENT_KINDS)}; got {value!r}")
        elif isinstance(value, bool) or not isinstance(value, (int, float)):
            raise EnvironmentConfigError(f"{where} must be a number, got {value!r}")
        else:
            low, high = _bounds(where)
            if not low <= value <= high:  # also rejects NaN
                raise EnvironmentConfigError(f"{where}={value} is outside [{low}, {high}]")
            if where in WHOLE or where.startswith("stock.capacity."):
                if value != int(value):
                    raise EnvironmentConfigError(f"{where} must be a whole number, got {value}")
                node[key] = int(value)


def _check_relations(config: dict[str, Any]) -> None:
    arrivals, staffing, events = config["arrivals"], config["staffing"], config["events"]
    if arrivals["age_min"] > arrivals["age_max"]:
        raise EnvironmentConfigError(
            f"arrivals.age_min={arrivals['age_min']} is above arrivals.age_max={arrivals['age_max']}")
    if staffing["staff_short"] > staffing["staff_day"]:
        raise EnvironmentConfigError(
            f"staffing.staff_short={staffing['staff_short']} is above staffing.staff_day={staffing['staff_day']}")
    for key in ("acuity_mix", "organ_mix"):
        if sum(arrivals[key].values()) <= 0:
            raise EnvironmentConfigError(f"arrivals.{key} needs a positive weight")
    if sum(events[kind]["weight"] for kind in EVENT_KINDS) <= 0:
        raise EnvironmentConfigError("events need a positive weight (events.flu_surge.weight or events.trauma_cluster.weight)")
