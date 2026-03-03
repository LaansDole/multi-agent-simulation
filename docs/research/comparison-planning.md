# Planning and Coordination Comparison Matrix

**Document Type:** Research Comparison  
**Last Updated:** March 2, 2026  
**Purpose:** Side-by-side comparison of planning and coordination mechanisms for multi-agent systems

---

## Overview

This document compares planning and coordination approaches across different multi-agent frameworks, from classic BDI systems to modern LLM-based approaches. The comparison focuses on key dimensions that influence how agents plan, coordinate, and adapt their behavior.

---

## Comparison Matrix

| Framework | Planning Paradigm | Decomposition Strategy | Re-planning Support | Temporal Reasoning | Coordination Mechanism |
|-----------|------------------|----------------------|-------------------|-------------------|----------------------|
| **Stanford Generative Agents** | Hierarchical reflection-based | Daily plan → Hourly → 5-15 min actions | Dynamic re-planning on new observations | Hierarchical time (days/hours/minutes) | Implicit via shared environment and memory |
| **AutoGen** | Conversation-driven | Task decomposition through dialogue | Iterative refinement via conversation | Implicit in conversation turns | Conversation patterns (two-agent, group chat) |
| **MetaGPT** | SOP-based sequential | PM → Architect → PM → Engineer → QA phases | Feedback loops between phases | Sequential phase ordering | Message pool publish-subscribe |
| **Classic BDI** | Plan library + deliberation | Goal → Plan → Sub-goals → Actions | Intention reconsideration strategies | Temporal logic (CTL-based) | Speech acts (FIPA-ACL/KQML) |
| **DevAll** | Workflow orchestration (DAG) | Graph topology defines execution order | No automatic re-planning | Layer-based topological ordering | Edge-based message passing |

---

## Detailed Framework Analysis

### 1. Stanford Generative Agents

**Planning Paradigm:**
- **Hierarchical reflection-based planning**
- Three-level hierarchy: daily plan → hourly breakdown → detailed actions
- Planning informed by memory stream and reflection synthesis
- Plans stored in memory and influence future planning

**Decomposition Strategy:**
```
High-level goal (e.g., "throw a Valentine's Day party")
    ↓
Daily Plan: "Work on novel at cafe, then grocery shopping"
    ↓
Hourly Breakdown: "8am-12pm: Write | 1pm-2pm: Lunch | 3pm-4pm: Grocery"
    ↓
Detailed Actions: "8:00-8:15: Walk to cafe | 8:15-11:45: Write | ..."
```

**Re-planning Support:**
- **Dynamic re-planning** triggered by:
  - New observations from memory stream
  - Social interactions and conversations
  - Environmental changes
  - Reflections synthesizing new insights
- Plans are not rigid - continuously adapted based on context
- No explicit commitment strategy - plans serve as behavioral guide

**Temporal Reasoning:**
- **Hierarchical time representation:**
  - Days: High-level goals and routines
  - Hours: Activity blocks
  - Minutes (5-15): Fine-grained actions
- Temporal coherence maintained through memory
- Future plans inform current behavior

**Coordination Mechanism:**
- **Implicit coordination** via shared environment
- Agents perceive each other's actions
- Memory stream tracks interactions
- No explicit coordination protocol
- Emergent coordination through shared context

**Key Innovation:**
- Planning integrated with reflection and memory
- Hierarchical decomposition with temporal structure
- Dynamic adaptation without explicit re-planning triggers

**Limitations:**
- No explicit commitment to plans
- Re-planning is reactive, not proactive
- No explicit coordination protocols
- Limited support for multi-agent collaboration

**Reference:** [stanford-generative-agents-summary.md](./stanford-generative-agents-summary.md)

---

### 2. AutoGen

**Planning Paradigm:**
- **Conversation-driven planning**
- No explicit planning hierarchy
- Tasks decomposed through dialogue
- Planning emerges from agent interactions

**Decomposition Strategy:**
```
User: "Write a Python function to calculate Fibonacci"
    ↓
Assistant: "I'll break this down into steps:
1. Define function signature
2. Handle base cases
3. Implement recursion
4. Add tests"
    ↓
User: "Looks good, proceed"
    ↓
Assistant: [Implements step 1]
    ↓
[Iterative refinement through conversation]
```

