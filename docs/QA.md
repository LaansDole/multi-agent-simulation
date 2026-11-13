# Multi-Agent Simulation — Q&A

## A. System Architecture & Design

**Walk me through the architectural layers. Which is most critical?**

| Layer | Purpose |
|-------|---------|
| **Clients** | Web UI (Vue.js), CLI (`run.py`), Python SDK |
| **Server** | FastAPI — HTTP REST + WebSocket, session management |
| **Workflow Engine** | Graph parsing, DAG/cyclic scheduling, dynamic execution |
| **Runtime** | Node executors (agent, python, human, etc.), edge conditions, LLM providers |
| **Storage** | `WareHouse/`, `logs/`, `yaml_instance/`, `schema_registry/` |

The **Workflow Engine** is arguably most critical — it is the brain that decides *what* runs *when*. Without correct graph scheduling (DAG vs cyclic detection, topological ordering), no other layer functions correctly.

---

**What are the trade-offs of the layered design vs monolithic?**

| Aspect | Layered (current) | Monolithic |
|--------|--------------------|------------|
| **Testability** | Each layer testable in isolation | Harder to unit test |
| **Extensibility** | Add providers/nodes without touching engine | Changes ripple through |
| **Latency** | Cross-layer calls add indirection | Direct function calls |
| **Complexity** | More files, abstractions to learn | Simpler codebase to navigate |
| **Deployment** | Same process (no network overhead) | Same |

The project mitigates latency concerns because all layers run **in-process** (no microservice boundaries), while still benefiting from clean separation.

---

**Why both HTTP REST and WebSocket?**

- **HTTP REST** handles stateless operations: listing workflows, fetching sessions, uploading files, triggering execution, health checks
- **WebSocket** provides **real-time streaming** during execution: node state changes, log events, intermediate outputs, completion notifications

They complement each other: REST for CRUD, WebSocket for live observability. A workflow execution may run for minutes — polling via REST would be wasteful; WebSocket pushes events as they happen via `WebSocketManager` → `WebSocketExecutor`.

---

**Explain to me the flowchart of the system.**

