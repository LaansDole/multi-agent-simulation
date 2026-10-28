"""demo_hospital runs on OpenAI: chat agents and the memory embedder resolve to the OpenAI endpoint."""

from pathlib import Path

from check.check import load_config
from entity.configs.node.agent import AgentConfig

DEMO_HOSPITAL = Path(__file__).resolve().parent.parent / "yaml_instance" / "demo_hospital.yaml"

DUMMY_VARS = {
    "OPENAI_BASE_URL": "https://openai.test/v1",
    "OPENAI_API_KEY": "sk-openai-dummy",
    "BASE_URL": "http://lmstudio.test:1234/v1",
    "API_KEY": "lm-studio-dummy",
}


def test_demo_hospital_agents_and_embedder_use_openai() -> None:
    design = load_config(DEMO_HOSPITAL, vars_override=DUMMY_VARS)

    agents = [cfg for node in design.graph.nodes if (cfg := node.as_config(AgentConfig))]
    assert agents
    for agent in agents:
        assert (agent.name, agent.base_url, agent.api_key) == ("gpt-6-luna", "https://openai.test/v1", "sk-openai-dummy")

    embeddings = [store.config.embedding for store in design.graph.memory or [] if getattr(store.config, "embedding", None)]
    assert embeddings
    for embedding in embeddings:
        assert (embedding.provider, embedding.model, embedding.base_url, embedding.api_key) == (
            "openai",
            "text-embedding-3-small",
            "https://openai.test/v1",
            "sk-openai-dummy",
        )
