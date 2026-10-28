"""The edge key is ``process:``; ``processor:`` was silently ignored and is now a config error."""

from pathlib import Path
from typing import Any, Iterator

import pytest
import yaml

from entity.configs import ConfigError
from entity.configs.edge.edge import EdgeConfig

REPO_ROOT = Path(__file__).resolve().parents[1]


@pytest.mark.parametrize(
    "value",
    [None, {"type": "template", "config": {"template": "{{ input }}"}}],
    ids=["null", "template"],
)
def test_processor_key_is_rejected_naming_the_edge_path(value: Any) -> None:
    with pytest.raises(ConfigError) as excinfo:
        EdgeConfig.from_dict({"from": "A", "to": "B", "processor": value}, path="graph.edges[2]")
    assert excinfo.value.path == "graph.edges[2].processor"
    assert "use 'process'" in str(excinfo.value)


def _edge_processor_keys(node: Any, where: str) -> Iterator[str]:
    if isinstance(node, dict):
        if "from" in node and "to" in node and "processor" in node:
            yield where
        for key, value in node.items():
            yield from _edge_processor_keys(value, f"{where}.{key}")
    elif isinstance(node, list):
        for idx, item in enumerate(node):
            yield from _edge_processor_keys(item, f"{where}[{idx}]")


def test_no_shipped_yaml_uses_the_edge_processor_key() -> None:
    paths = sorted(
        path
        for folder in ("yaml_instance", "yaml_template")
        for pattern in ("*.yaml", "*.yml")
        for path in (REPO_ROOT / folder).rglob(pattern)
    )
    assert paths
    offenders = [
        f"{path.relative_to(REPO_ROOT)}:{hit}"
        for path in paths
        for hit in _edge_processor_keys(yaml.safe_load(path.read_text(encoding="utf-8")), "")
    ]
    assert offenders == []