**Re-planning Support:**
- **Iterative refinement** via conversation:
  - Agents propose solutions
  - Other agents or humans provide feedback
  - Plans updated based on feedback
  - Continue until termination condition
- No explicit plan revision mechanism
- Re-planning occurs naturally in dialogue

**Temporal Reasoning:**
- **Implicit in conversation turns**
- No explicit temporal representation
- Sequential conversation flow
- Context window limits temporal scope
- No long-term temporal planning

**Coordination Mechanism:**
- **Conversation patterns:**
  - Two-agent: User ↔ Assistant
  - Sequential: Agent A → Agent B → Agent C
  - Group chat: Multiple agents with manager
- **Message passing protocol:**
  ```python
  {
      "content": str,
      "role": "user" | "assistant",
      "name": str,
      "context": dict
  }
  ```
- Termination conditions: max turns, explicit signal, task completion

**Key Innovation:**
- Flexible conversation patterns
- Human-in-the-loop integration
- Tool orchestration within conversations
- General-purpose conversation framework

**Limitations:**
- No explicit planning representation
- Limited temporal reasoning
- Conversation can be inefficient
- No structured plan verification

**Reference:** [papers/autogen-summary.md](./papers/autogen-summary.md)

---

### 3. MetaGPT

**Planning Paradigm:**
- **SOP (Standard Operating Procedure)-based planning**
- Sequential phase execution
- Structured handoffs between roles
- Plans encoded as standard procedures

**Decomposition Strategy:**
```
User Requirement
    ↓
Phase 1: Product Manager analyzes requirements
    Output: PRD (Product Requirements Document)
    ↓
Phase 2: Architect designs system
    Input: PRD
    Output: System Design Document
    ↓
Phase 3: Project Manager breaks down tasks
    Input: System Design
    Output: Task List + Schedule
    ↓
Phase 4: Engineer implements code
    Input: Task List + Design
    Output: Source Code
    ↓
Phase 5: QA Engineer tests
    Input: Source Code
    Output: Test Reports + Bug List
```

**Re-planning Support:**
- **Feedback loops** between phases:
  ```
  Testing → Bugs → Engineer fixes → Re-test
     ↓                      ↓
  Architect redesigns   PM updates PRD
  ```
- Re-planning triggered by:
  - Unresolved bugs
  - Requirements changes
  - Architectural issues
- Structured feedback ensures quality

**Temporal Reasoning:**
- **Sequential phase ordering**
- No explicit temporal representation
- Dependencies between phases
- Project timeline in task breakdown
- No real-time temporal reasoning

**Coordination Mechanism:**
- **Message pool publish-subscribe:**
  ```
  Agent A publishes → [Message Pool] ← Agent B subscribes
                              ↓
                      All agents can read
                      historical messages
  ```
- Structured output formats per role
- Shared memory pool for context
- Role-based communication

**Key Innovation:**
- SOPs from real-world software engineering
- Modular outputs for verification
- Assembly line workflow
- Quality control through structured outputs

**Limitations:**
- Domain-specific (software development)
- Less flexible than unconstrained conversations
- Higher setup overhead
- No dynamic role assignment

**Reference:** [papers/metagpt-summary.md](./papers/metagpt-summary.md)

---

### 4. Classic BDI

**Planning Paradigm:**
- **Plan library + deliberation**
- Hierarchical plans with sub-goals
- Means-end reasoning
- Commitment strategies

**Decomposition Strategy:**
```
Goal: "Deliver package to location X"
    ↓
Plan Library Search: Find applicable plans
    ↓
Selected Plan:
  1. Navigate to pickup location
  2. Pick up package
  3. Navigate to delivery location
  4. Deliver package
    ↓
Sub-goal expansion: Each step → finer-grained plan
    ↓
Action execution: Primitive actions
```

**Re-planning Support:**
- **Intention reconsideration** based on commitment strategies:
  - **Blind commitment:** Maintain until achieved
  - **Single-minded:** Maintain until achieved OR impossible
  - **Open-minded:** Maintain until achieved OR impossible OR reason no longer holds
