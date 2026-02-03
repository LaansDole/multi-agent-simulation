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

**DevAll** is a zero-code multi-agent orchestration platform for building customized multi-agent workflows. Built with Python 3.12+ backend (FastAPI) and Vue 3 frontend (Vite), it enables users to create complex agent systems through YAML configuration files.

**Tech Stack:**
- Backend: Python 3.12+, FastAPI, uvicorn, WebSockets
- Frontend: Vue 3, Vite, Vue Flow
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

**Run CLI Workflow:**
```bash
uv run python run.py --path yaml_instance/demo.yaml --name test_project
```

**Check/Validate Workflow:**
```bash
uv run python -m check.check --path yaml_instance/your_workflow.yaml
```

**Run Tests:**
```bash
uv run pytest                        # Run all tests
uv run pytest tests/test_file.py     # Run specific test file
uv run pytest tests/test_file.py::test_function  # Run single test
uv run pytest -v                     # Verbose output
uv run pytest -k "pattern"           # Run tests matching pattern
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
├── runtime/             # Agent abstraction and tool execution
├── workflow/            # Multi-agent orchestration logic
├── server/              # FastAPI backend
├── frontend/            # Vue 3 web console
├── functions/           # Custom Python tools
├── utils/               # Shared utilities
├── check/               # Validation scripts
├── yaml_instance/       # Workflow configuration examples
├── yaml_template/       # Workflow templates
├── WareHouse/           # Output directory for workflow runs
├── run.py               # CLI entry point
└── server_main.py       # Server entry point
```

## Development Workflow

1. **Before Making Changes:**
   - Read relevant code to understand context
   - Check for similar patterns in the codebase
   - Validate workflow files using `check.check` module

2. **Making Changes:**
   - Follow existing code style and patterns
   - Add type hints to all new functions
   - Write descriptive docstrings
   - Handle errors appropriately with custom exceptions

3. **Testing Changes:**
   - Run validation: `uv run python -m check.check --path your_workflow.yaml`
   - Test backend: Start server and verify endpoints
   - Test frontend: Check UI in browser at http://localhost:5173

4. **Configuration Files:**
   - Workflows are defined in YAML files
   - Use `${VAR}` for environment variable placeholders
   - Validate with check module before running
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
    yaml_file="yaml_instance/demo.yaml",
    task_prompt="Your task here",
    variables={"API_KEY": "sk-xxx"}
)
```

**Creating Custom Exceptions:**
```python
class YourCustomError(RuntimeError):
    """Specific error description."""
    pass
```

## Resources

- User Guide: `docs/user_guide/en/index.md`
- Workflow Authoring: `docs/user_guide/en/workflow_authoring.md`
- Memory Module: `docs/user_guide/en/modules/memory.md`
- Tooling Guide: `docs/user_guide/en/modules/tooling/index.md`

## Git Workflow

- Create feature branches for new work
- Write clear commit messages describing changes
- Test thoroughly before committing
- Never use `--no-verify` or force push to main/master
