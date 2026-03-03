# Communication Protocol Comparison Matrix

**Document Type:** Research Comparison  
**Last Updated:** March 2, 2026  
**Purpose:** Side-by-side comparison of inter-agent communication protocols for multi-agent systems

---

## Overview

This document compares communication protocols and message passing mechanisms across different multi-agent frameworks, from classic agent communication languages (FIPA-ACL, KQML) to modern LLM-based approaches (ChatDev, AutoGen, CrewAI, DevAll). The comparison focuses on message structure, protocol formality, turn-taking mechanisms, and context passing strategies.

---

## Comparison Matrix

| Framework | Message Structure | Protocol Formality | Turn-Taking | Context Passing |
|-----------|------------------|-------------------|-------------|----------------|
| **ChatDev** | Role-based natural language messages | Chat chain protocol (semi-structured) | Sequential within chat chains, agreement-based termination | Phase handoff with artifacts |
| **AutoGen** | OpenAI-style messages with role/content/name/context | Flexible conversation patterns | Turn-based (LLM-driven), termination conditions | Conversation history per agent |
| **CrewAI** | TaskOutput objects (raw/JSON/Pydantic) | Pub/Sub messaging + A2A protocol | Task-driven sequential execution | Shared memory bus |
| **FIPA-ACL** | Structured ACL messages with performative + content | Formal speech act protocol | Protocol-based (request-response, FIPA-request, etc.) | Conversation ID + reply-with |
| **KQML** | Three-layer (content/message/communication) | Formal speech act language | Protocol-based (tell/ask/achieve) | Reply-with/in-reply-to |
| **DevAll** | Message class with role + multimodal content blocks | Edge-based message passing | DAG-orchestrated (layer-by-layer) | Edge processors + context management |

---

## Detailed Framework Analysis

### 1. ChatDev

**Message Structure:**
- **Role-based natural language** messages
- Agents communicate in specific roles (CEO, CPO, Programmer, Tester, etc.)
- Messages contain role-specific context and artifacts
- Example:
  ```
  CTO: "What framework should we use?"
  CPO: "Based on requirements, React for frontend, Flask for backend"
  ```

**Protocol Formality:**
- **Chat chain protocol** - semi-structured conversation patterns
- Each phase divided into sequential sub-tasks
- Sub-tasks have defined input/output requirements
- Conversations terminate when agents reach agreement
- Phase structure:
  ```
  Design Phase → Coding Phase → Testing Phase → Deployment Phase
      ↓              ↓               ↓                ↓
  [Chat Chains]  [Chat Chains]   [Chat Chains]    [Chat Chains]
  ```

**Turn-Taking:**
- **Sequential within chat chains**
- Role-playing dialogue pattern:
  - Instructor (e.g., CTO) asks questions
  - Assistant (e.g., CPO) provides responses
  - Continue until agreement
- **Agreement-based termination**
  - Agents signal agreement with specific phrases
  - Automatic detection of consensus
- No explicit turn-taking protocol
- Turn order determined by chat chain structure

**Context Passing:**
- **Phase handoff with artifacts**
- Output artifacts from one phase become input to next:
  ```
  Design Phase → PRD Document
      ↓
  Coding Phase → Source Code
      ↓
  Testing Phase → Bug Reports
      ↓
  Deployment Phase → Documentation
  ```
- Each agent maintains role-specific memory
- Conversations are stateful within phases
- Past decisions inform future sub-tasks

**Communicative Dehallucination:**
- **Role-playing verification**: Agents cross-check each other's work
- **Iterative refinement**: Code reviewed and revised multiple times
- **Explicit constraints**: Requirements stated and verified
- **Peer review**: Tester identifies bugs before deployment

**Key Innovation:**
- Structured chat chains with defined sub-tasks
- Role-playing for specialization and verification
- Phase-based workflow with artifact handoffs

**Limitations:**
- Domain-specific (software development)
- Rigid phase structure
- Limited to two-agent conversations per sub-task
- No parallel execution

**Reference:** [papers/chatdev-summary.md](./papers/chatdev-summary.md)

---

### 2. AutoGen

