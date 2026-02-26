# RLM Memory Node

The RLM Memory node retrieves memory items and exposes them as Python variables in an RLM (Recursive Language Model) REPL context, enabling programmatic exploration of memory data through code execution.

## Configuration

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `memory_store` | string | Yes | - | Name of the memory store to retrieve from |
| `query` | string | No | `""` | Query string for memory retrieval |
| `limit` | int | No | `10` | Maximum number of memory items to retrieve |
| `time_decay` | float | No | `1.0` | Time decay factor for memory scoring (1.0 = no decay) |
| `max_iterations` | int | No | `10` | Maximum RLM REPL iterations |
| `max_depth` | int | No | `1` | Maximum depth for recursive LLM calls |
| `model` | string | No | `gpt-4o` | LLM model to use for RLM |
| `backend` | string | No | `openai` | LLM backend provider (`openai`, `anthropic`, etc.) |
| `persist_env` | bool | No | `false` | Whether to persist the RLM environment across calls |

## Core Concepts

### RLM REPL Context

The RLM Memory node creates an interactive Python REPL environment where memory items are available as a variable. The agent can execute Python code to analyze, filter, and transform memory data programmatically.

### Shared Environments

When `persist_env: true`, the RLM environment is shared across multiple agents, enabling recursive reasoning across agent boundaries. Shared environments are named using the pattern `shared_{memory_store_name}`.

## When to Use

- **Programmatic memory analysis**: Write code to filter and transform memory content
- **Complex queries**: Perform multi-step reasoning over memory data
- **Cross-agent reasoning**: Share RLM environments between agents for collaborative exploration
- **Data transformation**: Convert memory content into different formats

## Examples

### Basic RLM Memory Retrieval

```yaml
nodes:
  - id: rlm_retriever
    type: rlm_memory
    config:
      memory_store: project_docs
      query: architecture decisions
      limit: 5
      max_iterations: 10
```

### RLM with Custom Model

```yaml
nodes:
  - id: deep_analysis
    type: rlm_memory
    config:
      memory_store: convo_cache
      query: user preferences
      max_iterations: 20
      max_depth: 3
      model: gpt-4o
      backend: anthropic
```

### Shared RLM Environment

```yaml
nodes:
  - id: team_memory_explorer
    type: rlm_memory
    config:
      memory_store: team_knowledge
      persist_env: true
      max_iterations: 15

edges:
  - from: team_memory_explorer
    to: analyst_agent
```

## How to Play With `demo_rlm_memory.yaml`

Use this flow when you want to observe the full lifecycle from empty memory to recursive analysis.

### Step 1: Cold-start pass (empty store)

1. Ensure the demo store file is empty (`[]`) or missing: `WareHouse/{{project_name}}/rlm_test_memory.json`.
2. Run the workflow once with the baseline prompt:
   - `SeedQuery`: `Summarize what memory currently stores about RLM behavior.`
   - `RLMMemoryRetriever.query`: `rlm memory behavior`
3. Expected behavior:
   - `RLMMemoryRetriever` returns `No memories found in store 'test_store' ...`
   - `AgentWithRLM` still responds and then writes the turn to memory at `finished`

### Step 2: Warm-store pass (same store, second run)

1. Run the same workflow again without changing the memory store path.
2. Expected behavior:
   - Retrieval should now return one or more memories (up to `limit`)
   - Agent output should reference prior run content, not only empty-store explanation

### Step 3: Iterative exploration pass (prompt rotation)

1. Keep the same memory store path.
2. Update both `SeedQuery.config.content` and `RLMMemoryRetriever.config.query` to the next prompt from the ladder below.
3. Re-run and observe how analysis depth increases as memory grows across runs.

### Single-Run 5-Pass Mode (Looped Demo)

`demo_rlm_memory.yaml` now includes a `loop_counter` gate so a single run can build a richer memory set before termination.

