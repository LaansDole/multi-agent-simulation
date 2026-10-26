<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

# AGENTS.md - DevAll Multi-Agent Platform Developer Guide

This guide is designed for agentic coding assistants working on the ChatDev 2.0 (DevAll) codebase.

## Project Overview

**DevAll** is a zero-code multi-agent orchestration platform for building customized multi-agent workflows. Built with a Python 3.12 backend (FastAPI) and Vue 3 frontend (Vite), it enables users to create complex agent systems through YAML configuration files. The research goal of this fork is DynaClinic (see "DynaClinic (research goal)" below).

**Tech Stack:**
- Backend: Python 3.12 (`requires-python = ">=3.12,<3.13"`), FastAPI, uvicorn, WebSockets
- Frontend: Vue 3, Vite, Vue Flow (`frontend/`)
- 3D frontend: React 19 + Three.js playground (`the-delegation/`, own `package.json`, `npm run dev` on port 3000)
- Package Management: `uv` for Python, `npm` for frontend
- Configuration: YAML-based workflow definitions
- Testing: pytest

## Build, Lint, and Test Commands

### Backend (Python)

**Setup and Installation:**
```bash
uv sync                              # Install all dependencies
```

**Run Backend Server:**
```bash
uv run python server_main.py --port 6400 --reload
```

**Run CLI Workflow** (reads the task prompt from stdin via `input()`; prints only a run summary, the end-node text lands in `WareHouse/<name>_<timestamp>/node_outputs.yaml`):
```bash
echo "Your task" | uv run python run.py --path yaml_instance/demo_loop_counter.yaml --name test_project
```

**Check/Validate Workflow:**
```bash
uv run python -c "import sys; from pathlib import Path; from check.check import load_config; load_config(Path(sys.argv[1]))" yaml_instance/your_workflow.yaml
```
Prints `Workflow OK.` or raises `DesignError` (exit 1). `uv run python -m check.check --path ...` and `make validate-yamls` (which shells out to it from `tools/validate_all_yamls.py`) are silent no-ops that always exit 0: `check/check.py` has no `__main__`. Schema-only CLI: `uv run python -m check.check_yaml <path>`.

**Run Tests:**
```bash
uv run pytest                        # Run all tests
uv run pytest tests/test_file.py     # Run specific test file
uv run pytest tests/test_file.py::test_function  # Run single test
uv run pytest -v                     # Verbose output
uv run pytest -k "pattern"           # Run tests matching pattern
uv run pytest -m "not cline"         # Skip tests that call the real Cline API
```

### Frontend (Vue 3)

**Setup:**
```bash
cd frontend && npm install
```

**Development Server:**
```bash
cd frontend
VITE_API_BASE_URL=http://localhost:6400 npm run dev
```

**Build for Production:**
```bash
cd frontend
npm run build
```

**Preview Production Build:**
```bash
cd frontend
npm run preview
```

## Code Style Guidelines

### Python Code Style

**Import Organization:**
1. Standard library imports (alphabetically sorted)
2. Third-party imports (alphabetically sorted)
3. Local application imports (alphabetically sorted)

```python
# Standard library
import argparse
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional

# Third-party
from pydantic import BaseModel

# Local
from entity.configs import Node, EdgeConfig
from runtime.node.executor.base import ExecutionContext
from utils.logger import WorkflowLogger
```

**Type Hints:**
- ALL function signatures MUST include type hints for parameters and return values
- Use `Optional[Type]` for nullable values
- Use `Union[Type1, Type2]` or `Type1 | Type2` for alternatives (prefer `|` in Python 3.12+)
- Use `List[Type]`, `Dict[Key, Value]`, etc. for collections

```python
def execute(self, node: Node, inputs: List[Message]) -> List[Message]:
    """Execute the node logic."""
    pass

def build_config(data: Dict[str, Any], *, set_defaults: bool = True) -> Optional[DesignConfig]:
    """Build configuration from dictionary."""
    pass
```

