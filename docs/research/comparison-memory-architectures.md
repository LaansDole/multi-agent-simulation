# Memory Architectures Comparison Matrix

**Document Type:** Research Comparison  
**Last Updated:** March 2, 2026  
**Purpose:** Side-by-side comparison of memory architectures for multi-agent systems

---

## Overview

This document compares memory architectures across different multi-agent frameworks, from classic BDI systems to modern LLM-based approaches. The comparison focuses on key dimensions that influence agent behavior, learning, and long-term coherence.

---

## Comparison Matrix

| Architecture | Storage Mechanism | Retrieval Method | Importance Scoring | Reflection Support | Persistence | Implementation Complexity |
|--------------|-------------------|------------------|-------------------|-------------------|-------------|--------------------------|
| **Stanford Memory Stream** | Natural language observations in chronological stream | Recency + Importance + Relevance scoring | LLM-generated importance scores (1-10) | Automated reflection synthesis when importance threshold exceeded | JSON-based file storage | Medium - requires LLM for scoring |
| **ChatDev Memory** | Phase-specific conversation history | Chat chain termination conditions | No explicit importance scoring | Communicative dehallucination through peer review | Phase artifacts propagated sequentially | Low - simple conversation tracking |
| **MemGPT** | Hierarchical: Core Memory (RAM) + Recall Storage + Archival Storage | Self-directed function calls to move data between tiers | Agent-controlled prioritization and archival | Implicit through memory management functions | Database-backed persistent storage | High - OS-inspired memory management |
| **Classic BDI Belief Base** | Propositional logic facts and rules | Pattern matching and logical inference | No importance scoring - belief revision based on recency | No reflection - belief update through perception | Typically in-memory or database | Medium - formal logic systems |
| **DevAll SimpleMemory** | JSON files with embeddings (FAISS-indexed) | Semantic similarity + Jaccard + LCS + keyword matching | Time decay + length factor + relevance scoring | No automatic reflection | JSON file with max 1000 memories | Medium - embedding-based retrieval |
| **DevAll RLMMemory** | Wraps MemoryBase with RLM exploration capabilities | Programmatic exploration via Python code execution | Inherits from underlying memory store | RLM-driven semantic analysis and exploration | Inherits from underlying memory store | High - adds RLM layer |
| **DevAll MemoryBase** | Abstract interface with List[MemoryItem] | Abstract - implemented by subclasses | Time decay + length + relevance (in MemoryManager) | No built-in reflection | Configurable via subclasses | Low - abstract base class |

---

## Detailed Architecture Analysis

### 1. Stanford Memory Stream (Generative Agents)

**Storage Mechanism:**
- Continuous log of natural language observations
- Each memory includes: description, timestamp, importance score
- No compression or summarization - raw observations preserved

**Retrieval Method:**
- Multi-factor scoring function:
  ```
  score = recency_weight * recency_score + 
          importance_weight * importance_score + 
          relevance_weight * relevance_score
  ```
- Recency: Exponential decay based on time
- Importance: LLM-generated score (1-10 scale)
- Relevance: Semantic similarity to query

**Reflection Support:**
- Triggered when cumulative importance exceeds threshold
- Generates high-level questions about recent experiences
- Synthesizes abstract insights from observations
- Reflections stored back in memory stream

**Key Innovation:**
- Human-like memory retrieval balancing multiple factors
- Automatic synthesis of higher-level thoughts
- Maintains long-term behavioral coherence

**Reference:** [stanford-generative-agents-summary.md](./stanford-generative-agents-summary.md)

---

### 2. ChatDev Memory

**Storage Mechanism:**
- Phase-specific conversation histories
- Artifacts from each phase (design docs, code, tests)
- No explicit memory structure - conversation context

**Retrieval Method:**
- Sequential chat chains with termination conditions
- Agents reach agreement before proceeding
- No semantic retrieval - linear conversation flow

**Reflection Support:**
- Communicative dehallucination through peer review
- Tester agent identifies bugs and inconsistencies
- Iterative refinement through conversation

