# the-delegation Run-Any-YAML Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the-delegation (ThreeJS) import and run any YAML workflow in `yaml_instance/` via the DevAll backend, visualizing agent nodes as <=5 3D characters and rendering all nodes in a read-only ReactFlow graph.

**Architecture:** Hybrid. The DevAll backend gains one read-only endpoint that reuses the canonical `load_config` parser to serialize a `DesignConfig` into a `NormalizedGraph` (nodes/edges/types/agent_nodes). The the-delegation frontend owns the agent->3D-character-slot mapping and routing. The original YAML always runs unchanged on the backend; the imported/edited team is purely a visualization + mapping layer. A routing precedence fix in `EventBridge` makes the frontend `nodeAgentMap` authoritative (fixing a pre-existing bug where every node animates the lead character).

**Tech Stack:** Backend: Python 3.12, FastAPI, pytest, `fastapi.testclient.TestClient`. Frontend: TypeScript, React 19, Vite 6, Zustand 5, `@xyflow/react` (React Flow), Three.js. No JS test framework is installed in the-delegation, so frontend tasks verify via `npm run lint` (`tsc --noEmit`) and `npm run build`; pure-logic modules get a temporary `npx vite-node` verification script.

## Global Constraints

- Python 3.12 (not 3.13). Use `uv run` for all Python commands. Backend tests: `uv run pytest tests/<file>::<test> -v`.
- No emojis anywhere (code, docs, comments, commit messages).
- No "claude" as git commit author.
- Type hints required on all new Python function signatures.
- the-delegation frontend commands run from `the-delegation/`: `cd the-delegation && npm run lint` and `npm run build`.
- the-delegation has NO JS test runner; verify TS with `npm run lint` (tsc) + `npm run build`.
- Canonical node types come from `iter_node_schemas()` (single source of truth) — never hardcode the node-type list in the frontend.
- `MAX_AGENTS = 5` in the-delegation; agent nodes beyond 5 and all non-agent nodes map to character slot `-1` (log/flow only, no 3D character).
- The original YAML file is always executed unchanged; the frontend never re-serializes an imported workflow.

---

## File Structure

### Backend (DevAll) — creates/modifies
- **Create** `server/services/workflow_graph_serializer.py` — pure function `serialize_design(design, *, filename) -> dict`.
- **Modify** `server/routes/workflows.py` — add `GET /api/workflows/{filename}/graph` route.
- **Create** `tests/test_workflow_graph_serializer.py` — unit tests for `serialize_design`.
- **Create** `tests/test_workflow_graph_route.py` — HTTP integration tests for the new route.
- **Modify** `server/hooks/spatial_events.py` — stop defaulting unknown node IDs to agent index 1.

### Frontend (the-delegation) — creates/modifies
- **Modify** `src/integration/api/types.ts` — add `NormalizedGraph` and related types.
- **Modify** `src/integration/api/BackendClient.ts` — add `fetchWorkflowGraph(filename)`.
- **Create** `src/integration/api/YamlImporter.ts` — `importWorkflow(graph) -> ImportResult`.
- **Modify** `src/data/agents.ts` — add optional `sourceYamlFile?: string` to `AgenticSystem`.
- **Create** `src/integration/store/workflowStore.ts` — Zustand store for `workflowGraph` + `nodeAgentMap` + slot overrides.
- **Modify** `src/integration/api/EventBridge.ts` — flip routing precedence; handle `-1` (log-only) nodes.
- **Modify** `src/simulation/core/BackendAgentSimulation.ts` — branch `startWorkflow` on `sourceYamlFile`.
- **Create** `src/interface/WorkflowBrowser.tsx` — modal listing `yaml_instance/*.yaml` with import action.
- **Create** `src/interface/ReadOnlyWorkflowGraph.tsx` — read-only ReactFlow rendering of all nodes/edges.
- **Create** `src/interface/CharacterSlotMapping.tsx` — panel to view/reassign the 5 character slots.
- **Modify** `src/interface/Header.tsx` — add a "Browse Workflows" button.
- **Modify** `src/interface/ProjectView.tsx` — render read-only graph + slot mapping in design view when `workflowGraph` is set.

---

## Task 1: Backend graph serializer (pure function)

**Files:**
- Create: `server/services/workflow_graph_serializer.py`
- Test: `tests/test_workflow_graph_serializer.py`

**Interfaces:**
- Consumes: `check.check.load_config(config_path: Path, *, vars_override=None) -> DesignConfig`; `entity.configs.AgentConfig, DesignConfig`; `schema_registry.iter_node_schemas() -> dict[str, NodeSchemaSpec]`; `utils.strs.titleize(value: str) -> str`.
- Produces: `serialize_design(design: DesignConfig, *, filename: str) -> dict` returning the `NormalizedGraph` shape below. Tasks 2 and 6 depend on these exact keys.

`NormalizedGraph` shape produced by `serialize_design`:
```python
{
  "filename": str, "version": str, "graph_id": str | None,
  "description": str | None, "is_majority_voting": bool, "vars": dict,
  "start": list[str], "end": list[str] | None,
  "node_types": dict[str, str],          # {node_type_name: summary}
  "nodes": [                              # YAML order
    {"id": str, "type": str, "label": str, "description": str | None,
     "is_agent": bool,
     "config_summary": {                  # only when is_agent True; else null
       "provider": str, "model": str, "role": str,   # role truncated 200 chars
       "has_tooling": bool, "has_memory": bool, "has_thinking": bool} | None}
  ],
  "edges": [
    {"from": str, "to": str, "trigger": bool, "carry_data": bool,
     "condition_type": str | None, "processor_type": str | None, "is_dynamic": bool}
  ],
    "agent_nodes": [                        # YAML order
    {"node_id": str, "label": str, "proposed_slot": int | None}  # slot 1-5, else None
  ],
}
```

- [ ] **Step 1: Write the failing test (part A — fixture and first tests)**

Create `tests/test_workflow_graph_serializer.py`:

```python
"""Unit tests for the workflow graph serializer."""

from pathlib import Path

import pytest

from check.check import load_config
from server.services.workflow_graph_serializer import serialize_design


# Minimal workflow that passes load_config with concrete (non-${VAR}) values
# so validation does not depend on environment variables.
MINIMAL_YAML = """\
version: 0.0.0
vars: {}
graph:
  id: minimal_graph
  description: A minimal two-node workflow for serializer tests.
  is_majority_voting: false
  nodes:
    - id: starter
      type: literal
      config:
        content: begin
        role: user
      description: Start node
      context_window: 0
      log_output: true
    - id: worker
      type: agent
      config:
        provider: openai
        name: test-model
        role: Do the work and report back.
        base_url: http://localhost
        api_key: sk-test
        params: {}
        tooling: null
        thinking: null
        memories: []
      description: The worker agent
      context_window: 0
      log_output: true
  edges:
    - from: starter
      to: worker
      trigger: true
      carry_data: true
  start:
    - starter
  end:
    - worker
"""


@pytest.fixture()
def design(tmp_path: Path) -> object:
    yaml_path = tmp_path / "minimal.yaml"
    yaml_path.write_text(MINIMAL_YAML, encoding="utf-8")
    return load_config(yaml_path)


class TestSerializeDesign:
    def test_top_level_fields(self, design):
        result = serialize_design(design, filename="minimal.yaml")
        assert result["filename"] == "minimal.yaml"
        assert result["version"] == "0.0.0"
        assert result["graph_id"] == "minimal_graph"
        assert result["is_majority_voting"] is False
        assert result["start"] == ["starter"]
        assert result["end"] == ["worker"]

    def test_node_types_catalog_includes_builtins(self, design):
        result = serialize_design(design, filename="minimal.yaml")
        nt = result["node_types"]
        assert "agent" in nt
        assert "literal" in nt
        assert isinstance(nt["agent"], str)

    def test_nodes_preserve_yaml_order_and_types(self, design):
        result = serialize_design(design, filename="minimal.yaml")
        ids = [n["id"] for n in result["nodes"]]
        assert ids == ["starter", "worker"]
        starter = result["nodes"][0]
        assert starter["type"] == "literal"
        assert starter["is_agent"] is False
        assert starter["config_summary"] is None
        assert starter["label"] == "Starter"  # titleize("starter")
```

