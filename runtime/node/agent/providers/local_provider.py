"""Local GGUF model provider using llama-cpp-python."""

import json
import logging
from typing import Any, Dict, List, Optional

from entity.messages import (
    Message,
    MessageBlock,
    MessageBlockType,
    MessageRole,
    ToolCallPayload,
)
from entity.tool_spec import ToolSpec
from runtime.node.agent import ModelProvider
from runtime.node.agent.providers.response import ModelResponse
from utils.token_tracker import TokenUsage

logger = logging.getLogger(__name__)


class LocalProvider(ModelProvider):
    """Provider that runs GGUF models locally via llama-cpp-python."""

    def __init__(self, config: Any) -> None:
        super().__init__(config)
        self._client: Any = None

    def create_client(self) -> Any:
        """Lazily instantiate and cache the llama-cpp-python Llama client.

        Returns:
            A ``llama_cpp.Llama`` instance.
        """
        if self._client is not None:
            return self._client

        from runtime.tools.download_model import resolve_model_path

        model_path = resolve_model_path(self.model_name, self.params)

        n_ctx = int(self.params.get("n_ctx", 4096))
        n_gpu_layers = int(self.params.get("n_gpu_layers", 0))
        verbose = bool(self.params.get("verbose", False))

        logger.info(
            "Loading local model: %s (n_ctx=%d, n_gpu_layers=%d)",
            model_path,
            n_ctx,
            n_gpu_layers,
        )

        from llama_cpp import Llama

        self._client = Llama(
            model_path=model_path,
            n_ctx=n_ctx,
            n_gpu_layers=n_gpu_layers,
            verbose=verbose,
        )
        return self._client

    def call_model(
        self,
        client: Any,
        conversation: List[Message],
        timeline: List[Any],
        tool_specs: Optional[List[ToolSpec]] = None,
        **kwargs: Any,
    ) -> ModelResponse:
        """Run inference using llama-cpp-python chat completions.

        Args:
            client: A ``llama_cpp.Llama`` instance.
            conversation: Messages in the current conversation.
            timeline: Event timeline (unused for local provider).
            tool_specs: Optional tool specifications.
            **kwargs: Additional keyword arguments forwarded to the API call.

        Returns:
            A ``ModelResponse`` with the generated message.
        """
        messages = self._build_messages(conversation)

        params = dict(kwargs)
        temperature = float(
            params.pop("temperature", self.params.get("temperature", 0.7))
        )
        max_tokens = int(params.pop("max_tokens", self.params.get("max_tokens", 512)))

        create_kwargs: Dict[str, Any] = {
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }

        tools = self._build_tools(tool_specs)
        if tools:
            create_kwargs["tools"] = tools

        response = client.create_chat_completion(**create_kwargs)
        message = self._parse_response(response)

        self._track_token_usage(response)

        return ModelResponse(message=message, raw_response=response)

    def extract_token_usage(self, response: Any) -> TokenUsage:
        """Extract token counts from a llama-cpp-python response.

        Args:
            response: The raw response dict from ``create_chat_completion``.

        Returns:
            A ``TokenUsage`` instance.
        """
        usage = {}
        if isinstance(response, dict):
            usage = response.get("usage", {})
        elif hasattr(response, "usage"):
            usage = response.usage
            if hasattr(usage, "__dict__"):
                usage = usage.__dict__
            elif not isinstance(usage, dict):
                usage = {}

        prompt_tokens = int(usage.get("prompt_tokens", 0))
        completion_tokens = int(usage.get("completion_tokens", 0))
        total_tokens = int(usage.get("total_tokens", prompt_tokens + completion_tokens))

        return TokenUsage(
            input_tokens=prompt_tokens,
            output_tokens=completion_tokens,
            total_tokens=total_tokens,
            metadata={
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "total_tokens": total_tokens,
            },
        )

    def _track_token_usage(self, response: Any) -> None:
        """Record token usage if a tracker is attached to the config."""
        token_tracker = getattr(self.config, "token_tracker", None)
        if not token_tracker:
            return

        usage = self.extract_token_usage(response)
        if usage.input_tokens == 0 and usage.output_tokens == 0:
            return

        node_id = getattr(self.config, "node_id", "ALL")
        usage.node_id = node_id
        usage.model_name = self.model_name
        usage.workflow_id = token_tracker.workflow_id
        usage.provider = "local"

        token_tracker.record_usage(node_id, self.model_name, usage, provider="local")

    def _build_messages(self, conversation: List[Message]) -> List[Dict[str, Any]]:
        """Convert internal Message objects to llama-cpp-python chat format.

        Args:
            conversation: List of internal ``Message`` objects.

        Returns:
            A list of dicts with ``role`` and ``content`` keys.
        """
        messages: List[Dict[str, Any]] = []
        for msg in conversation:
            role = msg.role.value
            content = msg.text_content()
            entry: Dict[str, Any] = {"role": role, "content": content}
            if msg.tool_calls:
                entry["tool_calls"] = [
                    {
                        "type": "function",
                        "function": {
                            "name": tc.function_name,
                            "arguments": tc.arguments,
                        },
                    }
                    for tc in msg.tool_calls
                ]
            if msg.tool_call_id:
                entry["tool_call_id"] = msg.tool_call_id
            if msg.name:
                entry["name"] = msg.name
            messages.append(entry)
        return messages

    def _build_tools(
        self, tool_specs: Optional[List[ToolSpec]]
    ) -> List[Dict[str, Any]]:
        """Convert ToolSpec objects to llama-cpp-python tool format.

        Args:
            tool_specs: Optional list of tool specifications.

        Returns:
            A list of tool dicts suitable for ``create_chat_completion``.
        """
        if not tool_specs:
            return []

        tools: List[Dict[str, Any]] = []
        for spec in tool_specs:
            tools.append(
                {
                    "type": "function",
                    "function": {
                        "name": spec.name,
                        "description": spec.description,
                        "parameters": spec.parameters
                        or {"type": "object", "properties": {}},
                    },
                }
            )
        return tools

    def _parse_response(self, response: Any) -> Message:
        """Parse a llama-cpp-python chat completion response into a Message.

        Args:
            response: The raw response dict from ``create_chat_completion``.

        Returns:
            A ``Message`` with ``MessageRole.ASSISTANT``.
        """
        if isinstance(response, dict):
            choices = response.get("choices", [])
        elif hasattr(response, "choices"):
            choices = response.choices
        else:
            choices = []

        if not choices:
            return Message(role=MessageRole.ASSISTANT, content="")

        choice = choices[0]
        if isinstance(choice, dict):
            msg_data = choice.get("message", {})
            content = msg_data.get("content", "") or ""
            tool_calls_raw = msg_data.get("tool_calls")
        elif hasattr(choice, "message"):
            msg_data = choice.message
            content = getattr(msg_data, "content", "") or ""
            tool_calls_raw = getattr(msg_data, "tool_calls", None)
        else:
            content = ""
            tool_calls_raw = None

        tool_calls: List[ToolCallPayload] = []
        if tool_calls_raw:
            for idx, tc in enumerate(tool_calls_raw):
                if isinstance(tc, dict):
                    func = tc.get("function", {})
                    name = func.get("name", "")
                    arguments = func.get("arguments", "")
                    call_id = tc.get("id", f"tool_call_{idx}")
                else:
                    func = getattr(tc, "function", None)
                    name = getattr(func, "name", "") if func else ""
                    arguments = getattr(func, "arguments", "") if func else ""
                    call_id = getattr(tc, "id", f"tool_call_{idx}")

                if not isinstance(arguments, str):
                    try:
                        arguments = json.dumps(arguments, ensure_ascii=False)
                    except Exception:
                        arguments = str(arguments)

                tool_calls.append(
                    ToolCallPayload(
                        id=call_id,
                        function_name=name,
                        arguments=arguments,
                        type="function",
                    )
                )

        return Message(
            role=MessageRole.ASSISTANT,
            content=content,
            tool_calls=tool_calls,
        )
