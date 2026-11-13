"""The openai provider drops ``temperature`` for models that reject it, and only for those."""

import logging
from types import SimpleNamespace
from unittest.mock import Mock

import httpx
import openai
import pytest

from runtime.node.agent.providers.openai_provider import OpenAIProvider

REJECTED = "Unsupported parameter: 'temperature' is not supported with this model."


def _bad_request(message: str) -> openai.BadRequestError:
    request = httpx.Request("POST", "https://api.test/v1/chat/completions")
    return openai.BadRequestError(message, response=httpx.Response(400, request=request), body={"message": message})


def _provider(model: str, protocol: str) -> OpenAIProvider:
    config = SimpleNamespace(base_url="https://api.test/v1", api_key="k", name=model, provider="openai", params={"protocol": protocol})
    provider = OpenAIProvider(config)
    provider._track_token_usage = lambda response: None
    provider._append_chat_response_output = lambda timeline, response: None
    provider._append_response_output = lambda timeline, response: None
    provider._deserialize_chat_response = lambda response: "chat-reply"
    provider._deserialize_response = lambda response: "responses-reply"
    return provider


def _client(create: Mock) -> SimpleNamespace:
    return SimpleNamespace(responses=SimpleNamespace(create=create), chat=SimpleNamespace(completions=SimpleNamespace(create=create)))


@pytest.mark.parametrize("protocol, reply", [("chat", "chat-reply"), ("responses", "responses-reply")])
def test_rejected_temperature_is_retried_without_it_and_remembered(protocol, reply, caplog):
    model = f"no-temp-{protocol}"
    create = Mock(side_effect=[_bad_request(REJECTED), "ok", "ok"])
    provider = _provider(model, protocol)

    with caplog.at_level(logging.WARNING):
        first = provider.call_model(_client(create), [], [])
        second = _provider(model, protocol).call_model(_client(create), [], [])

    assert (first.message, second.message) == (reply, reply)
    sent = [call.kwargs for call in create.call_args_list]
    assert sent[0]["temperature"] == 0.7
    assert "temperature" not in sent[1] and "temperature" not in sent[2]
    assert len(sent) == 3  # the second call never sends temperature, so it is not rejected again
    assert sum(model in record.getMessage() for record in caplog.records) == 1


@pytest.mark.parametrize("protocol", ["chat", "responses"])
def test_accepted_temperature_is_unchanged(protocol):
    create = Mock(return_value="ok")
    _provider(f"temp-ok-{protocol}", protocol).call_model(_client(create), [], [])

    assert create.call_count == 1
    assert create.call_args.kwargs["temperature"] == 0.7


@pytest.mark.parametrize(
    "message",
    ["This model's maximum context length is 8192 tokens", "Invalid 'temperature': decimal above maximum value 2"],
    ids=["context-length", "temperature-out-of-range"],
)
def test_other_bad_requests_are_not_retried(message):
    create = Mock(side_effect=_bad_request(message))

    with pytest.raises(openai.BadRequestError):
        _provider("temp-other-400", "chat").call_model(_client(create), [], [])

    assert create.call_count == 1


def test_memory_is_per_model():
    rejecting = Mock(side_effect=[_bad_request(REJECTED), "ok"])
    _provider("temp-rejecter", "chat").call_model(_client(rejecting), [], [])
    other = Mock(return_value="ok")
    _provider("temp-acceptor", "chat").call_model(_client(other), [], [])

    assert other.call_args.kwargs["temperature"] == 0.7
