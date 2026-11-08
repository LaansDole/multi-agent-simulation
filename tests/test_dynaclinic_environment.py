"""functions/edge_processor/dynaclinic_environment.py: day-loop environment state transitions."""

from functions.edge_processor.dynaclinic_environment import (
    inject_day_and_flag_governance,
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


def test_flag_governance_reads_the_rendered_report_markers() -> None:
    adversarial = ("DynaClinic report (GATE: PASS)\n\nSafety gates:\n- A_SAD: pass\n\n"
                   "Meta-Controller: MODE ADVERSARIAL, C=0.80, U=0.70\n\nAssessment and plan:\nASSESSMENT: ...")
    state = {"hospital_day_counter": 2}
    text = inject_day_and_flag_governance(adversarial, state)
    assert text.startswith("Day 2: DynaClinic report (GATE: PASS)")
    assert text.endswith("\n\nGovernance note: Day 2: adversarial mode - flagged for protocol review "
                         "(not enforced, prototype).")
    assert state["governance_notes"] == ["Day 2: adversarial mode - flagged for protocol review "
                                         "(not enforced, prototype)."]

    blocked = ("DynaClinic report (GATE: BLOCKED)\n\nSafety gates:\n- T_SAD: FAIL\n\n"
               "Meta-Controller: MODE COLLABORATIVE, C=0.60, U=0.10\n\nAnswer:\nFINAL ANSWER: A")
    state = {"hospital_day_counter": 3}
    assert "Governance note: Day 3: gate blocked" in inject_day_and_flag_governance(blocked, state)

    clean = ("DynaClinic report (GATE: PASS)\n\nSafety gates:\n- A_SAD: pass\n\n"
             "Meta-Controller: MODE COLLABORATIVE, C=0.40, U=0.10\n\nAnswer:\nFINAL ANSWER: B")
    state = {"hospital_day_counter": 1}
    assert inject_day_and_flag_governance(clean, state) == f"Day 1: {clean}"
    assert "governance_notes" not in state
