"""Routes for saving and listing spatial configuration files."""

from pathlib import Path

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
    """List available spatial configuration files."""
    if not SPATIAL_CONFIGS_DIR.exists():
        return {"configs": []}
    return {
        "configs": [f.stem for f in SPATIAL_CONFIGS_DIR.glob("*.json")]
    }


@router.put("/api/spatial-configs/{name}")
async def save_spatial_config(name: str, payload: SpatialConfigPayload):
    """Save a spatial configuration to disk."""
    import json
    import re

    # Validate name: alphanumeric, underscores, hyphens only
    if not re.match(r'^[a-zA-Z0-9_-]+$', name):
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