- [ ] **Step 2: Append the remaining tests to the same file**

Append to `tests/test_workflow_graph_serializer.py`:

```python

    def test_agent_node_config_summary(self, design):
        result = serialize_design(design, filename="minimal.yaml")
        worker = result["nodes"][1]
        assert worker["is_agent"] is True
        summary = worker["config_summary"]
        assert summary["provider"] == "openai"
        assert summary["model"] == "test-model"
        assert summary["has_tooling"] is False
        assert summary["has_memory"] is False
        assert summary["has_thinking"] is False

    def test_agent_nodes_convenience_list_with_slots(self, design):
        result = serialize_design(design, filename="minimal.yaml")
        assert len(result["agent_nodes"]) == 1
        assert result["agent_nodes"][0]["node_id"] == "worker"
        assert result["agent_nodes"][0]["proposed_slot"] == 1

    def test_overflow_agent_gets_null_slot(self, tmp_path):
        nodes_yaml = "\n".join(
            f"    - id: agent_{i}\n      type: agent\n      config:\n"
            f"        provider: openai\n        name: m{i}\n        role: r{i}\n"
            f"        base_url: http://localhost\n        api_key: sk-test\n"
            f"        params: {{}}\n        tooling: null\n        thinking: null\n        memories: []\n"
            for i in range(6)
        )
        many_yaml = (
            "version: 0.0.0\nvars: {}\ngraph:\n  id: many\n  is_majority_voting: false\n"
            f"  nodes:\n{nodes_yaml}\n  start:\n    - agent_0\n  end:\n    - agent_5\n"
        )
        p = tmp_path / "many.yaml"
        p.write_text(many_yaml, encoding="utf-8")
        many_design = load_config(p)
        result = serialize_design(many_design, filename="many.yaml")
        slots = [a["proposed_slot"] for a in result["agent_nodes"]]
        assert slots == [1, 2, 3, 4, 5, None]

    def test_edges_serialized(self, design):
        result = serialize_design(design, filename="minimal.yaml")
        assert len(result["edges"]) == 1
        e = result["edges"][0]
        assert e["from"] == "starter"
        assert e["to"] == "worker"
        assert e["trigger"] is True
        assert e["carry_data"] is True
        assert e["is_dynamic"] is False
```

- [ ] **Step 3: Run test to verify it fails**

Run: `uv run pytest tests/test_workflow_graph_serializer.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'server.services.workflow_graph_serializer'`

- [ ] **Step 4: Write the implementation**

Create `server/services/workflow_graph_serializer.py`:

```python
"""Serialize a validated DesignConfig into a NormalizedGraph for the 3D frontend."""

from typing import Any, Dict, List, Optional

from entity.configs import AgentConfig, DesignConfig
from schema_registry import iter_node_schemas
from utils.strs import titleize

MAX_AGENT_SLOTS = 5
_ROLE_TRUNCATE = 200


def _agent_config_summary(node) -> Optional[Dict[str, Any]]:
    agent = node.as_config(AgentConfig)
    if agent is None:
        return None
    return {
        "provider": agent.provider,
        "model": agent.name,
        "role": (agent.role or "").strip()[:_ROLE_TRUNCATE],
        "has_tooling": bool(agent.tooling),
        "has_memory": bool(agent.memories),
        "has_thinking": agent.thinking is not None,
    }


def _node_label(node) -> str:
    label = getattr(node, "label", None) or getattr(node, "name", None)
    if label:
        return str(label)
    return titleize(node.id)


def _serialize_edge(edge) -> Dict[str, Any]:
    condition_type: Optional[str] = None
    if edge.condition is not None:
        condition_type = getattr(edge.condition, "type", None)
    processor_type: Optional[str] = None
    if edge.process is not None:
        processor_type = getattr(edge.process, "type", None)
    return {
        "from": edge.source,
        "to": edge.target,
        "trigger": edge.trigger,
        "carry_data": edge.carry_data,
        "condition_type": condition_type,
        "processor_type": processor_type,
        "is_dynamic": edge.dynamic is not None,
    }


def serialize_design(design: DesignConfig, *, filename: str) -> Dict[str, Any]:
    """Serialize a validated DesignConfig into a NormalizedGraph dict."""
    graph = design.graph
    node_types: Dict[str, str] = {
        name: (spec.summary or "") for name, spec in iter_node_schemas().items()
    }

    nodes_out: List[Dict[str, Any]] = []
    agent_nodes: List[Dict[str, Any]] = []

    for node in graph.nodes:
        is_agent = node.type == "agent"
        label = _node_label(node)
        nodes_out.append({
            "id": node.id,
            "type": node.type,
            "label": label,
            "description": node.description,
            "is_agent": is_agent,
            "config_summary": _agent_config_summary(node) if is_agent else None,
        })
        if is_agent:
            assigned = len(agent_nodes)
            proposed_slot = assigned + 1 if assigned < MAX_AGENT_SLOTS else None
            agent_nodes.append({"node_id": node.id, "label": label, "proposed_slot": proposed_slot})

    return {
        "filename": filename,
        "version": design.version,
        "graph_id": graph.id,
        "description": graph.description,
        "is_majority_voting": graph.is_majority_voting,
        "vars": dict(design.vars or {}),
        "start": list(graph.start_nodes),
        "end": list(graph.end_nodes) if graph.end_nodes is not None else None,
        "node_types": node_types,
        "nodes": nodes_out,
        "edges": [_serialize_edge(edge) for edge in graph.edges],
        "agent_nodes": agent_nodes,
    }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `uv run pytest tests/test_workflow_graph_serializer.py -v`
Expected: PASS (all 7 tests)

- [ ] **Step 6: Commit**

```bash
git add server/services/workflow_graph_serializer.py tests/test_workflow_graph_serializer.py
git commit -m "feat: add workflow graph serializer for 3D frontend"
```

---

## Task 2: Backend normalized-graph route

**Files:**
- Modify: `server/routes/workflows.py` (add the route; place it after the existing `get_workflow_args` route)
- Test: `tests/test_workflow_graph_route.py`

**Interfaces:**
- Consumes: `server.services.workflow_storage.validate_workflow_filename(filename, *, require_yaml_extension=True) -> str`; `check.check.load_config(config_path: Path) -> DesignConfig`; `server.services.workflow_graph_serializer.serialize_design(design, *, filename) -> dict`; `server.settings.YAML_DIR`; `utils.exceptions.ResourceNotFoundError, ValidationError`; `utils.structured_logger.get_server_logger, LogType`.
- Produces: HTTP endpoint `GET /api/workflows/{filename}/graph` returning the `NormalizedGraph` JSON (Task 1 shape) on 200, 404 when the file is missing, and 422 when `load_config` raises `DesignError`.

Note: the existing route tests in `tests/test_workflows.py` mock `check_config` to avoid runtime deps, but this route uses `load_config` (full validation), so it uses real valid YAML fixtures instead. The `conftest.py` `tmp_yaml_dir` fixture patches both `server.settings.YAML_DIR` and `server.routes.workflows.YAML_DIR`.

- [ ] **Step 1: Write the failing route test**

Create `tests/test_workflow_graph_route.py`:

```python
"""Integration tests for the GET /api/workflows/{filename}/graph route."""

from pathlib import Path

import pytest


VALID_GRAPH_YAML = """\
version: 0.0.0
vars: {}
graph:
  id: route_test
  description: A workflow for route integration tests.
  is_majority_voting: false
  nodes:
    - id: source
      type: literal
      config:
        content: hello
        role: user
      description: Start
      context_window: 0
      log_output: true
    - id: sink
      type: agent
      config:
        provider: openai
        name: test-model
        role: Report results.
        base_url: http://localhost
        api_key: sk-test
        params: {}
        tooling: null
        thinking: null
        memories: []
      description: End
      context_window: 0
      log_output: true
  edges:
    - from: source
      to: sink
      trigger: true
      carry_data: true
  start:
    - source
  end:
    - sink
"""


