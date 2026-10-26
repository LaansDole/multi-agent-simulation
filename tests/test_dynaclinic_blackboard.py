"""Tests for dynaclinic.blackboard."""

from concurrent.futures import ThreadPoolExecutor

import pytest

from dynaclinic.blackboard import Blackboard
from dynaclinic.types import BlackboardEntry
from tests.dynaclinic_fixtures import no_network  # noqa: F401


def _board() -> Blackboard:
    board = Blackboard()
    board.write(BlackboardEntry("Imaging", "finding", "No consolidation.", {"B": 0.3, "A": 0.7}, ["clear lungs"], 1))
    board.write(BlackboardEntry("Pharmacology", "finding", "On warfarin.", {"A": 0.2, "B": 0.8}, [], 1))
    board.write(BlackboardEntry("Critic", "critique", "Claim 2 unsupported.", step=2))
    return board


def test_entries_keep_append_order_and_filter() -> None:
    board = _board()
    assert len(board) == 3
    assert [e.agent for e in board.entries()] == ["Imaging", "Pharmacology", "Critic"]
    assert [e.agent for e in board.entries(kind="finding")] == ["Imaging", "Pharmacology"]
    assert [e.content for e in board.entries(agent="Critic")] == ["Claim 2 unsupported."]
    assert board.entries(agent="Imaging", kind="critique") == []


def test_entries_cannot_be_mutated_through_reads_or_the_written_object() -> None:
    board = Blackboard()
    original = BlackboardEntry("Imaging", "finding", "x", {"A": 1.0}, ["c"], 1)
    board.write(original)
    original.content = "rewritten by caller"
    original.claims.append("injected")
    read = board.entries()[0]
    read.distribution["A"] = 0.0
    read.claims.clear()
    stored = board.entries()[0]
    assert (stored.content, stored.distribution, stored.claims) == ("x", {"A": 1.0}, ["c"])


def test_write_rejects_unknown_kind() -> None:
    with pytest.raises(ValueError, match="kind"):
        Blackboard().write(BlackboardEntry("Imaging", "gossip", "x"))  # type: ignore[arg-type]


def test_concurrent_writes_are_all_kept() -> None:
    board = Blackboard()
    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(lambda i: board.write(BlackboardEntry(f"agent{i % 3}", "finding", str(i))), range(400)))
    assert len(board) == 400
    assert sorted(int(e.content) for e in board.entries()) == list(range(400))


def test_snapshot_renders_entries_for_prompts() -> None:
    assert _board().snapshot(kind="finding") == (
        "[step 1] Imaging (finding): No consolidation.\n"
        "  distribution: A=0.70, B=0.30\n"
        "  claims:\n"
        "  - clear lungs\n"
        "[step 1] Pharmacology (finding): On warfarin.\n"
        "  distribution: A=0.20, B=0.80"
    )
    assert Blackboard().snapshot() == "(blackboard is empty)"