**Key Innovation:**
- Role-based specialization with peer verification
- Structured conversation patterns (chat chains)
- Phase-based workflow with clear handoffs

**Limitations:**
- No persistent long-term memory across projects
- No semantic retrieval or importance scoring
- Memory scope limited to single development session

**Reference:** [papers/chatdev-summary.md](./papers/chatdev-summary.md)

---

### 3. MemGPT

**Storage Mechanism:**
- **Main Context (Core Memory):** Limited by LLM token window
  - System instructions
  - Conversational context (FIFO queue)
  - Working context (scratchpad)
- **External Context:** Unlimited storage
  - Recall storage (searchable event history)
  - Archival storage (long-term important information)

**Retrieval Method:**
- Agent generates function calls to move data between tiers
- Self-directed memory management
- Functions: `core_memory_append`, `core_memory_replace`, `archival_memory_insert`, etc.

**Reflection Support:**
- Implicit through memory reorganization
- Agent decides what to archive and what to keep active
- No explicit reflection synthesis

**Key Innovation:**
- Overcomes LLM context window limitations
- Provides illusion of unlimited memory
- OS-inspired architecture familiar to developers

**Trade-offs:**
- High complexity - requires function calling infrastructure
- Agent must learn memory management strategies
- Can be inefficient if agent makes poor archival decisions

**Sources:** 
- MemGPT: https://arxiv.org/abs/2310.08560
- GitHub: https://github.com/cpacker/memgpt

---

### 4. Classic BDI Belief Base

**Storage Mechanism:**
- Propositional logic facts and inference rules
- Belief base represents agent's knowledge about the world
- Can be incomplete, incorrect, or outdated

**Retrieval Method:**
- Pattern matching against belief base
- Logical inference to derive new beliefs
- Query-based access (e.g., `BEL(proposition)`)

**Reflection Support:**
- No reflection mechanism in classic BDI
- Beliefs updated through perception only
- No synthesis of higher-level insights

**Key Innovation:**
- Formal logical foundation for agent reasoning
- Clear semantics for belief update
- Integration with desires and intentions

**Limitations:**
- No automatic importance ranking
- No semantic similarity retrieval
- Requires manual belief engineering

**Modern Relevance:**
- Concepts applicable to LLM-based agents
- Belief tracking useful for state management
- Logical reasoning patterns complement LLM capabilities

**Reference:** [papers/classic/bdi-architecture-summary.md](./papers/classic/bdi-architecture-summary.md)

---

### 5. DevAll SimpleMemory

**Storage Mechanism:**
- JSON file storage with MemoryItem objects
- Each item contains:
  - Content summary
  - Embedding vector (L2-normalized)
  - Metadata (agent role, timestamps, attachments)
  - Input/output snapshots (multimodal support)
- Maximum 1000 memories (FIFO eviction)

**Retrieval Method:**
- FAISS inner-product index for similarity search
- Multi-factor semantic scoring:
  - Jaccard similarity (word overlap)
  - Longest common subsequence (LCS)
  - Keyword matching
  - Length factor
- Combined score: `0.7 * embedding_similarity + 0.3 * semantic_score`
- Content extraction removes templated instructions

**Importance Scoring:**
- Time decay: `max(0.1, 1.0 - age_hours / (24 * 30))`
- Length factor: Penalizes very short (<20) or very long (>200) content
- Relevance: Word overlap with query
- Combined: `0.7 * time_decay * length_factor + 0.3 * relevance`

**Reflection Support:**
- No automatic reflection
- Memories are static observations
- No synthesis of higher-level insights

**Key Innovation:**
- Multimodal memory support (text + attachments)
- Content extraction to reduce noise
- Deduplication via content hashing
- Efficient FAISS-based retrieval

**Trade-offs:**
- Fixed memory limit (1000 items)
- No reflection synthesis
- Requires embedding model

**Implementation:** `runtime/node/agent/memory/simple_memory.py`

---

### 6. DevAll RLMMemory

**Storage Mechanism:**
- Wrapper around any MemoryBase implementation
- Adds RLM (Reasoning Language Model) exploration layer
- Inherits storage from underlying memory store

