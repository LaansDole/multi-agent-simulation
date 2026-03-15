"""RLM-enhanced memory wrapper for programmatic memory exploration."""

import os
from typing import Any, Dict, List, Literal, Optional

from entity.configs import MemoryAttachmentConfig
from runtime.node.agent.memory.memory_base import (
    MemoryBase,
    MemoryContentSnapshot,
    MemoryItem,
    MemoryRetrievalResult,
)

ClientBackend = Literal[
    "openai",
    "portkey",
    "openrouter",
    "vercel",
    "vllm",
    "litellm",
    "anthropic",
    "azure_openai",
    "gemini",
]


class RLMMemory:
    """Wrapper that enables RLM-based exploration of memory contents.

    This class wraps a MemoryBase instance and provides methods to retrieve
    memories and execute RLM code for programmatic analysis.
    """

    def __init__(
        self,
        memory_store: MemoryBase,
        attachment_config: MemoryAttachmentConfig,
    ):
        self.memory_store = memory_store
        self.config = attachment_config

    def retrieve_with_rlm(
        self,
        agent_role: str,
        query: MemoryContentSnapshot,
    ) -> tuple[MemoryRetrievalResult | None, Optional[str]]:
        """Retrieve memories and optionally run RLM exploration.

        Returns:
            Tuple of (MemoryRetrievalResult, rlm_result_str or None)
        """
        items = self.memory_store.retrieve(
            agent_role=agent_role,
            query=query,
            top_k=self.config.top_k,
            similarity_threshold=self.config.similarity_threshold,
        )

        if not items:
            return None, None

        result = MemoryRetrievalResult(
            formatted_text=self._format_memories(items),
            items=items,
        )

        if not self.config.use_rlm:
            return result, None

        rlm_result = self._run_rlm_exploration(items, query.text)
        return result, rlm_result

    def _run_rlm_exploration(self, items: List[MemoryItem], query: str) -> str:
        """Run RLM exploration over retrieved memory items."""
        try:
            from rlm import RLM
        except ImportError:
            return self._format_memories(items)

        memory_context = self._serialize_memory_for_rlm(items)

        backend_kwargs: Dict[str, Any] = {"model_name": self.config.rlm_model}

        if self.config.rlm_backend == "openai":
            backend_kwargs["api_key"] = os.getenv("OPENAI_API_KEY") or os.getenv(
                "API_KEY"
            )
        elif self.config.rlm_backend == "anthropic":
            backend_kwargs["api_key"] = os.getenv("ANTHROPIC_API_KEY")

        rlm_backend: ClientBackend = self.config.rlm_backend  # type: ignore

        try:
            rlm = RLM(
                backend=rlm_backend,
                backend_kwargs=backend_kwargs,
                environment="local",
                max_depth=self.config.rlm_max_depth,
                max_iterations=self.config.rlm_max_iterations,
                verbose=False,
            )

            prompt = self._build_rlm_prompt(query, memory_context)
            result = rlm.completion(prompt)

            return result.response if hasattr(result, "response") else str(result)

        except Exception:
            return self._format_memories(items)

    def _serialize_memory_for_rlm(self, items: List[MemoryItem]) -> Dict[str, Any]:
        """Serialize memory items for RLM context."""
        memory_data: Dict[str, Any] = {
            "memories": [],
            "count": len(items),
        }

        for idx, item in enumerate(items):
            memory_data["memories"].append(
                {
                    "id": item.id,
                    "index": idx,
                    "content_summary": item.content_summary,
                    "metadata": item.metadata,
                    "timestamp": item.timestamp,
                }
            )

        return memory_data

    def _build_rlm_prompt(self, query: str, memory_context: Dict[str, Any]) -> str:
        """Build the RLM prompt for memory exploration."""
        return f"""You have access to a memory store containing {memory_context["count"]} memory items.

The memories are available in the `memories` variable as a list of dictionaries, each with:
- id: unique identifier
- index: position in the list
- content_summary: the memory content
- metadata: additional metadata
- timestamp: when the memory was created

Your task: {query}

You can explore the memories by writing Python code. Use:
- print() to see results
- llm_query(prompt) for semantic analysis on specific items
- llm_query_batched(prompts) for parallel analysis
- FINAL(answer) when done

Example exploration:
```python
print(f"Total memories: {{len(memories)}}")
for i, mem in enumerate(memories[:3]):
    print(f"Memory {{i}}: {{mem['content_summary'][:100]}}")
```

Now explore the memories and provide your answer."""

    def _format_memories(self, items: List[MemoryItem]) -> str:
        """Format memory items as plain text."""
        lines = [
            "===== Related Memories =====",
            "",
        ]

        for idx, item in enumerate(items, 1):
            lines.append(f"--- Memory {idx} ---")
            lines.append(f"ID: {item.id}")
            lines.append(f"Content: {item.content_summary}")
            if item.timestamp:
                lines.append(f"Timestamp: {item.timestamp}")
            lines.append("")

        lines.append("===== End of Memory =====")
        return "\n".join(lines)
