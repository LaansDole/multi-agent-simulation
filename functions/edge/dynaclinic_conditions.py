"""Edge conditions for the DynaClinic node markers (``dynaclinic.devall_nodes``).

Each reads ONLY the anchored ``KEY: VALUE`` marker on the first non-empty line, so a keyword later in
the text ("COMPLEXITY: HIGH ... not LOW") never routes.
"""

from dynaclinic.parsing import first_line_marker


def dc_route_low(data: str) -> bool:
    """Triage routed the case to the Primary Care Agent (``ROUTE: LOW``)."""
    return first_line_marker(data, "ROUTE") == "LOW"


def dc_route_team(data: str) -> bool:
    """Triage routed the case to the Integrated Care Team (``ROUTE: MODERATE`` or ``ROUTE: HIGH``)."""
    return first_line_marker(data, "ROUTE") in {"MODERATE", "HIGH"}


def dc_mode_collaborative(data: str) -> bool:
    """The care team agrees (``MODE: COLLABORATIVE``): go straight to the Synthesizer."""
    return first_line_marker(data, "MODE") == "COLLABORATIVE"


def dc_mode_adversarial(data: str) -> bool:
    """The care team diverges (``MODE: ADVERSARIAL``): go to the Clinical Critic."""
    return first_line_marker(data, "MODE") == "ADVERSARIAL"


def dc_gate_pass(data: str) -> bool:
    """Every safety gate passed (``GATE: PASS``)."""
    return first_line_marker(data, "GATE") == "PASS"


def dc_gate_blocked(data: str) -> bool:
    """A safety gate still fails after regeneration (``GATE: BLOCKED``)."""
    return first_line_marker(data, "GATE") == "BLOCKED"
