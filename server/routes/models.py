"""API endpoint for listing available models from all registered providers."""

import os

from fastapi import APIRouter

from entity.configs.node.agent import AgentConfig
from runtime.node.agent.providers.base import ModelInfo, ProviderRegistry

router = APIRouter()


@router.get("/api/models")
async def get_models():
    """List available models from all registered providers.

    Iterates registered providers, instantiates each with env-configured
    credentials, and collects their model listings. Providers that fail
    (e.g. LM Studio not running) are silently skipped.
    """
    models: list[ModelInfo] = []

    for provider_name in ProviderRegistry.list_providers():
        provider_cls = ProviderRegistry.get_provider(provider_name)
        if provider_cls is None:
            continue

        try:
            config = AgentConfig(
                provider=provider_name,
                name="",
                base_url=os.getenv("BASE_URL"),
                api_key=os.getenv("API_KEY"),
                path="",
            )
            provider = provider_cls(config)
            models.extend(provider.list_models())
        except Exception:
            continue

    return {
        "models": [{"id": m.id, "provider": m.provider, "type": m.type} for m in models]
    }
