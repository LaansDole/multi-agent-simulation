"""Shared fixtures for DynaClinic tests.

Every ``tests/test_dynaclinic_*.py`` module imports ``no_network`` so that any
attempt to open a socket fails the test instead of silently reaching a server.
"""

import socket
from typing import Any

import pytest


class NetworkBlockedError(RuntimeError):
    """Raised when a DynaClinic test tries to open a network connection."""


@pytest.fixture(autouse=True)
def no_network(monkeypatch: pytest.MonkeyPatch) -> None:
    """Make every outbound socket connection raise ``NetworkBlockedError``."""

    def _blocked(self: socket.socket, *args: Any, **kwargs: Any) -> None:
        raise NetworkBlockedError(f"network access attempted in a DynaClinic test: {args!r}")

    monkeypatch.setattr(socket.socket, "connect", _blocked)
    monkeypatch.setattr(socket.socket, "connect_ex", _blocked)
