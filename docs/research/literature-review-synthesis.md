# Literature Review Synthesis: Multi-Agent Orchestration Platforms

**Document Type:** Academic Synthesis  
**Last Updated:** March 2, 2026  
**Purpose:** Consolidated literature review positioning DevAll in the multi-agent systems landscape

---

## Abstract

This literature review synthesizes research on multi-agent orchestration platforms, examining the evolution from classic belief-desire-intention (BDI) architectures to modern large language model (LLM)-based multi-agent systems. We analyze state-of-the-art (SOTA) approaches across four core architectural dimensions—memory, planning, communication, and coordination—and position DevAll, a zero-code multi-agent orchestration platform, within this landscape. Our analysis reveals that while DevAll excels in declarative workflow specification, parallel execution, and multimodal support, it lacks critical adaptive capabilities present in SOTA systems. We identify key gaps in automatic reflection, dynamic re-planning, temporal reasoning, and formal communication protocols, proposing a prioritized roadmap for future development.

**Keywords:** multi-agent systems, LLM agents, workflow orchestration, BDI architecture, memory systems, planning, communication protocols

---

## 1. Introduction: The Multi-Agent Simulation Landscape

### 1.1 Evolution of Multi-Agent Systems

Multi-agent systems (MAS) have evolved through two distinct eras. The **classic era** (1980s-2010s) was characterized by formal architectures rooted in philosophy of action, featuring belief-desire-intention (BDI) models [Rao & Georgeff, 1991], agent-oriented programming languages [Bordini & Hübner, 2005; Hindriks et al., 2007; Dastani, 2008], and standardized communication protocols [FIPA, 2002; Finin et al., 1994]. These systems emphasized formal semantics, logical reasoning, and interoperability but required significant manual engineering.

The **modern era** (2022-present) emerged with the advent of large language models, featuring systems like ChatDev [Qian et al., 2024], AutoGen [Wu et al., 2023], MetaGPT [Hong et al., 2024], and Stanford Generative Agents [Park et al., 2023]. These systems leverage LLMs as core reasoning engines, enabling natural language communication, emergent behaviors, and reduced engineering overhead. However, they often lack the formal guarantees and theoretical foundations of classic systems.

### 1.2 Current Challenges

The field faces several critical challenges:

1. **Memory Management**: How can agents maintain long-term coherence across extended interactions while managing limited context windows?
2. **Adaptive Planning**: How can systems dynamically adapt workflows to unexpected events without manual redesign?
3. **Communication Semantics**: How can agents communicate with formal guarantees while preserving natural language flexibility?
4. **Coordination at Scale**: How can multi-agent systems coordinate effectively as the number of agents and complexity of workflows increase?

### 1.3 Positioning DevAll

DevAll represents a novel approach to multi-agent orchestration that bridges declarative workflow design with LLM-powered execution. Unlike classic BDI systems that require manual plan engineering, or modern LLM systems that rely on emergent conversation patterns, DevAll provides a **zero-code YAML-based workflow specification** combined with **DAG-based parallel execution** and **edge-based message routing**.

This synthesis examines how DevAll's architectural choices position it within the broader multi-agent landscape, identifying both unique contributions and gaps requiring future work.

---

## 2. Memory Architectures

### 2.1 State-of-the-Art Approaches

**Stanford Memory Stream** [Park et al., 2023] represents the current SOTA in agent memory systems, implementing a three-factor retrieval mechanism combining recency, importance, and relevance. The key innovation is **automatic reflection synthesis**: when cumulative importance of recent memories exceeds a threshold, the system generates high-level questions and synthesizes abstract insights, creating a hierarchical memory structure (observations → reflections). This enables long-term behavioral coherence and self-improvement.

**MemGPT** [Packer et al., 2023] addresses LLM context window limitations through an OS-inspired hierarchical memory architecture: Core Memory (limited by LLM window) → Recall Storage (searchable event history) → Archival Storage (unlimited long-term storage). Agents self-direct memory management through function calls, providing the illusion of unlimited memory.

**Classic BDI Belief Bases** [Rao & Georgeff, 1991] represent agent knowledge as propositional logic facts and rules, with retrieval via pattern matching and logical inference. While providing formal semantics, these systems lack modern features like semantic similarity retrieval and automatic importance scoring.

