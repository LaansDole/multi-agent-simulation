# DevAll System Architecture

This document provides a comprehensive visual architecture of the DevAll backend, using mermaid diagrams to illustrate how the major subsystems interact. For detailed feature documentation, see the [User Guide](user_guide/en/index.md).

---

## 1. High-Level System Architecture

```mermaid
graph TB
    subgraph Clients["Clients"]
        WebUI["Web UI (Vue.js)"]
        CLI["CLI (run.py)"]
        SDK["Python SDK (runtime/sdk.py)"]
    end

    subgraph Server["Server Layer (FastAPI)"]
        direction TB
        App["FastAPI App (server/app.py)"]
        Bootstrap["Bootstrap (server/bootstrap.py)"]
        MW["Middleware (CORS, Error Handling, Logging)"]

        subgraph Routes["HTTP/WS Routes"]
            WorkflowR["Workflow Routes"]
            ExecuteR["Execute Routes"]
            SessionR["Session Routes"]
            ArtifactR["Artifact Routes"]
            UploadR["Upload Routes"]
            WS["WebSocket Endpoint"]
            ConfigR["Config Schema Router"]
            SpatialR["Spatial Config Routes"]
        end

        subgraph Services["Services"]
            WRS["WorkflowRunService"]
            WSManager["WebSocketManager"]
            SessionStore["SessionStore"]
            BatchService["BatchRunService"]
            ArtifactSvc["ArtifactDispatcher"]
            PromptCh["PromptChannel"]
        end
    end

    subgraph Workflow["Workflow Engine (workflow/)"]
        GE["GraphExecutor"]
        GM["GraphManager"]
        TB2["TopologyBuilder"]
        CM["CycleManager / CycleDetector"]
        GCtx["GraphContext"]

        subgraph Executors["Execution Strategies"]
            DAG["DagExecutionStrategy"]
            CYC["CycleExecutionStrategy"]
            DYN["DynamicEdgeExecutor"]
            PAR["ParallelExecutor"]
            MV["MajorityVoteStrategy"]
        end
    end

    subgraph Runtime["Runtime Layer (runtime/)"]
        subgraph NodeExec["Node Executors (runtime/node/)"]
            AgentEx["AgentExecutor"]
            PythonEx["PythonExecutor"]
            HumanEx["HumanExecutor"]
            SubgraphEx["SubgraphExecutor"]
            PassEx["PassthroughExecutor"]
            LiteralEx["LiteralExecutor"]
            LoopCEx["LoopCounterExecutor"]
            LoopTEx["LoopTimerExecutor"]
        end

        subgraph AgentModules["Agent Modules (runtime/node/agent/)"]
            Providers["LLM Providers (OpenAI, Gemini)"]
            Memory["Memory (Simple, File, Blackboard, RLM)"]
            Thinking["Thinking (SelfReflection)"]
            Tooling["Tool Manager (Function, MCP)"]
        end

        subgraph EdgeLayer["Edge Layer (runtime/edge/)"]
            Conditions["Edge Conditions (Keyword, Function, Custom)"]
            Processors["Edge Processors (Regex, Function)"]
        end
    end

    subgraph Entity["Entity / Config Layer (entity/)"]
        GraphCfg["GraphConfig / GraphDefinition"]
        NodeCfg["Node Configs"]
        EdgeCfg["Edge Configs"]
        Messages["Message Objects"]
        Enums["Enums / EnumOptions"]
    end

    subgraph Utils["Utilities (utils/)"]
        Logger["Logger / StructuredLogger"]
        LogMgr["LogManager"]
        AttachStore["AttachmentStore"]
        FnCatalog["FunctionCatalog"]
        FnMgr["FunctionManager"]
        TokenTrack["TokenTracker"]
        SchemaExp["SchemaExporter"]
        ErrHandler["ErrorHandler"]
    end

    subgraph Storage["Storage / Output"]
        WareHouse["WareHouse/ (Session Outputs)"]
        Logs["logs/ (Structured Logs)"]
        YAMLDir["yaml_instance/ (Workflows)"]
        SchemaReg["schema_registry/"]
    end

    WebUI -->|"HTTP/WS"| App
    CLI -->|"Direct"| GE
    SDK -->|"Direct"| GE

    App --> Bootstrap
    Bootstrap --> MW
    Bootstrap --> Routes
    Routes --> Services

    WRS --> GE
    WSManager --> WS
    SessionStore --> SessionR

    GE --> GM
    GM --> TB2
    GM --> CM
    GE --> GCtx
    GE --> Executors

    DAG --> NodeExec
    CYC --> NodeExec
    DYN --> NodeExec
    PAR --> NodeExec

    AgentEx --> AgentModules
    AgentEx --> Providers

    GE --> EdgeLayer
    GE --> Entity

    GE --> Utils
    GCtx --> WareHouse
    LogMgr --> Logs
    Entity --> YAMLDir
```

