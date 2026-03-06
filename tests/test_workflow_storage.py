"""Unit tests for server.services.workflow_storage.

Imports are deferred to avoid triggering the circular import chain
check.check -> runtime -> check.check during collection.
"""


import pytest

from utils.exceptions import ResourceConflictError, ResourceNotFoundError, SecurityError, ValidationError


def _import_storage():
    """Lazy import to avoid circular import at collection time."""
    from server.services.workflow_storage import (
        copy_workflow,
        rename_workflow,
        validate_workflow_content,
        validate_workflow_filename,
    )
    return validate_workflow_filename, validate_workflow_content, rename_workflow, copy_workflow


# ---------------------------------------------------------------------------
# validate_workflow_filename
# ---------------------------------------------------------------------------

class TestValidateWorkflowFilename:

    def test_valid_filename(self):
        fn, *_ = _import_storage()
        assert fn("my-flow.yaml") == "my-flow.yaml"

    def test_valid_filename_yml(self):
        fn, *_ = _import_storage()
        assert fn("my-flow.yml") == "my-flow.yml"

    def test_empty_filename_raises(self):
        fn, *_ = _import_storage()
        with pytest.raises(ValidationError):
            fn("")

    def test_whitespace_only_raises(self):
        fn, *_ = _import_storage()
        with pytest.raises(ValidationError):
            fn("   ")

    def test_path_traversal_raises(self):
        fn, *_ = _import_storage()
        with pytest.raises(SecurityError):
            fn("../../etc/passwd")

    def test_leading_slash_raises(self):
        fn, *_ = _import_storage()
        with pytest.raises(SecurityError):
            fn("/etc/passwd")

    def test_bad_characters_raises(self):
        fn, *_ = _import_storage()
        with pytest.raises(ValidationError):
            fn("hello world.yaml")

    def test_missing_yaml_extension_raises(self):
        fn, *_ = _import_storage()
        with pytest.raises(ValidationError):
            fn("script.py", require_yaml_extension=True)

    def test_extension_not_required(self):
        fn, *_ = _import_storage()
        result = fn("script.py", require_yaml_extension=False)
        assert result == "script.py"


# ---------------------------------------------------------------------------
# validate_workflow_content
# ---------------------------------------------------------------------------

class TestValidateWorkflowContent:

    def test_valid_yaml(self, monkeypatch):
        _, vc, *_ = _import_storage()
        monkeypatch.setattr("server.services.workflow_storage.check_config", lambda c: "")
        filename, content = vc("test.yaml", "graph:\n  id: test\n  nodes: []\n")
        assert filename == "test.yaml"
        assert isinstance(content, dict)

    def test_empty_yaml_raises(self, monkeypatch):
        _, vc, *_ = _import_storage()
        monkeypatch.setattr("server.services.workflow_storage.check_config", lambda c: "")
        with pytest.raises(ValidationError, match="empty"):
            vc("empty.yaml", "")

    def test_invalid_syntax_raises(self, monkeypatch):
        _, vc, *_ = _import_storage()
        monkeypatch.setattr("server.services.workflow_storage.check_config", lambda c: "")
        with pytest.raises(ValidationError, match="YAML"):
            vc("bad.yaml", "key: [unclosed")


# ---------------------------------------------------------------------------
# rename_workflow
# ---------------------------------------------------------------------------

class TestRenameWorkflow:

    def test_rename_happy_path(self, tmp_path, monkeypatch):
        *_, rn, _ = _import_storage()
        monkeypatch.setattr("server.services.workflow_storage.check_config", lambda c: "")
        src = tmp_path / "old.yaml"
        src.write_text("graph:\n  id: old\n  nodes: []\n")
        rn("old.yaml", "new.yaml", directory=tmp_path)
        assert not src.exists()
        assert (tmp_path / "new.yaml").exists()

    def test_rename_source_not_found(self, tmp_path):
        *_, rn, _ = _import_storage()
        with pytest.raises(ResourceNotFoundError):
            rn("missing.yaml", "new.yaml", directory=tmp_path)

    def test_rename_target_exists(self, tmp_path):
        *_, rn, _ = _import_storage()
        (tmp_path / "a.yaml").write_text("graph:\n  id: a\n")
        (tmp_path / "b.yaml").write_text("graph:\n  id: b\n")
        with pytest.raises(ResourceConflictError):
            rn("a.yaml", "b.yaml", directory=tmp_path)

    def test_rename_same_name_raises(self, tmp_path):
        *_, rn, _ = _import_storage()
        (tmp_path / "flow.yaml").write_text("graph:\n  id: flow\n")
        with pytest.raises(ValidationError):
            rn("flow.yaml", "flow.yaml", directory=tmp_path)


# ---------------------------------------------------------------------------
# copy_workflow
# ---------------------------------------------------------------------------

class TestCopyWorkflow:

    def test_copy_happy_path(self, tmp_path):
        *_, cp = _import_storage()
        src = tmp_path / "src.yaml"
        src.write_text("graph:\n  id: src\n")
        cp("src.yaml", "dst.yaml", directory=tmp_path)
        assert src.exists()
        assert (tmp_path / "dst.yaml").exists()

    def test_copy_source_not_found(self, tmp_path):
        *_, cp = _import_storage()
        with pytest.raises(ResourceNotFoundError):
            cp("missing.yaml", "dst.yaml", directory=tmp_path)

    def test_copy_target_exists(self, tmp_path):
        *_, cp = _import_storage()
        (tmp_path / "a.yaml").write_text("x")
        (tmp_path / "b.yaml").write_text("y")
        with pytest.raises(ResourceConflictError):
            cp("a.yaml", "b.yaml", directory=tmp_path)

    def test_copy_same_name_raises(self, tmp_path):
        *_, cp = _import_storage()
        (tmp_path / "f.yaml").write_text("x")
        with pytest.raises(ValidationError):
            cp("f.yaml", "f.yaml", directory=tmp_path)
