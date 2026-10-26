"""LLM access for DynaClinic: OpenAI chat client with sticky model fallback, offline fake.

``OpenAIChatClient`` calls ``chat.completions.create`` only (never the Responses
API). The API key is handed to the SDK and never stored, logged or echoed.
"""

import logging
import os
import re
import threading
import time
from collections.abc import Callable, Mapping
from pathlib import Path
from typing import Protocol

import openai
from openai import OpenAI

from dynaclinic.types import CallRecord

logger = logging.getLogger(__name__)

DEFAULT_BASE_URL = "https://api.openai.com/v1"

# Errors after which the current model is abandoned for the rest of the run.
# The SDK has already retried timeouts and 5xx ``max_retries`` times when these surface.
_FALLBACK_ERRORS = (
    openai.NotFoundError,
    openai.PermissionDeniedError,
    openai.InternalServerError,
    openai.APITimeoutError,
)
_MODEL_MISSING = re.compile(r"model_not_found|invalid model|model\b.*\b(?:not found|does not exist|unknown)")
# Optional request params a model may reject with a 400, and the error text that names them.
_DROPPABLE = {"temperature": ("temperature",), "response_format": ("response_format", "json")}


class LLMError(RuntimeError):
    """Raised when an LLM call cannot be completed."""


class LLMClient(Protocol):
    """Minimal chat interface shared by the real client and ``FakeLLM``."""

    ledger: list[CallRecord]

    def complete(
        self, role: str, system: str, user: str, json_mode: bool = False, temperature: float | None = None
    ) -> tuple[str, CallRecord]:
        """Return the reply text and its accounting record."""
        ...

    def reset_ledger(self) -> list[CallRecord]:
        """Return the accumulated records and start a fresh ledger."""
        ...


class OpenAIChatClient:
    """OpenAI-compatible chat client with a sticky fallback chain and a call ledger."""

    def __init__(
        self,
        models: list[str],
        api_key: str,
        base_url: str = DEFAULT_BASE_URL,
        timeout: float = 60,
        max_retries: int = 2,
    ) -> None:
        if not models:
            raise LLMError("at least one model is required")
        if not api_key:
            raise LLMError("an API key is required")
        self.models = list(dict.fromkeys(models))
        self.base_url = base_url
        self.ledger: list[CallRecord] = []
        self._sdk = OpenAI(api_key=api_key, base_url=base_url, timeout=timeout, max_retries=max_retries)
        self._active = 0
        self._unsupported: dict[str, set[str]] = {}
        self._lock = threading.Lock()

    def __repr__(self) -> str:
        return f"OpenAIChatClient(models={self.models!r}, base_url={self.base_url!r}, active={self.active_model!r})"

    @property
    def active_model(self) -> str:
        """Model currently in use (moves forward on fallback, never back)."""
        return self.models[self._active]

    def complete(
        self, role: str, system: str, user: str, json_mode: bool = False, temperature: float | None = None
    ) -> tuple[str, CallRecord]:
        """Run one chat completion, falling back along ``models`` on model/availability errors."""
        messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
        start = time.perf_counter()
        while True:
            index = self._active
            model = self.models[index]
            params: dict[str, object] = {}
            if temperature is not None:
                params["temperature"] = temperature
            if json_mode:
                params["response_format"] = {"type": "json_object"}
            for name in self._unsupported.get(model, ()):
                params.pop(name, None)
            try:
                response = self._sdk.chat.completions.create(model=model, messages=messages, **params)
                break
            except openai.BadRequestError as err:
                if self._drop_rejected_param(model, params, err):
                    continue
                if not (err.code == "model_not_found" or _MODEL_MISSING.search(str(err).lower())):
                    raise self._error(role, model, err) from err
                self._fall_back(role, index, err)
            except _FALLBACK_ERRORS as err:
                self._fall_back(role, index, err)
            except openai.OpenAIError as err:
                raise self._error(role, model, err) from err

        if not response.choices:
            raise LLMError(f"{role}: model {model} returned no choices")
        text = response.choices[0].message.content or ""
        usage = response.usage
        record = CallRecord(
            role=role,
            model=model,
            prompt_tokens=getattr(usage, "prompt_tokens", 0) or 0,
            completion_tokens=getattr(usage, "completion_tokens", 0) or 0,
            latency_s=time.perf_counter() - start,
            fallback_used=index > 0,
        )
        self.ledger.append(record)
        return text, record

    def reset_ledger(self) -> list[CallRecord]:
        """Return the accumulated records and start a fresh ledger."""
        records, self.ledger = self.ledger, []
        return records

    def _drop_rejected_param(self, model: str, params: dict[str, object], err: Exception) -> bool:
        """Remember and drop a param the model rejected; return whether a retry makes sense."""
        message = str(err).lower()
        for name, hints in _DROPPABLE.items():
            if name in params and any(hint in message for hint in hints):
                with self._lock:
                    self._unsupported.setdefault(model, set()).add(name)
                logger.info("model %s rejected %s; retrying without it", model, name)
                return True
        return False

    def _fall_back(self, role: str, index: int, err: Exception) -> None:
        """Advance to the next model for the rest of the run, or raise when the chain is exhausted."""
        with self._lock:
            if self._active == index:
                if index + 1 >= len(self.models):
                    raise self._error(role, self.models[index], err, exhausted=True) from err
                self._active = index + 1
        logger.warning(
            "model %s failed (%s); using %s for the rest of the run",
            self.models[index],
            type(err).__name__,
            self.active_model,
        )

    def _error(self, role: str, model: str, err: Exception, exhausted: bool = False) -> LLMError:
        message = str(err)
        key = getattr(self._sdk, "api_key", "")
        if key:
            message = message.replace(key, "***")
        prefix = f"all models failed {self.models}; last" if exhausted else "model"
        return LLMError(f"{role}: {prefix} {model} raised {type(err).__name__}: {message}")


