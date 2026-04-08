"""Tests for the local model provider and model download utilities."""

import json
import os
import tempfile
from typing import Any, Dict, List
from unittest.mock import MagicMock, patch

import pytest

from entity.messages import (
    Message,
    MessageBlock,
    MessageBlockType,
    MessageRole,
    ToolCallPayload,
)
from entity.tool_spec import ToolSpec
from runtime.tools.download_model import resolve_model_path


class TestResolveModelPath:
    """Tests for model path resolution logic."""

    def test_explicit_model_path_takes_priority(self, tmp_path):
        gguf_file = tmp_path / "explicit.gguf"
        gguf_file.write_bytes(b"fake gguf data")
        result = resolve_model_path(
            "some/name",
            {"model_path": str(gguf_file)},
        )
        assert result == str(gguf_file.resolve())

    def test_name_as_direct_file_path(self, tmp_path):
        gguf_file = tmp_path / "model.gguf"
        gguf_file.write_bytes(b"fake gguf data")
        result = resolve_model_path(str(gguf_file))
        assert result == str(gguf_file.resolve())

    def test_hf_repo_id_triggers_download(self):
        with patch(
            "runtime.tools.download_model._download_from_hf",
            return_value="/cache/models/repo/model.gguf",
        ) as mock_dl:
            result = resolve_model_path("TheBloke/Mistral-7B-GGUF")
            mock_dl.assert_called_once_with("TheBloke/Mistral-7B-GGUF", {})
            assert result == "/cache/models/repo/model.gguf"

    def test_hf_repo_id_with_params(self):
        with patch(
            "runtime.tools.download_model._download_from_hf",
            return_value="/cache/model.gguf",
        ) as mock_dl:
            params = {"model_file_pattern": "*Q4_K_M.gguf"}
            resolve_model_path("owner/model-gguf", params)
            mock_dl.assert_called_once_with("owner/model-gguf", params)

    def test_no_valid_model_raises_error(self):
        with pytest.raises(FileNotFoundError, match="Cannot resolve model"):
            resolve_model_path("nonexistent-model-name")

    def test_explicit_path_nonexistent_falls_through_to_name(self, tmp_path):
        gguf_file = tmp_path / "model.gguf"
        gguf_file.write_bytes(b"fake gguf data")
        result = resolve_model_path(
            str(gguf_file),
            {"model_path": "/nonexistent/path.gguf"},
        )
        assert result == str(gguf_file.resolve())


class TestLocalProviderMessageConversion:
    """Tests for message format conversion."""

    def _make_provider(self, params: Dict[str, Any] | None = None) -> Any:
        from runtime.node.agent.providers.local_provider import LocalProvider

        config = MagicMock()
        config.name = "test-model.gguf"
        config.base_url = None
        config.api_key = None
        config.provider = "local"
        config.params = params or {}
        config.token_tracker = None
        config.node_id = "test_node"
        return LocalProvider(config)

    def test_simple_user_message(self):
        provider = self._make_provider()
        messages = [
            Message(role=MessageRole.USER, content="Hello, world!"),
        ]
        result = provider._build_messages(messages)
        assert len(result) == 1
        assert result[0]["role"] == "user"
        assert result[0]["content"] == "Hello, world!"

    def test_system_and_user_messages(self):
        provider = self._make_provider()
        messages = [
            Message(role=MessageRole.SYSTEM, content="You are helpful."),
            Message(role=MessageRole.USER, content="Hi"),
        ]
        result = provider._build_messages(messages)
        assert len(result) == 2
        assert result[0]["role"] == "system"
        assert result[0]["content"] == "You are helpful."
        assert result[1]["role"] == "user"
        assert result[1]["content"] == "Hi"

    def test_message_with_tool_calls(self):
        provider = self._make_provider()
        messages = [
            Message(
                role=MessageRole.ASSISTANT,
                content="",
                tool_calls=[
                    ToolCallPayload(
                        id="call_1",
                        function_name="get_weather",
                        arguments='{"city": "NYC"}',
                        type="function",
                    )
                ],
            ),
        ]
        result = provider._build_messages(messages)
        assert len(result) == 1
        assert result[0]["role"] == "assistant"
        assert len(result[0]["tool_calls"]) == 1
        assert result[0]["tool_calls"][0]["function"]["name"] == "get_weather"

    def test_tool_result_message(self):
        provider = self._make_provider()
        messages = [
            Message(
                role=MessageRole.TOOL,
                content='{"temp": 72}',
                tool_call_id="call_1",
                name="get_weather",
            ),
        ]
        result = provider._build_messages(messages)
        assert len(result) == 1
        assert result[0]["role"] == "tool"
        assert result[0]["tool_call_id"] == "call_1"
        assert result[0]["name"] == "get_weather"

    def test_blocks_content_uses_text_content(self):
        provider = self._make_provider()
        messages = [
            Message(
                role=MessageRole.USER,
                content=[
                    MessageBlock(MessageBlockType.TEXT, text="Hello from blocks"),
                ],
            ),
        ]
        result = provider._build_messages(messages)
        assert result[0]["content"] == "Hello from blocks"


