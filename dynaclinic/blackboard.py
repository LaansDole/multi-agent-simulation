"""L3 shared Blackboard: append-only, per-agent entries, read-all view."""

import copy
import threading
from typing import get_args

from dynaclinic.types import BlackboardEntry, EntryKind

KINDS: tuple[str, ...] = get_args(EntryKind)


class Blackboard:
    """Append-only shared workspace for the Integrated Care Team.

    Entries are copied on write and on read, so no agent can change an entry after it
    is posted (its own or another agent's). Writes are thread-safe for concurrent specialists.
    """

    def __init__(self) -> None:
        self._entries: list[BlackboardEntry] = []
        self._lock = threading.Lock()

    def __len__(self) -> int:
        return len(self._entries)

    def write(self, entry: BlackboardEntry) -> None:
        """Append a copy of ``entry``."""
        if entry.kind not in KINDS:
            raise ValueError(f"unknown blackboard entry kind {entry.kind!r}; expected one of {KINDS}")
        stored = copy.deepcopy(entry)
        with self._lock:
            self._entries.append(stored)

    def entries(self, agent: str | None = None, kind: str | None = None) -> list[BlackboardEntry]:
        """Return copies of entries in append order, optionally filtered by agent and/or kind."""
        with self._lock:
            selected = [
                e for e in self._entries if (agent is None or e.agent == agent) and (kind is None or e.kind == kind)
            ]
        return copy.deepcopy(selected)

    def snapshot(self, agent: str | None = None, kind: str | None = None) -> str:
        """Render (filtered) entries as prompt text."""
        lines = []
        for entry in self.entries(agent, kind):
            lines.append(f"[step {entry.step}] {entry.agent} ({entry.kind}): {entry.content}")
            if entry.distribution:
                dist = ", ".join(f"{letter}={p:.2f}" for letter, p in sorted(entry.distribution.items()))
                lines.append(f"  distribution: {dist}")
            if entry.claims:
                lines.append("  claims:")
                lines.extend(f"  - {claim}" for claim in entry.claims)
        return "\n".join(lines) or "(blackboard is empty)"
