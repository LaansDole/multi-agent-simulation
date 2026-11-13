"""RLM Memory Node Executor.

This executor retrieves memory items and exposes them as Python variables
in an RLM REPL context, allowing programmatic exploration of memory.
"""

import os
from typing import Any, Dict, List, Literal

from entity.configs import Node
from entity.configs.node.rlm_memory import RLMMemoryConfig
from entity.messages import Message, MessageRole
from runtime.node.agent.memory.memory_base import (
    MemoryBase,
    MemoryContentSnapshot,
    MemoryItem,
)
from runtime.node.executor.base import NodeExecutor

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


class RLMMemoryNodeExecutor(NodeExecutor):
    """Executor that retrieves memory and exposes it in an RLM REPL context.

    This node retrieves memory items from a specified memory store and uses
    RLM to expose them as Python variables, allowing the LLM to programmatically
    explore and analyze memory contents.
    """

    def execute(self, node: Node, inputs: List[Message]) -> List[Message]:
        """Execute the RLM memory node.

        Args:
            node: RLM memory node definition
            inputs: Input messages (query can come from inputs or config)

        Returns:
            List containing the RLM exploration result
        """
        self._ensure_not_cancelled()
        if node.node_type != "rlm_memory":
            raise ValueError(f"Node {node.id} is not an rlm_memory node")

        config = node.as_config(RLMMemoryConfig)
        if not config:
            raise ValueError(f"Node {node.id} missing RLMMemoryConfig")

        memory_store = self.context.get_memory_store(config.memory_store)
        if not memory_store:
            return [
                self._build_message(
                    role=MessageRole.ASSISTANT,
                    content=f"Error: Memory store '{config.memory_store}' not found",
                    source=node.id,
                    metadata={"error": "memory_store_not_found"},
                )
            ]

        query = config.query
        if not query and inputs:
            query = self._inputs_to_text(inputs)

        retrieved_items = self._retrieve_memories(memory_store, query, config)

        if not retrieved_items:
            return [
                self._build_message(
                    role=MessageRole.ASSISTANT,
                    content=f"No memories found in store '{config.memory_store}' for query: '{query}'",
                    source=node.id,
                    metadata={"memory_store": config.memory_store, "query": query},
                )
            ]

        result = self._run_rlm_exploration(retrieved_items, query, config, node)

        return [
            self._build_message(
                role=MessageRole.ASSISTANT,
                content=result,
                source=node.id,
                metadata={
                    "memory_store": config.memory_store,
                    "query": query,
                    "items_retrieved": len(retrieved_items),
                },
            )
        ]

    def _retrieve_memories(
        self,
        memory_store: MemoryBase,
        query: str,
        config: RLMMemoryConfig,
    ) -> List[MemoryItem]:
        """Retrieve memory items from the store."""
        query_snapshot = MemoryContentSnapshot(text=query)
        items = memory_store.retrieve(
            agent_role="rlm_memory_node",
            query=query_snapshot,
            top_k=config.limit,
            similarity_threshold=-1.0,
        )

        if config.time_decay < 1.0:
            items = self._apply_time_decay(items, config.time_decay)

        return items

    def _apply_time_decay(
        self, items: List[MemoryItem], decay_factor: float
    ) -> List[MemoryItem]:
        """Apply time decay scoring to memory items."""
        import time

        current_time = time.time()
        for item in items:
            if item.timestamp:
                age_hours = (current_time - item.timestamp) / 3600
                time_weight = max(
                    0.1, 1.0 - (age_hours / (24 * 30)) * (1.0 - decay_factor)
                )
                item.metadata["_time_weight"] = time_weight
        return items

    def _run_rlm_exploration(
        self,
        items: List[MemoryItem],
        query: str,
        config: RLMMemoryConfig,
        node: Node,
    ) -> str:
        """Run RLM exploration over retrieved memory items."""
        try:
            from rlm import RLM
        except ImportError:
            return self._format_memory_as_text(items, query)

        memory_context = self._serialize_memory_for_rlm(items)

        backend_kwargs: Dict[str, Any] = {"model_name": config.model}

        if config.backend == "openai":
            backend_kwargs["api_key"] = os.getenv("OPENAI_API_KEY") or os.getenv(
                "API_KEY"
            )
        elif config.backend == "anthropic":
            backend_kwargs["api_key"] = os.getenv("ANTHROPIC_API_KEY")

        rlm_backend: ClientBackend = config.backend  # type: ignore

        try:
            rlm = RLM(
                backend=rlm_backend,
                backend_kwargs=backend_kwargs,
                environment="local",
                max_depth=config.max_depth,
                max_iterations=config.max_iterations,
                verbose=False,
            )

            prompt = self._build_rlm_prompt(query, memory_context)

            result = rlm.completion(prompt)

            return result.response if hasattr(result, "response") else str(result)

        except Exception as e:
            self.log_manager.warning(
                f"RLM execution failed for node {node.id}, falling back to text",
                node_id=node.id,
                details={"error": str(e)},
            )
            return self._format_memory_as_text(items, query)

    def _serialize_memory_for_rlm(self, items: List[MemoryItem]) -> Dict[str, Any]:
        """Serialize memory items for RLM context."""
        memory_data = {
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

    def _format_memory_as_text(self, items: List[MemoryItem], query: str) -> str:
        """Format memory items as plain text when RLM is unavailable."""
        lines = [
            "===== Memory Exploration Results =====",
            f"Query: {query}",
            f"Found {len(items)} memories:",
            "",
        ]

        for idx, item in enumerate(items, 1):
            lines.append(f"--- Memory {idx} ---")
            lines.append(f"ID: {item.id}")
            lines.append(f"Content: {item.content_summary}")
            if item.timestamp:
                lines.append(f"Timestamp: {item.timestamp}")
            lines.append("")

        lines.append("===== End of Results =====")
        return "\n".join(lines)
