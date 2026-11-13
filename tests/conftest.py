"""Shared fixtures for the multi-agent-simulation test suite."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def tmp_yaml_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Provide an isolated temporary YAML directory."""
    d = tmp_path / "yaml_instance"
    d.mkdir()
    monkeypatch.setattr("server.settings.YAML_DIR", d)
    # Also patch the local reference cached by the routes module at import time.
    monkeypatch.setattr("server.routes.workflows.YAML_DIR", d)
    return d


@pytest.fixture()
def tmp_warehouse_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Provide an isolated temporary WareHouse directory."""
    d = tmp_path / "WareHouse"
    d.mkdir()
    monkeypatch.setattr("server.settings.WARE_HOUSE_DIR", d)
    # Also patch the reference imported in the sessions route module.
    monkeypatch.setattr("server.routes.sessions.WARE_HOUSE_DIR", d)
    return d


@pytest.fixture()
def tmp_spatial_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Provide an isolated temporary spatial configs directory."""
    d = tmp_path / "spatial_configs"
    # Don't create it yet — tests may want to verify behaviour when missing.
    monkeypatch.setattr("server.routes.spatial_configs.SPATIAL_CONFIGS_DIR", d)
    return d


@pytest.fixture()
def tmp_vuegraph_db(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Point vuegraph storage at a temporary SQLite database."""
    db_path = tmp_path / "vuegraphs.db"
    monkeypatch.setenv("VUEGRAPHS_DB_PATH", str(db_path))
    # Clear the module-level cache so the new path is picked up.
    from server.services import vuegraphs_storage
    vuegraphs_storage._INITIALIZED_PATHS.clear()
    return db_path


@pytest.fixture()
def client() -> TestClient:
    """Create a FastAPI TestClient bound to the application."""
    from server.app import app

    return TestClient(app)