- Re-planning triggered by:
  - Plan failure
  - Belief changes
  - New opportunities
- Deliberation cycle: options → filter → commit → execute

**Temporal Reasoning:**
- **Temporal logic (CTL-based):**
  - Branching time structures
  - Future possibilities reasoning
  - Temporal operators in BDI logic
- Temporal constraints on plans
- Temporal consistency checking

**Coordination Mechanism:**
- **Speech act-based communication:**
  - FIPA-ACL (Foundation for Intelligent Physical Agents - Agent Communication Language)
  - KQML (Knowledge Query and Manipulation Language)
- **Speech act types:**
  - Inform: Share beliefs
  - Request: Ask for action
  - Propose: Suggest joint plan
  - Commit: Agree to action
- Structured interaction protocols

**Key Innovation:**
- Theoretical foundation from philosophy of action
- Clear semantics for mental states
- Commitment strategies for stability
- Formal logical framework

**Limitations:**
- Requires manual plan library engineering
- Computational complexity of deliberation
- Scalability with many goals/plans
- Limited learning capabilities

**Reference:** [papers/classic/bdi-architecture-summary.md](./papers/classic/bdi-architecture-summary.md)

---

### 5. DevAll

**Planning Paradigm:**
- **Workflow orchestration (DAG-based)**
- Graph topology defines execution order
- Node-based execution model
- Layer-by-layer topological execution

**Decomposition Strategy:**
```
YAML Workflow Definition
    ↓
Graph Construction: Nodes + Edges
    ↓
Topological Sorting: Execution layers
    ↓
Layer-by-layer execution:
  Layer 0: [Start nodes]
  Layer 1: [Dependent nodes]
  Layer 2: [Further dependent nodes]
  ...
    ↓
Node execution: Each node executes independently
```

**Node Types:**
- **agent**: LLM-powered agent node
- **human**: Human-in-the-loop node
- **python_runner**: Execute Python code
- **literal**: Static value injection
- **template**: Template-based text generation
- **passthrough**: Forward messages
- **subgraph**: Nested workflow
- **loop_counter/loop_timer**: Loop control
- **rlm_memory**: RLM-enhanced memory operations

**Re-planning Support:**
- **No automatic re-planning**
- Static workflow defined in YAML
- Conditional edge execution via triggers
- Dynamic edges for runtime flexibility
- No intention reconsideration
- Manual workflow redesign required for changes

**Temporal Reasoning:**
- **Layer-based topological ordering**
- No explicit temporal representation
- Execution order determined by dependencies
- No temporal constraints or deadlines
- No future planning beyond workflow structure

**Coordination Mechanism:**
- **Edge-based message passing:**
  ```python
  EdgeLink:
    - target: Node
    - condition: EdgeConditionConfig
    - trigger: bool
    - carry_data: bool
    - process_config: EdgeProcessorConfig
  ```
- **Edge features:**
  - Conditional execution
  - Message transformation
  - Data routing
  - Context management
- No explicit coordination protocol
- Coordination via graph structure

**Graph Execution:**
```python
class DAGExecutor:
    def execute(self) -> None:
        for layer in self.layers:
            self._execute_layer(layer)
    
    def _execute_layer(self, layer_nodes: List[str]) -> None:
        # Parallel execution within layer
        self.parallel_executor.execute_nodes_parallel(
            layer_nodes, 
            execute_if_triggered
        )
```

**Key Innovation:**
- Declarative workflow definition (YAML)
- DAG-based parallel execution
- Multiple node types for different tasks
- Edge-based message routing
- Modular and composable workflows

**Limitations:**
- No automatic re-planning or adaptation
- Static workflow structure
- No temporal reasoning
- No explicit coordination protocols
- Limited runtime flexibility

**Implementation:**
- `workflow/executor/dag_executor.py` - DAG execution
- `workflow/executor/parallel_executor.py` - Parallel execution
- `entity/configs/graph.py` - Graph configuration
- `entity/configs/node/node.py` - Node definitions
- `runtime/node/executor/base.py` - Executor base class

---

