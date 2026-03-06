"""Integration tests for the config schema routes."""



class TestConfigSchemaValidate:

    def test_invalid_yaml_returns_400(self, client):
        response = client.post(
            "/api/config/schema/validate",
            json={"document": "key: [unclosed", "breadcrumbs": None},
        )
        assert response.status_code == 400

    def test_non_mapping_returns_422(self, client):
        response = client.post(
            "/api/config/schema/validate",
            json={"document": "- item1\n- item2\n", "breadcrumbs": None},
        )
        assert response.status_code == 422

    def test_valid_mapping_returns_result(self, client):
        response = client.post(
            "/api/config/schema/validate",
            json={"document": "graph:\n  id: test\n  nodes: []\n", "breadcrumbs": None},
        )
        assert response.status_code == 200
        data = response.json()
        assert "valid" in data
