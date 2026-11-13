"""Unit tests for server.state module.

Imports are deferred to avoid triggering the circular import chain
check.check -> runtime -> check.check during collection.
"""

import pytest

from utils.exceptions import ValidationError


class TestGetWebsocketManager:

    def test_singleton(self):
        from server.state import get_websocket_manager

        m1 = get_websocket_manager()
        m2 = get_websocket_manager()
        assert m1 is m2


class TestEnsureKnownSession:

    def test_empty_session_id_raises(self):
        from server.state import ensure_known_session

        with pytest.raises(ValidationError, match="not connected"):
            ensure_known_session("")

    def test_unknown_session_id_raises(self):
        from server.state import ensure_known_session

        with pytest.raises(ValidationError, match="not connected"):
            ensure_known_session("nonexistent-session-id")
