"""``{{run_dir}}`` in a memory store path resolves to each run's output directory."""

from pathlib import Path
from typing import Any, Callable, Dict, Tuple

import pytest

from entity.configs import DesignConfig
from entity.graph_config import GraphConfig
from runtime.bootstrap.schema import ensure_schema_registry_populated
from runtime.node.agent.memory import MemoryBase
from workflow.graph import GraphExecutor
from workflow.graph_context import GraphContext

ensure_schema_registry_populated()

# store type -> (config builder taking (path, file_source_dir), attribute holding the resolved path)
STORES: Dict[str, Tuple[Callable[[str, str], Dict[str, Any]], str]] = {
    "simple": (lambda path, _src: {"memory_path": path}, "memory_path"),
    "file": (lambda path, src: {"index_path": path, "file_sources": [{"path": src}]}, "index_path"),
    "blackboard": (lambda path, _src: {"memory_path": path}, "memory_path"),
}


@pytest.fixture(autouse=True)
def _isolated_cwd(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """An unresolved placeholder would otherwise create a literal ``{{run_dir}}`` folder in the repo."""
    monkeypatch.chdir(tmp_path)


def _design(tmp_path: Path, store_type: str, path: str) -> DesignConfig:
    sources = tmp_path / "sources"
    sources.mkdir(exist_ok=True)
    build, _ = STORES[store_type]
    return DesignConfig.from_dict(
        {
            "graph": {
                "id": "run_dir_memory",
                "nodes": [{"id": "only", "type": "literal", "config": {"content": "hi", "role": "user"}}],
                "start": ["only"],
                "memory": [{"name": "store", "type": store_type, "config": build(path, str(sources))}],
            }
        }
    )


def _build_store(design: DesignConfig, root: Path, session: str) -> Tuple[Path, MemoryBase]:
    config = GraphConfig.from_definition(design.graph, name=session, output_root=root)
    executor = GraphExecutor(GraphContext(config=config))
    executor._build_global_memories()
    return executor.graph.directory, executor.global_memories["store"]


@pytest.mark.parametrize("store_type", sorted(STORES))
def test_placeholder_resolves_to_the_run_directory(tmp_path: Path, store_type: str) -> None:
    design = _design(tmp_path, store_type, "{{run_dir}}/mem/store.json")
    run_dir, store = _build_store(design, tmp_path / "WareHouse", "session_one")
    assert run_dir == tmp_path / "WareHouse" / "session_one"
    assert getattr(store, STORES[store_type][1]) == str(run_dir / "mem" / "store.json")


@pytest.mark.parametrize("store_type", sorted(STORES))
def test_path_without_placeholder_is_shared_across_runs(tmp_path: Path, store_type: str) -> None:
    shared = str(tmp_path / "shared" / "store.json")
    design = _design(tmp_path, store_type, shared)
    _, store = _build_store(design, tmp_path / "WareHouse", "session_one")
    assert getattr(store, STORES[store_type][1]) == shared


def test_each_run_from_one_design_gets_its_own_directory(tmp_path: Path) -> None:
    design = _design(tmp_path, "simple", "{{run_dir}}/store.json")
    first_dir, first = _build_store(design, tmp_path / "WareHouse", "session_one")
    second_dir, second = _build_store(design, tmp_path / "WareHouse", "session_two")
    assert first.memory_path == str(first_dir / "store.json")
    assert second.memory_path == str(second_dir / "store.json")