**Naming Conventions:**
- Classes: `PascalCase` (e.g., `GraphExecutor`, `NodeExecutor`)
- Functions/methods: `snake_case` (e.g., `execute_graph`, `build_config`)
- Constants: `UPPER_SNAKE_CASE` (e.g., `OUTPUT_ROOT`, `DEFAULT_PORT`)
- Private methods: prefix with `_` (e.g., `_ensure_supported`)
- Internal variables: prefix with `__` for name mangling (e.g., `__execution_context`)

**Docstrings:**
- Use triple double-quotes `"""` for all docstrings
- Module-level docstrings at the top of each file
- Class and function docstrings following Google or NumPy style

```python
"""Module description goes here."""

class GraphExecutor:
    """Executes ChatDev_new graph workflows.
    
    Attributes:
        graph: GraphContext instance
        outputs: Dictionary of node outputs
    """
    
    def execute(self, node: Node) -> List[Message]:
        """Execute the node logic.
        
        Args:
            node: Node configuration to execute
            
        Returns:
            List of output messages
            
        Raises:
            WorkflowExecutionError: If execution fails
        """
        pass
```

**Error Handling:**
- Create custom exception classes inheriting from appropriate base exceptions
- Use descriptive exception messages with context
- Prefer raising exceptions over returning error codes

```python
class DesignError(RuntimeError):
    """Raised when a workflow design cannot be loaded or validated."""

class WorkflowExecutionError(Exception):
    """Raised when workflow execution fails."""

# Usage
if not config_path.exists():
    raise DesignError(f"Design file not found: {config_path}")
```

**Dataclasses:**
- Use `@dataclass` decorator for configuration classes
- Inherit from `BaseConfig` for workflow configurations
- Use `field(default_factory=...)` for mutable defaults

```python
from dataclasses import dataclass, field

@dataclass
class ExecutionContext:
    """Node execution context."""
    tool_manager: ToolManager
    memory_managers: Dict[str, MemoryManager] = field(default_factory=dict)
    global_state: Dict[str, Any] = field(default_factory=dict)
```

### Frontend Code Style (Vue 3)

**Component Structure:**
- Use `<script setup>` composition API syntax
- Order: template → script → style
- Props and emits should be explicitly defined

**Naming:**
- Components: `PascalCase` (e.g., `WorkflowEdge.vue`)
- Props/variables: `camelCase`
- Events: `kebab-case` in templates

## File Structure and Organization

```
/
├── entity/              # Configuration dataclasses and schemas
├── runtime/             # Node executors, agent providers, memory, edge conditions/processors, sdk.py
├── workflow/            # Graph execution (DAG / cycle / majority-vote strategies)
├── schema_registry/     # Registries backing config validation (node/edge/memory/provider schemas)
├── server/              # FastAPI backend
├── frontend/            # Vue 3 web console
├── the-delegation/      # React + Three.js 3D playground (separate npm project)
├── functions/           # Python functions: function_calling/ (agent tools), edge/ (conditions), edge_processor/
├── utils/               # Shared utilities
├── check/               # Validation (load_config, check_yaml, check_workflow)
├── tests/               # pytest suite (flat test_*.py + conftest.py)
├── tools/               # Dev scripts (validate_all_yamls.py, ...)
├── yaml_instance/       # Workflow configuration examples
├── yaml_template/       # Workflow templates
├── docs/                # User guide (docs/user_guide/en), architecture notes
├── openspec/            # OpenSpec changes/ and specs/ (openspec/AGENTS.md is not present)
├── WareHouse/           # Output directory for workflow runs (gitignored)
├── run.py               # CLI entry point
└── server_main.py       # Server entry point
```

## Development Workflow

1. **Before Making Changes:**
   - Read relevant code to understand context
   - Check for similar patterns in the codebase
   - Validate workflow files with `check.check.load_config` (command above)

2. **Making Changes:**
   - Follow existing code style and patterns
   - Add type hints to all new functions
   - Write descriptive docstrings
   - Handle errors appropriately with custom exceptions

3. **Testing Changes:**
   - Run validation: the `load_config` one-liner under "Check/Validate Workflow"
   - Test backend: Start server and verify endpoints
   - Test frontend: Check UI in browser at http://localhost:5173

4. **Configuration Files:**
   - Workflows are defined in YAML files
   - Use `${VAR}` for environment variable placeholders
   - Validate with `load_config` before running
   - Store reusable workflows in `yaml_instance/`