@pytest.fixture()
def yaml_file(tmp_yaml_dir: Path) -> str:
    (tmp_yaml_dir / "route_test.yaml").write_text(VALID_GRAPH_YAML, encoding="utf-8")
    return "route_test.yaml"


class TestGetWorkflowGraph:
    def test_returns_normalized_graph(self, client, yaml_file):
        response = client.get(f"/api/workflows/{yaml_file}/graph")
        assert response.status_code == 200
        body = response.json()
        assert body["filename"] == yaml_file
        assert body["graph_id"] == "route_test"
        ids = [n["id"] for n in body["nodes"]]
        assert ids == ["source", "sink"]
        assert any(n["is_agent"] for n in body["nodes"])
        assert len(body["agent_nodes"]) == 1

    def test_missing_file_returns_404(self, client, tmp_yaml_dir):
        response = client.get("/api/workflows/does_not_exist.yaml/graph")
        assert response.status_code == 404

    def test_path_traversal_rejected(self, client, tmp_yaml_dir):
        response = client.get("/api/workflows/..%2Fetc%2Fpasswd/graph")
        assert response.status_code in (400, 404)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_workflow_graph_route.py -v`
Expected: FAIL with 404 (route does not exist yet).

- [ ] **Step 3: Add the route to `server/routes/workflows.py`**

Add these imports near the top of `server/routes/workflows.py`, after the existing `from server.services.workflow_storage import (...)` block and the `from server.settings import YAML_DIR` line:

```python
from check.check import DesignError, load_config
from server.services.workflow_graph_serializer import serialize_design
```

Then add the route function. Place it immediately after the `get_workflow_args` route (which ends with `return {"args": args}`), before the `upload_workflow_content` route:

```python
@router.get("/api/workflows/{filename}/graph")
async def get_workflow_graph(filename: str):
    try:
        safe_filename = validate_workflow_filename(filename, require_yaml_extension=True)
        file_path = YAML_DIR / safe_filename
        if not file_path.exists() or not file_path.is_file():
            raise ResourceNotFoundError(
                "Workflow file not found",
                resource_type="workflow",
                resource_id=safe_filename,
            )
        design = load_config(file_path)
        graph = serialize_design(design, filename=safe_filename)
        logger = get_server_logger()
        logger.info("Workflow graph retrieved", log_type=LogType.WORKFLOW, filename=safe_filename)
        return graph
    except ValidationError:
        raise
    except ResourceNotFoundError:
        raise
    except DesignError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        logger = get_server_logger()
        logger.log_exception(exc, f"Unexpected error retrieving workflow graph: {filename}")
        raise WorkflowExecutionError(f"Failed to retrieve workflow graph: {exc}")
```

`HTTPException`, `ResourceNotFoundError`, `ValidationError`, `WorkflowExecutionError`, `get_server_logger`, `LogType`, `validate_workflow_filename`, and `YAML_DIR` are already imported in `server/routes/workflows.py` (confirmed by reading its import block). Only the two new imports above need adding.

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_workflow_graph_route.py -v`
Expected: PASS (all 3 tests)

- [ ] **Step 5: Run the backend test suite to check for regressions**

Run: `uv run pytest tests/test_workflows.py tests/test_workflow_graph_route.py tests/test_workflow_graph_serializer.py -v`
Expected: PASS (no regressions in the existing workflow route tests)

- [ ] **Step 6: Commit**

```bash
git add server/routes/workflows.py tests/test_workflow_graph_route.py
git commit -m "feat: add GET /api/workflows/{filename}/graph endpoint"
```

---

## Task 3: Frontend types + client fetch method

**Files:**
- Modify: `the-delegation/src/integration/api/types.ts` (append after the `ModelInfo` interface, ~line 144)
- Modify: `the-delegation/src/integration/api/BackendClient.ts` (add method after `fetchModels`, ~line 245)

**Interfaces:**
- Consumes: the `NormalizedGraph` JSON shape from Task 1/2 (REST response).
- Produces: TS type `NormalizedGraph` and `BackendClient.fetchWorkflowGraph(filename: string): Promise<NormalizedGraph>` used by Task 5 importer and Task 8 browser.

All frontend commands run from `the-delegation/`.

- [ ] **Step 1: Add the types to `types.ts`**

Append to the end of `the-delegation/src/integration/api/types.ts` (after the `BackendState` interface):

```typescript
// ── Normalized Workflow Graph (from GET /api/workflows/{filename}/graph) ──

export interface AgentConfigSummary {
  provider: string;
  model: string;
  role: string;
  has_tooling: boolean;
  has_memory: boolean;
  has_thinking: boolean;
}

export interface NormalizedNode {
  id: string;
  type: string;
  label: string;
  description: string | null;
  is_agent: boolean;
  config_summary: AgentConfigSummary | null;
}

export interface NormalizedEdge {
  from: string;
  to: string;
  trigger: boolean;
  carry_data: boolean;
  condition_type: string | null;
  processor_type: string | null;
  is_dynamic: boolean;
}

export interface AgentNodeSlot {
  node_id: string;
  label: string;
  proposed_slot: number | null; // 1-5, or null for overflow agents
}

export interface NormalizedGraph {
  filename: string;
  version: string;
  graph_id: string | null;
  description: string | null;
  is_majority_voting: boolean;
  vars: Record<string, any>;
  start: string[];
  end: string[] | null;
  node_types: Record<string, string>;
  nodes: NormalizedNode[];
  edges: NormalizedEdge[];
  agent_nodes: AgentNodeSlot[];
}
```

- [ ] **Step 2: Add `fetchWorkflowGraph` to `BackendClient.ts`**

Add this method to the `BackendClient` class in `the-delegation/src/integration/api/BackendClient.ts`, immediately after the `fetchModels` method (which ends with `return [];` and a closing `}` around line 245). Also add `NormalizedGraph` to the import at the top of the file.

Update the type import block at the top (lines 12-19) to include `NormalizedGraph`:

```typescript
import type {
  BackendConnectionStatus,
  BackendEvent,
  ClientMessage,
  ModelInfo,
  NormalizedGraph,
  WorkflowExecuteRequest,
  WorkflowListItem,
} from './types';
```

Then add the method (place it after `fetchModels`, before the `// ── Event System ──` comment):

```typescript
  /** Fetch the normalized graph for a workflow file. */
  public async fetchWorkflowGraph(filename: string): Promise<NormalizedGraph> {
    const response = await fetch(
      `${this.apiUrl}/api/workflows/${encodeURIComponent(filename)}/graph`,
      { signal: AbortSignal.timeout(10000) },
    );
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Failed to fetch workflow graph (${response.status}): ${text}`);
    }
    return response.json();
  }