---

## 2. Request Lifecycle Flow

```mermaid
sequenceDiagram
    participant C as Client (Web UI / CLI)
    participant S as FastAPI Server
    participant WS as WebSocket Manager
    participant WRS as WorkflowRunService
    participant GE as GraphExecutor
    participant GM as GraphManager
    participant NE as Node Executors
    participant LLM as LLM Provider
    participant FS as File System (WareHouse/)

    C->>S: POST /api/workflow/execute<br/>(yaml_file, task_prompt, session_id)
    S->>WRS: validate & prepare session

    WRS->>FS: Create session dir<br/>(WareHouse/{session}/)
    WRS->>GE: Initialize GraphExecutor

    GE->>GM: build_graph_structure()
    GM->>GM: Instantiate nodes from YAML
    GM->>GM: Build edges, detect cycles
    GM-->>GE: Graph ready (DAG or Cyclic)

    GE->>GE: Build memories, thinking managers
    GE->>GE: Prepare edge conditions

    loop For each execution layer
        GE->>NE: Execute node(s)
        NE->>LLM: Call provider (if agent node)
        LLM-->>NE: LLM response
        NE-->>GE: Node output (List[Message])
        GE->>WS: Push node state + logs
        WS->>C: WebSocket event
        GE->>GE: Evaluate edge conditions
        GE->>GE: Process edge payloads
    end

    GE->>GE: Save memories
    GE->>FS: Write outputs to WareHouse/
    GE-->>WRS: Execution complete
    WRS->>WS: Push completion event
    WS->>C: Workflow finished
```

---

## 3. Workflow Execution Engine — DAG vs Cyclic

The execution engine automatically detects graph structure using Tarjan's strongly connected components algorithm and selects the appropriate strategy. See [Graph Execution Logic](user_guide/en/execution_logic.md) for full details.

```mermaid
flowchart TB
    Start["Workflow YAML Loaded"] --> Parse["Parse GraphDefinition<br/>(entity/graph_config.py)"]
    Parse --> GM["GraphManager.build_graph_structure()"]

    GM --> InstNodes["Instantiate Nodes"]
    GM --> InitEdges["Initialize Edges"]
    InitEdges --> Detect{"CycleDetector:<br/>Tarjan's SCC"}

    Detect -->|"No Cycles"| DAGPath
    Detect -->|"Cycles Found"| CyclePath

    subgraph DAGPath["DAG Execution"]
        direction TB
        TopoSort["Topological Sort<br/>(TopologyBuilder)"]
        TopoSort --> Layers["Build Parallel Layers"]
        Layers --> ExecLayers["Execute layers sequentially<br/>Nodes within layer run in parallel"]
    end

    subgraph CyclePath["Cyclic Execution"]
        direction TB
        SuperNode["Abstract cycles into<br/>Super Nodes"]
        SuperNode --> MetaDAG["Build Super-Node DAG<br/>(guaranteed acyclic)"]
        MetaDAG --> MetaTopo["Topological sort on<br/>Super-Node DAG"]
        MetaTopo --> ExecSuper{"Execute item"}
        ExecSuper -->|"Regular Node"| ExecRegular["Execute normally"]
        ExecSuper -->|"Super Node"| RecurExec["Recursive Cycle<br/>Execution"]
    end

    subgraph RecurExec["Recursive Cycle Executor"]
        direction TB
        FindEntry["Find unique entry node"]
        FindEntry --> ScopeGraph["Build scoped subgraph<br/>(remove entry incoming edges)"]
        ScopeGraph --> InnerDetect{"Inner cycles?"}
        InnerDetect -->|"No"| InnerDAG["DAG topological sort"]
        InnerDetect -->|"Yes"| InnerSuper["Build inner super nodes"]
        InnerDAG --> LayerExec["Execute layers"]
        InnerSuper --> LayerExec
        LayerExec --> ExitCheck{"Exit condition?"}
        ExitCheck -->|"Exit edge triggered"| Done["Exit cycle"]
        ExitCheck -->|"Max iterations"| Done
        ExitCheck -->|"Entry not re-triggered"| Done
        ExitCheck -->|"Continue"| ScopeGraph
    end

    ExecLayers --> Complete["Execution Complete"]
    ExecRegular --> Complete
    Done --> Complete
```

