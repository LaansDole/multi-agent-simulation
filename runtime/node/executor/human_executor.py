"""Executor for Human nodes.

Runs the human-in-the-loop interaction nodes.
"""

from typing import List

from entity.configs import Node
from entity.configs.node.human import HumanConfig
from entity.enums import AgentExecFlowStage
from entity.messages import Message, MessageRole
from runtime.node.executor.base import NodeExecutor
from runtime.node.agent.memory.memory_base import (
    MemoryContentSnapshot,
    MemoryWritePayload,
)


class HumanNodeExecutor(NodeExecutor):
    """Executor used for human interaction nodes."""

    def execute(self, node: Node, inputs: List[Message]) -> List[Message]:
        """Execute a human node.

        Args:
            node: Human node definition
            inputs: Input messages

        Returns:
            Result supplied by the human reviewer
        """
        self._ensure_not_cancelled()
        if node.node_type != "human":
            raise ValueError(f"Node {node.id} is not a human node")

        human_config = node.as_config(HumanConfig)
        if not human_config:
            raise ValueError(f"Node {node.id} has no human configuration")

        human_task_description = human_config.description
        # Use clean human-friendly format without technical metadata headers
        input_data = self._inputs_to_human_text(inputs)

        # Retrieve memory context if configured
        memory_context = self._retrieve_and_format_memory(node, input_data, inputs)

        prompt_service = self.context.get_human_prompt_service()
        if prompt_service is None:
            raise RuntimeError(
                "HumanPromptService is not configured; cannot execute human node"
            )

        # Combine task description with memory context if available
        enhanced_description = human_task_description or ""
        if memory_context:
            enhanced_description = f"{enhanced_description}\n\n{memory_context}"

        prompt_result = prompt_service.request(
            node.id,
            enhanced_description,
            inputs=input_data,
            metadata={"node_type": "human"},
        )

        result_message = self._build_message(
            MessageRole.USER,
            prompt_result.as_message_content(),
            source=node.id,
        )

        # Write to memory if configured
        self._update_memory(node, input_data, inputs, result_message)

        return [result_message]

    def _retrieve_and_format_memory(
        self, node: Node, input_text: str, inputs: List[Message]
    ) -> str:
        memory_manager = self.context.get_memory_manager(node.id)
        if not memory_manager:
            return ""

        # Build query snapshot from input messages
        query_snapshot = self._build_memory_query_snapshot(inputs, input_text)

        # Determine retrieval stage
        retrieval_stage = AgentExecFlowStage.GEN_STAGE

        with self.log_manager.memory_timer(node.id, "RETRIEVE", retrieval_stage.value):
            retrieved_memory = memory_manager.retrieve(
                agent_role=node.role if node.role else "",
                query=query_snapshot,
                current_stage=retrieval_stage,
            )

        if not retrieved_memory or not retrieved_memory.formatted_text:
            return ""

        # Log the memory retrieval operation
        details = {
            "stage": retrieval_stage.value,
            "item_count": len(retrieved_memory.items) if retrieved_memory else 0,
            "attachment_count": len(retrieved_memory.attachment_overview())
            if retrieved_memory
            else 0,
        }

        self.log_manager.record_memory_operation(
            node.id,
            "RETRIEVE",
            retrieval_stage.value,
            retrieved_memory.formatted_text,
            details,
        )

        return retrieved_memory.formatted_text

    def _update_memory(
        self, node: Node, input_data: str, inputs: List[Message], result: Message
    ) -> None:
        memory_manager = self.context.get_memory_manager(node.id)
        if not memory_manager:
            return

        stage = AgentExecFlowStage.FINISHED_STAGE

        input_snapshot = MemoryContentSnapshot.from_messages(inputs)
        output_snapshot = MemoryContentSnapshot.from_message(result)
        payload = MemoryWritePayload(
            agent_role=node.role if node.role else "",
            inputs_text=input_data,
            input_snapshot=input_snapshot,
            output_snapshot=output_snapshot,
        )

        with self.log_manager.memory_timer(node.id, "UPDATE", stage.value):
            memory_manager.update(payload)

        # Record the memory update
        normalized_result = result.text_content()
        self.log_manager.record_memory_operation(
            node.id,
            "UPDATE",
            stage.value,
            normalized_result,
            {
                "stage": stage.value,
                "input_size": len(str(input_data)),
                "output_size": len(normalized_result),
                "attachment_count": len(output_snapshot.attachment_overview())
                if output_snapshot
                else 0,
            },
        )

    def _build_memory_query_snapshot(
        self, inputs: List[Message], input_text: str
    ) -> MemoryContentSnapshot:
        base_snapshot = MemoryContentSnapshot.from_messages(inputs)
        blocks = list(base_snapshot.blocks) if base_snapshot else []
        return MemoryContentSnapshot(text=input_text, blocks=blocks)
