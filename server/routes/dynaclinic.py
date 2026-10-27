"""Mock DynaClinic demo scenarios for the 3D UI: plain-text cases (``dynaclinic.plaintext``) of fictional patients."""

import re
from pathlib import Path

from fastapi import APIRouter

from dynaclinic.eval.cases import DATA_DIR

router = APIRouter()

SCENARIOS_DIR = DATA_DIR / "demo_scenarios"
_META = re.compile(r"^#\s*(title|teaches|source)\s*:\s*(.*)$")


def _scenario(path: Path) -> dict[str, str]:
    scenario = {"id": path.stem, "title": path.stem, "teaches": "", "source": ""}
    text: list[str] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        meta = _META.match(line)
        if meta:
            scenario[meta[1]] = meta[2].strip()
        else:
            text.append(line)
    return {**scenario, "text": "\n".join(text).strip()}


@router.get("/api/dynaclinic/scenarios")
def list_scenarios() -> list[dict[str, str]]:
    """``[{id, title, teaches, source, text}]`` sorted by file name; ``text`` is the case without its ``# key:`` lines."""
    return [_scenario(path) for path in sorted(SCENARIOS_DIR.glob("*.txt"))]
