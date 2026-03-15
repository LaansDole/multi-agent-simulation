"""Integration tests for the spatial config routes."""

import json



class TestListSpatialConfigs:

    def test_empty_when_dir_missing(self, client, tmp_spatial_dir):
        response = client.get("/api/spatial-configs")
        assert response.status_code == 200
        assert response.json()["configs"] == []

    def test_lists_existing_configs(self, client, tmp_spatial_dir):
        tmp_spatial_dir.mkdir(parents=True, exist_ok=True)
        (tmp_spatial_dir / "map1.json").write_text(json.dumps({"key": 1}))
        (tmp_spatial_dir / "map2.json").write_text(json.dumps({"key": 2}))
        response = client.get("/api/spatial-configs")
        assert response.status_code == 200
        configs = response.json()["configs"]
        names = sorted(c["name"] for c in configs)
        assert names == ["map1", "map2"]

    def test_deduplicates_display_names(self, client, tmp_spatial_dir):
        tmp_spatial_dir.mkdir(parents=True, exist_ok=True)
        (tmp_spatial_dir / "hosp_a.json").write_text(
            json.dumps({"metadata": {"name": "Hospital Simulation"}})
        )
        (tmp_spatial_dir / "hosp_b.json").write_text(
            json.dumps({"metadata": {"name": "Hospital Simulation"}})
        )
        response = client.get("/api/spatial-configs")
        assert response.status_code == 200
        display_names = sorted(c["displayName"] for c in response.json()["configs"])
        assert display_names == ["Hospital Simulation", "Hospital Simulation (2)"]

    def test_unique_names_unchanged(self, client, tmp_spatial_dir):
        tmp_spatial_dir.mkdir(parents=True, exist_ok=True)
        (tmp_spatial_dir / "alpha.json").write_text(
            json.dumps({"metadata": {"name": "Alpha Layout"}})
        )
        (tmp_spatial_dir / "beta.json").write_text(
            json.dumps({"metadata": {"name": "Beta Layout"}})
        )
        response = client.get("/api/spatial-configs")
        assert response.status_code == 200
        display_names = sorted(c["displayName"] for c in response.json()["configs"])
        assert display_names == ["Alpha Layout", "Beta Layout"]


class TestSaveSpatialConfig:

    def test_save_valid_config(self, client, tmp_spatial_dir):
        response = client.put(
            "/api/spatial-configs/my-config",
            json={"config": {"agents": []}},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert (tmp_spatial_dir / "my-config.json").exists()

    def test_invalid_name_returns_400(self, client, tmp_spatial_dir):
        response = client.put(
            "/api/spatial-configs/bad name!",
            json={"config": {}},
        )
        assert response.status_code == 400