1. YAML file loaded and parsed by `GraphConfig` dataclass (`entity/graph_config.py`)
2. `GraphManager.build_graph_structure()` instantiates nodes and edges from config
3. `CycleDetector` (Tarjan's SCC) classifies graph as DAG or cyclic
4. `TopologyBuilder` produces execution layers (topological sort)
5. `GraphExecutor` iterates layers, dispatching to node executors
6. `AgentExecutor` receives the agent's `NodeConfig` → applies prompt template → optional thinking/memory/tooling → calls LLM provider → returns `List[Message]`

---

## B. Workflow Execution Engine

**How is Tarjan's SCC used, and why over simpler methods?**

Tarjan's algorithm finds **all** strongly connected components in a single O(V+E) DFS pass. The system uses this to:
1. Identify which nodes form cycles (SCCs with >1 node)
2. Abstract each SCC into a "Super Node"
3. Build a guaranteed-acyclic meta-DAG of super nodes + regular nodes

**Why not simpler DFS cycle detection?** Simple DFS only tells you *if* a cycle exists — Tarjan's tells you *which* nodes are in *which* cycles, enabling the recursive cycle execution strategy. It also handles nested cycles (cycles within cycles).

---

**How does the Super Node abstraction guarantee an acyclic meta-DAG?**

By definition: every strongly connected component is collapsed into a single super node. Edges between SCCs are preserved but now connect super nodes. Since SCCs are maximal (no SCC can be part of a larger SCC), the resulting graph of super nodes **cannot** have cycles — if it did, those super nodes would themselves form an SCC and would have been merged. This is a mathematical property of the condensation of a directed graph.

---

**What determines parallelism boundaries in DAG mode?**

`TopologyBuilder` computes a topological sort and groups nodes into **layers** where each layer contains nodes whose *all* predecessors are in previous layers. Nodes within the same layer have no dependencies on each other → they run in parallel. Synchronization is implicit: the executor waits for **all** nodes in layer N to complete before starting layer N+1.

---

**Why are all three cyclic exit conditions necessary?**

| Condition | Purpose |
|-----------|---------|
| **Exit edge triggered** | Semantic exit — the workflow logic decided to break (e.g., quality check passed) |
| **Max iterations** | Safety valve — prevents infinite loops from LLM non-determinism or logic bugs |
| **Entry not re-triggered** | Structural exit — no edge routes back to the entry node, so the cycle naturally ends |

Without all three: missing max iterations → possible infinite loops; missing exit edge → no way for workflow logic to break early; missing entry-not-re-triggered → the system wouldn't recognize a natural dead-end.

---

## C. Memory & Embedding System

**Is memory "stored in vector database" accurate?**

**No.** The memory system uses **FAISS in-memory vector indexing** (`faiss-cpu`) + JSON file persistence — not a vector database.

The project **does** use a database — **SQLite** (`data/vuegraphs.db`) — but only for persisting VueFlow graph editor layouts via `vuegraphs_storage.py`, not for memory/embedding storage. This is a simple key-value table (`filename TEXT PRIMARY KEY, content TEXT`) storing serialized graph JSON, completely separate from the memory system.

---

**What are the performance implications of rebuilding FAISS per query?**

`IndexFlatIP` is brute-force O(n) — acceptable for the typical scale (tens to hundreds of memory items). Rebuilding is cheap because:
- No ANN index structure to maintain
- NumPy array construction from a Python list is fast for small n
- The real bottleneck is the **embedding API call** (network latency to OpenAI), not the FAISS search

It becomes a bottleneck when: (a) memory items exceed ~10K, (b) `retrieve()` is called in a tight loop, or (c) embedding dimension is very large. At that point, persisting a FAISS index or switching to an ANN index (e.g., `IndexIVFFlat`) would help.

---

**Compare the three memory store types.**

| | SimpleMemory | FileMemory | BlackboardMemory |
|---|---|---|---|
| **Search** | FAISS + semantic rerank | FAISS cosine similarity | Recency-based (no vectors) |
| **Read/Write** | Both | Read-only | Both |
| **Persistence** | JSON file | JSON index file | JSON file |
| **Best for** | Conversation history, small state | Knowledge bases, doc QA | Broadcast boards, debugging |
| **Embedding required** | Yes | Yes | No |

**Decision criteria**: Need R+W with semantic search → Simple. Need to index files/directories → File. Need lightweight append-only log → Blackboard.

---

## D. Agent Execution Pipeline

**Describe the agent execution pipeline and optional phases.**

```
Input → Prompt Template → [Thinking?] → [Memory?] → [Tooling?] → LLM Call → [Tool Loop?] → Memory Write → Output
```

| Phase | Optional? | Activated by |
|-------|-----------|--------------|
| Prompt template | No (always runs) | `prompt_template` in config |
| Thinking | Yes | `thinking.type` configured (e.g., `reflection`) |
| Memory read | Yes | `memories[].read: true` with matching `retrieve_stage` |
| Tooling setup | Yes | `tooling[]` list in config |
| Tool loop | Yes | LLM response contains `tool_calls` |
| Memory write | Yes | `memories[].write: true` |

The system checks each config field's presence — `None`/empty means skip.

---

**How is provider abstraction designed? How to add Anthropic?**

The provider layer uses a strategy pattern — each provider implements a common interface for `call()` with messages, tools, and params. Currently OpenAI and Gemini are supported.

To add Anthropic, you would:
1. Create `runtime/node/agent/provider/anthropic_provider.py` implementing the provider interface
2. Register it in the provider factory with key `"anthropic"`
3. Map the common message format to Anthropic's API (system messages, tool definitions, content blocks)
4. Handle Anthropic-specific features (e.g., extended thinking, prompt caching)

---

## E. Dynamic Execution

**Map vs Tree — when to use each?**

| | Map (Fan-out) | Tree (Fan-out + Reduce) |
|---|---|---|
| **Pattern** | 1 → N parallel → collect all | 1 → N parallel → group → reduce → ... → 1 |
| **Output** | List of N messages | Single final message |
| **Use case** | Process N patients independently | Summarize 100 documents into one report |

**Map example**: 5 patients → 5 parallel nurse intakes → collect all 5 results.
**Tree example**: 50 web pages → 10 groups of 5 → 10 summaries → 2 groups of 5 → 2 summaries → 1 final summary.

---

**Why replicate static edges, and what if context is large?**

Static edges carry "shared context" (e.g., system instructions, configuration) that every dynamic instance needs. Without replication, parallel instances would lack the necessary context to execute correctly.

**Large context risk**: If static context is 10K tokens and you fan out to 50 instances, you're sending 500K tokens of duplicated context to the LLM. Mitigation strategies: (a) keep static context minimal, (b) use `context_window` to limit history, (c) use memory retrieval instead of edge-carried context.

---

## F. Frontend & DevOps

**Describe the WebSocket lifecycle.**

1. **Connect**: Client opens WebSocket to `/ws` with a session ID
2. **Subscribe**: `WebSocketManager` registers the connection for that session
3. **Streaming**: During execution, `GraphExecutor` pushes events (node start/complete, logs, outputs) via `WebSocketManager`
4. **Reconnect**: If connection drops, the frontend reconnects and may request missed events
5. **Disconnect**: On workflow completion or manual close, the connection is cleaned up

The frontend handles state transitions: `connecting` → `connected` → `streaming` → `complete` / `error` / `disconnected`.
