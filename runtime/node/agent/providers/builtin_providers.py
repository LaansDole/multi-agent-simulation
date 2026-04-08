"""Register built-in agent providers."""

from runtime.node.agent.providers.base import ProviderRegistry

from runtime.node.agent.providers.openai_provider import OpenAIProvider

ProviderRegistry.register(
    "openai",
    OpenAIProvider,
    label="OpenAI",
    summary="OpenAI models via the official OpenAI SDK (responses API)",
)

try:
    from runtime.node.agent.providers.gemini_provider import GeminiProvider
except ImportError:
    GeminiProvider = None

if GeminiProvider is not None:
    ProviderRegistry.register(
        "gemini",
        GeminiProvider,
        label="Google Gemini",
        summary="Google Gemini models via google-genai",
    )
else:
    print("Gemini provider not registered: google-genai library not found.")

try:
    from runtime.node.agent.providers.local_provider import LocalProvider
except ImportError:
    LocalProvider = None

if LocalProvider is not None:
    ProviderRegistry.register(
        "local",
        LocalProvider,
        label="Local (llama-cpp-python)",
        summary="Local GGUF model inference via llama-cpp-python",
    )
else:
    print("Local provider not registered: llama-cpp-python library not found.")
