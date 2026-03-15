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


def rlm_prompt_ladder_by_pass(data: str, global_state: Dict[str, Any]) -> str:
    """Return a deterministic RLM prompt based on loop pass count.

    The function reads loop-counter state from ``global_state['loop_counter']['LoopGate']``
    and maps passes 1..5 to the progressive RLM prompt ladder.
    """

    loop_state = global_state.get("loop_counter", {})
    gate_state = loop_state.get("LoopGate", {}) if isinstance(loop_state, dict) else {}
    count = gate_state.get("count", 1) if isinstance(gate_state, dict) else 1

    ladder = {
        1: "Summarize what memory currently stores about RLM behavior.",
        2: "Group stored memory notes into 2-3 themes and explain each theme.",
        3: "Find conflicting claims across stored memory notes and explain why they conflict.",
        4: "Identify how conclusions about RLM memory changed over time.",
        5: "For each major claim, ask one follow-up question and answer it using stored memory evidence only.",
    }

    prompt = ladder.get(count, ladder[5])
    return f"[Prompt Tier {min(max(int(count), 1), 5)}] {prompt}"
