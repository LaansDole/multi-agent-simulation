"""functions/edge_processor/dynaclinic_environment.py: the adapter between the seeded engine and the day loop."""

import json
import random

import pytest

from dynaclinic.environment.config import resolve_scenario
from dynaclinic.environment.engine import initial_state, snapshot, step_day
from functions.edge_processor.dynaclinic_environment import (
    ENGINE_KEY,
    inject_day_and_attach_environment,
    inject_day_and_flag_governance,
    inject_day_and_start_shift,
)

FLU_7 = 'Starting hospital operations\nScenario: {"preset": "flu_surge", "overrides": {"seed": 7}}'


def _payload(text: str) -> dict:
    [line] = [line for line in text.splitlines() if line.startswith("Environment: ")]
    return json.loads(line.removeprefix("Environment: "))


def test_day_one_reports_a_replayable_scenario_and_later_days_only_the_state() -> None:
    state: dict = {}
    day_one = inject_day_and_start_shift(FLU_7, state)
    assert day_one.startswith("Day 1: Starting hospital operations\nEnvironment: {") and "Scenario:" not in day_one
    first = _payload(day_one)
    config, _ = resolve_scenario("flu_surge", {"seed": 7})
    assert (first.pop("preset"), first.pop("seed"), first.pop("config")) == ("flu_surge", 7, config)
    state["hospital_day_counter"] = 2
    second = _payload(inject_day_and_start_shift(FLU_7, state))
    assert not {"preset", "seed", "config"} & set(second)
    # Nothing ran between the days, so the pure engine on the same seed replays both payloads exactly.
    rng = random.Random(7)
    replay = initial_state(config, rng)
    assert [first, second] == [snapshot(step_day(replay, config, rng), config) for _ in range(2)]
    assert state["environment"] == second


def test_the_next_day_continues_from_the_consults_stock_and_fatigue() -> None:
    quiet = ('Starting hospital operations\nScenario: {"preset": "baseline", "overrides": '
             '{"seed": 3, "arrivals": {"rate_per_day": 0}, "stock": {"restock_every_days": 10}}}')
    state: dict = {}
    inject_day_and_start_shift(quiet, state)
    environment = state["environment"]
    environment["resource_availability"]["imaging"] = 0  # what dc_care_team does during a consult
    environment["staff_fatigue"] = 3
    state["hospital_day_counter"] = 2
    inject_day_and_start_shift(quiet, state)
    assert environment["resource_availability"]["imaging"] == 0  # no arrivals, no restock until day 11
    assert environment["staff_fatigue"] == 2  # 3 - 1 recovery, no load


@pytest.mark.parametrize("line", [
    'Scenario: {"preset": "monsoon", "overrides": {}}',
    'Scenario: {"preset": "baseline", "overrides": {"beds": {"capacity": 0}}}',
    "Scenario: {\"preset\": \"baseline\", \"overrides\": {'seed': 7}}",  # a dict inserted with str(), not JSON
    'Scenario: {"preset": "baseline", "extra": 1}',
])
def test_an_invalid_scenario_drops_the_day_and_says_why(line: str, caplog: pytest.LogCaptureFixture) -> None:
    state: dict = {}
    assert inject_day_and_start_shift(f"Starting hospital operations\n{line}", state) is None
    assert ENGINE_KEY not in state and "invalid scenario" in caplog.text


def test_without_a_scenario_line_the_baseline_runs_and_its_seed_is_logged(caplog: pytest.LogCaptureFixture) -> None:
    payload = _payload(inject_day_and_start_shift("Starting hospital operations", {}))
    assert payload["preset"] == "baseline" and f"seed {payload['seed']}" in caplog.text


def test_the_daily_summary_input_carries_the_days_environment() -> None:
    state = {"hospital_day_counter": 4, "environment": {"day": 4, "waiting": 2}}
    assert inject_day_and_attach_environment('{"patient_name": "Ana"}', state) == (
        'Day 4: {"patient_name": "Ana"}\nEnvironment: {"day":4,"waiting":2}')
    assert inject_day_and_attach_environment("x", {"hospital_day_counter": 1}) == "Day 1: x"


def test_flag_governance_reads_the_rendered_report_markers() -> None:
    adversarial = ("DynaClinic report (GATE: PASS)\n\nSafety gates:\n- A_SAD: pass\n\n"
                   "Meta-Controller: MODE ADVERSARIAL, C=0.80, U=0.70\n\nAssessment and plan:\nASSESSMENT: ...")
    state = {"hospital_day_counter": 2}
    text = inject_day_and_flag_governance(adversarial, state)
    assert text.startswith("Day 2: DynaClinic report (GATE: PASS)")
    assert text.endswith("\n\nGovernance note: Day 2: adversarial mode - flagged for protocol review "
                         "(not enforced, prototype).")

    blocked = ("DynaClinic report (GATE: BLOCKED)\n\nSafety gates:\n- T_SAD: FAIL\n\n"
               "Meta-Controller: MODE COLLABORATIVE, C=0.60, U=0.10\n\nAnswer:\nFINAL ANSWER: A")
    state = {"hospital_day_counter": 3}
    assert "Governance note: Day 3: gate blocked" in inject_day_and_flag_governance(blocked, state)

    clean = ("DynaClinic report (GATE: PASS)\n\nSafety gates:\n- A_SAD: pass\n\n"
             "Meta-Controller: MODE COLLABORATIVE, C=0.40, U=0.10\n\nAnswer:\nFINAL ANSWER: B")
    state = {"hospital_day_counter": 1}
    assert inject_day_and_flag_governance(clean, state) == f"Day 1: {clean}"

    quoting = ("DynaClinic report (GATE: PASS)\n\nSafety gates:\n- A_SAD: pass\n\n"
               "Meta-Controller: MODE COLLABORATIVE, C=0.40, U=0.10\n\nAnswer:\n"
               "Earlier draft said Meta-Controller: MODE ADVERSARIAL.\nFINAL ANSWER: B")
    assert inject_day_and_flag_governance(quoting, {"hospital_day_counter": 1}) == f"Day 1: {quoting}"
