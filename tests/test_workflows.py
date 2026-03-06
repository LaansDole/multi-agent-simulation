"""Integration tests for the workflow CRUD routes."""

import pytest


# Minimal valid YAML that passes check_config (mocked).
VALID_YAML = "graph:\n  id: test\n  nodes: []\n"


@pytest.fixture(autouse=True)
def _mock_check_config(monkeypatch):
    """All workflow route tests mock check_config to avoid runtime dependencies."""
    monkeypatch.setattr("server.services.workflow_storage.check_config", lambda c: "")


class TestListWorkflows:

    def test_empty_when_dir_missing(self, client, tmp_yaml_dir, monkeypatch):
        import shutil
        shutil.rmtree(tmp_yaml_dir)
        response = client.get("/api/workflows")
        assert response.status_code == 200
        assert response.json()["workflows"] == []

    def test_returns_files(self, client, tmp_yaml_dir):
        (tmp_yaml_dir / "a.yaml").write_text(VALID_YAML)
        (tmp_yaml_dir / "b.yaml").write_text(VALID_YAML)
        response = client.get("/api/workflows")
        assert response.status_code == 200
        names = response.json()["workflows"]
        assert sorted(names) == ["a.yaml", "b.yaml"]


class TestUploadWorkflowContent:

    def test_upload_success(self, client, tmp_yaml_dir):
        response = client.post(
            "/api/workflows/upload/content",
            json={"filename": "new.yaml", "content": VALID_YAML},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert (tmp_yaml_dir / "new.yaml").exists()

    def test_upload_duplicate_returns_409(self, client, tmp_yaml_dir):
        (tmp_yaml_dir / "dup.yaml").write_text(VALID_YAML)
        response = client.post(
            "/api/workflows/upload/content",
            json={"filename": "dup.yaml", "content": VALID_YAML},
        )
        assert response.status_code == 409


class TestGetWorkflowContent:

    def test_get_existing(self, client, tmp_yaml_dir):
        (tmp_yaml_dir / "exist.yaml").write_text(VALID_YAML)
        response = client.get("/api/workflows/exist.yaml")
        assert response.status_code == 200
        assert response.json()["content"] == VALID_YAML

    def test_get_missing_returns_error(self, client, tmp_yaml_dir):
        response = client.get("/api/workflows/missing.yaml")
        assert response.status_code in (404, 500)


class TestUpdateWorkflowContent:

    def test_update_existing(self, client, tmp_yaml_dir):
        (tmp_yaml_dir / "upd.yaml").write_text(VALID_YAML)
        new_content = "graph:\n  id: updated\n  nodes: []\n"
        response = client.put(
            "/api/workflows/upd.yaml",
            json={"content": new_content},
        )
        assert response.status_code == 200
        assert (tmp_yaml_dir / "upd.yaml").read_text() == new_content

    def test_update_missing_returns_404(self, client, tmp_yaml_dir):
        response = client.put(
            "/api/workflows/ghost.yaml",
            json={"content": VALID_YAML},
        )
        assert response.status_code == 404


class TestDeleteWorkflow:

    def test_delete_existing(self, client, tmp_yaml_dir):
        (tmp_yaml_dir / "del.yaml").write_text(VALID_YAML)
        response = client.delete("/api/workflows/del.yaml")
        assert response.status_code == 200
        assert not (tmp_yaml_dir / "del.yaml").exists()

    def test_delete_missing_returns_error(self, client, tmp_yaml_dir):
        response = client.delete("/api/workflows/nope.yaml")
        assert response.status_code in (404, 500)


class TestRenameWorkflow:

    def test_rename_success(self, client, tmp_yaml_dir):
        (tmp_yaml_dir / "orig.yaml").write_text(VALID_YAML)
        response = client.post(
            "/api/workflows/orig.yaml/rename",
            json={"new_filename": "renamed.yaml"},
        )
        assert response.status_code == 200
        assert not (tmp_yaml_dir / "orig.yaml").exists()
        assert (tmp_yaml_dir / "renamed.yaml").exists()

    def test_rename_conflict(self, client, tmp_yaml_dir):
        (tmp_yaml_dir / "a.yaml").write_text(VALID_YAML)
        (tmp_yaml_dir / "b.yaml").write_text(VALID_YAML)
        response = client.post(
            "/api/workflows/a.yaml/rename",
            json={"new_filename": "b.yaml"},
        )
        assert response.status_code in (409, 500)

    def test_rename_not_found(self, client, tmp_yaml_dir):
        response = client.post(
            "/api/workflows/missing.yaml/rename",
            json={"new_filename": "new.yaml"},
        )
        assert response.status_code in (404, 500)


class TestCopyWorkflow:

    def test_copy_success(self, client, tmp_yaml_dir):
        (tmp_yaml_dir / "src.yaml").write_text(VALID_YAML)
        response = client.post(
            "/api/workflows/src.yaml/copy",
            json={"new_filename": "cpy.yaml"},
        )
        assert response.status_code == 200
        assert (tmp_yaml_dir / "src.yaml").exists()
        assert (tmp_yaml_dir / "cpy.yaml").exists()

    def test_copy_conflict(self, client, tmp_yaml_dir):
        (tmp_yaml_dir / "a.yaml").write_text(VALID_YAML)
        (tmp_yaml_dir / "b.yaml").write_text(VALID_YAML)
        response = client.post(
            "/api/workflows/a.yaml/copy",
            json={"new_filename": "b.yaml"},
        )
        assert response.status_code in (409, 500)
