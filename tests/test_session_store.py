"""Unit tests for server.services.session_store."""

from server.services.session_store import SessionStatus, WorkflowSessionStore


class TestWorkflowSessionStore:

    def _make_store(self) -> WorkflowSessionStore:
        return WorkflowSessionStore()

    def test_create_and_get(self):
        store = self._make_store()
        session = store.create_session(
            yaml_file="test.yaml",
            task_prompt="hello",
            session_id="s1",
        )
        assert session.session_id == "s1"
        assert store.get_session("s1") is session
        assert store.has_session("s1") is True

    def test_get_missing_returns_none(self):
        store = self._make_store()
        assert store.get_session("nope") is None
        assert store.has_session("nope") is False

    def test_update_status(self):
        store = self._make_store()
        store.create_session(yaml_file="w.yaml", task_prompt="p", session_id="s1")
        store.update_session_status("s1", SessionStatus.RUNNING)
        session = store.get_session("s1")
        assert session.status == SessionStatus.RUNNING

    def test_set_error(self):
        store = self._make_store()
        store.create_session(yaml_file="w.yaml", task_prompt="p", session_id="s1")
        store.set_session_error("s1", "boom")
        session = store.get_session("s1")
        assert session.status == SessionStatus.ERROR
        assert session.error_message == "boom"

    def test_complete_session(self):
        store = self._make_store()
        store.create_session(yaml_file="w.yaml", task_prompt="p", session_id="s1")
        store.complete_session("s1", {"output": "done"})
        session = store.get_session("s1")
        assert session.status == SessionStatus.COMPLETED
        assert session.results == {"output": "done"}

    def test_pop_session(self):
        store = self._make_store()
        store.create_session(yaml_file="w.yaml", task_prompt="p", session_id="s1")
        popped = store.pop_session("s1")
        assert popped is not None
        assert popped.session_id == "s1"
        assert store.get_session("s1") is None

    def test_pop_missing_returns_none(self):
        store = self._make_store()
        assert store.pop_session("missing") is None

    def test_get_session_info(self):
        store = self._make_store()
        store.create_session(yaml_file="w.yaml", task_prompt="p", session_id="s1")
        info = store.get_session_info("s1")
        assert info["session_id"] == "s1"
        assert info["yaml_file"] == "w.yaml"
        assert info["status"] == "idle"

    def test_list_sessions(self):
        store = self._make_store()
        store.create_session(yaml_file="a.yaml", task_prompt="p", session_id="s1")
        store.create_session(yaml_file="b.yaml", task_prompt="q", session_id="s2")
        sessions = store.list_sessions()
        assert len(sessions) == 2
        assert "s1" in sessions
        assert "s2" in sessions

    def test_create_session_with_attachments(self):
        store = self._make_store()
        session = store.create_session(
            yaml_file="w.yaml",
            task_prompt="p",
            session_id="s1",
            attachments=["file1.txt", "file2.txt"],
        )
        assert session.task_attachments == ["file1.txt", "file2.txt"]