**Retrieval Method:**
- Standard retrieval from underlying memory
- RLM exploration allows programmatic analysis:
  - Python code execution on retrieved memories
  - `llm_query()` for semantic analysis
  - `llm_query_batched()` for parallel analysis
  - `FINAL(answer)` to conclude exploration

**Importance Scoring:**
- Inherits from underlying memory store
- No additional importance scoring

**Reflection Support:**
- RLM-driven semantic exploration
- Agent writes Python code to analyze memories
- Can perform arbitrary computation on memory items

**Key Innovation:**
- Programmatic memory exploration
- Beyond simple retrieval - enables complex reasoning
- RLM provides flexible analysis capabilities

**Trade-offs:**
- High complexity - requires RLM infrastructure
- Additional latency for code execution
- Requires careful prompting for effective exploration

**Implementation:** `runtime/node/agent/memory/rlm_memory.py`

---

### 7. DevAll MemoryBase (Abstract)

**Storage Mechanism:**
- Abstract interface for memory implementations
- Base storage: `List[MemoryItem]`
- Configurable via MemoryStoreConfig

**Retrieval Method:**
- Abstract method - implemented by subclasses
- MemoryManager provides combined retrieval:
  - Stage-based filtering
  - Multi-store aggregation
  - Combined scoring across attachments

**Importance Scoring:**
- MemoryManager scoring (see SimpleMemory section)
- Time decay + length factor + relevance

**Reflection Support:**
- No reflection in base class
- Subclasses can implement custom reflection

**Key Innovation:**
- Modular memory architecture
- Support for multiple memory stores per agent
- Attachment-based configuration

**Implementation:** `runtime/node/agent/memory/memory_base.py`

---

## Where DevAll Differs from SOTA

### Advantages Over SOTA

**1. Multimodal Memory Support**
- DevAll's MemoryContentSnapshot supports text + attachments
- Most SOTA systems focus on text-only memory
- Enables richer context preservation

**2. Programmatic Exploration (RLMMemory)**
- RLM layer allows arbitrary code execution on memories
- Beyond simple retrieval - enables complex reasoning
- Unique capability not found in other frameworks

**3. Content Extraction**
- SimpleMemory extracts key content, removes noise
- Reduces storage overhead and improves retrieval quality
- Most systems store raw observations

**4. Modular Architecture**
- MemoryBase abstraction enables multiple implementations
- MemoryManager supports multiple stores per agent
- More flexible than monolithic memory systems

**5. Deduplication**
- Content hashing prevents duplicate memories
- Reduces storage and improves retrieval precision
- Many SOTA systems lack deduplication

### Gaps Compared to SOTA

**1. No Automatic Reflection**
- Stanford Memory Stream: Automatic synthesis of insights
- DevAll: No reflection mechanism
- Impact: Limited long-term coherence and learning

**2. No Importance-Based Retrieval**
- Stanford: LLM-generated importance scores
- MemGPT: Agent-controlled prioritization
- DevAll: Only time decay and relevance
- Impact: May retrieve mundane memories over significant ones

**3. Fixed Memory Limits**
- SimpleMemory: Hard limit of 1000 items
- MemGPT: Unlimited archival storage
- Stanford: No explicit limit mentioned
- Impact: Potential loss of important old memories

**4. No Hierarchical Memory**
- MemGPT: Core + Recall + Archival tiers
- DevAll: Single-tier storage
- Impact: No distinction between working and long-term memory

**5. Limited Cross-Agent Memory Sharing**
- DevAll: Per-agent memory stores
- No explicit shared memory mechanisms
- Impact: Limited collaborative learning

### Alignment with Classic BDI

