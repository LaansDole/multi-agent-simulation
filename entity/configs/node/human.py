"""Human node configuration."""

from dataclasses import dataclass, field
from typing import Any, List, Mapping

from entity.configs.base import (
    BaseConfig,
    ConfigFieldSpec,
    ConfigError,
    extend_path,
    optional_str,
    require_mapping,
)
from .memory import MemoryAttachmentConfig


@dataclass
class HumanConfig(BaseConfig):
    description: str | None = None
    memories: List[MemoryAttachmentConfig] = field(default_factory=list)

    @classmethod
    def from_dict(cls, data: Mapping[str, Any] | None, *, path: str) -> "HumanConfig":
        if data is None:
            return cls(description=None, path=path)
        mapping = require_mapping(data, path)
        description = optional_str(mapping, "description", path)

        # Parse memories configuration
        memories_cfg: List[MemoryAttachmentConfig] = []
        if "memories" in mapping and mapping["memories"] is not None:
            raw_memories = mapping["memories"]
            if not isinstance(raw_memories, list):
                raise ConfigError(
                    "memories must be a list", extend_path(path, "memories")
                )
            for idx, item in enumerate(raw_memories):
                memories_cfg.append(
                    MemoryAttachmentConfig.from_dict(
                        item, path=extend_path(path, f"memories[{idx}]")
                    )
                )

        return cls(description=description, memories=memories_cfg, path=path)

    FIELD_SPECS = {
        "description": ConfigFieldSpec(
            name="description",
            display_name="Human Task Description",
            type_hint="text",
            required=False,
            description="Description of the task for human to complete",
        ),
        "memories": ConfigFieldSpec(
            name="memories",
            display_name="Memory Attachments",
            type_hint="list[MemoryAttachmentConfig]",
            required=False,
            description="Associated memory references for context retrieval",
            child=MemoryAttachmentConfig,
            advance=True,
        ),
    }