## Important Constraints

- **Python Version:** Requires Python 3.12 (not 3.13)
- **No Emojis:** Never include emojis in code or documentation
- **No Claude Attribution:** Never put "claude" as author in git commits
- **Use `uv`:** All Python project management uses `uv`, not pip
- **Check Compile Errors:** Always run validation after code generation
- **Absolute Paths:** Use absolute paths for file operations
- **No Placeholders:** Never use placeholder values in code; implement fully

## Environment Configuration

Create `.env` file in project root:
```bash
BASE_URL=https://api.openai.com/v1
API_KEY=your_api_key_here
SERPER_DEV_API_KEY=your_serper_key
JINA_API_KEY=your_jina_key
```

Reference in YAML configs:
```yaml
vars:
  api_key: ${API_KEY}
  base_url: ${BASE_URL}
```

## Common Patterns

**Loading Workflows:**
```python
from check.check import load_config

design = load_config(Path("yaml_instance/workflow.yaml"))
```

**Executing Workflows:**
```python
from runtime.sdk import run_workflow

result = run_workflow(
    "yaml_instance/demo_loop_counter.yaml",
    task_prompt="Your task here",
    variables={"API_KEY": "sk-xxx"},  # merged into root `vars`, which win over env
)
print(result.final_message.text_content() if result.final_message else "")
print(result.meta_info.output_dir)  # WareHouse/<session>_<timestamp>/
```

**Creating Custom Exceptions:**
```python
class YourCustomError(RuntimeError):
    """Specific error description."""
    pass
```

## DynaClinic (research goal)

DynaClinic is the research target of this fork: a dynamic architecture-switching multi-agent framework for clinical decision support. A Meta-Controller triages case complexity: low-complexity cases go to a single Primary Care Agent restricted to the Emanuel & Emanuel Informative model; moderate/high cases go to an Integrated Care Team (Diagnostic Imaging, Pathology/Lab, Pharmacology agents) writing to a shared Blackboard. When inter-agent divergence exceeds a threshold tau, the system switches to an Adversarial mode in which a Clinical Critic decomposes the consensus into atomic claims and scores them with an adaptive hybrid rule/LLM-judge estimator. The architecture has 5 layers: L1 FHIR ingestion into Neo4j, L2 MCTS control plane, L3 Blackboard workspace, L4 safety gates (A_SAD, S_NAP, T_SAD), L5 working memory + BioBERT/Qdrant experience memory + verified semantic cache. The proposal lives outside the repo (reference only, do not copy it in): `/Users/laansdole/.hermes/cache/dynaclinic-dispatches/proposal.txt`.

### Proposal component -> repo today

| Proposal component | Where it lives today |
|---|---|
| Meta-Controller complexity triage | `yaml_instance/dynaclinic_meta_controller.yaml` (`MetaController` agent + `keyword` edges; LOW/HIGH only, no moderate tier) |
| Primary Care Agent (Informative model) | same YAML, `PrimaryCareAgent` (Informative-model constraint not encoded) |
| Integrated Care Team (Imaging, Pathology/Lab, Pharmacology) | same YAML, `ImagingAgent`, `PathologyAgent`, `PharmacologyAgent` -> `ConsensusBuilder` (edge message passing, not a blackboard) |
| L3 shared Blackboard | not implemented for DynaClinic; generic store `runtime/node/agent/memory/blackboard_memory.py` (example: `yaml_instance/subgraphs/reflexion_loop.yaml`) |
| Conflict-aware routing (tau, Conflict Set) | `yaml_instance/dynaclinic_conflict_routing.yaml` (LLM `ConflictDetector` emits `VERDICT: CONSENSUS/CONFLICT`; no numeric divergence or tau) |
| Clinical Critic / Adversarial mode | same YAML, `ClinicalCritic` -> `ConflictResolver` (prompt only) |
| Atomic-claim decomposition + hybrid rule/LLM-judge estimator | not implemented |
| L1 FHIR ingestion -> Neo4j graph | not implemented (no FHIR or neo4j dependency) |
| L2 MCTS control plane (PUCT, reward, backtracking) | not implemented |
| L4 A_SAD / S_NAP / T_SAD gates | `yaml_instance/dynaclinic_semantic_verification.yaml` (sequential LLM judges + `PlanReviser`/`LoopGate`); trust-region constraint not implemented |
| L5 working memory | not implemented; closest primitive is per-run `ExecutionContext.global_state` (`runtime/node/executor/base.py`) |
| L5 BioBERT/Qdrant experience memory | not implemented; `simple`/`file` stores use FAISS + `EmbeddingConfig` (`provider: openai` or `local`, see `runtime/node/agent/memory/embedding.py`; `local` needs `sentence_transformers`, not installed) |
| L5 verified semantic cache | not implemented |
| CSEDB safety metrics / evaluation harness | not implemented |

