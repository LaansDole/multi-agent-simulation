"""workflow_completed event: ``final_text`` carries the end node's output, ``summary`` is kept."""

import asyncio
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock

import pytest

from server.services import workflow_run_service
from server.services.session_store import WorkflowSessionStore
from server.services.workflow_run_service import WorkflowRunService

FLOW = """\
version: 0.4.0
graph:
  id: final_text_flow
  start: [Intake]
  end: [Report]
  nodes:
    - id: Intake
      type: passthrough
      config: {{}}
    - id: Report
      type: template
      config:
        template: "REPORT: {{{{ input }}}}"
  edges:
    - from: Intake
      to: Report
{condition}
"""
# Keeps Report from ever running, so the end node has no output.
NEVER = "      condition: {type: keyword, config: {any: [NEVER_IN_THE_PROMPT]}}"


class RecordingManager:
    """Fake WebSocketManager that records every message sent to the session."""

    def __init__(self) -> None:
        self.messages: list[dict[str, Any]] = []

    async def send_message(self, session_id: str, message: dict[str, Any]) -> None:
        self.messages.append(message)

    def send_message_sync(self, session_id: str, message: dict[str, Any]) -> None:
        self.messages.append(message)


def _completed(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, condition: str) -> dict[str, Any]:
    monkeypatch.setattr(workflow_run_service, "YAML_DIR", tmp_path)
    monkeypatch.setattr(workflow_run_service, "WARE_HOUSE_DIR", tmp_path / "WareHouse")
    (tmp_path / "flow.yaml").write_text(FLOW.format(condition=condition), encoding="utf-8")
    manager = RecordingManager()
    service = WorkflowRunService(WorkflowSessionStore(), MagicMock(), MagicMock())
    asyncio.run(service.start_workflow("session_final_text", "flow.yaml", "chest pain", manager))
    completed = [m["data"] for m in manager.messages if m["type"] == "workflow_completed"]
    assert len(completed) == 1, [m for m in manager.messages if m["type"] == "error"]
    return completed[0]


def test_final_text_is_end_node_output_and_summary_is_kept(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    data = _completed(tmp_path, monkeypatch, "")
    assert data["final_text"] == "REPORT: chest pain"
    assert data["summary"].startswith("Workflow finished with")


def test_final_text_falls_back_to_summary_without_end_output(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    data = _completed(tmp_path, monkeypatch, NEVER)
    assert data["final_text"] == data["summary"]
    assert data["summary"].startswith("Workflow finished with")
