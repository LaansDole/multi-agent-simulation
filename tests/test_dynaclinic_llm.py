"""Tests for dynaclinic.llm (offline: the openai SDK client is replaced by a stub)."""

import logging
import sys
from collections.abc import Callable
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import httpx
import openai
import pytest

from dynaclinic import llm
from dynaclinic.llm import (
    FakeLLM,
    LLMError,
    OpenAIChatClient,
    client_from_env,
    get_client,
    set_client_factory,
)
from tests.dynaclinic_fixtures import NetworkBlockedError, no_network  # noqa: F401

KEY = "sk-test-SECRET-0123456789"
ENV_KEYS = ("OPENAI_API_KEY", "OPENAI_BASE_URL", "DYNACLINIC_MODEL", "DYNACLINIC_FALLBACK_MODELS")
Behaviour = Callable[[dict[str, Any]], Any]


def _response(text: str = "ok", prompt_tokens: int = 11, completion_tokens: int = 7) -> SimpleNamespace:
    return SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=text))],
        usage=SimpleNamespace(prompt_tokens=prompt_tokens, completion_tokens=completion_tokens),
    )


def _status_error(cls: type[openai.APIStatusError], status: int, message: str, code: str | None = None) -> Exception:
    request = httpx.Request("POST", "https://api.test/v1/chat/completions")
    return cls(message, response=httpx.Response(status, request=request), body={"message": message, "code": code})


class _StubSDK:
    """Stands in for ``openai.OpenAI``; records every ``chat.completions.create`` call."""

    def __init__(self, behaviour: Behaviour, **init_kwargs: Any) -> None:
        self.init_kwargs = init_kwargs
        self.api_key = init_kwargs["api_key"]
        self.calls: list[dict[str, Any]] = []
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))
        self._behaviour = behaviour

    def _create(self, **kwargs: Any) -> Any:
        self.calls.append(kwargs)
        return self._behaviour(kwargs)


@pytest.fixture
def make_client(monkeypatch: pytest.MonkeyPatch) -> Callable[..., tuple[OpenAIChatClient, _StubSDK]]:
    def _make(behaviour: Behaviour, models: tuple[str, ...] = ("primary", "backup")) -> tuple[OpenAIChatClient, _StubSDK]:
        stubs: list[_StubSDK] = []

        def _factory(**kwargs: Any) -> _StubSDK:
            stubs.append(_StubSDK(behaviour, **kwargs))
            return stubs[-1]

        monkeypatch.setattr(llm, "OpenAI", _factory)
        client = OpenAIChatClient(list(models), api_key=KEY, base_url="https://api.test/v1", timeout=5, max_retries=1)
        return client, stubs[0]

    return _make


def _fail_model(model: str, error: Exception) -> Behaviour:
    def behaviour(kwargs: dict[str, Any]) -> Any:
        if kwargs["model"] == model:
            raise error
        return _response(f"answer from {kwargs['model']}")

    return behaviour


@pytest.fixture(autouse=True)
def _reset_factory() -> Any:
    yield
    set_client_factory(None)


def test_sends_chat_completion_with_only_requested_params(make_client: Callable[..., Any]) -> None:
    client, sdk = make_client(lambda kwargs: _response("hello"))
    text, record = client.complete("triage", "sys prompt", "user prompt")
    assert text == "hello"
    assert sdk.calls == [
        {
            "model": "primary",
            "messages": [{"role": "system", "content": "sys prompt"}, {"role": "user", "content": "user prompt"}],
        }
    ]
    assert sdk.init_kwargs == {"api_key": KEY, "base_url": "https://api.test/v1", "timeout": 5, "max_retries": 1}
    assert (record.role, record.model, record.prompt_tokens, record.completion_tokens) == ("triage", "primary", 11, 7)
    assert record.fallback_used is False