### 2.2 DevAll's Memory Architecture

DevAll implements a modular memory architecture with multiple implementations:

1. **SimpleMemory**: JSON-based storage with FAISS-indexed embeddings, combining semantic similarity (via embeddings) with heuristic scoring (time decay, length factor, word overlap). Limited to 1000 memories with FIFO eviction.

2. **RLMMemory**: Wraps any MemoryBase with programmatic exploration capabilities via Python code execution, enabling complex reasoning beyond simple retrieval.

3. **MemoryBase (Abstract)**: Provides a plugin architecture supporting multiple memory stores per agent.

**Unique Contributions:**

- **Multimodal Memory Support**: Unlike text-only systems (Stanford, ChatDev), DevAll's `MemoryContentSnapshot` supports text, images, audio, video, and files, preserving rich context.
- **Programmatic Exploration**: RLM layer enables arbitrary code execution on memories, a capability not found in other frameworks.
- **Content Extraction**: Automatic extraction of key content reduces noise and improves retrieval precision.
- **Deduplication**: Content hashing prevents duplicate memories, improving retrieval quality.

**Identified Gaps:**

1. **No Automatic Reflection** (HIGH impact): Lacks Stanford's synthesis mechanism for generating higher-level insights from observations. This limits long-term learning and behavioral coherence.

2. **Rule-Based Importance Scoring** (MEDIUM impact): Uses time decay and word overlap rather than LLM-generated semantic importance scores. May retrieve mundane memories over significant ones.

3. **Fixed Memory Limits** (MEDIUM impact): Hard limit of 1000 memories vs. MemGPT's unlimited archival storage. Risks losing important old memories.

4. **Single-Tier Storage** (MEDIUM impact): No hierarchical distinction between working memory and long-term storage.

5. **Limited Cross-Agent Sharing** (LOW impact): Per-agent memory stores without explicit shared memory mechanisms.

**Positioning**: DevAll's memory architecture excels at retrieval accuracy and flexibility but would benefit from Stanford's reflection synthesis and MemGPT's hierarchical storage to achieve SOTA-level long-term coherence.

---

## 3. Planning and Coordination

### 3.1 State-of-the-Art Approaches

**Stanford Generative Agents** [Park et al., 2023] implements **hierarchical reflection-based planning** with three levels: daily plan → hourly breakdown → 5-15 minute actions. Planning is informed by memory stream and reflection synthesis. Critically, the system supports **dynamic re-planning**: agents continuously adapt plans based on new observations, social interactions, and environmental changes.

**AutoGen** [Wu et al., 2023] uses **conversation-driven planning** where tasks are decomposed through dialogue. Planning emerges from agent interactions without explicit hierarchical representation. Re-planning occurs naturally through iterative conversation refinement.

**MetaGPT** [Hong et al., 2024] employs **SOP-based sequential planning**, encoding Standard Operating Procedures from real-world software engineering. Structured phases (PM → Architect → Engineer → QA) with feedback loops enable quality control and iterative refinement.

**Classic BDI** [Rao & Georgeff, 1991] implements **plan library + deliberation** with hierarchical plans, means-end reasoning, and **intention reconsideration strategies**:
- Blind commitment: Maintain until achieved
- Single-minded: Maintain until achieved OR impossible
- Open-minded: Maintain until achieved OR impossible OR reason no longer holds

BDI also provides **temporal reasoning** via CTL-based temporal logic, enabling deadline-driven behavior and temporal consistency checking.

### 3.2 DevAll's Planning Architecture

DevAll uses **workflow orchestration via directed acyclic graphs (DAGs)**:

1. **Declarative Workflow Definition**: YAML-based specification of nodes and edges
2. **Layer-by-Layer Execution**: Topological sorting determines execution order
3. **Parallel Execution**: Nodes within layers execute in parallel
4. **Node Diversity**: 9+ node types (agent, human, python_runner, literal, template, passthrough, subgraph, loop_counter, rlm_memory)
5. **Edge-Based Coordination**: Conditional execution, message transformation, and context management via edges

**Unique Contributions:**

- **Declarative Specification**: YAML workflows are easier to design, version control, and maintain than code-based approaches
- **Flexible Node Types**: Mix LLM agents, human input, code execution, and subgraphs in unified workflows
- **Parallel Execution**: Automatic parallel execution within layers, improving efficiency
- **Human-in-the-Loop Integration**: Dedicated human node type for interactive workflows
- **Edge-Based Routing**: Fine-grained control over data flow with conditions, triggers, and processors

