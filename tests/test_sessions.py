"""Integration tests for the session download route."""



class TestDownloadSession:

    def test_invalid_session_id_with_dots(self, client, tmp_warehouse_dir):
        """Path-traversal-style session IDs are rejected."""
        response = client.get("/api/sessions/../../etc/download")
        # Either caught by validation (400) or not found (404)
        assert response.status_code in (400, 404)

    def test_invalid_session_id_with_spaces(self, client, tmp_warehouse_dir):
        """Session IDs with spaces are rejected."""
        response = client.get("/api/sessions/bad%20id/download")
        assert response.status_code == 400

    def test_missing_session_directory(self, client, tmp_warehouse_dir):
        response = client.get("/api/sessions/valid-id/download")
        assert response.status_code == 404

    def test_valid_session_download(self, client, tmp_warehouse_dir):
        session_dir = tmp_warehouse_dir / "session_my-session"
        session_dir.mkdir()
        (session_dir / "result.txt").write_text("hello")
        response = client.get("/api/sessions/my-session/download")
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/zip"