## Where DevAll Differs from SOTA

### Advantages Over SOTA

**1. Declarative Workflow Definition**
- YAML-based workflow specification
- Clear visual representation
- Easier to design and maintain than code
- Version controllable

**2. Flexible Node Types**
- Multiple specialized node types
- Mix agents, humans, code execution
- Subgraph composition for modularity
- Extensible architecture

**3. Edge-Based Coordination**
- Conditional execution via edge triggers
- Message transformation on edges
- Fine-grained control over data flow
- Dynamic edge configuration

**4. Parallel Execution**
- Layer-based parallel execution
- Efficient resource utilization
- Automatic dependency management
- Scalable to large workflows

**5. Human-in-the-Loop Integration**
- Dedicated human node type
- Interactive prompts
- Approval workflows
- Flexible human oversight

### Gaps Compared to SOTA

**1. No Automatic Re-planning**
- Stanford: Dynamic re-planning based on observations
- BDI: Intention reconsideration strategies
- AutoGen: Iterative refinement via conversation
- **DevAll: Static workflow, no automatic adaptation**
- Impact: Cannot handle unexpected situations or changing requirements

**2. No Temporal Reasoning**
- Stanford: Hierarchical temporal planning (days/hours/minutes)
- BDI: Temporal logic (CTL-based)
- **DevAll: No temporal representation**
- Impact: Cannot reason about deadlines, durations, or temporal constraints

**3. No Reflection Mechanism**
- Stanford: Automatic reflection synthesis
- **DevAll: No reflection capabilities**
- Impact: Cannot learn from experiences or improve behavior over time

**4. Limited Coordination Protocols**
- BDI: FIPA-ACL, KQML speech acts
- AutoGen: Structured conversation patterns
- MetaGPT: Message pool publish-subscribe
- **DevAll: Only edge-based message passing**
- Impact: Limited multi-agent coordination patterns

**5. No Goal Management**
- BDI: Explicit goal base, deliberation, intention selection
- Stanford: Goal-directed planning
- **DevAll: Goals implicit in workflow structure**
- Impact: No dynamic goal adoption or abandonment

**6. No Plan Library**
- BDI: Rich plan library with hierarchical plans
- MetaGPT: SOP-encoded procedures
- **DevAll: Plans hardcoded in workflow YAML**
- Impact: No plan reuse or dynamic plan selection

**7. No Means-End Reasoning**
- BDI: Deliberation cycle for means-end reasoning
- **DevAll: No deliberation process**
- Impact: Cannot reason about how to achieve goals

### Alignment with Classic BDI

**Shared Concepts:**
- Beliefs → Workflow context/state
- Desires → Workflow objectives
- Intentions → Committed workflow execution

**Differences:**
- BDI: Dynamic deliberation and intention reconsideration
- DevAll: Static workflow execution
- BDI: Plan library with reusable plans
- DevAll: Hardcoded workflow structure
- BDI: Explicit goal management
- DevAll: Goals implicit in workflow

**Modern Interpretation:**
- DevAll's workflow is a "frozen intention"
- No runtime deliberation or adaptation
- BDI concepts would enhance DevAll's flexibility

---

## Design Recommendations