```

- [ ] **Step 3: Verify it type-checks**

Run: `cd the-delegation && npm run lint`
Expected: PASS (tsc --noEmit exits 0, no errors)

- [ ] **Step 4: Verify the production build still works**

Run: `cd the-delegation && npm run build`
Expected: PASS (vite build completes)

- [ ] **Step 5: Commit**

```bash
cd the-delegation
git add src/integration/api/types.ts src/integration/api/BackendClient.ts
git commit -m "feat: add NormalizedGraph types and fetchWorkflowGraph client method"
```

---

## Task 4: YAML importer (pure logic) + sourceYamlFile field

**Files:**
- Modify: `the-delegation/src/data/agents.ts` (add `sourceYamlFile?: string` to `AgenticSystem`, ~line 39)
- Create: `the-delegation/src/integration/api/YamlImporter.ts`

**Interfaces:**
- Consumes: `NormalizedGraph`, `AgentNodeSlot` (Task 3 types); `AgenticSystem`, `AgentNode`, `MAX_AGENTS` from `src/data/agents.ts`; `DEFAULT_MODELS` from `src/core/llm/constants`.
- Produces: `importWorkflow(graph: NormalizedGraph): ImportResult` where `ImportResult = { system: AgenticSystem; nodeAgentMap: Record<string, number> }`. Used by Task 5 (workflowStore) and Task 8 (WorkflowBrowser).

The `nodeAgentMap` maps agent node IDs to character slots 1-5. Non-agent nodes and overflow agents are intentionally absent (the EventBridge fix in Task 6 returns `-1` for unmapped node IDs).

- [ ] **Step 1: Add `sourceYamlFile` to `AgenticSystem`**

In `the-delegation/src/data/agents.ts`, insert `sourceYamlFile?: string;` after the `leadAgent: AgentNode;` line in the `AgenticSystem` interface, so it reads:

```typescript
  leadAgent: AgentNode;
  sourceYamlFile?: string;
}
```

- [ ] **Step 2: Write the importer**

Create `the-delegation/src/integration/api/YamlImporter.ts`:

```typescript
/**
 * YamlImporter -- Converts a NormalizedGraph (from the backend graph endpoint)
 * into an AgenticSystem + nodeAgentMap for the-delegation's 3D visualization.
 *
 * Pure transform, no IO. Agent nodes fill character slots 1-5 in YAML order;
 * overflow agents and all non-agent nodes are absent from nodeAgentMap (they
 * resolve to -1 / log-only in the EventBridge). The original YAML file runs
 * unchanged on the backend; this mapping is purely a visualization layer.
 */

import type { AgentNodeSlot, NormalizedGraph } from './types';
import type { AgenticSystem, AgentNode } from '../../data/agents';
import { MAX_AGENTS } from '../../data/agents';
import { DEFAULT_MODELS } from '../../core/llm/constants';

const SLOT_COLORS = ['#4285F4', '#34A853', '#FBBC05', '#EA4335', '#64748B'];

export interface ImportResult {
  system: AgenticSystem;
  nodeAgentMap: Record<string, number>;
}

export function importWorkflow(graph: NormalizedGraph): ImportResult {
  const nodeAgentMap: Record<string, number> = {};
  const nodeLookup = new Map(graph.nodes.map((n) => [n.id, n]));

  const buildFromSlot = (slot: AgentNodeSlot, index: number): AgentNode => {
    const fullNode = nodeLookup.get(slot.node_id);
    const summary = fullNode?.config_summary;
    return {
      id: slot.node_id,
      index,
      name: slot.label,
      description: summary?.role || fullNode?.description || 'Imported agent node',
      color: SLOT_COLORS[index - 1] ?? SLOT_COLORS[0],
      model: summary?.model || DEFAULT_MODELS.text,
      provider: summary?.provider,
      position: { x: (index - 2) * 220, y: index === 1 ? 130 : 320 },
    };
  };

  const mapped = graph.agent_nodes
    .filter((a) => a.proposed_slot !== null)
    .slice(0, MAX_AGENTS);

  let leadAgent: AgentNode;
  if (mapped.length > 0) {
    leadAgent = buildFromSlot(mapped[0], 1);
    nodeAgentMap[mapped[0].node_id] = 1;
    leadAgent.subagents = mapped.slice(1).map((slot, i) => {
      const idx = i + 2;
      nodeAgentMap[slot.node_id] = idx;
      return buildFromSlot(slot, idx);
    });
  } else {
    leadAgent = {
      id: 'imported-lead',
      index: 1,
      name: 'Workflow',
      description: graph.description || 'Imported workflow with no agent nodes.',
      color: SLOT_COLORS[0],
      model: DEFAULT_MODELS.text,
      position: { x: 0, y: 130 },
    };
  }

  const system: AgenticSystem = {
    id: graph.graph_id || graph.filename.replace(/\.ya?ml$/, ''),
    teamName: graph.graph_id || graph.filename,
    teamType: 'Imported',
    teamDescription: graph.description || `Imported from ${graph.filename}`,
    color: SLOT_COLORS[0],
    outputType: 'text',
    outputModel: DEFAULT_MODELS.text,
    outputAutoApprove: true,
    user: { index: 0, model: 'Human', position: { x: 0, y: 0 } },
    leadAgent,
    sourceYamlFile: graph.filename,
  };

  return { system, nodeAgentMap };
}
```

- [ ] **Step 3: Verify it type-checks**

Run: `cd the-delegation && npm run lint`
Expected: PASS (tsc --noEmit exits 0)

- [ ] **Step 4: Verify the import logic with a temporary script**

Create `the-delegation/verify_importer.ts`:

```typescript
import { importWorkflow } from './src/integration/api/YamlImporter';
import type { NormalizedGraph } from './src/integration/api/types';

const graph: NormalizedGraph = {
  filename: 'demo.yaml', version: '0.0.0', graph_id: 'demo',
  description: 'Test workflow', is_majority_voting: false, vars: {},
  start: ['a'], end: ['c'],
  node_types: { agent: 'Agent node', literal: 'Literal node' },
  nodes: [
    { id: 'a', type: 'agent', label: 'Agent A', description: null, is_agent: true,
      config_summary: { provider: 'openai', model: 'm1', role: 'r1', has_tooling: false, has_memory: false, has_thinking: false } },
    { id: 'b', type: 'literal', label: 'Literal B', description: null, is_agent: false, config_summary: null },
    { id: 'c', type: 'agent', label: 'Agent C', description: null, is_agent: true,
      config_summary: { provider: 'openai', model: 'm2', role: 'r2', has_tooling: false, has_memory: false, has_thinking: false } },
  ],
  edges: [{ from: 'a', to: 'c', trigger: true, carry_data: true, condition_type: null, processor_type: null, is_dynamic: false }],
  agent_nodes: [
    { node_id: 'a', label: 'Agent A', proposed_slot: 1 },
    { node_id: 'c', label: 'Agent C', proposed_slot: 2 },
  ],
};

const { system, nodeAgentMap } = importWorkflow(graph);
const ok =
  system.id === 'demo' &&
  system.sourceYamlFile === 'demo.yaml' &&
  system.leadAgent.id === 'a' &&
  system.leadAgent.index === 1 &&
  system.leadAgent.subagents?.length === 1 &&
  system.leadAgent.subagents[0].id === 'c' &&
  system.leadAgent.subagents[0].index === 2 &&
  nodeAgentMap['a'] === 1 &&
  nodeAgentMap['c'] === 2 &&
  !('b' in nodeAgentMap);
console.log('ASSERTIONS PASS:', ok);
if (!ok) process.exit(1);
```

Run: `cd the-delegation && npx vite-node verify_importer.ts`
Expected: prints `ASSERTIONS PASS: true` and exits 0.

Delete the temporary script: `cd the-delegation && rm verify_importer.ts`

- [ ] **Step 5: Verify the production build**

Run: `cd the-delegation && npm run build`
Expected: PASS (vite build completes)

- [ ] **Step 6: Commit**

```bash
cd the-delegation
git add src/data/agents.ts src/integration/api/YamlImporter.ts
git commit -m "feat: add YamlImporter to map NormalizedGraph to AgenticSystem"
```

---

## Task 5: Workflow store (graph + slot mapping state)

**Files:**
- Create: `the-delegation/src/integration/store/workflowStore.ts`

**Interfaces:**
- Consumes: `NormalizedGraph` (Task 3); `importWorkflow, ImportResult` (Task 4); `useTeamStore` from `./teamStore` (to register the imported system as a custom team).
- Produces: Zustand store `useWorkflowStore` with state `workflowGraph: NormalizedGraph | null`, `nodeAgentMap: Record<string, number>`, and actions `setImportedWorkflow(result, graph)`, `swapSlots(nodeIdA, nodeIdB)`, `clearImportedWorkflow()`. Used by Tasks 8, 9, 10, 11.

- [ ] **Step 1: Write the store**

Create `the-delegation/src/integration/store/workflowStore.ts`:

```typescript
/**
 * workflowStore -- Holds the read-only normalized graph and the agent -> 3D
 * character slot mapping for an imported workflow. Edits to slot assignments
 * update nodeAgentMap here; the BackendAgentSimulation rebuilds its EventBridge
 * map from the team store's AgenticSystem (kept in sync via setImportedWorkflow).
 */