Known defects in the three YAMLs (reproduced with a fake provider, no model calls):
- Each starts with a `literal` `CaseInput` node. `runtime/node/executor/literal_executor.py` ignores its inputs, so the user's case text never reaches any agent. Start at the first agent, or use a `passthrough` node.
- Edges carry only the source node's output. Even with the start node fixed, the ICT specialists see only the triage text, and `S_NAP_Predictor`/`T_SAD_Reviewer`/`VerifiedPlanOutput` see only the previous verdict, never the plan. To fan the case or plan out, add `trigger: false, carry_data: true` data edges from the source (this queues input without triggering; verified for the specialists).
- `keyword` conditions are case-sensitive substring matches over the whole output (`runtime/edge/conditions/keyword_manager.py`). `COMPLEXITY: HIGH ... not LOW` fires both branches; `VERDICT: CONSENSUS ... no CONFLICT` runs the adversarial path. Anchor with `regex: ['^COMPLEXITY:\s*HIGH']` (no MULTILINE, so `^` means start of output) or use a function condition.
- `dynaclinic_semantic_verification.yaml`: `LoopGate` (`loop_counter`, standard mode) emits nothing before its 2nd hit, and the only loop-back edge passes through it. The first FAIL therefore ends the run with no final output. Loop back from `PlanReviser` directly (pattern: `yaml_instance/demo_loop_counter.yaml`) or set `passthrough: true`.
- Edges use `processor: null`, but the key is `process` (`entity/configs/edge/edge.py`). An unknown `processor:` is silently ignored, even when non-null.

### Adding a DynaClinic piece the DevAll way

1. **Workflow**: put a YAML at `yaml_instance/dynaclinic_<name>.yaml`. Agents use `provider: openai`, `name: ${MODEL_NAME}`, `base_url: ${BASE_URL}`, `api_key: ${API_KEY}`, with `MODEL_NAME` set in root `vars:`. Root `vars` win over environment variables (`utils/vars_resolver.py`), and `.env` is loaded from the CWD during `load_config` (`entity/config_loader.py`). Registered providers are `openai` and `gemini` (`runtime/node/agent/providers/builtin_providers.py`). For local OpenAI-compatible servers, set `params: {protocol: chat}`. Otherwise every call tries the Responses API first and silently falls back (`runtime/node/agent/providers/openai_provider.py`).
2. **Deterministic routing**: for edge conditions, write `def name(data: str) -> bool` in `functions/edge/*.py` and use `condition: {type: function, config: {name: name}}`. A missing function name evaluates to `true` with only a warning (`runtime/edge/conditions/function_manager.py`). For edge processors, write `def name(data: str, global_state: dict) -> str | dict | None` in `functions/edge_processor/*.py` and use `process: {type: function, config: {name: name}}`. Returning `None` or `{"drop": True}` drops the message (`runtime/edge/processors/function_processor.py`). All function directories form a flat namespace, loaded by `utils/function_manager.py`.
3. **Agent tools**: put type-hinted functions (optionally `Annotated[..., ParamMeta(...)]`) in `functions/function_calling/*.py` and attach them with `tooling: [{type: function, config: {tools: [{name: ...}]}}]` (example: `yaml_instance/demo_function_call.yaml`; docs: `docs/user_guide/en/modules/tooling/function.md`).
4. **New node type** (e.g. MCTS controller, claim scorer): subclass `NodeExecutor` (`runtime/node/executor/base.py`) and implement `execute(node, inputs) -> List[Message]`; returning `[]` suppresses all outgoing edges. Add a config dataclass under `entity/configs/node/`. Register it with `register_node_type(name, config_cls=..., executor_cls=...)` in `runtime/node/builtin_nodes.py`, or in a module listed in `runtime/bootstrap/schema.py`. Registration feeds both the executor factory (`runtime/node/executor/factory.py`) and validation (`schema_registry/`). The built-in `python` node only runs code extracted from its input message, gated by `MAC_ALLOW_UNSAFE_CODE_EXECUTION=1`. It is not a hook for repo functions.
5. **Memory**: declare stores in graph-level `memory:` (`simple`, `file`, `blackboard`, `mem0`; `runtime/node/agent/memory/builtin_stores.py`). Attach them per agent with `memories: [{name, read, write, retrieve_stage, top_k}]` (`entity/configs/node/memory.py`). Register new stores with `register_memory_store` (`runtime/node/agent/memory/registry.py`). Docs: `docs/user_guide/en/modules/memory.md`.
6. **Validate** (offline; prints `Workflow OK.`):
   ```bash
   env -u PYTHONPATH -u VIRTUAL_ENV uv run python -c "import sys; from pathlib import Path; from check.check import load_config; load_config(Path(sys.argv[1]))" yaml_instance/dynaclinic_meta_controller.yaml
   ```