**Message Structure:**
- **OpenAI-style message format**:
  ```python
  {
      "content": str,           # Message content
      "role": str,              # "user" or "assistant"
      "name": str,              # Agent name
      "context": dict,          # Additional context
  }
  ```
- Flexible content (text, code, structured data)
- Supports tool calls and function execution
- Rich metadata support

**Protocol Formality:**
- **Flexible conversation patterns**:
  1. **Two-agent conversation**: UserProxyAgent ↔ AssistantAgent
  2. **Sequential chat**: Agent A → Agent B → Agent C
  3. **Group chat**: Multiple agents with GroupChatManager
- No rigid protocol specification
- Developers define conversation patterns programmatically
- LLM determines message content and flow

**Turn-Taking:**
- **Turn-based (LLM-driven)**:
  - Each agent takes turns generating replies
  - Reply generation via LLM, human, or tools
  - No fixed turn order (determined by conversation pattern)
- **Termination conditions**:
  - Maximum number of turns
  - Explicit termination signal ("TERMINATE")
  - Human manual stop
  - Task completion criteria
- Automatic turn management by ConversableAgent base class

**Context Passing:**
- **Conversation history per agent**:
  ```python
  class ConversableAgent:
      def __init__(self):
          self.chat_messages = {}  # agent_name -> [messages]
  ```
- **Context management strategies**:
  - **Sliding window**: Truncate old messages
  - **Summary buffer**: Compress long conversations
  - **Checkpointing**: Save/resume conversation state
- Each agent maintains complete message history
- Context shared within conversation, not across conversations

**Reply Generation:**
Agents generate replies using:
1. **LLM**: Call language model with conversation history
2. **Human**: Prompt human for input
3. **Tool**: Execute function and return result
4. **Hybrid**: Combine multiple sources

**Key Innovation:**
- General-purpose conversation framework
- Flexible conversation topologies
- Seamless LLM/human/tool integration
- Reusable conversable agent abstraction

**Limitations:**
- No formal semantic guarantees
- LLM-dependent turn-taking (unpredictable)
- Limited context sharing across agents
- No structured interaction protocols

**Reference:** [papers/autogen-summary.md](./papers/autogen-summary.md)

---

### 3. CrewAI

**Message Structure:**
- **TaskOutput objects** with multiple formats:
  ```python
  class TaskOutput:
      description: str
      summary: str
      raw: str                    # Raw text output
      json_dict: dict            # JSON format
      pydantic: BaseModel        # Pydantic model
      agent: str                 # Agent who completed task
  ```
- Structured output from one task becomes input to next
- Supports multiple serialization formats
- Task outputs are strongly typed (via Pydantic)

**Protocol Formality:**
- **Pub/Sub messaging architecture**:
  ```
  Agent A publishes → [Message Broker] ← Agent B subscribes
                              ↓
                     Scalable async communication
  ```
- **Agent-to-Agent (A2A) Protocol**:
  - Primary delegation mechanism
  - Supports JSONRPC, gRPC, HTTP+JSON transports
  - Agents delegate tasks to remote A2A agents
- **Flows**: Event-driven framework for orchestrating tasks and crews
- Semi-formal protocol with structured task handoffs

**Turn-Taking:**
- **Task-driven sequential execution**:
  ```
  Task 1 → Task 2 → Task 3 → Task 4
    ↓        ↓        ↓        ↓
  Agent A  Agent B  Agent C  Agent A
  ```
- Execution order determined by task dependencies
- No turn-taking in traditional sense (task-based)
- LLM interprets messages and determines next steps
- **Cognitive latency**: LLM parsing adds delay

**Context Passing:**
- **Shared memory bus**:
  ```
  ┌─────────────────────────────────────┐
  │      Shared Memory Bus              │
  ├─────────────────────────────────────┤
  │  - Persistent context storage        │
  │  - Cross-agent memory sharing        │
  │  - Token limit management            │
  └─────────────────────────────────────┘
        ↑         ↑         ↑
     Agent A   Agent B   Agent C
  ```
- Agents access shared context
- Memory bus overcomes token limits
- Structured task outputs passed between agents
- **Flows** manage state across tasks/crews

**Communication Mechanisms:**

1. **Pub/Sub Messaging**:
   - Asynchronous agent-to-agent communication
   - Structured data (JSON), embeddings, control signals
   - Task handoff and error propagation

