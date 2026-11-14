"""Shared server configuration constants."""

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
YAML_DIR = REPO_ROOT / "yaml_instance"
SPATIAL_CONFIGS_DIR = REPO_ROOT / "frontend" / "public" / "spatial_configs"
# ponytail: CWD-relative like the other run-output roots (AttachmentService, GraphConfig, run.py); anchor them together.
WARE_HOUSE_DIR = Path("WareHouse")