- The loop target is fixed at 5 passes (`LoopGate.max_iterations: 5`).
- `loop_counter` is used instead of `loop_timer` so iteration count is deterministic and not affected by model/network latency.
- On the threshold pass, LoopGate emits `RLM loop complete after five passes` and routes execution to `Finalizer`.

Why this choice:
- `loop_counter` semantics are a better fit for prompt-ladder evaluation where each tier maps to a pass budget.
- `loop_timer` is useful for wall-clock bounded loops, but pass count can vary across environments.

Related loop docs:
- `docs/user_guide/en/nodes/loop_counter.md`
- `docs/user_guide/en/nodes/loop_timer.md`
- `docs/user_guide/en/execution_logic.md`

Expected output pattern for looped runs:
- Passes 1-4: `AgentWithRLM` continues retrieval/writeback loop and memory entries accumulate.
- Pass 5: LoopGate emits the termination message and `Finalizer` produces terminal output.
- Memory artifact: `WareHouse/{{project_name}}/rlm_test_memory.json` contains multiple entries created in one run.

### Auto Tier-Rotating Variant

Use `yaml_instance/demo_rlm_memory_tiered.yaml` when you want one run to walk the full 5-tier prompt ladder automatically.

- Same loop topology as the looped demo (`SeedQuery -> LoopGate -> RLMMemoryRetriever -> AgentWithRLM -> LoopGate`).
- `LoopGate` uses `loop_counter` with `passthrough: true` and `max_iterations: 6` so working passes are counts 1..5 and count 6 emits terminal message.
- `LoopGate -> RLMMemoryRetriever` applies function processor `rlm_prompt_ladder_by_pass` to inject tier-specific prompts each pass.
- `RLMMemoryRetriever.config.query` is intentionally empty so the per-pass injected prompt becomes the active query.

Run example:
`uv run python run.py --path yaml_instance/demo_rlm_memory_tiered.yaml --name rlm_tiered_demo`

Expected pattern:
- Five tiered retrieval/analysis passes in one run (recall, grouping, contradiction, trend, recursive follow-up).
- Terminal output: `RLM tiered demo completed after five prompt tiers.`
- Memory artifact: `WareHouse/{{project_name}}/rlm_test_memory_tiered.json` accumulates entries from that single run.

## Prompt Ladder (Progressive RLM Testing)

Use prompts in order. Each tier is designed to expose deeper memory reasoning.

| Tier | `SeedQuery.config.content` | `RLMMemoryRetriever.config.query` | Expected output characteristics |
|------|-----------------------------|-----------------------------------|----------------------------------|
| 1. Recall | `Summarize what memory currently stores about RLM behavior.` | `rlm memory behavior` | Basic recap of stored entries; may be empty on first run |
| 2. Grouping | `Group stored memory notes into 2-3 themes and explain each theme.` | `themes of rlm memory behavior` | Thematic clustering over multiple memory items |
| 3. Contradiction check | `Find conflicting claims across stored memory notes and explain why they conflict.` | `conflicting rlm memory claims` | Side-by-side comparison with conflict rationale |
| 4. Trend extraction | `Identify how conclusions about RLM memory changed over time.` | `timeline of rlm memory behavior` | Temporal synthesis using timestamp-aware reasoning |
| 5. Recursive follow-up | `For each major claim, ask one follow-up question and answer it using stored memory evidence only.` | `rlm claims follow up evidence` | Multi-step analysis that decomposes and verifies claims |

## Prompt Rotation Rules

- Keep `memory.test_store.config.memory_path` unchanged so each run accumulates context.
- Change `SeedQuery` and `RLMMemoryRetriever.query` together to avoid query drift.
- Keep `limit` at `5` or higher after tier 2 so clustering/contradiction prompts have enough evidence.
- Use one tier per run; avoid skipping from tier 1 to tier 5 on a sparse store.

## How to Verify RLM Exploration Executed

Check both output text and logs.

### Output signals

- Cold-start expected: `No memories found in store 'test_store' ...`
- Warm-store expected: memory-aware synthesis that references prior turns
- Deeper tiers expected: grouped themes, conflicts, or trend language instead of single-item recap