---

## 4. Agent Node Execution Pipeline

Agent nodes are the primary compute unit, orchestrating LLM calls with optional thinking, memory, and tooling phases. See [Workflow Authoring § Agent Features](user_guide/en/workflow_authoring.md#6-agent-node-advanced-features) for configuration details.

```mermaid
flowchart LR
    Input["Input Messages<br/>(from predecessors)"] --> AgentEx["AgentExecutor"]

    AgentEx --> TemplatePhase["Apply prompt_template<br/>(Jinja2 rendering)"]

    TemplatePhase --> ThinkPhase{"Thinking<br/>enabled?"}
    ThinkPhase -->|"Yes"| Think["ThinkingManager<br/>(chain-of-thought /<br/>self-reflection)"]
    ThinkPhase -->|"No"| MemRead

    Think --> MemRead{"Memory<br/>configured?"}
    MemRead -->|"Yes"| ReadMem["MemoryManager.read()<br/>(simple / file / blackboard / RLM)"]
    MemRead -->|"No"| ToolCheck

    ReadMem --> ToolCheck{"Tooling<br/>configured?"}
    ToolCheck -->|"Yes"| ToolSetup["ToolManager<br/>(function / MCP)"]
    ToolCheck -->|"No"| LLMCall

    ToolSetup --> LLMCall["LLM Provider Call"]

    subgraph ProviderLayer["Provider Abstraction"]
        LLMCall --> ProviderSelect{"Provider type"}
        ProviderSelect -->|"openai"| OpenAI["OpenAI Provider"]
        ProviderSelect -->|"gemini"| Gemini["Gemini Provider"]
    end

    OpenAI --> Response["Provider Response"]
    Gemini --> Response

    Response --> ToolLoop{"Tool calls<br/>in response?"}
    ToolLoop -->|"Yes"| ExecTool["Execute tool function"]
    ExecTool --> LLMCall
    ToolLoop -->|"No"| PostProcess

    PostProcess --> WriteMem["MemoryManager.write()<br/>(persist to store)"]
    WriteMem --> Output["Output: List[Message]"]
```

---

## 5. Dynamic Execution — Map and Tree Modes

Dynamic execution enables parallel processing defined at the edge level. See [Dynamic Execution Guide](user_guide/en/dynamic_execution.md) for configuration and examples.

```mermaid
flowchart TB
    Source["Source Node Output"] --> DynEdge{"Edge has<br/>dynamic config?"}
    DynEdge -->|"No"| StaticFlow["Standard message passing"]
    DynEdge -->|"Yes"| SplitStrategy

    subgraph SplitStrategy["Split Strategy"]
        direction LR
        SS{"Split type"}
        SS -->|"message"| MsgSplit["Each message =<br/>one execution unit"]
        SS -->|"regex"| RegexSplit["Regex matches =<br/>execution units"]
        SS -->|"json_path"| JSONSplit["JSONPath array elements =<br/>execution units"]
    end

    SplitStrategy --> ModeSelect{"Execution mode"}

    ModeSelect -->|"map"| MapMode
    ModeSelect -->|"tree"| TreeMode

    subgraph MapMode["Map Mode (Fan-out)"]
        direction TB
        MapUnits["N execution units"]
        MapUnits --> MapPar["Parallel execution<br/>(max_parallel limit)"]
        MapPar --> MapMerge["Flatten results<br/>→ List of Messages"]
    end

    subgraph TreeMode["Tree Mode (Fan-out + Reduce)"]
        direction TB
        TreeL1["Layer 1: Parallel execution"]
        TreeL1 --> TreeGroup["Group by group_size"]
        TreeGroup --> TreeReduce["Reduction: re-execute<br/>with grouped inputs"]
        TreeReduce --> TreeCheck{"Result count = 1?"}
        TreeCheck -->|"No"| TreeGroup
        TreeCheck -->|"Yes"| TreeFinal["Single final Message"]
    end

    MapMerge --> Next["Downstream node(s)"]
    TreeFinal --> Next

    %% Static edge replication
    StaticEdge["Static edge messages"] -.->|"Replicated to all<br/>dynamic instances"| MapPar
    StaticEdge -.->|"Replicated to all<br/>dynamic instances"| TreeL1
```

---

## 6. Server Layer — Routes and Services

```mermaid
flowchart LR
    subgraph HTTP["HTTP Routes (server/routes/)"]
        R1["/api/workflow/*"]
        R2["/api/workflow/execute"]
        R3["/api/workflow/execute-sync"]
        R4["/api/sessions/*"]
        R5["/api/artifacts/*"]
        R6["/api/uploads/*"]
        R7["/api/tools/*"]
        R8["/api/config/schema*"]
        R9["/api/spatial-configs/*"]
        R10["/api/batch/*"]
        R11["/api/health"]
        R12["/api/vuegraphs/*"]
    end

    subgraph WS["WebSocket"]
        WSE["/ws"]
    end

    subgraph Svc["Services (server/services/)"]
        S1["WorkflowRunService"]
        S2["WorkflowStorage"]
        S3["WebSocketManager"]
        S4["WebSocketExecutor"]
        S5["SessionStore"]
        S6["SessionExecution"]
        S7["AttachmentService"]
        S8["ArtifactDispatcher"]
        S9["ArtifactEvents"]
        S10["BatchRunService"]
        S11["BatchParser"]
        S12["MessageHandler"]
        S13["PromptChannel"]
        S14["VueGraphsStorage"]
    end

    R1 --> S2
    R2 --> S1
    R3 --> S1
    R4 --> S5
    R5 --> S8
    R6 --> S7
    R10 --> S10
    R12 --> S14
    WSE --> S3
    S3 --> S4
    S1 --> S6
    S1 --> S13
    S6 --> S9
```

---

## 7. Component Interaction Summary

| Layer | Key Modules | Responsibility |
|-------|------------|----------------|
| **Server** | `server/app.py`, `server/bootstrap.py`, `server/routes/`, `server/services/` | HTTP/WebSocket API, session management, real-time observability |
| **Workflow Engine** | `workflow/graph.py`, `workflow/graph_manager.py`, `workflow/cycle_manager.py`, `workflow/topology_builder.py`, `workflow/executor/` | Graph parsing, DAG/cyclic scheduling, dynamic map/tree execution |
| **Runtime** | `runtime/node/`, `runtime/edge/`, `runtime/sdk.py` | Node execution (agent, python, human, etc.), edge conditions/processors, provider abstraction |
| **Entity** | `entity/graph_config.py`, `entity/configs/`, `entity/messages.py`, `entity/enums.py` | Configuration dataclasses, message schema, enums |
| **Utilities** | `utils/logger.py`, `utils/attachments.py`, `utils/function_catalog.py`, `utils/token_tracker.py` | Structured logging, attachment management, function registry, token tracking |
| **Storage** | `WareHouse/`, `logs/`, `yaml_instance/`, `schema_registry/` | Session outputs, structured logs, workflow definitions, schema cache |

---

## Related Documentation

- [User Guide Index](user_guide/en/index.md) — Navigation map for all backend documentation
- [Graph Execution Logic](user_guide/en/execution_logic.md) — DAG and cyclic execution deep dive
- [Workflow Authoring](user_guide/en/workflow_authoring.md) — YAML structure, node types, edge conditions
- [Dynamic Execution](user_guide/en/dynamic_execution.md) — Map/tree parallel processing details
- [WebSocket Lifecycle](user_guide/en/ws_frontend_logic.md) — Frontend connection state machine