2. **A2A Protocol**:
   - Remote agent delegation
   - Multiple transport protocols (JSONRPC, gRPC, HTTP)
   - Task analysis and delegation decisions

3. **Structured Task Outputs**:
   - TaskOutput objects passed between tasks
   - Clear dependencies and workflow
   - Type-safe via Pydantic models

**Key Innovation:**
- Pub/Sub architecture for scalable async communication
- Shared memory bus for persistent context
- Strong typing via Pydantic models
- Flexible A2A delegation protocol

**Limitations:**
- Cognitive latency from LLM parsing
- Complex setup with multiple protocols
- Less formal than FIPA-ACL/KQML
- Dependency on external message brokers

**Sources:**
- CrewAI Documentation (crewai.com)
- Agent communication protocols research

---

### 4. FIPA-ACL (Foundation for Intelligent Physical Agents - Agent Communication Language)

**Message Structure:**
- **Structured ACL messages**:
  ```fipa
  (inform
      :sender    agent1
      :receiver  agent2
      :content   "price(apple, 5)"
      :language  Prolog
      :ontology  trading
      :protocol  FIPA-Request
      :conversation-id  conv-123
      :reply-with  msg-1
      :in-reply-to  msg-0
  )
  ```
- **Mandatory fields**:
  - Performative (speech act type)
  - Sender
  - Receiver
  - Content
- **Optional fields**:
  - Language (content language)
  - Ontology (shared vocabulary)
  - Protocol (interaction protocol)
  - Conversation-id (conversation tracking)
  - Reply-with/In-reply-to (message correlation)

**Protocol Formality:**
- **Formal speech act protocol** based on speech act theory
- **20+ performatives** defined by FIPA:
  - **Informative**: `inform`, `confirm`, `disconfirm`, `not-understood`
  - **Requests**: `request`, `request-when`, `request-whenever`
  - **Queries**: `query-if`, `query-ref`
  - **Proposals**: `propose`, `accept-proposal`, `reject-proposal`
  - **Commitments**: `agree`, `refuse`, `cancel`
  - **Errors**: `failure`
- **Semantic framework**:
  - Feasibility preconditions (FP): When performative is appropriate
  - Rational effect (RE): Expected outcome
  - Formal semantics based on modal logic

**Turn-Taking:**
- **Protocol-based interaction patterns**:
  1. **FIPA-Request Protocol**:
     ```
     Agent A                Agent B
        |                      |
        |--- request --------->|
        |                      |
        |<-- agree/refuse -----|
        |                      |
        |<-- inform/failure ---|
     ```
  2. **FIPA-Query Protocol**:
     ```
     Agent A                Agent B
        |                      |
        |--- query-if -------->|
        |                      |
        |<-- agree/refuse -----|
        |                      |
        |<-- inform -----------|
     ```
  3. **FIPA-Propose Protocol**:
     ```
     Agent A                Agent B
        |                      |
        |--- propose --------->|
        |                      |
        |<-- accept/reject ----|
        |                      |
        |<-- inform/failure ---|
     ```
- Turn order determined by protocol specification
- Strict message sequencing
- Protocol state machines

**Context Passing:**
- **Conversation ID tracking**:
  - `conversation-id`: Groups related messages
  - `reply-with`: Correlate request with response
  - `in-reply-to`: Reference previous message
- **Ontology-based context**:
  - Shared vocabulary for content interpretation
  - Domain-specific knowledge representation
  - Semantic alignment between agents
- **Protocol state**:
  - Agents track protocol execution state
  - State transitions follow protocol specification
  - Formal verification possible

**Semantic Foundation:**
- **Speech act theory** (Austin, Searle):
  - **Locutionary act**: Saying something
  - **Illocutionary act**: Intention behind utterance
  - **Perlocutionary act**: Effect on hearer
- **FIPA performatives are illocutionary acts**:
  - `inform`: Illocution = informing
  - `request`: Illocution = requesting
  - `promise`: Illocution = committing

**Key Innovation:**
- Formal semantics based on speech act theory
- Standardized interaction protocols
- Interoperability across heterogeneous agents
- Rich ontology support
- Conversation tracking and correlation