### Log signals

- Retrieval phase log appears before generation (`Memory RETRIEVE operation ...`)
- Update phase log appears after generation at `finished` (`Memory UPDATE operation ... at finished`)
- Retrieval details show non-zero `item_count` on warm-store and later passes
- Retrieval details include `rlm_executed: true` when RLM exploration path runs successfully in agent memory flow

## Notes

- The RLM library (`rlms`) is optional; if unavailable, DevAll falls back to deterministic plain-text memory output
- Memory items are serialized into the RLM prompt for exploration
- Use `max_iterations` and `max_depth` to control RLM execution complexity
- `persist_env` is accepted in node YAML, but shared RLM environment wiring currently happens via agent memory attachments (`use_rlm: true`)

## Troubleshooting Demo Playbook

- **Missing API/env vars**: confirm `API_KEY` and `BASE_URL` are set and reachable.
- **Always empty retrieval**: verify the same `memory_path` is reused across runs and the first run completed successfully.
- **Query drift**: if `SeedQuery` and `RLMMemoryRetriever.query` target different concepts, retrieval quality drops.
- **Sparse memory set**: contradiction/trend tiers need multiple runs; start with recall and grouping tiers first.
- **Fallback mode**: if `rlm` import/execution fails, output may degrade to deterministic text formatting; install/verify `rlms` and retry.

## Upstream Alignment Audit (alexzhang13/rlm)

This section captures how local integration maps to upstream `alexzhang13/rlm` semantics.

### Upstream references reviewed

- `README.md` quick setup and REPL/environment overview
- `docs/getting-started.md` constructor and invocation patterns
- docs site pages: `/rlm/api/` and `/rlm/backends/`
- examples: `examples/quickstart.py`, `examples/lm_in_repl.py`

### Concept mapping: upstream vs DevAll

| Upstream concept | Upstream behavior | DevAll usage | Match status |
|------------------|-------------------|--------------|--------------|
| Constructor + call pattern | `RLM(...); rlm.completion(prompt)` | Same pattern in `rlm_memory` node and agent memory wrappers | Match |
| Backend/model config | `backend` + `backend_kwargs["model_name"]` | YAML `backend`/`model` (node) and `rlm_backend`/`rlm_model` (attachment) | Match |
| Recursion controls | `max_depth`, `max_iterations` | Exposed in YAML and passed through to `RLM(...)` | Match |
| Final answer contract | `FINAL(...)` / `FINAL_VAR(...)` | Prompts now consistently instruct `FINAL(...)` | Match |
| Environment selection | `environment` supports `local`, `docker`, `modal`, etc. | DevAll currently hardcodes `environment="local"` | Mismatch |
| Persistent mode | Upstream has `persistent=True` for cross-call state | DevAll shared environments are custom wrappers, not upstream `persistent` mode | Mismatch |
| Execution limits | Upstream exposes `max_budget`, `max_timeout`, `max_tokens`, `max_errors` | Not currently exposed in local YAML for RLM integration | Mismatch |

### YAML-impacting incompatibilities

- `rlm_memory.config.persist_env` currently does not drive environment creation in `RLMMemoryNodeExecutor`; shared environment lifecycle is built from agent memory attachments (`use_rlm: true`) in graph setup.
- `rlm_memory` YAML does not expose upstream `environment`/`environment_kwargs`, so users cannot opt into upstream Docker/Modal isolation through node config today.
- `rlm_memory` and memory-attachment YAML do not expose upstream runtime limits (`max_budget`, `max_timeout`, `max_tokens`, `max_errors`), so failure/cost governance is outside YAML design for now.
- Prompts describe a `memories` working variable, but upstream natively guarantees `context` injection; local memory serialization is prompt-driven rather than a first-class upstream context schema.

### Local quality-gate stance

- Upstream `rlms` is not a runtime quality gate for local development checks.
- If `rlm` import or execution fails at runtime, both `rlm_memory` node and agent-memory RLM paths fall back to deterministic text formatting so workflows remain executable.