**Identified Gaps:**

1. **No Automatic Re-Planning** (HIGH impact): Static workflow structure cannot adapt to unexpected events. Manual redesign required for changes. Unlike Stanford (dynamic re-planning) and BDI (intention reconsideration), DevAll workflows are "frozen intentions."

2. **No Temporal Reasoning** (HIGH impact): No representation of deadlines, durations, or temporal constraints. Layer-based ordering provides only dependency-based sequencing.

3. **No Reflection Mechanism** (HIGH impact): Lacks Stanford's integration of reflection with planning for continuous improvement.

4. **No Goal Management** (MEDIUM impact): Goals implicit in workflow structure vs. BDI's explicit goal base with adoption, deliberation, and abandonment.

5. **No Plan Library** (LOW impact): Workflows hardcoded in YAML vs. BDI's reusable plan templates and MetaGPT's SOP-encoded procedures.

**Positioning**: DevAll excels at orchestrating predefined workflows with parallel execution and flexible node types, but lacks the adaptive planning, temporal reasoning, and dynamic coordination capabilities present in SOTA systems. The gap is not "missing features" but "missing adaptability."

---

## 4. Communication Protocols

### 4.1 State-of-the-Art Approaches

**Classic Agent Communication Languages** provide formal semantics:

**FIPA-ACL** [FIPA, 2002] implements structured messages with performatives based on speech act theory [Austin, 1962; Searle, 1969]:
```
(inform
    :sender agent1
    :receiver agent2
    :content "price(apple, 5)"
    :ontology trading
    :conversation-id conv-123
    :reply-with msg-1)
```

20+ performatives (inform, request, propose, agree, refuse, etc.) with formal semantics: Feasibility Preconditions (FP) define when appropriate, Rational Effect (RE) defines expected outcome.

**KQML** [Finin et al., 1994] provides a three-layer structure (content, message, communication) with performatives for knowledge exchange (tell, ask-if), capability queries (subscribe, standby), and task delegation (achieve, advertise).

**Modern LLM-Based Systems** prioritize flexibility:

**ChatDev** [Qian et al., 2024] uses role-based natural language messages within **chat chains**—semi-structured conversation patterns with agreement-based termination. Phase-based handoffs propagate artifacts (PRD → code → tests).

**AutoGen** [Wu et al., 2023] employs OpenAI-style messages with flexible conversation patterns (two-agent, sequential, group chat). LLM-driven turn-taking with termination conditions.

**CrewAI** [Venkadesh et al., 2024] implements Pub/Sub messaging with shared memory bus and Agent-to-Agent (A2A) protocol supporting multiple transports (JSONRPC, gRPC, HTTP).

### 4.2 DevAll's Communication Architecture

DevAll uses **edge-based message passing** with rich message structure:

```python
@dataclass
class Message:
    role: MessageRole
    content: MessageContent  # str | List[MessageBlock]
    name: Optional[str]
    tool_call_id: Optional[str]
    metadata: Dict[str, Any]
    keep: bool  # Context retention flag
```

**Multimodal Content Blocks** support text, images, audio, video, files, and structured data.

**Edge Configuration** provides fine-grained control:
```yaml
edges:
  - from: agent1
    to: agent2
    trigger: true
    condition: "true"
    carry_data: true
    keep_message: false
    clear_context: false
    process:
      type: regex_extract
      config:
        pattern: "Result: (.*)"
```

**Unique Contributions:**

- **Multimodal Messages**: Supports text, images, audio, video, files vs. text-only ChatDev/FIPA-ACL
- **Edge-Based Routing**: Fine-grained control with conditions, triggers, and processors vs. protocol-based FIPA-ACL or conversation-based AutoGen
- **Rich Context Management**: `keep`, `clear_context`, `clear_kept_context` flags for precise context control
- **Message Transformation**: Edge processors (regex, functions, templates) for payload transformation
- **Parallel Execution**: DAG-based parallel communication vs. sequential protocols

**Identified Gaps:**

1. **No Formal Protocol Specification** (MEDIUM impact): Ad-hoc message passing vs. FIPA-ACL's formal speech act semantics. No semantic guarantees or interoperability standards.