**Limitations:**
- Heavyweight for simple interactions
- Requires shared ontology
- Manual protocol engineering
- Limited adoption in modern LLM systems
- Not designed for LLM context management

**Reference:** [papers/classic/communication-protocols-summary.md](./papers/classic/communication-protocols-summary.md)

---

### 5. KQML (Knowledge Query and Manipulation Language)

**Message Structure:**
- **Three-layer structure**:
  ```
  ┌─────────────────────────────────────┐
  │        KQML Message Layers          │
  ├─────────────────────────────────────┤
  │                                     │
  │  ┌───────────────────────────────┐ │
  │  │  Content Layer                │ │
  │  │  - Actual message content     │ │
  │  │  - Domain-specific language   │ │
  │  │  - Application-dependent      │ │
  │  └───────────────────────────────┘ │
  │                                     │
  │  ┌───────────────────────────────┐ │
  │  │  Message Layer                │ │
  │  │  - Performative               │ │
  │  │  - Defines message type       │ │
  │  │  - Speech act specification   │ │
  │  └───────────────────────────────┘ │
  │                                     │
  │  ┌───────────────────────────────┐ │
  │  │  Communication Layer          │ │
  │  │  - Sender/receiver            │ │
  │  │  - Message transport          │ │
  │  │  - Low-level protocols        │ │
  │  └───────────────────────────────┘ │
  │                                     │
  └─────────────────────────────────────┘
  ```
- **Basic format**:
  ```kqml
  (performative
      :sender <agent>
      :receiver <agent>
      :content <expression>
      :language <language>
      :ontology <ontology>
      :reply-with <id>
      :in-reply-to <id>
  )
  ```

**Protocol Formality:**
- **Formal speech act language**
- **Performative types**:
  - **Knowledge exchange**: `tell`, `untell`, `ask-if`, `ask-about`
  - **Capability queries**: `subscribe`, `standby`
  - **Task delegation**: `achieve`, `advertise`
  - **Error handling**: `error`, `sorry`
- Less comprehensive than FIPA-ACL
- Foundation for FIPA-ACL development
- Part of DARPA Knowledge Sharing Effort (1990s)

**Turn-Taking:**
- **Protocol-based** (similar to FIPA-ACL):
  ```
  Agent A                Agent B
     |                      |
     |--- ask-if --------->|
     |                      |
     |<-- tell/error ------|
  ```
- Performatives define expected responses:
  - `ask-if` → `tell` or `error`
  - `achieve` → `tell` or `sorry`
  - `subscribe` → stream of `tell` messages
- Turn order determined by performative type
- No explicit turn-taking protocol
- Response expectations defined by performative semantics

**Context Passing:**
- **Reply-with/In-reply-to correlation**:
  ```kqml
  (ask-if
      :sender agent1
      :receiver agent2
      :content "price(apple, ?price)"
      :reply-with query-1
  )
  
  (tell
      :sender agent2
      :receiver agent1
      :content "price(apple, 5)"
      :in-reply-to query-1
  )
  ```
- **Ontology support**:
  - Shared vocabulary for content interpretation
  - Domain-specific knowledge
  - Less formal than FIPA ontologies
- **Language specification**:
  - Content language (Prolog, KIF, etc.)
  - Enables heterogeneous agent communication
  - Agents must agree on content language

**Facilitators:**
- **KQML facilitator agents**:
  - Route messages between agents
  - Broker agent capabilities
  - Match requests with providers
  - Enable dynamic agent discovery
- **Facilitator services**:
  - `advertise`: Agent announces capabilities
  - `subscribe`: Agent subscribes to topics
  - `broker`: Facilitator routes messages

**Key Innovation:**
- Three-layer separation of concerns
- Performative-based communication
- Facilitator agents for routing
- Foundation for FIPA-ACL
- First standardized ACL (1990s)

**Limitations:**
- Less comprehensive than FIPA-ACL
- No formal semantic framework
- Limited performative set
- Dated technology (1990s)
- No LLM context management

**Reference:** [papers/classic/communication-protocols-summary.md](./papers/classic/communication-protocols-summary.md)

---

### 6. DevAll