Script = Callable[[str, str, str], str] | Mapping[str, str | list[str]]


class FakeLLM:
    """Scripted offline client: a ``(role, system, user) -> text`` callable or ``{role: text | [texts]}``.

    List replies are consumed in order; running out raises ``LLMError``.
    Every call is recorded in ``ledger`` (model ``"fake"``, word-count tokens) and ``prompts``.
    """

    def __init__(self, script: Script) -> None:
        self.ledger: list[CallRecord] = []
        self.prompts: list[tuple[str, str, str]] = []
        self._script = script if callable(script) else {
            role: list(reply) if isinstance(reply, list) else reply for role, reply in script.items()
        }
        self._lock = threading.Lock()

    def complete(
        self, role: str, system: str, user: str, json_mode: bool = False, temperature: float | None = None
    ) -> tuple[str, CallRecord]:
        """Return the scripted reply for ``role``."""
        with self._lock:
            self.prompts.append((role, system, user))
            text = self._reply(role, system, user)
            record = CallRecord(role, "fake", len(f"{system} {user}".split()), len(text.split()), 0.0, False)
            self.ledger.append(record)
        return text, record

    def reset_ledger(self) -> list[CallRecord]:
        """Return the accumulated records and start a fresh ledger."""
        records, self.ledger = self.ledger, []
        return records

    def _reply(self, role: str, system: str, user: str) -> str:
        if callable(self._script):
            return self._script(role, system, user)
        if role not in self._script:
            raise LLMError(f"FakeLLM has no script for role {role!r}")
        reply = self._script[role]
        if isinstance(reply, str):
            return reply
        if not reply:
            raise LLMError(f"FakeLLM script exhausted for role {role!r}")
        return reply.pop(0)


ClientFactory = Callable[[list[str] | None], LLMClient]
_client_factory: ClientFactory | None = None


def set_client_factory(factory: ClientFactory | None) -> None:
    """Install a factory used by ``get_client`` (tests inject ``FakeLLM``); ``None`` restores the default."""
    global _client_factory
    _client_factory = factory


def get_client(models: list[str] | None = None) -> LLMClient:
    """Return a client from the installed factory, else ``client_from_env(models)``."""
    return _client_factory(models) if _client_factory else client_from_env(models)


def _read_env_file(path: Path) -> dict[str, str]:
    """Parse a ``.env`` file with python-dotenv if importable, else a tiny KEY=VALUE parser."""
    try:
        from dotenv import dotenv_values
    except ImportError:
        values = {}
        for line in path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.removeprefix("export ").split("=", 1)
                values[key.strip()] = value.strip().strip("'\"")
        return values
    return {key: value for key, value in dotenv_values(path).items() if value is not None}


def client_from_env(models: list[str] | None = None, env_file: str | Path | None = None) -> OpenAIChatClient:
    """Build an ``OpenAIChatClient`` from the environment, falling back to ``env_file`` (default ``./.env``).

    Process environment wins over the file. The model chain is ``models`` if given, else
    ``DYNACLINIC_MODEL`` followed by the comma list ``DYNACLINIC_FALLBACK_MODELS``.
    """
    path = Path(env_file) if env_file else Path.cwd() / ".env"
    env = {**(_read_env_file(path) if path.is_file() else {}), **os.environ}
    chain = models or [env.get("DYNACLINIC_MODEL", ""), *env.get("DYNACLINIC_FALLBACK_MODELS", "").split(",")]
    chain = [model.strip() for model in chain if model and model.strip()]
    if not chain:
        raise LLMError("no model configured: set DYNACLINIC_MODEL or pass models")
    api_key = env.get("OPENAI_API_KEY", "")
    if not api_key:
        raise LLMError("OPENAI_API_KEY is not set")
    return OpenAIChatClient(chain, api_key=api_key, base_url=env.get("OPENAI_BASE_URL") or DEFAULT_BASE_URL)