### For Adaptive Workflows
- Implement re-planning triggers (like Stanford's observation-based)
- Add goal management system
- Support dynamic workflow modification
- Implement commitment strategies

### For Temporal Planning
- Add temporal constraints to nodes/edges
- Support deadlines and durations
- Implement temporal reasoning layer
- Enable hierarchical time representation

### For Multi-Agent Coordination
- Implement speech act-based communication
- Add structured interaction protocols
- Support agent role negotiation
- Enable shared mental models

### For Plan Reuse
- Create plan library system
- Support plan template instantiation
- Enable dynamic plan selection
- Implement plan parameterization

---

## Implementation Status

| Feature | Stanford | AutoGen | MetaGPT | BDI | DevAll |
|---------|----------|---------|---------|-----|--------|
| Hierarchical planning | ✓ | ✗ | Partial | ✓ | ✗ |
| Automatic re-planning | ✓ | Partial | ✓ | ✓ | ✗ |
| Temporal reasoning | ✓ | ✗ | ✗ | ✓ | ✗ |
| Reflection synthesis | ✓ | ✗ | ✗ | ✗ | ✗ |
| Plan library | ✗ | ✗ | SOP-based | ✓ | ✗ |
| Goal management | ✓ | ✗ | ✗ | ✓ | ✗ |
| Coordination protocols | ✗ | ✓ | ✓ | ✓ | Partial |
| Parallel execution | ✗ | ✗ | ✗ | ✗ | ✓ |
| Human-in-loop | ✗ | ✓ | ✗ | ✗ | ✓ |
| Declarative specification | ✗ | ✗ | ✗ | ✗ | ✓ |
| Dynamic edge routing | ✗ | ✗ | ✗ | ✗ | ✓ |

---

## Future Research Directions

### Near-Term Enhancements

1. **Implement Re-planning Mechanism**
   - Monitor workflow execution for failures
   - Trigger workflow re-design on unexpected events
   - Support partial workflow re-execution
   - Learn from execution failures

2. **Add Goal Management**
   - Define workflow goals explicitly
   - Track goal achievement status
   - Support goal adoption/abandonment
   - Enable goal prioritization

3. **Temporal Constraints**
   - Add deadline support to nodes
   - Implement duration estimates
   - Support temporal dependencies
   - Enable time-based triggers

4. **Reflection Layer**
   - Synthesize insights from workflow executions
   - Store reflections in memory
   - Use reflections to improve workflows
   - Enable meta-learning

### Long-Term Research

1. **Dynamic Workflow Generation**
   - Generate workflows from goal specifications
   - Adapt workflows based on context
   - Learn workflow patterns from examples
   - Compose workflows dynamically

2. **Advanced Coordination**
   - Implement FIPA-ACL speech acts
   - Support negotiation protocols
   - Enable coalition formation
   - Distributed workflow execution

3. **Plan Library System**
   - Create reusable plan templates
   - Support plan parameterization
   - Enable plan inheritance
   - Dynamic plan selection

4. **Temporal Reasoning Engine**
   - Temporal constraint satisfaction
   - Deadline-driven scheduling
   - Duration prediction
   - Temporal consistency checking

---

## Cross-References

### Related Documents
- [Stanford Generative Agents Summary](./stanford-generative-agents-summary.md)
- [AutoGen Summary](./papers/autogen-summary.md)
- [MetaGPT Summary](./papers/metagpt-summary.md)
- [BDI Architecture Summary](./papers/classic/bdi-architecture-summary.md)
- [Memory Architectures Comparison](./comparison-memory-architectures.md)
- [Bibliography](./bibliography.md)

### Implementation Files
- `workflow/executor/dag_executor.py` - DAG execution
- `workflow/executor/parallel_executor.py` - Parallel execution
- `workflow/executor/dynamic_edge_executor.py` - Dynamic edges
- `entity/configs/graph.py` - Graph configuration
- `entity/configs/node/node.py` - Node definitions
- `entity/configs/edge/edge_condition.py` - Edge conditions
- `runtime/node/executor/base.py` - Executor base
- `runtime/node/executor/agent_executor.py` - Agent executor
- `runtime/node/executor/human_executor.py` - Human executor

---

## Conclusion

DevAll's planning and coordination approach is fundamentally different from SOTA systems. While Stanford, AutoGen, MetaGPT, and BDI focus on dynamic planning, adaptation, and temporal reasoning, DevAll emphasizes **declarative workflow specification** and **DAG-based execution**.

**Key Takeaway:** DevAll excels at orchestrating predefined workflows with parallel execution and flexible node types, but lacks the adaptive planning, temporal reasoning, and dynamic coordination capabilities present in SOTA systems.

**Recommendation:** To bring DevAll's planning capabilities to SOTA level, prioritize:
1. **Re-planning mechanisms** for adaptive workflows
2. **Goal management** for dynamic intention formation
3. **Temporal constraints** for time-sensitive workflows
4. **Reflection layer** for learning and improvement

These enhancements would complement DevAll's existing strengths in declarative workflow design and parallel execution, creating a more flexible and adaptive multi-agent orchestration platform.