**Message Structure:**
- **Message class with multimodal content**:
  ```python
  @dataclass
  class Message:
      role: MessageRole              # system, user, assistant, tool
      content: MessageContent        # str | List[MessageBlock]
      name: Optional[str]            # Agent name
      tool_call_id: Optional[str]    # Tool call correlation
      metadata: Dict[str, Any]       # Rich metadata
      tool_calls: List[ToolCallPayload]
      keep: bool                     # Context retention flag
      preserve_role: bool            # Role preservation flag
  ```
- **Multimodal content blocks**:
  ```python
  @dataclass
  class MessageBlock:
      type: MessageBlockType         # text, image, audio, video, file, data
      text: Optional[str]
      attachment: Optional[AttachmentRef]
      data: Dict[str, Any]
  ```
- **Attachment support**:
  ```python
  @dataclass
  class AttachmentRef:
      attachment_id: str
      mime_type: Optional[str]
      name: Optional[str]
      size: Optional[int]
      sha256: Optional[str]
      local_path: Optional[str]
      remote_file_id: Optional[str]
      data_uri: Optional[str]
      metadata: Dict[str, Any]
  ```

**Protocol Formality:**
- **Edge-based message passing**:
  ```yaml
  edges:
    - from: agent1
      to: agent2
      trigger: true              # Can trigger successor
      condition: "true"          # Edge condition
      carry_data: true           # Pass data to target
      keep_message: false        # Context retention
      clear_context: false       # Clear incoming context
      process:                   # Payload processor
        type: regex_extract
        config:
          pattern: "Result: (.*)"
      dynamic:                   # Dynamic edge expansion
        mode: map
        split_by: list_items
  ```
- **No formal protocol specification**
- Declarative workflow definition in YAML
- Edge processors transform messages
- Dynamic edges for fan-out/fan-in patterns

**Turn-Taking:**
- **DAG-orchestrated execution**:
  ```
  Layer 0: [Start nodes]
      ↓
  Layer 1: [Dependent nodes] (parallel execution)
      ↓
  Layer 2: [Further dependent nodes] (parallel execution)
      ↓
  ...
  ```
- **Layer-by-layer topological order**:
  - DAGExecutor executes layers sequentially
  - ParallelExecutor handles nodes within layers
  - No turn-taking in conversational sense
  - Execution order determined by graph topology
- **Conditional edge execution**:
  - Edge triggers control node activation
  - Edge conditions determine message passing
  - Dynamic edges create runtime flexibility

**Context Passing:**
- **Edge-based context management**:
  ```python
  @dataclass
  class EdgeConfig:
      source: str
      target: str
      trigger: bool = True
      condition: EdgeConditionConfig | None
      carry_data: bool = True              # Pass data to target
      keep_message: bool = False           # Keep message in context
      clear_context: bool = False          # Clear all incoming context
      clear_kept_context: bool = False     # Clear kept messages
      process: EdgeProcessorConfig | None  # Transform payload
  ```
- **Context retention flags**:
  - `keep=True`: Message persists across node executions
  - `clear_context`: Clear all incoming context before passing new payload
  - `clear_kept_context`: Clear messages marked with `keep=True`
- **Edge processors**:
  - **Regex extraction**: Extract content via regex patterns
  - **Function processors**: Custom Python functions
  - **Template processors**: Jinja2 template transformation
- **Message transformation**:
  - Process payload before passing to target node
  - Regex extraction, custom functions, templating
  - Content filtering and transformation

**Role-Based Dialogue:**
- **Agent node configuration**:
  ```yaml
  nodes:
    - id: ceo
      type: agent
      role: "CEO"
      system_prompt: "You are the CEO of a software company..."
      model:
        name: gpt-4
    - id: cto
      type: agent
      role: "CTO"
      system_prompt: "You are the CTO..."
  ```
- **Role-specific prompts** define agent behavior
- **System prompts** establish agent identity
- **Role-based message routing** via edges
- No explicit role negotiation protocol

**Edge Features:**
- **Conditional execution**: Edge conditions determine activation
- **Message transformation**: Edge processors transform payloads
- **Data routing**: Fine-grained control over data flow
- **Dynamic edges**: Runtime edge expansion (map/reduce)
- **Context management**: Clear/keep context flags

