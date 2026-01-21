# Deep Research: YAML Scenario File Format for ChatDev 2.0 (DevAll)

This document details the YAML format used for defining multi-agent workflows in ChatDev 2.0. It is based on an analysis of the codebase, specifically the configuration schemas in `entity/configs/` and validation logic in `check/`.

## 1. File Structure Overview

A valid workflow file consists of three main top-level keys:

```yaml
version: "0.0.0"      # Optional, defaults to "0.0.0"
vars:                 # Optional global variables
  API_KEY: ${API_KEY}
  BASE_URL: ${BASE_URL}
graph:                # REQUIRED: The core workflow definition
  id: "MyWorkflow"
  description: "Description of what this workflow does"
  nodes: []           # List of Node objects
  edges: []           # List of Edge objects
```

## 2. Graph Definition (`graph`)

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `id` | `str` | Yes | Unique identifier (alphanumeric, underscores, hyphens). |
| `nodes` | `List[Node]` | Yes | List of nodes. Must contain at least one node. |
| `edges` | `List[Edge]` | Yes | List of directed edges connecting nodes. |
| `description` | `str` | No | Human-readable description. |
| `log_level` | `enum` | No | `DEBUG`, `INFO`, `WARNING`, `ERROR`, `CRITICAL`. Default: `DEBUG`. |
| `is_majority_voting` | `bool` | No | Default: `false`. |
| `memory` | `List` | No | List of `MemoryStoreConfig` definitions. |
| `start` | `List[str]` | No* | List of start node IDs. *Inferred if graph has unique source.* |
| `end` | `List[str]` | No* | List of end node IDs. *Inferred if graph has unique sink.* |
| `initial_instruction` | `str` | No | Initial instruction text for the user. |
| `organization` | `str` | No | Organization name. |

## 3. Node Configuration (`nodes`)

Each item in the `nodes` list represents a processing unit.

```yaml
- id: "NodeID"        # Required: Unique ID
  type: "agent"       # Required: Node type (agent, human, loop_counter, etc.)
  description: "..."  # Optional
  context_window: 0   # Optional: 0 (clear), -1 (unlimited), N (keep last N)
  config:             # Required: Configuration specific to the 'type'
    ...
```

### Common Node Types & Configurations

#### **`agent`**
Represents an LLM-based agent.
```yaml
type: agent
config:
  name: "gpt-4o"           # Required: Model name
  provider: "openai"       # Required: Provider (openai, etc.)
  role: "System prompt..." # Optional: System message
  base_url: ${BASE_URL}    # Optional: Override URL
  api_key: ${API_KEY}      # Optional: API Key
  params:                  # Optional: Model parameters
    temperature: 0.7
  tooling:                 # Optional: List of tools
    - type: function
      config:
        tools:
          - name: "read_file"
  memories: []             # Optional: Memory attachments
  retry:                   # Optional: Retry configuration
    enabled: true
    max_attempts: 5
```

#### **`human`**
Represents a human interaction point.
```yaml
type: human
config:
  description: "Instruction for the human user"
```

#### **`loop_counter`**
Controls loops by counting iterations.
```yaml
type: loop_counter
config:
  max_iterations: 5     # Max allowed loops
  reset_on_emit: true   # Reset count when condition is met
  message: ""           # Optional message
```

#### **`passthrough`**
A simple node that passes data through without modification.
```yaml
type: passthrough
config: {}
```

#### **`literal`**
Injects static content into the workflow.
```yaml
type: literal
config:
  content: "Static content text"
  role: "user"          # Role of the message (user, assistant, system)
```

#### **`python_runner`** (implied from imports)
Executes Python code.
```yaml
type: python_runner
config:
  timeout_seconds: 60
```

## 4. Edge Configuration (`edges`)

Defines the flow between nodes.

```yaml
- from: "SourceNodeID"    # Required
  to: "TargetNodeID"      # Required
  trigger: true           # Default: true. Can trigger target execution?
  condition: "true"       # Condition to traverse (default "true")
  carry_data: true        # Pass output of source to target?
  keep_message: false     # Mark message as 'keep' in target context?
  clear_context: false    # Clear target's context before adding new data?
  clear_kept_context: false # Clear 'kept' messages in target?
```

## 5. Common Errors & Best Practices

1.  **Unique IDs**: Ensure every `id` in `nodes` is unique. Duplicate IDs cause validation failure.
2.  **Valid References**: `from` and `to` in `edges` must match exactly with a defined `id` in `nodes`.
3.  **Root Structure**: The file **must** have the `graph:` key. `vars:` defines placeholders like `${API_KEY}`.
4.  **Type Consistency**:
    *   `context_window` is an **integer**, not a string.
    *   `condition` is a string expression (e.g., `"true"`, `"false"`) or a config object.
5.  **Agent Config**:
    *   `name` and `provider` are mandatory for `agent` nodes.
    *   `tooling` must be a list of tool configurations.
6.  **Environment Variables**: Use `${VAR_NAME}` in YAML and define them in `.env` or the `vars` section. The validation logic checks schema but resolves variables at runtime.

## 6. Validation

Use the project's validation tool to check your YAML:
```bash
uv run python -m check.check --path yaml_instance/your_workflow.yaml
```

This tool performs:
*   **Schema Validation**: Checks if fields match the defined dataclasses (`entity/configs`).
*   **Structure Validation**: Checks for orphan nodes, invalid edges, and logical consistency.
