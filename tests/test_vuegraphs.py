"""Integration tests for the vuegraph routes."""



class TestVuegraphUpload:

    def test_upload_content(self, client, tmp_vuegraph_db):
        response = client.post(
            "/api/vuegraphs/upload/content",
            json={"filename": "graph1", "content": '{"nodes":[]}'},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["filename"] == "graph1"
        assert data["status"] == "saved"


class TestVuegraphGet:

    def test_get_existing(self, client, tmp_vuegraph_db):
        # First upload
        client.post(
            "/api/vuegraphs/upload/content",
            json={"filename": "g1", "content": '{"nodes":[]}'},
        )
        response = client.get("/api/vuegraphs/g1")
        assert response.status_code == 200
        assert response.json()["content"] == '{"nodes":[]}'

    def test_get_missing_returns_404(self, client, tmp_vuegraph_db):
        response = client.get("/api/vuegraphs/nonexistent")
        assert response.status_code == 404