@pytest.mark.parametrize(
    "error",
    [
        _status_error(openai.NotFoundError, 404, "The model `primary` does not exist"),
        _status_error(openai.PermissionDeniedError, 403, "You do not have access to this model"),
        _status_error(openai.InternalServerError, 503, "Service unavailable"),
        openai.APITimeoutError(request=httpx.Request("POST", "https://api.test/v1/chat/completions")),
        _status_error(openai.BadRequestError, 400, "unknown", code="model_not_found"),
        _status_error(openai.BadRequestError, 400, "Invalid model name passed in model=primary"),
    ],
)
def test_fallback_switches_and_stays_sticky(make_client: Callable[..., Any], error: Exception) -> None:
    client, sdk = make_client(_fail_model("primary", error))
    first, first_record = client.complete("triage", "s", "u")
    second, second_record = client.complete("critic", "s", "u")
    assert [call["model"] for call in sdk.calls] == ["primary", "backup", "backup"]
    assert first == second == "answer from backup"
    assert [(r.model, r.fallback_used) for r in client.ledger] == [("backup", True), ("backup", True)]
    assert client.ledger == [first_record, second_record]


def test_non_fallback_error_raises_without_switching(make_client: Callable[..., Any]) -> None:
    client, sdk = make_client(_fail_model("primary", _status_error(openai.AuthenticationError, 401, "bad key")))
    for _ in range(2):
        with pytest.raises(LLMError, match="AuthenticationError"):
            client.complete("triage", "s", "u")
    assert [call["model"] for call in sdk.calls] == ["primary", "primary"]
    assert client.ledger == []


def test_exhausted_chain_raises(make_client: Callable[..., Any]) -> None:
    def behaviour(kwargs: dict[str, Any]) -> Any:
        raise _status_error(openai.NotFoundError, 404, "no such model")

    client, sdk = make_client(behaviour)
    with pytest.raises(LLMError, match="backup"):
        client.complete("triage", "s", "u")
    assert [call["model"] for call in sdk.calls] == ["primary", "backup"]


@pytest.mark.parametrize(
    ("kwargs", "param", "message"),
    [
        ({"temperature": 0.2}, "temperature", "Unsupported value: 'temperature' does not support 0.2 with this model."),
        ({"json_mode": True}, "response_format", "Invalid parameter: 'response_format' is not supported with this model."),
    ],
)
def test_rejected_param_is_retried_once_without_it_and_remembered(
    make_client: Callable[..., Any], kwargs: dict[str, Any], param: str, message: str
) -> None:
    def behaviour(call: dict[str, Any]) -> Any:
        if param in call:
            raise _status_error(openai.BadRequestError, 400, message)
        return _response("fine")

    client, sdk = make_client(behaviour)
    assert client.complete("triage", "s", "u", **kwargs)[0] == "fine"
    assert client.complete("triage", "s", "u", **kwargs)[0] == "fine"
    assert [param in call for call in sdk.calls] == [True, False, False]
    assert [r.model for r in client.ledger] == ["primary", "primary"]


def test_json_mode_sets_response_format(make_client: Callable[..., Any]) -> None:
    client, sdk = make_client(lambda kwargs: _response("{}"))
    client.complete("triage", "s", "u", json_mode=True, temperature=0.0)
    assert sdk.calls[0]["response_format"] == {"type": "json_object"}
    assert sdk.calls[0]["temperature"] == 0.0


def test_unrelated_bad_request_is_raised_not_retried(make_client: Callable[..., Any]) -> None:
    def behaviour(kwargs: dict[str, Any]) -> Any:
        raise _status_error(openai.BadRequestError, 400, "This model's maximum context length is 8192 tokens")

    client, sdk = make_client(behaviour)
    with pytest.raises(LLMError, match="context length"):
        client.complete("triage", "s", "u", json_mode=True, temperature=0.5)
    assert len(sdk.calls) == 1


def test_reset_ledger_returns_and_clears(make_client: Callable[..., Any]) -> None:
    client, _ = make_client(lambda kwargs: _response())
    client.complete("a", "s", "u")
    client.complete("b", "s", "u")
    records = client.reset_ledger()
    assert [r.role for r in records] == ["a", "b"]
    assert client.ledger == []


def test_api_key_never_in_repr_errors_or_logs(make_client: Callable[..., Any], caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.DEBUG)

    def behaviour(kwargs: dict[str, Any]) -> Any:
        if kwargs["model"] == "primary":
            raise _status_error(openai.NotFoundError, 404, f"model missing for key {KEY}")
        raise _status_error(openai.AuthenticationError, 401, f"Incorrect API key provided: {KEY}")

    client, _ = make_client(behaviour)
    with pytest.raises(LLMError) as excinfo:
        client.complete("triage", "s", "u")
    assert "primary" in caplog.text and "backup" in caplog.text
    for surface in (repr(client), str(client), str(excinfo.value), caplog.text):
        assert KEY not in surface