**Shared Concepts:**
- Beliefs → Memory content (agent's knowledge)
- Desires → Not explicitly modeled in memory
- Intentions → Not stored in memory

**Differences:**
- BDI: Formal logic-based beliefs
- DevAll: Natural language + embeddings
- BDI: Explicit goal management
- DevAll: Goals handled at workflow level, not memory level

**Modern Interpretation:**
- DevAll's memory serves as belief base
- No explicit desire/intention modeling in memory
- BDI concepts more applicable to workflow orchestration

---

## Design Recommendations

### For Short-Term Context (Working Memory)
- Use MemoryBase with high recency weight
- Keep memory count low (100-500 items)
- Focus on task-relevant information

### For Long-Term Learning (Episodic Memory)
- Implement reflection synthesis (like Stanford)
- Add importance scoring via LLM
- Consider hierarchical storage (like MemGPT)

### For Collaborative Agents
- Add shared memory stores
- Implement memory synchronization mechanisms
- Consider blackboard pattern for shared context

### For Complex Reasoning
- Use RLMMemory for programmatic exploration
- Combine multiple memory stores (episodic + semantic)
- Implement custom reflection strategies

---

## Implementation Status

| Feature | Stanford | ChatDev | MemGPT | BDI | DevAll |
|---------|----------|---------|--------|-----|--------|
| Natural language storage | ✓ | ✓ | ✓ | ✗ | ✓ |
| Semantic retrieval | ✓ | ✗ | ✓ | ✗ | ✓ |
| Importance scoring | ✓ | ✗ | ✓ | ✗ | Partial |
| Reflection synthesis | ✓ | ✗ | ✗ | ✗ | ✗ |
| Hierarchical memory | ✗ | ✗ | ✓ | ✗ | ✗ |
| Multimodal support | ✗ | ✗ | ✗ | ✗ | ✓ |
| Programmatic exploration | ✗ | ✗ | ✗ | ✗ | ✓ |
| Persistent storage | ✓ | ✗ | ✓ | Varies | ✓ |
| Cross-agent sharing | ✗ | ✗ | ✗ | ✗ | ✗ |

---

## Future Research Directions

### Near-Term Enhancements
1. **Implement Reflection Mechanism**
   - Adapt Stanford's importance-based triggering
   - LLM-generated insights from memory aggregation
   - Store reflections in memory stream

2. **Add Hierarchical Memory**
   - Working memory (recent, high-importance)
   - Long-term memory (archived, compressed)
   - Transition policies between tiers

3. **Importance Scoring via LLM**
   - Rate memory significance on 1-10 scale
   - Weight retrieval by importance
   - Evict low-importance memories first

### Long-Term Research
1. **Cross-Agent Memory Sharing**
   - Shared belief bases
   - Distributed memory synchronization
   - Privacy and access control

2. **Memory Compression**
   - Summarize old memories
   - Maintain semantic content
   - Reduce storage requirements

3. **Meta-Learning from Memory**
   - Learn retrieval strategies
   - Adapt importance scoring
   - Personalize memory management

---

## Cross-References

### Related Documents
- [Stanford Generative Agents Summary](./stanford-generative-agents-summary.md)
- [ChatDev Summary](./papers/chatdev-summary.md)
- [BDI Architecture Summary](./papers/classic/bdi-architecture-summary.md)
- [Bibliography](./bibliography.md)

### Implementation Files
- `runtime/node/agent/memory/memory_base.py` - Base memory interface
- `runtime/node/agent/memory/simple_memory.py` - SimpleMemory implementation
- `runtime/node/agent/memory/rlm_memory.py` - RLM-enhanced memory
- `runtime/node/agent/memory/file_memory.py` - File-based storage
- `runtime/node/agent/memory/blackboard_memory.py` - Shared blackboard

---

## Conclusion

DevAll's memory architecture provides a solid foundation with unique features (multimodal support, programmatic exploration) but lacks key capabilities present in SOTA systems (automatic reflection, hierarchical memory, importance-based retrieval). 

**Key Takeaway:** DevAll excels at retrieval accuracy and flexibility but would benefit from adding reflection mechanisms and hierarchical storage to match the long-term coherence capabilities of systems like Stanford Memory Stream.

**Recommendation:** Prioritize implementing reflection synthesis and importance scoring to bring DevAll's memory capabilities to SOTA level while preserving its unique strengths in multimodal support and programmatic exploration.
