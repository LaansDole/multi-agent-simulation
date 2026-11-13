"""GET /api/models reports the DynaClinic default model."""

from runtime.node.agent.providers.base import ProviderRegistry


def test_models_route_reports_default_model(client, monkeypatch):
    monkeypatch.setattr(ProviderRegistry, "list_providers", staticmethod(list))
    monkeypatch.setenv("DYNACLINIC_MODEL", "env-model")
    body = client.get("/api/models").json()
    assert body["models"] == []
    assert body["default"] == {"provider": "openai", "model": "env-model"}
