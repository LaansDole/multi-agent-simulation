"""Shared RLM environment for multi-agent memory computation.

This module provides a persistent RLM environment that multiple agents can access
for collaborative memory analysis. The environment persists across agent interactions,
enabling recursive reasoning (llm_query, llm_query_batched) to work across agent boundaries.
"""

import os
from typing import Any, Dict, List, Optional

from runtime.node.agent.memory.memory_base import MemoryBase, MemoryItem


class SharedRLMEnvironment:
    """Manages a shared RLM environment for multi-agent memory computation.

    This class provides a persistent RLM environment that multiple agents can use
    to collaboratively analyze shared memory pools. The environment maintains state
    across agent interactions, enabling recursive reasoning.
    """

    def __init__(
        self,
        name: str,
        backend: str = "openai",
        model_name: str = "gpt-4o",
        max_depth: int = 3,
        max_iterations: int = 10,
    ):
        self.name = name
        self.backend = backend
        self.model_name = model_name
        self.max_depth = max_depth
        self.max_iterations = max_iterations
        self._rlm_instance: Optional[Any] = None
        self._memory_stores: Dict[str, MemoryBase] = {}
        self._initialized = False

    def initialize(self) -> None:
        """Initialize the RLM environment."""
        if self._initialized:
            return

        try:
            from rlm import RLM
        except ImportError:
            self._initialized = False
            return

        backend_kwargs: Dict[str, Any] = {"model_name": self.model_name}

        if self.backend == "openai":
            backend_kwargs["api_key"] = os.getenv("OPENAI_API_KEY") or os.getenv(
                "API_KEY"
            )
        elif self.backend == "anthropic":
            backend_kwargs["api_key"] = os.getenv("ANTHROPIC_API_KEY")

        try:
            self._rlm_instance = RLM(
                backend=self.backend,
                backend_kwargs=backend_kwargs,
                environment="local",
                max_depth=self.max_depth,
                max_iterations=self.max_iterations,
                verbose=False,
            )
            self._initialized = True
        except Exception:
            self._initialized = False

    def add_memory_store(self, name: str, store: MemoryBase) -> None:
        """Add a memory store to the shared environment."""
        self._memory_stores[name] = store

    def get_memory_store(self, name: str) -> Optional[MemoryBase]:
        """Get a memory store by name."""
        return self._memory_stores.get(name)

    def execute(
        self,
        query: str,
        memory_context: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Execute an RLM query in the shared environment.

        Args:
            query: The query to execute
            memory_context: Optional memory context to expose as variables

        Returns:
            The RLM response
        """
        if not self._initialized or self._rlm_instance is None:
            return self._fallback_execute(query, memory_context)

        try:
            prompt = self._build_prompt(query, memory_context)
            result = self._rlm_instance.completion(prompt)
            return result.response if hasattr(result, "response") else str(result)
        except Exception:
            return self._fallback_execute(query, memory_context)

    def _build_prompt(
        self, query: str, memory_context: Optional[Dict[str, Any]]
    ) -> str:
        """Build the RLM prompt with memory context."""
        parts = []

        if memory_context:
            for var_name, var_value in memory_context.items():
                parts.append(f"# Variable: {var_name}")
                parts.append(f"{var_name} = {self._serialize_value(var_value)}")
                parts.append("")

        parts.append(f"Your task: {query}")
        parts.append("")
        parts.append("You can explore the data by writing Python code. Use:")
        parts.append("- print() to see results")
        parts.append("- llm_query(prompt) for semantic analysis")
        parts.append("- llm_query_batched(prompts) for batch processing")
        parts.append("- FINAL(your_answer) when done")

        return "\n".join(parts)

    def _serialize_value(self, value: Any) -> str:
        """Serialize a value for the RLM prompt."""
        if isinstance(value, dict):
            items = []
            for k, v in value.items():
                items.append(f"    {repr(k)}: {self._serialize_value(v)}")
            return "{\n" + ",\n".join(items) + "\n}"
        elif isinstance(value, list):
            return (
                "[\n"
                + ",\n".join(f"    {self._serialize_value(item)}" for item in value)
                + "\n]"
            )
        elif isinstance(value, str):
            return repr(value)
        else:
            return repr(value)

    def _fallback_execute(
        self, query: str, memory_context: Optional[Dict[str, Any]]
    ) -> str:
        """Fallback execution when RLM is not available."""
        lines = ["===== Shared Memory Analysis =====", ""]

        if memory_context:
            for var_name, var_value in memory_context.items():
                lines.append(f"Variable: {var_name}")
                if isinstance(var_value, dict) and "memories" in var_value:
                    for idx, mem in enumerate(var_value.get("memories", [])):
                        lines.append(
                            f"  Memory {idx}: {mem.get('content_summary', '')[:100]}"
                        )
                lines.append("")

        lines.append(f"Query: {query}")
        lines.append("===== End of Analysis =====")
        return "\n".join(lines)

    def reset(self) -> None:
        """Reset the RLM environment."""
        if self._rlm_instance is not None:
            try:
                self._rlm_instance.reset()
            except Exception:
                pass

    @property
    def is_initialized(self) -> bool:
        """Check if the environment is initialized."""
        return self._initialized

    def retrieve_memories(
        self,
        store_name: str,
        query: str,
        top_k: int = 10,
    ) -> List[MemoryItem]:
        """Retrieve memories from a specific store."""
        store = self._memory_stores.get(store_name)
        if not store:
            return []

        from runtime.node.agent.memory.memory_base import MemoryContentSnapshot

        query_snapshot = MemoryContentSnapshot(text=query)
        items = store.retrieve(
            agent_role="shared_rlm",
            query=query_snapshot,
            top_k=top_k,
            similarity_threshold=-1.0,
        )
        return items

    def serialize_memories(self, items: List[MemoryItem]) -> Dict[str, Any]:
        """Serialize memory items for RLM context."""
        return {
            "memories": [
                {
                    "id": item.id,
                    "content_summary": item.content_summary,
                    "metadata": item.metadata,
                    "timestamp": item.timestamp,
                }
                for item in items
            ],
            "count": len(items),
        }