**Key Innovation:**
- Multimodal message support (text + attachments)
- Edge-based message routing and transformation
- Declarative workflow specification
- Parallel execution via DAG
- Rich context management flags
- Edge processors for message transformation

**Limitations:**
- No formal protocol specification
- No speech act semantics
- Limited multi-turn dialogue support
- No conversation tracking
- No ontology support
- Static workflow structure (no runtime adaptation)

**Implementation:**
- `entity/messages.py` - Message class
- `entity/configs/edge/edge.py` - Edge configuration
- `entity/configs/edge/edge_processor.py` - Edge processors
- `entity/configs/node/agent.py` - Agent configuration
- `workflow/executor/dag_executor.py` - DAG execution
- `workflow/executor/parallel_executor.py` - Parallel execution

---

## Where DevAll Differs from SOTA

### Advantages Over SOTA

**1. Multimodal Message Support**
- DevAll: Text, images, audio, video, files, structured data
- ChatDev: Text only
- AutoGen: Text + code
- CrewAI: Text + structured data
- FIPA-ACL/KQML: Text (domain-specific languages)

**2. Edge-Based Message Routing**
- DevAll: Fine-grained edge control with conditions, triggers, processors
- ChatDev: Phase-based handoff
- AutoGen: Conversation patterns
- CrewAI: Task-driven handoff
- FIPA-ACL/KQML: Protocol-based routing

**3. Rich Context Management**
- DevAll: `keep`, `clear_context`, `clear_kept_context` flags
- ChatDev: Phase-specific context
- AutoGen: Conversation history per agent
- CrewAI: Shared memory bus
- FIPA-ACL/KQML: Conversation ID tracking

**4. Message Transformation**
- DevAll: Edge processors (regex, functions, templates)
- ChatDev: Artifact transformation
- AutoGen: Tool outputs
- CrewAI: TaskOutput objects
- FIPA-ACL/KQML: No built-in transformation

**5. Parallel Execution**
- DevAll: DAG-based parallel execution
- ChatDev: Sequential
- AutoGen: Sequential (group chat can be parallel)
- CrewAI: Task-driven (can be parallel)
- FIPA-ACL/KQML: Sequential protocol execution

### Gaps Compared to SOTA

**1. No Formal Protocol Specification**
- FIPA-ACL: Formal speech act semantics, interaction protocols
- KQML: Performative-based communication
- **DevAll: No formal protocol, ad-hoc message passing**
- Impact: No semantic guarantees, no interoperability standards

**2. No Speech Act Semantics**
- FIPA-ACL: Feasibility preconditions, rational effects
- KQML: Performative semantics
- **DevAll: No speech act theory foundation**
- Impact: No formal reasoning about message intentions

**3. Limited Conversation Tracking**
- FIPA-ACL: `conversation-id`, `reply-with`, `in-reply-to`
- KQML: `reply-with`, `in-reply-to`
- AutoGen: Conversation history per agent
- **DevAll: No conversation ID tracking**
- Impact: Harder to correlate messages across long workflows

**4. No Ontology Support**
- FIPA-ACL: Ontology field for shared vocabulary
- KQML: Ontology field for domain knowledge
- **DevAll: No ontology support**
- Impact: No shared vocabulary, potential semantic mismatches

**5. No Multi-Turn Dialogue Support**
- ChatDev: Chat chains with multiple turns
- AutoGen: Multi-turn conversations
- **DevAll: Single-turn message passing (no conversation loops)**
- Impact: Limited support for iterative refinement

**6. No Role Negotiation**
- FIPA-ACL: `propose`, `accept-proposal`, `reject-proposal`
- KQML: `advertise`, `subscribe`
- **DevAll: Roles hardcoded in workflow YAML**
- Impact: No dynamic role assignment or negotiation

**7. No Protocol State Machines**
- FIPA-ACL: Protocol state transitions
- KQML: Performative-based state management
- **DevAll: No protocol state tracking**
- Impact: No verification of interaction correctness

---

## Communication Patterns DevAll Could Adopt

### 1. Speech Act Semantics (from FIPA-ACL/KQML)

**Current DevAll:**
```yaml
edges:
  - from: agent1
    to: agent2
    # No indication of message intention
```

