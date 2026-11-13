"""graph.demo_scenarios: optional plain-text task prompts in the workflow YAML, served by GET /api/workflows/{filename}/scenarios."""

from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from entity.configs import ConfigError, DesignConfig

PLAIN_YAML = """\
graph:
  id: plain
  nodes:
    - id: only
      type: literal
      config:
        content: hello
        role: user
  start: [only]
"""


def _graph(scenarios: Any) -> Any:
    return DesignConfig.from_dict({"graph": {"id": "g", "demo_scenarios": scenarios}}).graph


def test_scenarios_parse_with_optional_teaches() -> None:
    graph = _graph([{"id": "a", "title": "A", "teaches": "routing", "text": "case a\n"}, {"id": "b", "title": "B", "text": "case b"}])
    assert [(s.id, s.title, s.teaches, s.text) for s in graph.demo_scenarios] == [
        ("a", "A", "routing", "case a\n"),
        ("b", "B", "", "case b"),
    ]


def test_absent_key_means_no_scenarios() -> None:
    assert DesignConfig.from_dict({"graph": {"id": "g"}}).graph.demo_scenarios == []


@pytest.mark.parametrize(
    ("scenarios", "path"),
    [
        ("not a list", "root.graph.demo_scenarios"),
        ({"id": "a", "title": "A", "text": "t"}, "root.graph.demo_scenarios"),
        (["just text"], "root.graph.demo_scenarios[0]"),
        ([{"title": "A", "text": "t"}], "root.graph.demo_scenarios[0].id"),
        ([{"id": "a", "text": "t"}], "root.graph.demo_scenarios[0].title"),
        ([{"id": "a", "title": "A"}], "root.graph.demo_scenarios[0].text"),
        ([{"id": "a", "title": "A", "text": "  "}], "root.graph.demo_scenarios[0].text"),
        ([{"id": "a", "title": "A", "teaches": 3, "text": "t"}], "root.graph.demo_scenarios[0].teaches"),
        ([{"id": "a", "title": "A", "text": "t"}, {"id": "a", "title": "B", "text": "u"}], "root.graph.demo_scenarios[1].id"),
    ],
)
def test_invalid_scenarios_raise_with_path(scenarios: Any, path: str) -> None:
    with pytest.raises(ConfigError) as excinfo:
        _graph(scenarios)
    assert excinfo.value.path == path


def test_endpoint_serves_the_dynaclinic_scenarios(client: TestClient) -> None:
    response = client.get("/api/workflows/dynaclinic_mvp.yaml/scenarios")
    assert response.status_code == 200
    scenarios = response.json()
    assert all(set(s) == {"id", "title", "teaches", "text"} and s["title"] and s["teaches"] and s["text"] for s in scenarios)


def test_endpoint_returns_empty_list_without_the_key(client: TestClient, tmp_yaml_dir: Path) -> None:
    (tmp_yaml_dir / "plain.yaml").write_text(PLAIN_YAML, encoding="utf-8")
    response = client.get("/api/workflows/plain.yaml/scenarios")
    assert response.status_code == 200 and response.json() == []


@pytest.mark.parametrize(("filename", "status"), [("missing.yaml", 404), ("foo..bar.yaml", 403)])
def test_endpoint_rejects_unknown_or_unsafe_files(client: TestClient, tmp_yaml_dir: Path, filename: str, status: int) -> None:
    assert client.get(f"/api/workflows/{filename}/scenarios").status_code == status