class TestLocalProviderResponseParsing:
    """Tests for response parsing."""

    def _make_provider(self) -> Any:
        from runtime.node.agent.providers.local_provider import LocalProvider

        config = MagicMock()
        config.name = "test-model.gguf"
        config.base_url = None
        config.api_key = None
        config.provider = "local"
        config.params = {}
        config.token_tracker = None
        config.node_id = "test_node"
        return LocalProvider(config)

    def test_simple_text_response(self):
        provider = self._make_provider()
        response = {
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": "Hello! How can I help?",
                    },
                }
            ],
            "usage": {"prompt_tokens": 10, "completion_tokens": 8, "total_tokens": 18},
        }
        message = provider._parse_response(response)
        assert message.role == MessageRole.ASSISTANT
        assert message.content == "Hello! How can I help?"
        assert message.tool_calls == []

    def test_tool_call_response(self):
        provider = self._make_provider()
        response = {
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": "",
                        "tool_calls": [
                            {
                                "id": "call_abc",
                                "type": "function",
                                "function": {
                                    "name": "get_weather",
                                    "arguments": '{"city": "NYC"}',
                                },
                            }
                        ],
                    },
                }
            ],
        }
        message = provider._parse_response(response)
        assert message.role == MessageRole.ASSISTANT
        assert len(message.tool_calls) == 1
        assert message.tool_calls[0].function_name == "get_weather"
        assert message.tool_calls[0].arguments == '{"city": "NYC"}'
        assert message.tool_calls[0].id == "call_abc"

    def test_empty_choices(self):
        provider = self._make_provider()
        response = {"choices": []}
        message = provider._parse_response(response)
        assert message.role == MessageRole.ASSISTANT
        assert message.content == ""

    def test_dict_arguments_converted_to_string(self):
        provider = self._make_provider()
        response = {
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": "",
                        "tool_calls": [
                            {
                                "id": "call_1",
                                "type": "function",
                                "function": {
                                    "name": "search",
                                    "arguments": {"query": "test"},
                                },
                            }
                        ],
                    },
                }
            ],
        }
        message = provider._parse_response(response)
        args = message.tool_calls[0].arguments
        parsed = json.loads(args)
        assert parsed == {"query": "test"}


class TestLocalProviderToolBuilding:
    """Tests for tool spec conversion."""

    def _make_provider(self) -> Any:
        from runtime.node.agent.providers.local_provider import LocalProvider

        config = MagicMock()
        config.name = "test-model.gguf"
        config.base_url = None
        config.api_key = None
        config.provider = "local"
        config.params = {}
        config.token_tracker = None
        config.node_id = "test_node"
        return LocalProvider(config)

    def test_no_tool_specs_returns_empty(self):
        provider = self._make_provider()
        assert provider._build_tools(None) == []
        assert provider._build_tools([]) == []

    def test_tool_specs_converted(self):
        provider = self._make_provider()
        specs = [
            ToolSpec(
                name="get_weather",
                description="Get weather for a city",
                parameters={
                    "type": "object",
                    "properties": {
                        "city": {"type": "string"},
                    },
                },
            )
        ]
        tools = provider._build_tools(specs)
        assert len(tools) == 1
        assert tools[0]["type"] == "function"
        assert tools[0]["function"]["name"] == "get_weather"
        assert tools[0]["function"]["description"] == "Get weather for a city"


