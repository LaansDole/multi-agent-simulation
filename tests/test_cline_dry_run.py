"""Integration test: dry-run a YAML workflow against the real Cline API (clinepass).

This test calls the Cline API at https://api.cline.bot/api/v1 using the
cline-pass/qwen3.7-max model. It requires CLINE_API_KEY and CLINE_BASE_URL
in the environment (or .env). Mark it with @pytest.mark.cline so it can be
skipped in CI environments without API access.

Run: uv run pytest tests/test_cline_dry_run.py -v
Skip in CI: uv run pytest -m "not cline" -v
"""

import os

import pytest

from runtime.sdk import run_workflow
from utils.env_loader import load_dotenv_file


@pytest.mark.cline
def test_cline_dry_run() -> None:
    """Execute the cline_dry_run.yaml workflow and verify a non-empty LLM response.

    The workflow has two agent nodes (writer -> reviewer) both using the
    Cline API. The reviewer's role instructs it to respond with REVIEW_DONE
    followed by the writer's sentence. We assert the final output contains
    REVIEW_DONE and is non-empty.
    """
    # Populate os.environ from .env so the skip check sees CLINE_API_KEY when
    # the ambient shell lacks it. run_workflow() calls this again internally
    # for placeholder resolution, but only after this check.
    load_dotenv_file()

    # Skip gracefully if the API key is still not in the environment.
    api_key = os.environ.get("CLINE_API_KEY")
    if not api_key:
        pytest.skip("CLINE_API_KEY not set in environment; skipping Cline dry-run test")

    result = run_workflow(
        "yaml_instance/cline_dry_run.yaml",
        task_prompt="Begin the dry run.",
        session_name="cline_dry_run_test",
    )

    assert result.final_message is not None, (
        "Final message from end node (reviewer) is None"
    )

    final_text = result.final_message.text_content()
    assert final_text is not None, "Final message text_content() returned None"
    assert len(final_text.strip()) > 0, "Final message text is empty"
    assert "REVIEW_DONE" in final_text, (
        f"Expected 'REVIEW_DONE' in output, got: {final_text[:200]}"
    )