def test_real_sdk_call_fails_offline_instead_of_reaching_network(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.DEBUG)
    client = OpenAIChatClient(["m"], api_key=KEY, base_url="http://127.0.0.1:9/v1", timeout=1, max_retries=0)
    with pytest.raises(LLMError) as excinfo:
        client.complete("triage", "s", "u")
    chain: list[BaseException] = []
    error: BaseException | None = excinfo.value
    while error is not None and len(chain) < 10:
        chain.append(error)
        error = error.__cause__ or error.__context__
    assert any(isinstance(e, NetworkBlockedError) for e in chain)
    assert KEY not in caplog.text


def test_fake_llm_mapping_script_and_accounting() -> None:
    script = {"triage": '{"tier": "LOW"}', "specialist": ["one", "two"]}
    fake = FakeLLM(script)
    assert fake.complete("triage", "sys", "user words here")[0] == '{"tier": "LOW"}'
    assert fake.complete("specialist", "s", "u")[0] == "one"
    assert fake.complete("specialist", "s", "u")[0] == "two"
    with pytest.raises(LLMError, match="exhausted"):
        fake.complete("specialist", "s", "u")
    with pytest.raises(LLMError, match="no script"):
        fake.complete("critic", "s", "u")
    assert script["specialist"] == ["one", "two"]
    assert [(r.role, r.model, r.fallback_used) for r in fake.ledger] == [
        ("triage", "fake", False),
        ("specialist", "fake", False),
        ("specialist", "fake", False),
    ]
    assert fake.ledger[0].prompt_tokens == 4
    assert fake.prompts[0] == ("triage", "sys", "user words here")


def test_fake_llm_callable_script() -> None:
    fake = FakeLLM(lambda role, system, user: f"{role}:{user}")
    text, record = fake.complete("synth", "s", "case 1", json_mode=True, temperature=0.1)
    assert text == "synth:case 1"
    assert record.completion_tokens == 2


def test_get_client_uses_factory_hook() -> None:
    fake = FakeLLM({"x": "y"})
    seen: list[list[str] | None] = []

    def factory(models: list[str] | None) -> FakeLLM:
        seen.append(models)
        return fake

    set_client_factory(factory)
    assert get_client() is fake
    assert get_client(["m1", "m2"]) is fake
    assert seen == [None, ["m1", "m2"]]


def _clean_env(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    for key in ENV_KEYS:
        monkeypatch.delenv(key, raising=False)
    monkeypatch.chdir(tmp_path)


def test_get_client_without_factory_reads_env(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    _clean_env(monkeypatch, tmp_path)
    (tmp_path / ".env").write_text(f"OPENAI_API_KEY={KEY}\nDYNACLINIC_MODEL=cwd-model\n")
    client = get_client()
    assert isinstance(client, OpenAIChatClient)
    assert client.models == ["cwd-model"]


@pytest.mark.parametrize("without_dotenv", [False, True])
def test_client_from_env_file_and_precedence(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, without_dotenv: bool
) -> None:
    _clean_env(monkeypatch, tmp_path)
    if without_dotenv:
        monkeypatch.setitem(sys.modules, "dotenv", None)
    env_file = tmp_path / "custom.env"
    env_file.write_text(
        "# comment\n"
        f"OPENAI_API_KEY='{KEY}'\n"
        "OPENAI_BASE_URL=https://gateway.test/v1\n"
        "DYNACLINIC_MODEL=file-model\n"
        'DYNACLINIC_FALLBACK_MODELS="fb-1, ,fb-2,file-model"\n'
    )
    monkeypatch.setenv("DYNACLINIC_MODEL", "env-model")
    client = client_from_env(env_file=env_file)
    assert client.models == ["env-model", "fb-1", "fb-2", "file-model"]
    assert client.base_url == "https://gateway.test/v1"
    assert client_from_env(["only"], env_file=env_file).models == ["only"]


def test_client_from_env_requires_key_and_model(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    _clean_env(monkeypatch, tmp_path)
    with pytest.raises(LLMError, match="OPENAI_API_KEY"):
        client_from_env(["m"])
    monkeypatch.setenv("OPENAI_API_KEY", KEY)
    with pytest.raises(LLMError, match="DYNACLINIC_MODEL"):
        client_from_env()
    assert client_from_env(["m"]).base_url == "https://api.openai.com/v1"