import { create } from 'zustand';
import type { NormalizedGraph } from '../api/types';
import type { ImportResult } from '../api/YamlImporter';
import { useTeamStore } from './teamStore';

interface WorkflowState {
  workflowGraph: NormalizedGraph | null;
  nodeAgentMap: Record<string, number>; // node_id -> slot 1-5

  setImportedWorkflow: (result: ImportResult, graph: NormalizedGraph) => void;
  swapSlots: (nodeIdA: string, nodeIdB: string) => void;
  clearImportedWorkflow: () => void;
}

export const useWorkflowStore = create<WorkflowState>()((set, get) => ({
  workflowGraph: null,
  nodeAgentMap: {},

  setImportedWorkflow: (result, graph) => {
    // Register the imported system as the active custom team.
    useTeamStore.getState().saveCustomSystem(result.system);
    useTeamStore.getState().setActiveTeam(result.system.id);
    set({ workflowGraph: graph, nodeAgentMap: { ...result.nodeAgentMap } });
  },

  swapSlots: (nodeIdA, nodeIdB) => {
    const map = { ...get().nodeAgentMap };
    const slotA = map[nodeIdA];
    const slotB = map[nodeIdB];
    if (slotA === undefined || slotB === undefined) return;
    map[nodeIdA] = slotB;
    map[nodeIdB] = slotA;
    set({ nodeAgentMap: map });
    // Reflect the swap in the team store's AgenticSystem agent indices.
    const { selectedAgentSetId, customSystems } = useTeamStore.getState();
    const system = customSystems.find((s) => s.id === selectedAgentSetId);
    if (!system) return;
    const all = [system.leadAgent, ...(system.leadAgent.subagents ?? [])];
    const agentA = all.find((a) => a.id === nodeIdA);
    const agentB = all.find((a) => a.id === nodeIdB);
    if (agentA) agentA.index = slotB;
    if (agentB) agentB.index = slotA;
    useTeamStore.getState().saveCustomSystem({ ...system });
  },

  clearImportedWorkflow: () => set({ workflowGraph: null, nodeAgentMap: {} }),
}));
```

- [ ] **Step 2: Verify it type-checks**

Run: `cd the-delegation && npm run lint`
Expected: PASS (tsc --noEmit exits 0)

- [ ] **Step 3: Verify the production build**

Run: `cd the-delegation && npm run build`
Expected: PASS (vite build completes)

- [ ] **Step 4: Commit**

```bash
cd the-delegation
git add src/integration/store/workflowStore.ts
git commit -m "feat: add workflowStore for imported graph and slot mapping"
```

---

## Task 6: EventBridge routing precedence fix (critical bug)

**Files:**
- Modify: `the-delegation/src/integration/api/EventBridge.ts` (`resolveAgentIndex` ~line 76; `onNodeStarted` ~line 168; `onNodeCompleted` ~line 210; `onHumanInputRequired` ~line 244)

**Interfaces:**
- Consumes: `nodeAgentMap` (set by `BackendAgentSimulation.buildNodeAgentMap`), `NodeStartedData`, `NodeCompletedData`, `HumanInputRequiredData` from `./types`; `useCoreStore`, `useUiStore`.
- Produces: corrected routing where the frontend `nodeAgentMap` is authoritative; unmapped/non-agent nodes resolve to `-1` and skip 3D character state mutations (log + Kanban only).

This fixes a pre-existing bug: today `resolveAgentIndex` prefers the backend's `explicitIndex` over `nodeAgentMap`, but the backend defaults unknown nodes to `1`, so every node animates the lead character. After this fix, `nodeAgentMap` wins when present, and unmapped nodes become `-1` (log-only).

- [ ] **Step 1: Fix `resolveAgentIndex`**

In `the-delegation/src/integration/api/EventBridge.ts`, replace the `resolveAgentIndex` method (currently lines 75-83):

```typescript
  /** Resolve a backend node_id to a frontend agent index (defaults to 1 = lead). */
  private resolveAgentIndex(nodeId?: string, explicitIndex?: number): number {
    if (explicitIndex !== undefined) return explicitIndex;
    if (!nodeId) return 1;
    // Strip "review_" prefix if present to map review nodes to their corresponding agents
    const cleanNodeId = nodeId.startsWith('review_') ? nodeId.substring(7) : nodeId;
    if (this.nodeAgentMap.has(cleanNodeId)) return this.nodeAgentMap.get(cleanNodeId)!;
    return 1; // Default to lead agent
  }
```

with:

```typescript
  /**
   * Resolve a backend node_id to a frontend agent index.
   * The frontend nodeAgentMap is authoritative when present; the backend's
   * explicitIndex is only a fallback. Unmapped/non-agent nodes resolve to -1
   * (log + Kanban only, no 3D character).
   */
  private resolveAgentIndex(nodeId?: string, explicitIndex?: number): number {
    if (!nodeId) return explicitIndex ?? -1;
    const cleanNodeId = nodeId.startsWith('review_') ? nodeId.substring(7) : nodeId;
    if (this.nodeAgentMap.has(cleanNodeId)) return this.nodeAgentMap.get(cleanNodeId)!;
    return -1;
  }
```

- [ ] **Step 2: Guard 3D state mutations against index < 1**

In `onNodeStarted` (currently ~line 168), the line `useUiStore.getState().setAgentStatus(agentIndex, 'working');` must only run for valid character indices. Wrap it so the full handler reads:

```typescript
  private onNodeStarted(data: NodeStartedData): void {
    const core = useCoreStore.getState();
    const agentIndex = this.resolveAgentIndex(data.node_id, data.agent_index);

    const task = core.addTask({
      title: data.node_name || data.node_id,
      description: `Executing node: ${data.node_id}`,
      assignedAgentId: agentIndex,
      status: 'in_progress',
      requiresUserApproval: false,
    });

    this._nodeTaskMap.set(data.node_id, task.id);

    // Only update 3D character status for mapped agent nodes (index >= 1).
    if (agentIndex >= 1) {
      useUiStore.getState().setAgentStatus(agentIndex, 'working');
    }

    core.addLogEntry({
      agentIndex,
      action: `Started: ${data.node_name || data.node_id}`,
      taskId: task.id,
    });
  }
```

In `onNodeCompleted` (currently ~line 210), guard the `setAgentStatus` and `setAgentHistory` calls. The handler should read:

```typescript
  private onNodeCompleted(data: NodeCompletedData): void {
    const core = useCoreStore.getState();
    const taskId = this._nodeTaskMap.get(data.node_id);
    const agentIndex = this.resolveAgentIndex(data.node_id, data.agent_index);

    if (taskId) {
      if (data.output) {
        core.setTaskOutput(taskId, data.output);
      }
      core.updateTaskStatus(taskId, 'done');
    }

    if (agentIndex >= 1) {
      useUiStore.getState().setAgentStatus(agentIndex, 'idle');
      if (data.output) {
        core.setAgentHistory(agentIndex, [
          ...(core.agentHistories[agentIndex] ?? []),
          { role: 'assistant', content: data.output },
        ]);
      }
    }

    core.addLogEntry({
      agentIndex,
      action: `Completed: ${data.node_id}`,
      taskId,
    });

    this._nodeTaskMap.delete(data.node_id);
  }
```

In `onHumanInputRequired` (currently ~line 244), guard the `setAgentStatus` call so the handler reads:

```typescript
  private onHumanInputRequired(data: HumanInputRequiredData): void {
    const core = useCoreStore.getState();
    const agentIndex = this.resolveAgentIndex(data.node_id, data.agent_index);
    const taskId = this._nodeTaskMap.get(data.node_id);

    if (taskId) {
      core.submitTaskForReview(taskId, data.prompt);
      if (agentIndex >= 1) {
        core.setAgentHistory(agentIndex, [
          ...(core.agentHistories[agentIndex] ?? []),
          { role: 'assistant', content: data.prompt, metadata: { reviewTaskId: taskId } },
        ]);
      }
    }

    if (agentIndex >= 1) {
      useUiStore.getState().setAgentStatus(agentIndex, 'on_hold');
    }

    core.addLogEntry({
      agentIndex,
      action: `Waiting for human input: ${data.prompt}`,
      taskId,
    });
  }
