"""Register built-in memory stores."""

from dataclasses import replace
from pathlib import Path

from entity.configs.node.memory import (
    BlackboardMemoryConfig,
    FileMemoryConfig,
    Mem0MemoryConfig,
    SimpleMemoryConfig,
    MemoryStoreConfig,
)
from runtime.node.agent.memory.blackboard_memory import BlackboardMemory
from runtime.node.agent.memory.file_memory import FileMemory
from runtime.node.agent.memory.memory_base import MemoryBase
from runtime.node.agent.memory.simple_memory import SimpleMemory
from runtime.node.agent.memory.registry import register_memory_store, get_memory_store_registration

register_memory_store(
    "simple",
    config_cls=SimpleMemoryConfig,
    factory=lambda store: SimpleMemory(store),
    summary="In-memory store that resets between runs; best for testing",
)

register_memory_store(
    "file",
    config_cls=FileMemoryConfig,
    factory=lambda store: FileMemory(store),
    summary="Persists documents on disk and supports embedding search",
)

register_memory_store(
    "blackboard",
    config_cls=BlackboardMemoryConfig,
    factory=lambda store: BlackboardMemory(store),
    summary="Shared blackboard memory allowing multiple nodes to read/write",
)


def _create_mem0_memory(store):
    from runtime.node.agent.memory.mem0_memory import Mem0Memory
    return Mem0Memory(store)


register_memory_store(
    "mem0",
    config_cls=Mem0MemoryConfig,
    factory=_create_mem0_memory,
    summary="Mem0 managed memory with semantic search and graph relationships",
)

RUN_DIR_PLACEHOLDER = "{{run_dir}}"
_PATH_FIELDS = ("memory_path", "index_path")


def resolve_run_dir(store: MemoryStoreConfig, run_dir: Path) -> MemoryStoreConfig:
    """Return ``store`` with ``{{run_dir}}`` in its path fields replaced by ``run_dir``.

    Covers every store config exposing ``memory_path`` or ``index_path``. The input
    config is not mutated, so a design reused for several runs keeps its placeholder.
    """
    config = store.config
    changes = {
        name: value.replace(RUN_DIR_PLACEHOLDER, str(run_dir))
        for name in _PATH_FIELDS
        if isinstance(value := getattr(config, name, None), str) and RUN_DIR_PLACEHOLDER in value
    }
    if not changes:
        return store
    return replace(store, config=replace(config, **changes))


class MemoryFactory:
    @staticmethod
    def create_memory(store: MemoryStoreConfig, *, run_dir: Path) -> MemoryBase:
        registration = get_memory_store_registration(store.type)
        return registration.factory(resolve_run_dir(store, run_dir))
