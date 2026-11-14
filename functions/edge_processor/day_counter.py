"""Day counter edge processor for hospital workflow."""

from typing import Dict, Any


def increment_day_counter(data: str, global_state: Dict[str, Any]) -> str:
    counter_key = "hospital_day_counter"
    current_day = global_state.get(counter_key, 0) + 1
    global_state[counter_key] = current_day

    return f"Day {current_day}: {data}"


def inject_day_to_message(data: str, global_state: Dict[str, Any]) -> str:
    counter_key = "hospital_day_counter"
    # Initialize to 1 if doesn't exist (first execution)
    if counter_key not in global_state:
        global_state[counter_key] = 1
    current_day = global_state[counter_key]
    return f"Day {current_day}: {data}"


def reset_day_counter(data: str, global_state: Dict[str, Any]) -> str:
    global_state["hospital_day_counter"] = 0
    return data
