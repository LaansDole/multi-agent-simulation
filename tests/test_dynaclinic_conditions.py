"""DevAll edge conditions for DynaClinic markers, loaded the way the runtime loads functions/edge."""

import pytest

from tests.dynaclinic_fixtures import no_network  # noqa: F401
from utils.function_manager import EDGE_FUNCTION_DIR, FunctionManager

NAMES = (
    "dc_route_low", "dc_route_team", "dc_mode_collaborative", "dc_mode_adversarial", "dc_gate_pass", "dc_gate_blocked",
)
_EDGE_FUNCTIONS = FunctionManager(EDGE_FUNCTION_DIR)


def _fired(text: str) -> set[str]:
    return {name for name in NAMES if _EDGE_FUNCTIONS.get_function(name)(text)}


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("ROUTE: LOW\nTriage: LLM tier LOW.", {"dc_route_low"}),
        ("ROUTE: MODERATE", {"dc_route_team"}),
        ("ROUTE: HIGH\n", {"dc_route_team"}),
        ("MODE: COLLABORATIVE\nDivergence 0.02", {"dc_mode_collaborative"}),
        ("MODE: ADVERSARIAL", {"dc_mode_adversarial"}),
        ("GATE: PASS\nFINAL ANSWER: B", {"dc_gate_pass"}),
        ("GATE: BLOCKED\nBLOCKED FOR MANUAL REVIEW", {"dc_gate_blocked"}),
        ("\n\n  **Route:** low  \n", {"dc_route_low"}),
        ("ROUTE: LOWER", set()),
        ("STAGE: synthesizer\nFINAL ANSWER: B", set()),
        ("", set()),
    ],
)
def test_each_condition_fires_only_on_its_first_line_marker(text: str, expected: set[str]) -> None:
    assert _fired(text) == expected


def test_regression_substring_does_not_route() -> None:
    text = "ROUTE: HIGH\nThe case is not LOW complexity.\nMODE: ADVERSARIAL\nGATE: PASS\nROUTE: LOW"
    assert _fired(text) == {"dc_route_team"}
    assert _fired("Specialists reached MODE: COLLABORATIVE, so GATE: PASS") == set()
