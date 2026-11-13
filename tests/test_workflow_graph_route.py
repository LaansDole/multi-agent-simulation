"""Integration tests for the GET /api/workflows/{filename}/graph route."""

from pathlib import Path

import pytest


VALID_GRAPH_YAML = """\
version: 0.0.0
vars: {}
graph:
  id: route_test
  description: A workflow for route integration tests.
  is_majority_voting: false
  nodes:
    - id: source
      type: literal
      config:
        content: hello
        role: user
      description: Start
      context_window: 0
      log_output: true
    - id: sink
      type: agent
      config:
        provider: openai
        name: test-model
        role: Report results.
        base_url: http://localhost
        api_key: sk-test
        params: {}
        tooling: null
        thinking: null
        memories: []
      description: End
      context_window: 0
      log_output: true
  edges:
    - from: source
      to: sink
      trigger: true
      carry_data: true
  start:
    - source
  end:
    - sink
"""


@pytest.fixture()
def yaml_file(tmp_yaml_dir: Path) -> str:
    (tmp_yaml_dir / "route_test.yaml").write_text(VALID_GRAPH_YAML, encoding="utf-8")
    return "route_test.yaml"


class TestGetWorkflowGraph:
    def test_returns_normalized_graph(self, client, yaml_file):
        response = client.get(f"/api/workflows/{yaml_file}/graph")
        assert response.status_code == 200
        body = response.json()
        assert body["filename"] == yaml_file
        assert body["graph_id"] == "route_test"
        ids = [n["id"] for n in body["nodes"]]
        assert ids == ["source", "sink"]
        assert any(n["is_agent"] for n in body["nodes"])
        assert len(body["agent_nodes"]) == 1

    def test_missing_file_returns_404(self, client, tmp_yaml_dir):
        response = client.get("/api/workflows/does_not_exist.yaml/graph")
        assert response.status_code == 404

    def test_path_traversal_rejected(self, client, tmp_yaml_dir):
        response = client.get("/api/workflows/..%2Fetc%2Fpasswd/graph")
        assert response.status_code in (400, 404)

    def test_security_error_returns_403(self, client, tmp_yaml_dir):
        # A filename with ".." in the middle bypasses the URL-encoding middleware
        # but is rejected by validate_workflow_filename as a SecurityError (-> 403).
        response = client.get("/api/workflows/foo..bar.yaml/graph")
        assert response.status_code == 403

