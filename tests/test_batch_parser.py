"""Unit tests for server.services.batch_parser."""

import pytest

from server.services.batch_parser import parse_batch_file
from utils.exceptions import ValidationError


class TestParseBatchFile:

    def _csv_bytes(self, text: str) -> bytes:
        return text.encode("utf-8")

    def test_parse_valid_csv(self):
        csv = "task\nhello world\nfoo bar\n"
        tasks, file_base = parse_batch_file(self._csv_bytes(csv), "batch.csv")
        assert file_base == "batch"
        assert len(tasks) == 2
        assert tasks[0].task_prompt == "hello world"
        assert tasks[1].task_prompt == "foo bar"

    def test_parse_csv_with_id_column(self):
        csv = "id,task\na1,hello\na2,world\n"
        tasks, _ = parse_batch_file(self._csv_bytes(csv), "data.csv")
        assert tasks[0].task_id == "a1"
        assert tasks[1].task_id == "a2"

    def test_unsupported_file_type(self):
        with pytest.raises(ValidationError, match="Unsupported"):
            parse_batch_file(b"data", "file.txt")

    def test_empty_batch_raises(self):
        csv = "task\n"
        with pytest.raises(ValidationError, match="no tasks"):
            parse_batch_file(self._csv_bytes(csv), "empty.csv")

    def test_duplicate_ids_raise(self):
        csv = "id,task\ndup,hello\ndup,world\n"
        with pytest.raises(ValidationError, match="Duplicate"):
            parse_batch_file(self._csv_bytes(csv), "dups.csv")

    def test_csv_with_attachments(self):
        csv = 'task,attachments\nhello,"[""f1.txt"",""f2.txt""]"\n'
        tasks, _ = parse_batch_file(self._csv_bytes(csv), "att.csv")
        assert tasks[0].attachment_paths == ["f1.txt", "f2.txt"]

    def test_csv_with_vars(self):
        csv = 'task,vars\nhello,"{""key"":""val""}"\n'
        tasks, _ = parse_batch_file(self._csv_bytes(csv), "vars.csv")
        assert tasks[0].vars_override == {"key": "val"}