2. **No Speech Act Semantics** (MEDIUM impact): No foundation in speech act theory. Cannot formally reason about message intentions (request vs. inform vs. propose).

3. **No Conversation Tracking** (MEDIUM impact): Lacks `conversation-id`, `reply-with`, `in-reply-to` fields present in FIPA-ACL/KQML. Harder to correlate messages across long workflows.

4. **No Ontology Support** (LOW impact): No shared vocabulary mechanism. Potential semantic mismatches between agents.

5. **No Multi-Turn Dialogue** (MEDIUM impact): Single-turn message passing vs. ChatDev's chat chains or AutoGen's multi-turn conversations. Limited support for iterative refinement.

6. **No Role Negotiation** (LOW impact): Roles hardcoded in YAML vs. FIPA-ACL's propose/accept-proposal protocols for dynamic assignment.

**Positioning**: DevAll excels at structured workflow communication with multimodal support and fine-grained message routing, but lacks the formal protocol semantics, conversation tracking, and multi-turn dialogue capabilities present in SOTA systems.

---

## 5. Coordination Mechanisms

### 5.1 State-of-the-Art Approaches

**Classic BDI** coordinates via **speech act-based interaction protocols**:
- Request-Response: request → agree/refuse → inform/failure
- Query: query-if → agree/refuse → inform
- Propose: propose → accept/reject → inform/failure

**AutoGen** provides **conversation patterns**:
- Two-agent: UserProxyAgent ↔ AssistantAgent
- Sequential: Agent A → Agent B → Agent C
- Group chat: Multiple agents with GroupChatManager

**MetaGPT** uses **message pool publish-subscribe**:
```
Agent A publishes → [Message Pool] ← Agent B subscribes
                          ↓
                  All agents can read
                  historical messages
```

**Stanford Generative Agents** coordinates **implicitly via shared environment**: agents perceive each other's actions, track interactions in memory stream, with emergent coordination through shared context.

### 5.2 DevAll's Coordination Architecture

DevAll coordinates via **DAG structure and edge-based message passing**:

1. **Graph Topology Defines Coordination**: Node dependencies determine execution order and data flow
2. **Conditional Edges**: Edge conditions control which nodes activate
3. **Dynamic Edges**: Runtime edge expansion for fan-out/fan-in patterns
4. **Context Management**: Edge flags control context propagation

**Unique Contributions:**

- **Declarative Coordination**: Graph structure makes coordination patterns explicit and verifiable
- **Parallel Coordination**: Multiple independent branches execute concurrently
- **Conditional Activation**: Fine-grained control over which agents participate
- **Dynamic Patterns**: Map/reduce patterns via dynamic edges

**Identified Gaps:**

1. **Limited Coordination Protocols** (MEDIUM impact): No explicit protocol state machines like FIPA-ACL. Limited multi-agent coordination patterns.

2. **No Protocol Verification** (MEDIUM impact): Cannot verify interaction correctness vs. FIPA-ACL's protocol state tracking.

**Positioning**: DevAll's graph-based coordination provides clarity and parallelism but lacks the rich interaction protocols and verification capabilities of classic MAS.

---

## 6. DevAll's Unique Contributions

### 6.1 Architectural Innovations

**1. Zero-Code Workflow Specification**
- YAML-based declarative workflows
- Visual graph representation
- Version controllable, easy to maintain
- Lower barrier to entry than code-based frameworks

**2. Multimodal-First Design**
- Native support for text, images, audio, video, files
- Rich context preservation across workflow
- Unique among both classic and modern systems

**3. Programmatic Memory Exploration**
- RLM layer enables arbitrary code execution on memories
- Beyond simple retrieval—enables complex reasoning
- Novel capability not found in other frameworks

**4. Edge-Based Message Routing**
- Fine-grained control over data flow
- Message transformation via processors
- Conditional execution and context management
- More flexible than protocol-based or conversation-based approaches

**5. Parallel Execution Architecture**
- Automatic parallel execution within DAG layers
- Efficient resource utilization
- Scalable to large workflows

**6. Modular Memory Architecture**
- Plugin-based memory implementations
- Multiple memory stores per agent
- Flexible attachment-based configuration

### 6.2 Design Philosophy