class TestLocalProviderTokenUsage:
    """Tests for token usage extraction."""

    def _make_provider(self) -> Any:
        from runtime.node.agent.providers.local_provider import LocalProvider

        config = MagicMock()
        config.name = "test-model.gguf"
        config.base_url = None
        config.api_key = None
        config.provider = "local"
        config.params = {}
        config.token_tracker = None
        config.node_id = "test_node"
        return LocalProvider(config)

    def test_extract_from_dict(self):
        provider = self._make_provider()
        response = {
            "usage": {
                "prompt_tokens": 15,
                "completion_tokens": 42,
                "total_tokens": 57,
            }
        }
        usage = provider.extract_token_usage(response)
        assert usage.input_tokens == 15
        assert usage.output_tokens == 42
        assert usage.total_tokens == 57

    def test_extract_with_no_usage(self):
        provider = self._make_provider()
        response = {}
        usage = provider.extract_token_usage(response)
        assert usage.input_tokens == 0
        assert usage.output_tokens == 0

    def test_extract_computes_total_if_missing(self):
        provider = self._make_provider()
        response = {
            "usage": {
                "prompt_tokens": 10,
                "completion_tokens": 5,
            }
        }
        usage = provider.extract_token_usage(response)
        assert usage.total_tokens == 15


class TestLocalProviderCallModel:
    """Tests for the full call_model pipeline with mocked llama client."""

    def _make_provider(self) -> Any:
        from runtime.node.agent.providers.local_provider import LocalProvider

        config = MagicMock()
        config.name = "test-model.gguf"
        config.base_url = None
        config.api_key = None
        config.provider = "local"
        config.params = {}
        config.token_tracker = None
        config.node_id = "test_node"
        return LocalProvider(config)

    def test_call_model_returns_model_response(self):
        provider = self._make_provider()

        mock_client = MagicMock()
        mock_client.create_chat_completion.return_value = {
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": "Generated text",
                    }
                }
            ],
            "usage": {"prompt_tokens": 5, "completion_tokens": 3, "total_tokens": 8},
        }

        messages = [
            Message(role=MessageRole.USER, content="Test prompt"),
        ]
        result = provider.call_model(mock_client, messages, [])

        assert result.message.role == MessageRole.ASSISTANT
        assert result.message.content == "Generated text"

        call_kwargs = mock_client.create_chat_completion.call_args
        assert call_kwargs[1]["messages"][0]["role"] == "user"
        assert call_kwargs[1]["messages"][0]["content"] == "Test prompt"

    def test_call_model_with_tools(self):
        provider = self._make_provider()

        mock_client = MagicMock()
        mock_client.create_chat_completion.return_value = {
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": "",
                        "tool_calls": [
                            {
                                "id": "call_1",
                                "type": "function",
                                "function": {
                                    "name": "search",
                                    "arguments": '{"q": "test"}',
                                },
                            }
                        ],
                    }
                }
            ],
            "usage": {"prompt_tokens": 10, "completion_tokens": 15, "total_tokens": 25},
        }

        tool_specs = [
            ToolSpec(name="search", description="Search the web"),
        ]

        messages = [
            Message(role=MessageRole.USER, content="Search for test"),
        ]
        result = provider.call_model(mock_client, messages, [], tool_specs=tool_specs)

        call_kwargs = mock_client.create_chat_completion.call_args
        assert "tools" in call_kwargs[1]
        assert len(result.message.tool_calls) == 1
        assert result.message.tool_calls[0].function_name == "search"