**Enhanced with Speech Acts:**
```yaml
edges:
  - from: agent1
    to: agent2
    performative: request  # Speech act type
    content: "Please analyze this data"
    # Feasibility precondition: agent2 must be capable
    # Rational effect: agent2 performs analysis
```

**Benefits:**
- Formal message intention specification
- Enable semantic verification
- Support for negotiation protocols
- Interoperability with classic MAS

### 2. Conversation ID Tracking (from FIPA-ACL/KQML)

**Current DevAll:**
```python
class Message:
    role: MessageRole
    content: MessageContent
    # No conversation tracking
```

**Enhanced with Conversation IDs:**
```python
class Message:
    role: MessageRole
    content: MessageContent
    conversation_id: str          # Group related messages
    reply_with: Optional[str]     # Correlate request
    in_reply_to: Optional[str]    # Reference previous message
```

**Benefits:**
- Track multi-turn conversations
- Correlate requests with responses
- Enable conversation replay
- Support for long-running interactions

### 3. Ontology Support (from FIPA-ACL/KQML)

**Current DevAll:**
```yaml
nodes:
  - id: agent1
    type: agent
    system_prompt: "..."
    # No shared vocabulary
```

**Enhanced with Ontologies:**
```yaml
nodes:
  - id: agent1
    type: agent
    ontology: "software-development"
    # Shared vocabulary for:
    # - Task types (coding, testing, review)
    # - Artifact types (PRD, code, tests)
    # - Status values (pending, complete, failed)
```

**Benefits:**
- Shared vocabulary across agents
- Semantic alignment
- Domain-specific knowledge
- Reduced ambiguity

### 4. Protocol State Machines (from FIPA-ACL)

**Current DevAll:**
- No protocol state tracking
- Edge conditions are ad-hoc

**Enhanced with Protocol States:**
```yaml
protocols:
  - name: code-review
    states:
      - name: initial
        transitions:
          - on: request
            to: review_requested
      - name: review_requested
        transitions:
          - on: agree
            to: review_in_progress
          - on: refuse
            to: review_rejected
      - name: review_in_progress
        transitions:
          - on: inform
            to: review_complete
```

**Benefits:**
- Formal protocol verification
- Clear interaction patterns
- State tracking and debugging
- Protocol reuse

### 5. Multi-Turn Dialogue (from ChatDev/AutoGen)

**Current DevAll:**
- Single-turn message passing
- No conversation loops

**Enhanced with Chat Chains:**
```yaml
nodes:
  - id: dialogue
    type: agent
    dialogue_mode: chat_chain
    max_turns: 10
    termination:
      - phrase: "AGREED"
      - phrase: "TERMINATE"
```

**Benefits:**
- Iterative refinement
- Multi-turn negotiation
- Agreement-based termination
- Support for complex interactions

### 6. Role Negotiation (from FIPA-ACL)

**Current DevAll:**
- Roles hardcoded in YAML

**Enhanced with Role Negotiation:**
```yaml
nodes:
  - id: agent1
    type: agent
    capabilities:
      - "code-generation"
      - "code-review"
    # Agent can negotiate role assignment

edges:
  - from: coordinator
    to: agent1
    performative: propose
    content: "Role: Code Reviewer"
  - from: agent1
    to: coordinator
    performative: accept-proposal  # or reject-proposal
```

**Benefits:**
- Dynamic role assignment
- Capability-based matching
- Flexible agent utilization
- Support for open systems

### 7. Shared Memory Bus (from CrewAI)

**Current DevAll:**
- Context passed via edges
- No persistent shared context

**Enhanced with Shared Memory:**
```yaml
workflow:
  shared_memory:
    type: vector_store
    config:
      embedding_model: text-embedding-3-small
      max_entries: 10000

nodes:
  - id: agent1
    type: agent
    memory_access:
      - read: shared_memory
      - write: shared_memory
```

**Benefits:**
- Persistent context across workflow
- Semantic retrieval
- Overcome token limits
- Cross-agent memory sharing

---

## Implementation Status

