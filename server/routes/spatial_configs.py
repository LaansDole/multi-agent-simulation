"""Routes for saving and listing spatial configuration files."""

import json
from pathlib import Path
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from utils.structured_logger import get_server_logger, LogType

router = APIRouter()

SPATIAL_CONFIGS_DIR = Path("frontend/public/spatial_configs")


class SpatialConfigPayload(BaseModel):
    """Request body for saving a spatial configuration."""

    config: dict


@router.get("/api/spatial-configs")
async def list_spatial_configs():
    """List available spatial configuration files with metadata."""
    if not SPATIAL_CONFIGS_DIR.exists():
        return {"configs": []}

    configs: List[Dict[str, Any]] = []
    for config_file in SPATIAL_CONFIGS_DIR.glob("*.json"):
        config_name = config_file.stem
        config_data: Dict[str, Any] = {"name": config_name}

        try:
            with open(config_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                metadata = data.get("metadata", {})

                config_data["displayName"] = metadata.get(
                    "name", _format_label(config_name)
                )
                config_data["description"] = metadata.get("description", "")
                config_data["tags"] = metadata.get("tags", [])
                config_data["recommendedAgentCount"] = metadata.get(
                    "recommendedAgentCount", {}
                )
                config_data["thumbnail"] = metadata.get("thumbnail", "")
                config_data["category"] = _determine_category(metadata.get("tags", []))
        except Exception:
            config_data["displayName"] = _format_label(config_name)
            config_data["description"] = ""
            config_data["tags"] = []
            config_data["recommendedAgentCount"] = {}
            config_data["thumbnail"] = ""
            config_data["category"] = "Other"

        configs.append(config_data)

    return {"configs": configs}


def _format_label(name):
    """Format config name to display label."""
    return name.replace("_", " ").replace("-", " ").title()


def _determine_category(tags):
    """Determine layout category from tags."""
    tags_lower = [tag.lower() for tag in tags]

    if "office" in tags_lower:
        return "Office"
    elif (
        "industrial" in tags_lower
        or "warehouse" in tags_lower
        or "factory" in tags_lower
    ):
        return "Industrial"
    elif (
        "outdoor" in tags_lower
        or "park" in tags_lower
        or "street" in tags_lower
        or "parking" in tags_lower
    ):
        return "Outdoor"
    elif "hospital" in tags_lower or "medical" in tags_lower:
        return "Hospital"
    elif any(tag in tags_lower for tag in ["retail", "restaurant", "school"]):
        return "Specialized"
    else:
        return "Other"


@router.put("/api/spatial-configs/{name}")
async def save_spatial_config(name: str, payload: SpatialConfigPayload):
    """Save a spatial configuration to disk."""
    import json
    import re

    # Validate name: alphanumeric, underscores, hyphens only
    if not re.match(r"^[a-zA-Z0-9_-]+$", name):
        raise HTTPException(status_code=400, detail="Invalid config name")

    SPATIAL_CONFIGS_DIR.mkdir(parents=True, exist_ok=True)
    file_path = SPATIAL_CONFIGS_DIR / f"{name}.json"

    try:
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(payload.config, f, indent=2)

        logger = get_server_logger()
        logger.info(
            "Spatial config saved",
            log_type=LogType.WORKFLOW,
            filename=f"{name}.json",
        )
        return {
            "status": "success",
            "name": name,
            "message": f"Spatial config '{name}' saved successfully",
        }
    except Exception as exc:
        logger = get_server_logger()
        logger.log_exception(exc, f"Failed to save spatial config: {name}")
        raise HTTPException(status_code=500, detail=f"Failed to save config: {exc}")