DevAll embodies a **declarative orchestration philosophy** that contrasts with:

- **Classic BDI**: Deliberative, adaptive, formal but engineering-intensive
- **Modern LLM Systems**: Emergent, flexible, but lacking structure and guarantees

DevAll provides **structure without rigidity**: declarative workflows with parallel execution, while maintaining flexibility through edge-based routing and multiple node types.

---

## 7. Gap Analysis and Prioritized Roadmap

### 7.1 Critical Gaps (Priority 0)

**Automatic Reflection Synthesis** (Memory)
- **Impact**: HIGH - Enables long-term learning and behavioral coherence
- **Effort**: MEDIUM
- **Approach**: Implement Stanford-style importance-based triggering, LLM-generated insights, reflection storage
- **Timeline**: 6 weeks
- **Reference**: [Gap Analysis §1.1](./gap-analysis.md#11-no-automatic-reflection-synthesis)

**Automatic Re-Planning** (Planning)
- **Impact**: HIGH - Enables adaptive behavior in dynamic environments
- **Effort**: HIGH
- **Approach**: Re-planning triggers in DAGExecutor, alternative path generation, safe-point resumption
- **Timeline**: 8 weeks
- **Reference**: [Gap Analysis §2.1](./gap-analysis.md#21-no-automatic-re-planning)

### 7.2 High-Priority Gaps (Priority 1)

**LLM-Based Importance Scoring** (Memory)
- **Impact**: MEDIUM - More relevant memory retrieval
- **Effort**: LOW
- **Timeline**: 3 weeks

**Temporal Reasoning** (Planning)
- **Impact**: HIGH - Time-aware planning and deadline support
- **Effort**: HIGH
- **Timeline**: 6 weeks

**Planning Reflection** (Planning)
- **Impact**: HIGH - Continuous workflow improvement
- **Effort**: MEDIUM
- **Timeline**: 4 weeks

**Conversation ID Tracking** (Communication)
- **Impact**: MEDIUM - Multi-turn conversation support
- **Effort**: LOW
- **Timeline**: 2 weeks

### 7.3 Medium-Priority Gaps (Priority 2)

- **Hierarchical Memory** (Memory): Working vs. long-term tiers
- **Goal Management** (Planning): Explicit goal adoption/abandonment
- **Speech Act Semantics** (Communication): Formal message intentions
- **Multi-Turn Dialogue** (Communication): Chat chain support
- **Coordination Protocols** (Coordination): Protocol state machines

### 7.4 Implementation Roadmap

**Phase 1: Foundation (Q1 2026)**
- Automatic reflection synthesis
- LLM-based importance scoring
- Conversation ID tracking

**Phase 2: Adaptation (Q2 2026)**
- Automatic re-planning
- Temporal reasoning
- Planning reflection

**Phase 3: Sophistication (Q3-Q4 2026)**
- Goal management
- Speech act semantics
- Multi-turn dialogue
- Hierarchical memory

**Phase 4: Advanced Features (2027)**
- Coordination protocols
- Plan library
- Ontology support
- Cross-agent memory sharing

---

## 8. Future Research Directions

### 8.1 Near-Term Research Questions

1. **Reflection-Driven Adaptation**: How can reflection synthesis inform automatic workflow re-design? Can agents learn to optimize their own workflows?

2. **Temporal Constraint Satisfaction**: How can temporal reasoning be integrated with DAG execution? What scheduling algorithms work best for deadline-driven workflows?

3. **Hybrid Communication Protocols**: Can DevAll combine formal speech act semantics with natural language flexibility? What is the right balance?

4. **Memory Hierarchy Optimization**: What policies govern memory tier transitions? How to compress old memories while preserving semantic content?

### 8.2 Long-Term Research Vision

**Autonomous Workflow Generation**
- Generate workflows from high-level goal specifications
- Learn workflow patterns from examples
- Compose workflows dynamically based on context

**Distributed Multi-Agent Orchestration**
- Scale beyond single-process execution
- Distributed workflow coordination
- Fault tolerance and recovery

**Meta-Learning and Self-Improvement**
- Agents learn to optimize their own behavior
- Workflow pattern discovery
- Automatic hyperparameter tuning

**Interoperability Standards**
- FIPA-ACL compatibility layer
- Standard protocol support
- Cross-framework agent communication

---

## 9. Conclusion

This literature review has positioned DevAll within the evolving landscape of multi-agent systems, from classic BDI architectures to modern LLM-based frameworks. Our analysis reveals that DevAll makes unique contributions through:

1. **Declarative workflow specification** that lowers barriers to multi-agent system development
2. **Multimodal-first design** supporting rich context beyond text-only systems
3. **Programmatic memory exploration** enabling complex reasoning
4. **Edge-based message routing** providing fine-grained coordination control
5. **Parallel execution architecture** scaling to complex workflows

However, critical gaps exist in **adaptive behavior** (reflection, re-planning), **temporal reasoning**, and **formal communication semantics**. These gaps represent not missing features, but missing adaptability—the ability to respond dynamically to unexpected events and learn from experience.

**Strategic Imperative**: Prioritize implementing reflection and re-planning mechanisms as foundational capabilities. These improvements will unlock DevAll's potential for complex, long-running multi-agent workflows while preserving its architectural strengths in declarative workflow design and parallel execution.

By addressing these gaps through the proposed roadmap, DevAll can evolve from a workflow orchestration tool to a truly adaptive multi-agent platform, bridging the gap between the formal guarantees of classic MAS and the flexibility of modern LLM-based systems.

---

## 10. Bibliography

### LLM-Based Multi-Agent Systems

Qian, C., Liu, W., Liu, H., Chen, N., Dang, Y., Li, J., Yang, C., Chen, W., Su, Y., Cong, X., Xu, J., Li, D., Liu, Z., & Sun, M. (2024). ChatDev: Communicative Agents for Software Development. In *Proceedings of the 62nd Annual Meeting of the Association for Computational Linguistics (ACL 2024)*. arXiv:2307.07924

Park, J. S., O'Brien, J. C., Cai, C. J., Morris, M. R., Liang, P., & Bernstein, M. S. (2023). Generative Agents: Interactive Simulacra of Human Behavior. In *Proceedings of the 36th Annual ACM Symposium on User Interface Software and Technology (UIST 2023)*. arXiv:2304.03442

Wu, Q., Bansal, G., Zhang, J., Wu, Y., Zhang, S., Zhu, J., Li, B., Zhang, E., Zhang, C., Liu, A., Wang, L., Awadallah, A., White, R., Burger, D., & Wang, C. (2023). AutoGen: Enabling Next-Gen LLM Applications via Multi-Agent Conversation. In *Proceedings of the Conference on Language Modeling (COLM 2024)*. arXiv:2308.08155

Hong, S., Zhuge, M., Chen, J., Zheng, X., Cheng, Y., Wang, J., Zhang, C., Wang, Z., Yau, S. K. S., Lin, Z., Zhou, L., Ran, C., Xiao, L., Wu, C., & Schmidhuber, J. (2024). MetaGPT: Meta Programming for A Multi-Agent Collaborative Framework. In *Proceedings of the International Conference on Learning Representations (ICLR 2024)*. arXiv:2308.00352

Chen, W., Su, Y., Zuo, J., Yang, C., Yuan, C., Chan, C. M., Yu, H., Lu, Y., Hung, Y. H., Qian, C., Qin, Y., Cong, X., Xie, R., Liu, Z., Sun, M., & Zhou, J. (2024). AgentVerse: Facilitating Multi-Agent Collaboration and Exploring Emergent Behaviors. In *Proceedings of the International Conference on Learning Representations (ICLR 2024)*. arXiv:2308.10848

Li, G., Hammoud, H. A. A. K., Itani, H., Khizbullin, D., & Ghanem, B. (2023). CAMEL: Communicative Agents for "Mind" Exploration of Large Language Model Society. In *Proceedings of the 37th Conference on Neural Information Processing Systems (NeurIPS 2023)*. arXiv:2303.17760

Packer, C., Wooders, S., Lin, K., Fang, V., Patil, S. G., Stoica, I., & Gonzalez, J. E. (2023). MemGPT: Towards LLMs as Operating Systems. arXiv preprint arXiv:2308.07108.

Venkadesh, P., Divya, S. V., & Kumar, K. S. (2024). Unlocking AI Creativity: A Multi-Agent Approach with CrewAI. *Journal of Trends in Computer Science and Smart Technology*, 6(4).

Guo, T., Chen, X., Wang, Y., Chang, R., Pei, S., Patel, N., Li, Z., & Wang, H. (2024). Large Language Model based Multi-Agents: A Survey of Progress and Challenges. arXiv preprint arXiv:2402.01680.

Wei, J., Wang, X., Schuurmans, D., Bosma, M., Chi, E. H., Xia, F., Le, Q., & Zhou, D. (2022). Chain-of-Thought Prompting Elicits Reasoning in Large Language Models. In *Proceedings of the 36th Conference on Neural Information Processing Systems (NeurIPS 2022)*. arXiv:2201.11903

Yao, S., Zhao, J., Yu, D., Du, N., Shafran, I., Narasimhan, K., & Cao, Y. (2022). ReAct: Synergizing Reasoning and Acting in Language Models. In *Proceedings of the International Conference on Learning Representations (ICLR 2023)*. arXiv:2210.03629

### Classic Multi-Agent Systems

Rao, A. S., & Georgeff, M. P. (1991). Modeling Rational Agents within a BDI-Architecture. In *Proceedings of the 2nd International Conference on Principles of Knowledge Representation and Reasoning (KR'91)* (pp. 473-484). Morgan Kaufmann.

Rao, A. S., & Georgeff, M. P. (1995). BDI Agents: From Theory to Practice. In *Proceedings of the First International Conference on Multi-Agent Systems (ICMAS-95)* (pp. 312-319). AAAI Press.

Bratman, M. E. (1987). *Intention, Plans, and Practical Reason*. Harvard University Press.

Bordini, R. H., & Hübner, J. F. (2005). BDI Agent Programming in AgentSpeak Using Jason (Tutorial Paper). In *Proceedings of the 4th International Joint Conference on Autonomous Agents and Multiagent Systems (AAMAS 2005)* (pp. 10-11). ACM.

Hindriks, K. V., de Boer, F. S., van der Hoek, W., & Meyer, J. J. C. (2007). GOAL: A Multi-Agent Programming Language Applied to an Exploration Game. In *Proceedings of the 6th International Joint Conference on Autonomous Agents and Multiagent Systems (AAMAS 2007)*.

Dastani, M. (2008). 2APL: A Practical Agent Programming Language. *Autonomous Agents and Multi-Agent Systems*, 16(3), 214-248.

Foundation for Intelligent Physical Agents (FIPA). (2002). *FIPA ACL Message Structure Specification*. FIPA Standard. https://www.fipa.org/specs/fipa00061/

Finin, T., Fritzson, R., McKay, D., & McEntire, R. (1994). KQML as an Agent Communication Language. In *Proceedings of the 3rd International Conference on Information and Knowledge Management (CIKM'94)* (pp. 456-463). ACM.

### Speech Act Theory

Austin, J. L. (1962). *How to Do Things with Words*. Oxford University Press.

Searle, J. R. (1969). *Speech Acts: An Essay in the Philosophy of Language*. Cambridge University Press.

### Surveys and Reviews

Weng, L. (2023). LLM Powered Autonomous Agents. Lil'Log blog post. https://lilianweng.github.io/posts/2023-06-23-agent/

---

## Cross-References

### Supporting Research Documents

- [Bibliography](./bibliography.md) - Complete bibliography with citations
- [Gap Analysis](./gap-analysis.md) - Detailed gap analysis and roadmap
- [Memory Architectures Comparison](./comparison-memory-architectures.md) - Memory system comparison matrix
- [Planning and Coordination Comparison](./comparison-planning.md) - Planning mechanism comparison
- [Communication Protocol Comparison](./comparison-communication.md) - Communication protocol comparison

### Paper Summaries

- [Stanford Generative Agents Summary](./stanford-generative-agents-summary.md)
- [ChatDev Summary](./papers/chatdev-summary.md)
- [AutoGen Summary](./papers/autogen-summary.md)
- [MetaGPT Summary](./papers/metagpt-summary.md)
- [BDI Architecture Summary](./papers/classic/bdi-architecture-summary.md)
- [Communication Protocols Summary](./papers/classic/communication-protocols-summary.md)

---

## Document Metadata

**Version**: 1.0  
**Authors**: DevAll Research Team  
**Last Updated**: March 2, 2026  
**Review Status**: Complete  
**Next Review**: Q2 2026