| Feature | ChatDev | AutoGen | CrewAI | FIPA-ACL | KQML | DevAll |
|---------|---------|---------|--------|----------|------|--------|
| Speech act semantics | ✗ | ✗ | ✗ | ✓ | ✓ | ✗ |
| Conversation tracking | Partial | ✓ | ✓ | ✓ | ✓ | ✗ |
| Ontology support | ✗ | ✗ | ✗ | ✓ | ✓ | ✗ |
| Protocol state machines | ✗ | ✗ | ✗ | ✓ | Partial | ✗ |
| Multi-turn dialogue | ✓ | ✓ | ✗ | ✓ | ✓ | ✗ |
| Role negotiation | ✗ | ✗ | ✗ | ✓ | ✓ | ✗ |
| Multimodal messages | ✗ | Partial | Partial | ✗ | ✗ | ✓ |
| Edge-based routing | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| Message transformation | ✗ | ✓ | ✓ | ✗ | ✗ | ✓ |
| Context management | Phase-based | History | Shared bus | Conv ID | Conv ID | Edge flags |
| Parallel execution | ✗ | Partial | ✓ | ✗ | ✗ | ✓ |
| Declarative workflow | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |

---

## Future Research Directions

### Near-Term Enhancements

1. **Add Conversation ID Tracking**
   - Add `conversation_id`, `reply_with`, `in_reply_to` to Message class
   - Track conversation state across nodes
   - Enable conversation replay and debugging

2. **Implement Speech Act Semantics**
   - Add `performative` field to edges
   - Define speech act types (inform, request, propose, etc.)
   - Map performatives to edge behaviors

3. **Add Ontology Support**
   - Define ontology field in workflow config
   - Support shared vocabulary
   - Enable semantic validation

4. **Multi-Turn Dialogue Support**
   - Add chat chain node type
   - Implement turn-taking logic
   - Agreement-based termination

### Long-Term Research

1. **Protocol State Machines**
   - Define protocol templates
   - State transition tracking
   - Protocol verification

2. **Role Negotiation Protocol**
   - Capability-based role assignment
   - Propose/accept/reject messages
   - Dynamic role allocation

3. **Shared Memory Bus**
   - Vector store integration
   - Semantic retrieval
   - Cross-agent memory sharing

4. **Interoperability Layer**
   - FIPA-ACL compatibility
   - KQML message translation
   - Standard protocol support

---

## Cross-References

### Related Documents
- [ChatDev Summary](./papers/chatdev-summary.md)
- [AutoGen Summary](./papers/autogen-summary.md)
- [Communication Protocols Summary](./papers/classic/communication-protocols-summary.md)
- [Planning Comparison](./comparison-planning.md)
- [Memory Architectures Comparison](./comparison-memory-architectures.md)
- [Bibliography](./bibliography.md)

### Implementation Files
- `entity/messages.py` - Message class and multimodal content
- `entity/configs/edge/edge.py` - Edge configuration
- `entity/configs/edge/edge_processor.py` - Edge processors
- `entity/configs/edge/edge_condition.py` - Edge conditions
- `entity/configs/node/agent.py` - Agent node configuration
- `workflow/executor/dag_executor.py` - DAG execution
- `workflow/executor/parallel_executor.py` - Parallel execution

---

## Conclusion

DevAll's communication approach is fundamentally different from both classic agent communication languages (FIPA-ACL, KQML) and modern LLM-based frameworks (ChatDev, AutoGen, CrewAI). While classic systems emphasize **formal semantics and protocol specification**, and modern systems focus on **flexible conversation patterns**, DevAll emphasizes **declarative workflow orchestration** and **edge-based message routing**.

**Key Takeaway:** DevAll excels at structured workflow communication with multimodal support and fine-grained message routing, but lacks the formal protocol semantics, conversation tracking, and multi-turn dialogue capabilities present in SOTA systems.

**Recommendation:** To enhance DevAll's communication capabilities, prioritize:
1. **Conversation ID tracking** for multi-turn interactions
2. **Speech act semantics** for formal message intentions
3. **Ontology support** for shared vocabulary
4. **Multi-turn dialogue** for iterative refinement
5. **Protocol state machines** for interaction verification

These enhancements would complement DevAll's existing strengths in declarative workflow design and edge-based routing, creating a more robust and semantically rich multi-agent communication framework.
