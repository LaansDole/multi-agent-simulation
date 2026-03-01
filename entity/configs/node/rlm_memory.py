"""Configuration for RLM memory nodes."""

from dataclasses import dataclass
from typing import Any, Mapping

from entity.configs.base import (
    BaseConfig,
    ConfigError,
    ConfigFieldSpec,
    optional_str,
    require_mapping,
    require_str,
    extend_path,
)


@dataclass
class RLMMemoryConfig(BaseConfig):
    """Configuration for RLM memory retrieval nodes.

    This node retrieves memory items and exposes them as Python variables
    in an RLM REPL context, allowing programmatic exploration of memory.
    """

    memory_store: str
    query: str = ""
    limit: int = 10
    time_decay: float = 1.0
    max_iterations: int = 10
    max_depth: int = 1
    model: str = "gpt-4o"
    backend: str = "openai"
    persist_env: bool = False

    @classmethod
    def from_dict(
        cls, data: Mapping[str, Any] | None, *, path: str
    ) -> "RLMMemoryConfig":
        if data is None:
            raise ConfigError("RLM memory node requires configuration", path)

        mapping = require_mapping(data, path)

        memory_store = require_str(mapping, "memory_store", path)
        query = optional_str(mapping, "query", path) or ""

        limit_value = mapping.get("limit", 10)
        if not isinstance(limit_value, int) or limit_value <= 0:
            raise ConfigError(
                "limit must be a positive integer", extend_path(path, "limit")
            )

        time_decay_value = mapping.get("time_decay", 1.0)
        if not isinstance(time_decay_value, (int, float)):
            raise ConfigError(
                "time_decay must be a number", extend_path(path, "time_decay")
            )

        max_iterations_value = mapping.get("max_iterations", 10)
        if not isinstance(max_iterations_value, int) or max_iterations_value <= 0:
            raise ConfigError(
                "max_iterations must be a positive integer",
                extend_path(path, "max_iterations"),
            )

        max_depth_value = mapping.get("max_depth", 1)
        if not isinstance(max_depth_value, int) or max_depth_value <= 0:
            raise ConfigError(
                "max_depth must be a positive integer", extend_path(path, "max_depth")
            )

        model = optional_str(mapping, "model", path) or "gpt-4o"
        backend = optional_str(mapping, "backend", path) or "openai"

        persist_env_value = mapping.get("persist_env", False)
        if not isinstance(persist_env_value, bool):
            raise ConfigError(
                "persist_env must be boolean", extend_path(path, "persist_env")
            )

        return cls(
            memory_store=memory_store,
            query=query,
            limit=limit_value,
            time_decay=float(time_decay_value),
            max_iterations=max_iterations_value,
            max_depth=max_depth_value,
            model=model,
            backend=backend,
            persist_env=persist_env_value,
            path=path,
        )

    FIELD_SPECS = {
        "memory_store": ConfigFieldSpec(
            name="memory_store",
            display_name="Memory Store",
            type_hint="str",
            required=True,
            description="Name of the memory store to retrieve from",
        ),
        "query": ConfigFieldSpec(
            name="query",
            display_name="Query",
            type_hint="str",
            required=False,
            default="",
            description="Query string for memory retrieval",
        ),
        "limit": ConfigFieldSpec(
            name="limit",
            display_name="Limit",
            type_hint="int",
            required=False,
            default=10,
            description="Maximum number of memory items to retrieve",
        ),
        "time_decay": ConfigFieldSpec(
            name="time_decay",
            display_name="Time Decay",
            type_hint="float",
            required=False,
            default=1.0,
            description="Time decay factor for memory scoring (1.0 = no decay)",
        ),
        "max_iterations": ConfigFieldSpec(
            name="max_iterations",
            display_name="Max Iterations",
            type_hint="int",
            required=False,
            default=10,
            description="Maximum RLM REPL iterations",
        ),
        "max_depth": ConfigFieldSpec(
            name="max_depth",
            display_name="Max Depth",
            type_hint="int",
            required=False,
            default=1,
            description="Maximum depth for recursive LLM calls",
        ),
        "model": ConfigFieldSpec(
            name="model",
            display_name="Model",
            type_hint="str",
            required=False,
            default="gpt-4o",
            description="LLM model to use for RLM",
        ),
        "backend": ConfigFieldSpec(
            name="backend",
            display_name="Backend",
            type_hint="str",
            required=False,
            default="openai",
            description="LLM backend provider (openai, anthropic, etc.)",
        ),
        "persist_env": ConfigFieldSpec(
            name="persist_env",
            display_name="Persist Environment",
            type_hint="bool",
            required=False,
            default=False,
            description="Whether to persist the RLM environment across calls",
        ),
    }