```

- [ ] **Step 3: Verify it type-checks**

Run: `cd the-delegation && npm run lint`
Expected: PASS (tsc --noEmit exits 0)

- [ ] **Step 4: Verify the production build**

Run: `cd the-delegation && npm run build`
Expected: PASS (vite build completes)

- [ ] **Step 5: Commit**

```bash
cd the-delegation
git add src/integration/api/EventBridge.ts
git commit -m "fix: make frontend nodeAgentMap authoritative and route unmapped nodes to log-only"
```

---

## Task 7: BackendAgentSimulation run-direct branch

**Files:**
- Modify: `the-delegation/src/simulation/core/BackendAgentSimulation.ts` (`startWorkflow` method, ~line 98)

**Interfaces:**
- Consumes: `this.system.sourceYamlFile` (Task 4 field); `BackendClient.executeWorkflow`, `BackendClient.uploadWorkflow`; `exportSystemToYaml` (legacy path).
- Produces: when the active system has a `sourceYamlFile`, the original YAML is executed directly (no export/upload). Native teams keep the legacy export+upload+run path.

- [ ] **Step 1: Branch `startWorkflow` on `sourceYamlFile`**

In `the-delegation/src/simulation/core/BackendAgentSimulation.ts`, replace the body of `startWorkflow` (currently the `try` block, lines ~105-119):

```typescript
    try {
      const yamlFile = `${this.system.id}.yaml`;

      const { exportSystemToYaml } = await import('../../integration/api/YamlExporter');
      const yamlContent = exportSystemToYaml(this.system);

      console.log(`[BackendAgentSimulation] Exporting and uploading YAML for ${yamlFile}...`);
      await this.client.uploadWorkflow(yamlFile, yamlContent);

      await this.client.executeWorkflow({
        session_id: sessionId,
        yaml_file: yamlFile,
        task_prompt: brief,
      });
    } catch (error) {
```

with:

```typescript
    try {
      if (this.system.sourceYamlFile) {
        // Imported workflow: run the ORIGINAL file directly (no export/upload).
        console.log(`[BackendAgentSimulation] Running imported workflow ${this.system.sourceYamlFile}`);
        await this.client.executeWorkflow({
          session_id: sessionId,
          yaml_file: this.system.sourceYamlFile,
          task_prompt: brief,
        });
      } else {
        // Native the-delegation team: export + upload + run.
        const yamlFile = `${this.system.id}.yaml`;
        const { exportSystemToYaml } = await import('../../integration/api/YamlExporter');
        const yamlContent = exportSystemToYaml(this.system);

        console.log(`[BackendAgentSimulation] Exporting and uploading YAML for ${yamlFile}...`);
        await this.client.uploadWorkflow(yamlFile, yamlContent);

        await this.client.executeWorkflow({
          session_id: sessionId,
          yaml_file: yamlFile,
          task_prompt: brief,
        });
      }
    } catch (error) {
```

The surrounding `const sessionId = ...` guard, the `catch (error)` handler, and the rest of the method remain unchanged.

- [ ] **Step 2: Verify it type-checks**

Run: `cd the-delegation && npm run lint`
Expected: PASS (tsc --noEmit exits 0)

- [ ] **Step 3: Verify the production build**

Run: `cd the-delegation && npm run build`
Expected: PASS (vite build completes)

- [ ] **Step 4: Commit**

```bash
cd the-delegation
git add src/simulation/core/BackendAgentSimulation.ts
git commit -m "feat: run imported workflows directly via sourceYamlFile"
```

---

## Task 8: Workflow Browser modal

**Files:**
- Create: `the-delegation/src/interface/WorkflowBrowser.tsx`

**Interfaces:**
- Consumes: `BackendClient.listWorkflows(): Promise<string[]>` (existing); `BackendClient.fetchWorkflowGraph(filename): Promise<NormalizedGraph>` (Task 3); `importWorkflow(graph): ImportResult` (Task 4); `useWorkflowStore.setImportedWorkflow(result, graph)` (Task 5).
- Produces: a modal `<WorkflowBrowser isOpen onClose />` listing `yaml_instance/*.yaml`; selecting one fetches its graph, imports it, and closes. Rendered by Task 11.

- [ ] **Step 1: Write the component**

Create `the-delegation/src/interface/WorkflowBrowser.tsx`:

```typescript
import { FileText, X } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { BackendClient } from '../integration/api/BackendClient';
import { importWorkflow } from '../integration/api/YamlImporter';
import { useWorkflowStore } from '../integration/store/workflowStore';

interface WorkflowBrowserProps {
  isOpen: boolean;
  onClose: () => void;
}

const WorkflowBrowser: React.FC<WorkflowBrowserProps> = ({ isOpen, onClose }) => {
  const [files, setFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState<string | null>(null);
  const setImportedWorkflow = useWorkflowStore((s) => s.setImportedWorkflow);

  useEffect(() => {
    if (!isOpen) return;
    const client = new BackendClient();
    setLoading(true);
    setError(null);
    client
      .listWorkflows()
      .then((names) => setFiles(names))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [isOpen]);

  const handleImport = async (filename: string) => {
    setImporting(filename);
    setError(null);
    try {
      const client = new BackendClient();
      const graph = await client.fetchWorkflowGraph(filename);
      const result = importWorkflow(graph);
      setImportedWorkflow(result, graph);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div onClick={onClose} className="absolute inset-0 bg-white/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg bg-white rounded-4xl shadow-2xl overflow-hidden border border-zinc-100">
        <div className="px-8 pt-8 pb-10">
          <div className="flex items-start justify-between mb-6">
            <h3 className="text-2xl font-black text-darkDelegation leading-tight">Import Workflow</h3>
            <button onClick={onClose} className="p-2 hover:bg-zinc-100 rounded-full text-zinc-400 transition-colors">
              <X size={20} />
            </button>
          </div>

          <p className="text-sm text-zinc-500 leading-relaxed mb-6">
            Select a YAML workflow from the DevAll backend to import and run.
            Agent nodes are mapped to the available 3D characters; non-agent
            nodes appear in the graph and logs.
          </p>

          {loading && <p className="text-sm text-zinc-400">Loading workflows...</p>}
          {error && <p className="text-sm text-red-500 mb-4">{error}</p>}

          <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">
            {files.map((filename) => (
              <button
                key={filename}
                onClick={() => handleImport(filename)}
                disabled={importing !== null}
                className="w-full flex items-center gap-3 px-4 py-3 bg-zinc-50 hover:bg-zinc-100 rounded-2xl text-left transition-all disabled:opacity-50"
              >
                <FileText size={18} className="text-zinc-400 shrink-0" />
                <span className="text-sm font-medium text-zinc-700 truncate">{filename}</span>
                {importing === filename && <span className="ml-auto text-xs text-zinc-400">Importing...</span>}
              </button>
            ))}
            {!loading && files.length === 0 && !error && (
              <p className="text-sm text-zinc-400">No workflows found.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkflowBrowser;
```

- [ ] **Step 2: Verify it type-checks**

Run: `cd the-delegation && npm run lint`
Expected: PASS (tsc --noEmit exits 0)

- [ ] **Step 3: Verify the production build**

Run: `cd the-delegation && npm run build`
Expected: PASS (vite build completes)

- [ ] **Step 4: Commit**

```bash
cd the-delegation
git add src/interface/WorkflowBrowser.tsx
git commit -m "feat: add WorkflowBrowser modal to import YAML workflows"
```

---

## Task 9: Read-only workflow graph view

**Files:**
- Create: `the-delegation/src/interface/ReadOnlyWorkflowGraph.tsx`

**Interfaces:**
- Consumes: `useWorkflowStore.workflowGraph` (Task 5); `@xyflow/react` (already a dependency).
- Produces: a component rendering all nodes/edges in a read-only ReactFlow with type-based colors, start/end badges, dashed dynamic edges. Rendered by Task 11.

Computes a simple BFS-layered layout from start nodes (no external layout library).

- [ ] **Step 1: Write the component**

Create `the-delegation/src/interface/ReadOnlyWorkflowGraph.tsx`:

```typescript
import React, { useMemo } from 'react';
import {
  ReactFlow, Background, Controls,
  type Node, type Edge, ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useWorkflowStore } from '../integration/store/workflowStore';
import type { NormalizedGraph } from '../integration/api/types';

const TYPE_COLORS: Record<string, string> = {
  agent: '#4285F4', human: '#FBBC05', literal: '#a1a1aa',
  loop_counter: '#64748B', loop_timer: '#64748B',
  template: '#14b8a6', python: '#14b8a6', passthrough: '#d4d4d8',
  subgraph: '#8b5cf6', rlm_memory: '#f59e0b',
};

const LAYER_X = 260;
const NODE_Y = 130;

/** Assign layered positions via BFS from start nodes. */
function layoutGraph(graph: NormalizedGraph): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {};
  const adj: Record<string, string[]> = {};
  for (const n of graph.nodes) adj[n.id] = [];
  for (const e of graph.edges) if (adj[e.from]) adj[e.from].push(e.to);

  const layer: Record<string, number> = {};
  const queue: string[] = [...(graph.start.length ? graph.start : graph.nodes.slice(0, 1).map((n) => n.id))];
  for (const id of queue) layer[id] = 0;
  while (queue.length) {
    const id = queue.shift()!;
    const depth = layer[id];
    for (const next of adj[id] ?? []) {
      if (layer[next] === undefined || layer[next] < depth + 1) {
        layer[next] = depth + 1;
        queue.push(next);
      }
    }
  }
  for (const n of graph.nodes) if (layer[n.id] === undefined) layer[n.id] = 0;

  const byLayer: Record<number, string[]> = {};
  for (const n of graph.nodes) (byLayer[layer[n.id]] ??= []).push(n.id);
  for (const [dStr, ids] of Object.entries(byLayer)) {
    const d = Number(dStr);
    ids.forEach((id, i) => { positions[id] = { x: d * LAYER_X, y: i * NODE_Y }; });
  }
  return positions;
}

const FlowInner: React.FC = () => {
  const workflowGraph = useWorkflowStore((s) => s.workflowGraph);

  const { nodes, edges } = useMemo(() => {
    if (!workflowGraph) return { nodes: [] as Node[], edges: [] as Edge[] };
    const positions = layoutGraph(workflowGraph);
    const startSet = new Set(workflowGraph.start);
    const endSet = new Set(workflowGraph.end ?? []);

    const nodes: Node[] = workflowGraph.nodes.map((n) => ({
      id: n.id,
      position: positions[n.id] ?? { x: 0, y: 0 },
      data: { label: `${n.label}  (${n.type})${startSet.has(n.id) ? '  [START]' : ''}${endSet.has(n.id) ? '  [END]' : ''}` },
      style: { borderLeft: `4px solid ${TYPE_COLORS[n.type] ?? '#d4d4d8'}`, fontSize: 11, opacity: n.is_agent ? 1 : 0.75 },
      draggable: false,
    }));

    const edges: Edge[] = workflowGraph.edges.map((e, i) => ({
      id: `e${i}-${e.from}-${e.to}`,
      source: e.from,
      target: e.to,
      animated: e.is_dynamic,
      style: { strokeDasharray: e.is_dynamic ? '6 4' : undefined },
    }));

    return { nodes, edges };
  }, [workflowGraph]);

  if (!workflowGraph) return null;

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        fitView
        fitViewOptions={{ padding: 0.15 }}
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
};

const ReadOnlyWorkflowGraph: React.FC = () => (
  <ReactFlowProvider>
    <FlowInner />
  </ReactFlowProvider>
);

export default ReadOnlyWorkflowGraph;
```

- [ ] **Step 2: Verify it type-checks**

Run: `cd the-delegation && npm run lint`
Expected: PASS (tsc --noEmit exits 0)

- [ ] **Step 3: Verify the production build**

Run: `cd the-delegation && npm run build`
Expected: PASS (vite build completes)

- [ ] **Step 4: Commit**

```bash
cd the-delegation
git add src/interface/ReadOnlyWorkflowGraph.tsx
git commit -m "feat: add read-only ReactFlow view for imported workflows"
```

---

## Task 10: Character slot mapping panel

**Files:**
- Create: `the-delegation/src/interface/CharacterSlotMapping.tsx`

**Interfaces:**
- Consumes: `useWorkflowStore.workflowGraph`, `useWorkflowStore.nodeAgentMap`, `useWorkflowStore.swapSlots` (Task 5).
- Produces: a panel listing the 5 character slots with their assigned agent node, plus overflow agents as unmapped. Clicking two agents swaps their slots. Rendered by Task 11.

- [ ] **Step 1: Write the component**

Create `the-delegation/src/interface/CharacterSlotMapping.tsx`:

```typescript
import { ArrowLeftRight } from 'lucide-react';
import React, { useState } from 'react';
import { useWorkflowStore } from '../integration/store/workflowStore';

const SLOT_COLORS = ['#4285F4', '#34A853', '#FBBC05', '#EA4335', '#64748B'];

const CharacterSlotMapping: React.FC = () => {
  const { workflowGraph, nodeAgentMap, swapSlots } = useWorkflowStore();
  const [selected, setSelected] = useState<string | null>(null);

  if (!workflowGraph) return null;

  const slotToNode: Record<number, string> = {};
  for (const [nodeId, slot] of Object.entries(nodeAgentMap)) slotToNode[slot] = nodeId;
  const overflow = workflowGraph.agent_nodes.filter(
    (a) => !Object.prototype.hasOwnProperty.call(nodeAgentMap, a.node_id),
  );

  const handleNodeClick = (nodeId: string) => {
    if (selected === null) {
      setSelected(nodeId);
    } else if (selected === nodeId) {
      setSelected(null);
    } else {
      swapSlots(selected, nodeId);
      setSelected(null);
    }
  };

  return (
    <div className="flex flex-col gap-3 p-4 bg-white rounded-2xl border border-zinc-100">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-black text-darkDelegation uppercase tracking-wider">Character Slots</h3>
        <span className="text-[10px] text-zinc-400">{selected ? 'Select another agent to swap' : 'Click two to swap'}</span>
      </div>

      <div className="flex flex-col gap-2">
        {[1, 2, 3, 4, 5].map((slot) => {
          const nodeId = slotToNode[slot];
          const node = workflowGraph.agent_nodes.find((a) => a.node_id === nodeId);
          return (
            <button
              key={slot}
              onClick={() => nodeId && handleNodeClick(nodeId)}
              disabled={!nodeId}
              className={`flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-all disabled:opacity-40 ${selected === nodeId ? 'ring-2 ring-darkDelegation' : 'hover:bg-zinc-50'}`}
            >
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-black shrink-0" style={{ backgroundColor: SLOT_COLORS[slot - 1] }}>
                {slot}
              </div>
              <span className="text-sm font-medium text-zinc-700 truncate">{node ? node.label : '(empty)'}</span>
              {nodeId && <ArrowLeftRight size={12} className="ml-auto text-zinc-300" />}
            </button>
          );
        })}
      </div>

      {overflow.length > 0 && (
        <div className="mt-2">
          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">Unmapped Agents (log/flow only)</p>
          <div className="flex flex-col gap-1">
            {overflow.map((a) => (
              <div
                key={a.node_id}
                onClick={() => handleNodeClick(a.node_id)}
                className={`px-3 py-1.5 rounded-lg text-xs text-zinc-500 cursor-pointer transition-all ${selected === a.node_id ? 'ring-2 ring-darkDelegation bg-zinc-50' : 'hover:bg-zinc-50'}`}
              >
                {a.label}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default CharacterSlotMapping;
```

- [ ] **Step 2: Verify it type-checks**

Run: `cd the-delegation && npm run lint`
Expected: PASS (tsc --noEmit exits 0)

- [ ] **Step 3: Verify the production build**

Run: `cd the-delegation && npm run build`
Expected: PASS (vite build completes)

- [ ] **Step 4: Commit**

```bash
cd the-delegation
git add src/interface/CharacterSlotMapping.tsx
git commit -m "feat: add CharacterSlotMapping panel for slot reassignment"
```

---

## Task 11: Wire up browser button and design-view integration

**Files:**
- Modify: `the-delegation/src/interface/Header.tsx` (add a "Browse Workflows" button + modal state)
- Modify: `the-delegation/src/App.tsx` (render read-only graph + slot mapping in design view when `workflowGraph` is set; keep `VisualConfigurator` for native teams)

**Interfaces:**
- Consumes: `WorkflowBrowser` (Task 8), `ReadOnlyWorkflowGraph` (Task 9), `CharacterSlotMapping` (Task 10), `useWorkflowStore.workflowGraph` (Task 5).
- Produces: the user-facing flow — "Browse Workflows" button opens the browser; importing switches the design view to the read-only graph + slot mapping panel.

The design view is a full-screen modal in `App.tsx` (renders `<VisualConfigurator />` when `viewMode === 'design'`, lines 117-126). When `workflowGraph` is set, render the read-only graph + slot panel instead.

- [ ] **Step 1: Add the Browse button and modal to `Header.tsx`**

In `the-delegation/src/interface/Header.tsx`, after `import InfoModal from './InfoModal';` add:

```typescript
import WorkflowBrowser from './WorkflowBrowser';
```

After `const [isInfoOpen, setIsInfoOpen] = useState(false);` add:

```typescript
  const [isBrowserOpen, setIsBrowserOpen] = useState(false);
```

After the "Manage Teams" button and before the divider `<div className="w-px h-4 bg-zinc-200" />`, add:

```typescript
        <button
          onClick={() => setIsBrowserOpen(true)}
          className="flex items-center gap-2 px-3 py-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-lg transition-all active:scale-95 cursor-pointer h-9 shrink-0"
          title="Browse and import YAML workflows"
        >
          <span className="text-[10px] font-black uppercase tracking-wider">Browse Workflows</span>
        </button>
```

Before the closing `</header>` (after the `InfoModal` render), add:

```typescript
      <WorkflowBrowser isOpen={isBrowserOpen} onClose={() => setIsBrowserOpen(false)} />
```

- [ ] **Step 2: Integrate the read-only view into `App.tsx`**

In `the-delegation/src/App.tsx`, add imports after the existing interface imports:

```typescript
import ReadOnlyWorkflowGraph from './interface/ReadOnlyWorkflowGraph';
import CharacterSlotMapping from './interface/CharacterSlotMapping';
import { useWorkflowStore } from './integration/store/workflowStore';
```

Inside `App`, add:

```typescript
  const workflowGraph = useWorkflowStore((s) => s.workflowGraph);
```

Then modify the design-mode overlay (lines 117-126). Read those lines first to preserve the exact outer `onClick` (which sets `viewMode` back to `'simulation'`). Replace the inner `<VisualConfigurator />` with a conditional, and give the inner container a `flex` layout:

```tsx
              {workflowGraph ? (
                <>
                  <div className="flex-1 relative overflow-hidden">
                    <ReadOnlyWorkflowGraph />
                  </div>
                  <div className="w-80 shrink-0 overflow-y-auto p-4 border-l border-zinc-100">
                    <CharacterSlotMapping />
                  </div>
                </>
              ) : (
                <VisualConfigurator />
              )}
```

Keep the surrounding `<div className="fixed inset-0 z-[60] ...">`, the backdrop `onClick` that exits design mode, and the `onClick={(e) => e.stopPropagation()}` on the inner panel. Only the `<VisualConfigurator />` line becomes the conditional above.

- [ ] **Step 3: Verify it type-checks**

Run: `cd the-delegation && npm run lint`
Expected: PASS (tsc --noEmit exits 0)

- [ ] **Step 4: Verify the production build**

Run: `cd the-delegation && npm run build`
Expected: PASS (vite build completes)

- [ ] **Step 5: Commit**

```bash
cd the-delegation
git add src/interface/Header.tsx src/App.tsx
git commit -m "feat: wire workflow browser and read-only graph into design view"
```

---

## Task 12: Backend spatial events cleanup (optional)

**Files:**
- Modify: `server/hooks/spatial_events.py` (`_resolve_agent_index`, lines 77-95)

**Interfaces:**
- Consumes: `Node` config.
- Produces: `_resolve_agent_index` returns `0` (unmapped) instead of `1` for unknown nodes, so the frontend `nodeAgentMap` is the sole authority.

Optional because Task 6 makes the frontend `nodeAgentMap` authoritative; the backend's `agent_index` is only a fallback. Returning `1` for every unmapped node is misleading, so we change the default to `0`.

- [ ] **Step 1: Update `_resolve_agent_index`**

In `server/hooks/spatial_events.py`, replace the method body so the final fallback returns `0`:

```python
    @staticmethod
    def _resolve_agent_index(node: Node) -> int:
        """Extract agent index from node config or ID.

        Returns 0 (unmapped) when no explicit index is available; the 3D
        frontend's nodeAgentMap is the authoritative router.
        """
        if hasattr(node, "config") and isinstance(node.config, dict):
            if "agent_index" in node.config:
                return int(node.config["agent_index"])

        parts = node.id.rsplit("_", 1)
        if len(parts) == 2 and parts[1].isdigit():
            return int(parts[1])

        return 0
```

- [ ] **Step 2: Run the backend test suite**

Run: `uv run pytest tests/test_workflows.py tests/test_workflow_graph_route.py tests/test_workflow_graph_serializer.py -v`
Expected: PASS (no regressions)

- [ ] **Step 3: Commit**

```bash
git add server/hooks/spatial_events.py
git commit -m "refactor: stop defaulting unmapped node agent_index to 1 in spatial events"
```

---

## Task 13: Full verification and end-to-end smoke test

**Files:** None (verification only)

- [ ] **Step 1: Run the full backend test suite**

Run: `uv run pytest -v`
Expected: PASS (all tests green)

- [ ] **Step 2: Run the frontend lint and build**

Run: `cd the-delegation && npm run lint && npm run build`
Expected: PASS (tsc --noEmit and vite build both succeed)

- [ ] **Step 3: Manual end-to-end smoke test**

Start the backend:
```bash
uv run python server_main.py --port 6400 --reload
```

In a separate terminal, start the frontend:
```bash
cd the-delegation && VITE_BACKEND_URL=http://localhost:6400 npm run dev
```

Open the app (usually `http://localhost:3000/the-delegation`) and verify:
1. The "Browse Workflows" button appears in the header.
2. Clicking it lists the YAML files from `yaml_instance/`.
3. Selecting a workflow (e.g. `demo_hospital.yaml`) imports it: the design view switches to the read-only ReactFlow graph showing all nodes with type-based colors, and the Character Slot Mapping panel shows the agent nodes assigned to slots 1-5.
4. Clicking two agents in the slot panel swaps their slots.
5. Entering a brief and starting the project runs the ORIGINAL `demo_hospital.yaml` on the backend (check backend logs reference `yaml_instance/demo_hospital.yaml`, not an exported file). Node events stream into the 3D office and Kanban; non-agent nodes appear in logs without animating a 3D character.

If any step fails, note the failure and fix before considering the feature complete.

- [ ] **Step 4: Final commit (if any fixes were needed)**

If the smoke test revealed issues requiring fixes, commit them. Otherwise, no commit is needed.

---


