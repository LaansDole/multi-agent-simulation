"""functions/edge_processor/dynaclinic_environment.py: day-loop environment state transitions."""

from functions.edge_processor.dynaclinic_environment import (
    inject_day_and_record_admission,
    inject_day_and_start_shift,
    record_discharge,
)


def test_start_shift_cycles_staffing_restocks_and_decays_fatigue() -> None:
    state: dict = {}
    inject_day_and_start_shift("Starting hospital operations", state)
    env = state["environment"]
    assert env["staffing_level"] == "day" and env["bed_occupancy"] == 20 and env["staff_fatigue"] == 0
    assert env["resource_availability"] == {"imaging": 2, "pathology": 3, "pharmacology": 3}

    env["resource_availability"]["imaging"] = 0
    env["staff_fatigue"] = 3
    state["hospital_day_counter"] = 3
    text = inject_day_and_start_shift("Starting hospital operations", state)
    assert env["staffing_level"] == "short" and "Environment: case_mix_context=baseline" in text
    assert env["resource_availability"]["imaging"] == 0  # no restock between restock days
    assert env["staff_fatigue"] == 2

    state["hospital_day_counter"] = 5
    inject_day_and_start_shift("Starting hospital operations", state)
    assert env["case_mix_context"] == "flu_surge" and env["resource_availability"]["imaging"] == 2


def test_admission_and_discharge_move_bed_occupancy() -> None:
    state = {"hospital_day_counter": 1, "environment": {"bed_occupancy": 20}}
    inject_day_and_record_admission("{}", state)
    assert state["environment"]["bed_occupancy"] == 28
    record_discharge("ignored", state)
    assert state["environment"]["bed_occupancy"] == 23