7. **Run headless** (calls the model at `BASE_URL`; `.env` also holds `API_KEY` and `OPENAI_API_KEY`, never print it):
   ```bash
   echo "68-year-old diabetic with chest pain on warfarin" | env -u PYTHONPATH -u VIRTUAL_ENV uv run python run.py --path yaml_instance/dynaclinic_meta_controller.yaml --name dc_meta
   ```
   Programmatic: `runtime.sdk.run_workflow(path, task_prompt=..., session_name=..., variables={...})` returns `WorkflowRunResult` with `.final_message` (end-node `Message` or `None`) and `.meta_info` (`output_dir`, `outputs`, `token_usage`). The run directory `WareHouse/<session>_<YYYYmmddHHMMSS>/` holds `node_outputs.yaml`, `workflow_summary.yaml`, `execution_logs.json`, and `token_usage_<session>.json`. Workflow log events also stream to stdout.

### Testing conventions

- Config in `pyproject.toml` `[tool.pytest.ini_options]`: `testpaths = ["tests"]`, `pythonpath = ["."]`, `addopts = "-v --tb=short"`. Tests are flat `tests/test_*.py` files.
- Shared fixtures in `tests/conftest.py`: `tmp_yaml_dir`, `tmp_warehouse_dir`, `tmp_spatial_dir`, `tmp_vuegraph_db`, `client` (FastAPI `TestClient`). They redirect storage via `monkeypatch`. `runtime.sdk` writes to `OUTPUT_ROOT = Path("WareHouse")` relative to the CWD, so SDK-driven tests should `monkeypatch.chdir(tmp_path)` or patch `runtime.sdk.OUTPUT_ROOT`.
- No network: patch `ProviderRegistry.get_provider` to return a `Mock` whose `call_model` returns `ModelResponse(message=...)` (`tests/test_attachment_boundary_security.py`). The mem0 client is patched with `MagicMock` (`tests/test_mem0_memory.py`). Pass dummy `BASE_URL`/`API_KEY` through `variables=` so `.env` is not needed.
- The only real-API test is marked `@pytest.mark.cline` and skips without `CLINE_API_KEY` (`tests/test_cline_dry_run.py`). Deselect it with `-m "not cline"`.

## Resources

- User Guide: `docs/user_guide/en/index.md`
- Workflow Authoring: `docs/user_guide/en/workflow_authoring.md`
- Memory Module: `docs/user_guide/en/modules/memory.md`
- Tooling Guide: `docs/user_guide/en/modules/tooling/README.md`
- Execution semantics (DAG, cycles, triggers): `docs/user_guide/en/execution_logic.md`

## Git Workflow

- Create feature branches for new work
- Write clear commit messages describing changes
- Test thoroughly before committing
- Never use `--no-verify` or force push to main/master
