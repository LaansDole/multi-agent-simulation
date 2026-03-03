# Stanford Generative Agents: Patterns for DevAll Integration

**Document Purpose:** Identify specific patterns from Stanford Generative Agents that can be applied to enhance DevAll's agent capabilities.

**Prerequisites:** US-002 (Architecture), US-003 (Repository Analysis)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Memory Patterns](#memory-patterns)
3. [Reflection Patterns](#reflection-patterns)
4. [Planning Patterns](#planning-patterns)
5. [Integration Points](#integration-points)
6. [Implementation Roadmap](#implementation-roadmap)

---

## Executive Summary

### Patterns Overview

| Pattern | Source | DevAll Compatibility | Implementation Priority | Already Implemented |
|---------|--------|---------------------|------------------------|---------------------|
| Weighted Memory Retrieval | Memory Stream | High | High | Partial |
| Importance-Based Triggers | Reflection | High | High | No |
| Hierarchical Planning | Planning | Medium | Medium | No |
| Lazy Decomposition | Planning | High | Medium | No |
| Post-Action Reflection | Reflection | High | Medium | Partial |
| Working Memory (Scratch) | Architecture | Medium | Low | No |
| Event Perception | Architecture | Medium | Low | No |

### Key Insights

1. **Memory retrieval scoring** in DevAll is simpler than Stanford's weighted approach
2. **Reflection** exists but lacks importance-based triggering
3. **Planning** is not implemented - agents react without long-term planning
4. **MemoryItem** structure is compatible with Stanford's ConceptNode

---

## Memory Patterns

### Pattern 1: Weighted Retrieval Scoring

**Stanford Approach:**
```python
# Stanford uses weighted combination of three factors
score = (recency_weight * recency_score * 0.5 +
         relevance_weight * relevance_score * 3 +
         importance_weight * importance_score * 2)
```

**DevAll Current Implementation:**
```python
# DevAll uses simpler scoring in MemoryManager._score_memory()
time_decay = max(0.1, 1.0 - age_hours / (24 * 30))
relevance = len(query_words & content_words) / len(query_words)
return 0.7 * time_decay * length_factor + 0.3 * relevance
```

**Gap Analysis:**
- DevAll lacks **importance scoring** on memory items
- DevAll lacks **embedding-based relevance** in MemoryManager (only in SimpleMemory)
- DevAll's time decay is linear, Stanford uses exponential (0.995^hours)

**Proposed Enhancement for DevAll:**

```python
from dataclasses import dataclass
from typing import List, Optional
import time
import math

@dataclass
class EnhancedMemoryItem:
    """Extended MemoryItem with Stanford-style importance scoring."""
    id: str
    content_summary: str
    metadata: dict
    embedding: Optional[List[float]] = None
    timestamp: float | None = None
    importance: float = 5.0  # NEW: 1-10 scale, LLM-assigned
    last_accessed: float | None = None  # NEW: For recency tracking
    memory_type: str = "observation"  # NEW: observation | reflection | plan


class WeightedRetrievalScorer:
    """Stanford-style weighted retrieval scoring for DevAll."""
    
    def __init__(
        self,
        recency_weight: float = 0.5,
        relevance_weight: float = 3.0,
        importance_weight: float = 2.0,
        decay_factor: float = 0.995
    ):
        self.recency_weight = recency_weight
        self.relevance_weight = relevance_weight
        self.importance_weight = importance_weight
        self.decay_factor = decay_factor
    
    def score_memories(
        self,
        query_embedding: List[float],
        memories: List[EnhancedMemoryItem],
        top_k: int = 10
    ) -> List[EnhancedMemoryItem]:
        """Retrieve top-k memories using weighted scoring."""
        current_time = time.time()
        scored = []
        
        for memory in memories:
            # 1. Recency score (exponential decay)
            hours_since_access = 0
            if memory.last_accessed:
                hours_since_access = (current_time - memory.last_accessed) / 3600
            recency_score = self.decay_factor ** hours_since_access
            
            # 2. Importance score (normalized to 0-1)
            importance_score = memory.importance / 10.0
            
            # 3. Relevance score (cosine similarity)
            relevance_score = 0.0
            if memory.embedding and query_embedding:
                relevance_score = self._cosine_similarity(
                    query_embedding, memory.embedding
                )
            
            # 4. Combined weighted score
            combined_score = (
                self.recency_weight * recency_score +
                self.relevance_weight * relevance_score +
                self.importance_weight * importance_score
            )
            
            scored.append((memory, combined_score))
        
        # Sort and return top-k
        scored.sort(key=lambda x: x[1], reverse=True)
        return [m for m, _ in scored[:top_k]]
    
    def _cosine_similarity(self, vec_a: List[float], vec_b: List[float]) -> float:
        """Calculate cosine similarity between two vectors."""
        dot = sum(a * b for a, b in zip(vec_a, vec_b))
        mag_a = math.sqrt(sum(a ** 2 for a in vec_a))
        mag_b = math.sqrt(sum(b ** 2 for b in vec_b))
        if mag_a == 0 or mag_b == 0:
            return 0.0
        return dot / (mag_a * mag_b)


class ImportanceScorer:
    """LLM-based importance scoring for memory items."""
    
    IMPORTANCE_PROMPT = """Rate the importance of the following event on a scale of 1-10.
    
1 = mundane (eating breakfast, walking)
5 = moderately significant (meeting a friend, starting a task)
10 = life-changing (major decision, significant achievement)

Event: {content}

Return only a single number between 1 and 10."""
    
    def __init__(self, llm_client):
        self.llm = llm_client
    
    def score_importance(self, content: str) -> float:
        """Use LLM to rate importance of a memory."""
        prompt = self.IMPORTANCE_PROMPT.format(content=content)
        try:
            response = self.llm.generate(prompt)
            score = float(response.strip())
            return max(1.0, min(10.0, score))
        except (ValueError, Exception):
            return 5.0  # Default moderate importance
```

**Integration Point:** Extend `MemoryItem` in `memory_base.py` and update `MemoryManager._score_memory()`.

---

### Pattern 2: Memory Type Classification

**Stanford Approach:**
Memories are classified as:
- **Events** - Observations of the world
- **Thoughts** - Self-generated reflections
- **Chats** - Conversations with other agents

**DevAll Current Implementation:**
No explicit memory type classification. All memories are treated uniformly.

**Proposed Enhancement for DevAll:**

```python
from enum import Enum
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

class MemoryType(Enum):
    OBSERVATION = "observation"  # External events perceived
    REFLECTION = "reflection"    # Self-generated insights
    PLAN = "plan"               # Future intentions
    CONVERSATION = "conversation"  # Inter-agent dialogue
    ACTION = "action"           # Agent's own actions


@dataclass
class TypedMemoryItem:
    """MemoryItem with Stanford-style type classification."""
    id: str
    content_summary: str
    memory_type: MemoryType
    metadata: Dict[str, Any]
    embedding: Optional[List[float]] = None
    timestamp: float | None = None
    importance: float = 5.0
    last_accessed: float | None = None
    
    # Type-specific fields
    evidence_ids: Optional[List[str]] = None  # For reflections: source memories
    plan_start: Optional[float] = None  # For plans: execution time
    plan_end: Optional[float] = None
    conversation_partners: Optional[List[str]] = None  # For conversations


class TypedMemoryStore:
    """Memory store with type-aware operations."""
    
    def __init__(self):
        self.memories: List[TypedMemoryItem] = []
    
    def add_observation(self, content: str, importance: float) -> TypedMemoryItem:
        """Add an observation memory."""
        item = TypedMemoryItem(
            id=self._generate_id(),
            content_summary=content,
            memory_type=MemoryType.OBSERVATION,
            importance=importance,
            timestamp=time.time(),
            last_accessed=time.time(),
            metadata={}
        )
        self.memories.append(item)
        return item
    
    def add_reflection(
        self,
        content: str,
        evidence_ids: List[str],
        importance: float
    ) -> TypedMemoryItem:
        """Add a reflection memory with evidence links."""
        item = TypedMemoryItem(
            id=self._generate_id(),
            content_summary=content,
            memory_type=MemoryType.REFLECTION,
            importance=importance,
            evidence_ids=evidence_ids,
            timestamp=time.time(),
            last_accessed=time.time(),
            metadata={}
        )
        self.memories.append(item)
        return item
    
    def add_plan(
        self,
        content: str,
        start_time: float,
        end_time: float,
        importance: float = 5.0
    ) -> TypedMemoryItem:
        """Add a plan memory."""
        item = TypedMemoryItem(
            id=self._generate_id(),
            content_summary=content,
            memory_type=MemoryType.PLAN,
            importance=importance,
            plan_start=start_time,
            plan_end=end_time,
            timestamp=time.time(),
            last_accessed=time.time(),
            metadata={}
        )
        self.memories.append(item)
        return item
    
    def get_by_type(self, memory_type: MemoryType) -> List[TypedMemoryItem]:
        """Retrieve all memories of a specific type."""
        return [m for m in self.memories if m.memory_type == memory_type]
```

**Integration Point:** Add `memory_type` field to `MemoryItem` in `memory_base.py`.

---

## Reflection Patterns

### Pattern 3: Importance-Based Reflection Triggering

**Stanford Approach:**
Reflection is triggered when accumulated importance reaches a threshold (default: 150), not by time.

```python
# Stanford code
if persona.scratch.importance_trigger_curr <= 0:
    run_reflection(persona)
    persona.scratch.importance_trigger_curr = importance_trigger_max
```

**DevAll Current Implementation:**
DevAll has a `SelfReflectionThinkingManager` that reflects after each generation, but:
- No importance-based triggering
- Reflection happens on every output, not accumulated experience
- No memory of past reflections

**Proposed Enhancement for DevAll:**

```python
from dataclasses import dataclass, field
from typing import List, Optional, Callable
import time

@dataclass
class ReflectionConfig:
    """Configuration for importance-based reflection."""
    importance_threshold: float = 150.0
    questions_count: int = 3
    insights_per_question: int = 5
    recent_memory_window: int = 100
    min_importance_for_reflection: float = 3.0


@dataclass
class ReflectionState:
    """Tracks reflection trigger state."""
    importance_accumulator: float = 0.0
    last_reflection_time: float = 0.0
    reflection_count: int = 0


class AccumulatedReflectionManager:
    """
    Stanford-style reflection triggered by accumulated importance.
    
    This can be integrated as a new ThinkingManager or as a
    standalone module that feeds into memory.
    """
    
    REFLECTION_QUESTIONS_PROMPT = """Based on the following recent experiences,
generate {n} high-level questions that would help someone reflect on patterns,
relationships, or themes in these events.

Recent experiences:
{experiences}

Return only the questions, one per line, numbered."""

    INSIGHT_GENERATION_PROMPT = """Question: {question}

Relevant context:
{context}

Based on the above context, generate {n} high-level insights or inferences.
These should be abstract conclusions that go beyond simply restating facts.

Return only the insights, one per line, numbered."""
    
    def __init__(
        self,
        config: ReflectionConfig,
        llm_client,
        embedding_func: Callable[[str], List[float]],
        memory_store
    ):
        self.config = config
        self.llm = llm_client
        self.embedding_func = embedding_func
        self.memory_store = memory_store
        self.state = ReflectionState()
    
    def process_observation(
        self,
        memory_item: TypedMemoryItem
    ) -> Optional[List[TypedMemoryItem]]:
        """
        Process a new observation and check if reflection should trigger.
        
        Returns:
            List of reflection memories if triggered, None otherwise
        """
        # Accumulate importance
        self.state.importance_accumulator += memory_item.importance
        
        # Check trigger condition
        if self.state.importance_accumulator >= self.config.importance_threshold:
            reflections = self._trigger_reflection()
            self.state.importance_accumulator = 0.0
            self.state.reflection_count += 1
            self.state.last_reflection_time = time.time()
            return reflections
        
        return None
    
    def _trigger_reflection(self) -> List[TypedMemoryItem]:
        """Execute the full reflection process."""
        # Step 1: Get recent memories
        recent_memories = self.memory_store.memories[
            -self.config.recent_memory_window:
        ]
        
        # Filter for significant memories only
        significant = [
            m for m in recent_memories
            if m.importance >= self.config.min_importance_for_reflection
        ]
        
        if not significant:
            return []
        
        # Step 2: Generate reflection questions
        questions = self._generate_questions(significant)
        
        # Step 3: Generate insights for each question
        all_reflections = []
        for question in questions:
            # Retrieve relevant memories for this question
            query_embedding = self.embedding_func(question)
            relevant = self._retrieve_relevant(query_embedding, top_k=20)
            
            # Generate insights
            insights = self._generate_insights(question, relevant)
            
            # Create reflection memories
            for insight in insights:
                reflection = TypedMemoryItem(
                    id=self._generate_id(),
                    content_summary=insight,
                    memory_type=MemoryType.REFLECTION,
                    importance=self._calculate_reflection_importance(insight),
                    evidence_ids=[m.id for m in relevant[:5]],
                    timestamp=time.time(),
                    last_accessed=time.time(),
                    metadata={"source_question": question}
                )
                self.memory_store.memories.append(reflection)
                all_reflections.append(reflection)
        
        return all_reflections
    
    def _generate_questions(
        self,
        memories: List[TypedMemoryItem]
    ) -> List[str]:
        """Generate high-level reflection questions."""
        experiences = "\n".join([
            f"[{m.memory_type.value}] {m.content_summary}"
            for m in memories[-20:]
        ])
        
        prompt = self.REFLECTION_QUESTIONS_PROMPT.format(
            n=self.config.questions_count,
            experiences=experiences
        )
        
        response = self.llm.generate(prompt)
        questions = self._parse_numbered_list(response)
        return questions[:self.config.questions_count]
    
    def _generate_insights(
        self,
        question: str,
        relevant_memories: List[TypedMemoryItem]
    ) -> List[str]:
        """Generate insights based on question and relevant memories."""
        context = "\n".join([m.content_summary for m in relevant_memories])
        
        prompt = self.INSIGHT_GENERATION_PROMPT.format(
            question=question,
            context=context,
            n=self.config.insights_per_question
        )
        
        response = self.llm.generate(prompt)
        insights = self._parse_numbered_list(response)
        return insights[:self.config.insights_per_question]
    
    def _retrieve_relevant(
        self,
        query_embedding: List[float],
        top_k: int
    ) -> List[TypedMemoryItem]:
        """Retrieve relevant memories using embedding similarity."""
        # Use existing SimpleMemory FAISS logic or implement custom
        scored = []
        for memory in self.memory_store.memories:
            if memory.embedding:
                sim = self._cosine_similarity(query_embedding, memory.embedding)
                scored.append((memory, sim))
        
        scored.sort(key=lambda x: x[1], reverse=True)
        return [m for m, _ in scored[:top_k]]
    
    def _calculate_reflection_importance(self, insight: str) -> float:
        """Reflections typically have higher importance."""
        # Could use LLM here; for now, default to high importance
        return 7.0
    
    def _parse_numbered_list(self, text: str) -> List[str]:
        """Parse numbered list from LLM response."""
        items = []
        for line in text.strip().split("\n"):
            if ". " in line:
                _, content = line.split(". ", 1)
                items.append(content.strip())
        return items
    
    def _cosine_similarity(self, a: List[float], b: List[float]) -> float:
        import math
        dot = sum(x * y for x, y in zip(a, b))
        mag_a = math.sqrt(sum(x ** 2 for x in a))
        mag_b = math.sqrt(sum(x ** 2 for x in b))
        return dot / (mag_a * mag_b) if mag_a and mag_b else 0.0
    
    def _generate_id(self) -> str:
        import uuid
        return str(uuid.uuid4())[:8]
```

**Integration Point:** Create new file `runtime/node/agent/thinking/accumulated_reflection.py` and register as new thinking mode.

---

### Pattern 4: Post-Action Reflection

**Stanford Approach:**
After conversations, agents generate two additional thoughts:
1. **Planning thought** - "For X's planning: ..."
2. **Memo thought** - Summary of the conversation

**DevAll Current Implementation:**
`SelfReflectionThinkingManager` reflects after generation, but does not:
- Store reflections in memory
- Generate planning thoughts
- Create memos for future reference

**Proposed Enhancement for DevAll:**

```python
from dataclasses import dataclass
from typing import List, Optional
from entity.messages import Message

@dataclass
class PostActionReflectionResult:
    """Result of post-action reflection."""
    planning_thought: str
    memo: str
    insights: List[str]


class PostActionReflector:
    """
    Generates post-action reflections inspired by Stanford's approach.
    
    This can be triggered after agent actions, conversations, or
    significant outputs.
    """
    
    PLANNING_THOUGHT_PROMPT = """Based on the following action/output,
generate a brief planning thought that could help guide future behavior.

Action/Output:
{action_content}

Context:
{context}

Format your response as a single sentence starting with "For future planning:""""

    MEMO_PROMPT = """Summarize the following action/output in a memo format
that can be stored for future reference.

Action/Output:
{action_content}

Context:
{context}

Format your response as a single sentence that captures the key point."""

    def __init__(self, llm_client, memory_store):
        self.llm = llm_client
        self.memory_store = memory_store
    
    def reflect_on_action(
        self,
        action_content: str,
        context: str,
        action_importance: float = 5.0
    ) -> PostActionReflectionResult:
        """
        Generate post-action reflection.
        
        Args:
            action_content: The action or output to reflect on
            context: Additional context (previous memories, etc.)
            action_importance: Importance of the action (affects storage)
        
        Returns:
            PostActionReflectionResult with planning thought and memo
        """
        # Generate planning thought
        planning_prompt = self.PLANNING_THOUGHT_PROMPT.format(
            action_content=action_content,
            context=context[:500]  # Limit context length
        )
        planning_thought = self.llm.generate(planning_prompt)
        
        # Generate memo
        memo_prompt = self.MEMO_PROMPT.format(
            action_content=action_content,
            context=context[:500]
        )
        memo = self.llm.generate(memo_prompt)
        
        # Store in memory if significant
        if action_importance >= 5.0:
            self._store_reflection(planning_thought, memo, action_importance)
        
        return PostActionReflectionResult(
            planning_thought=planning_thought,
            memo=memo,
            insights=[]
        )
    
    def reflect_on_conversation(
        self,
        messages: List[Message],
        partner_name: str,
        importance: float = 6.0
    ) -> PostActionReflectionResult:
        """
        Generate post-conversation reflection.
        
        Args:
            messages: List of conversation messages
            partner_name: Name of the conversation partner
            importance: Importance of the conversation
        
        Returns:
            PostActionReflectionResult with planning thought and memo
        """
        # Format conversation
        conversation_text = "\n".join([
            f"{msg.role.value}: {msg.text_content()}"
            for msg in messages
        ])
        
        # Generate planning thought
        planning_prompt = f"""Based on the following conversation with {partner_name},
generate a brief planning thought for future interactions.

Conversation:
{conversation_text}

Format your response as: "For future interactions with {partner_name}: ...\""""
        
        planning_thought = self.llm.generate(planning_prompt)
        
        # Generate memo
        memo_prompt = f"""Summarize the key points from this conversation with {partner_name}.

Conversation:
{conversation_text}

Format: "{partner_name} and I discussed...\""""
        
        memo = self.llm.generate(memo_prompt)
        
        # Store as conversation memory
        self._store_conversation_memory(
            partner_name, conversation_text, planning_thought, memo, importance
        )
        
        return PostActionReflectionResult(
            planning_thought=planning_thought,
            memo=memo,
            insights=[]
        )
    
    def _store_reflection(
        self,
        planning_thought: str,
        memo: str,
        importance: float
    ):
        """Store reflection in memory."""
        # Implementation depends on memory store structure
        pass
    
    def _store_conversation_memory(
        self,
        partner: str,
        conversation: str,
        planning_thought: str,
        memo: str,
        importance: float
    ):
        """Store conversation memory."""
        # Implementation depends on memory store structure
        pass
```

**Integration Point:** Extend `SelfReflectionThinkingManager` or create new thinking mode in `runtime/node/agent/thinking/`.

---

## Planning Patterns

### Pattern 5: Hierarchical Planning

**Stanford Approach:**
Three-level planning hierarchy:
1. **Daily Plan** - High-level goals for the day
2. **Hourly Schedule** - Decomposed into hour blocks
3. **Detailed Actions** - 5-15 minute action increments

**DevAll Current Implementation:**
No hierarchical planning. Agents respond reactively to inputs without long-term planning.

**Proposed Enhancement for DevAll:**

```python
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any
from enum import Enum
from datetime import datetime, timedelta
import time

class PlanLevel(Enum):
    STRATEGIC = "strategic"  # High-level goals (equivalent to daily)
    TACTICAL = "tactical"    # Medium-level tasks (equivalent to hourly)
    OPERATIONAL = "operational"  # Specific actions (equivalent to detailed)


@dataclass
class Plan:
    """Hierarchical plan structure."""
    id: str
    level: PlanLevel
    content: str
    start_time: float  # Unix timestamp
    end_time: float
    parent_id: Optional[str] = None
    children: List['Plan'] = field(default_factory=list)
    status: str = "pending"  # pending, in_progress, completed, cancelled
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def duration_minutes(self) -> float:
        return (self.end_time - self.start_time) / 60


class HierarchicalPlanner:
    """
    Stanford-style hierarchical planning for DevAll agents.
    
    This enables agents to maintain long-term goals and decompose
    them into actionable tasks.
    """
    
    STRATEGIC_PLAN_PROMPT = """Create a high-level plan for the following goal.

Agent Identity: {identity}
Goal: {goal}
Recent Context: {context}
Available until: {deadline}

Provide a brief strategic plan (2-3 sentences) describing the main activities."""

    TACTICAL_DECOMPOSITION_PROMPT = """Decompose the following strategic task into tactical subtasks.

Strategic Task: {strategic_task}
Time Available: {hours} hours
Agent Capabilities: {capabilities}

Format each subtask as:
[Start Time - End Time]: Subtask description"""

    OPERATIONAL_DECOMPOSITION_PROMPT = """Decompose the following tactical task into specific actions.

Tactical Task: {tactical_task}
Duration: {minutes} minutes
Current Context: {context}

Format each action as:
[Start - End]: Specific action (5-15 minute increments)"""

    REPLAN_PROMPT = """Current plan: {current_plan}
New observation: {observation}

Should the plan be adjusted? Consider:
1. Is this observation significant enough to warrant change?
2. Can the current plan accommodate this new information?
3. What would be a natural response?

If adjustment needed, provide updated plan. Otherwise respond with "KEEP CURRENT PLAN"."""
    
    def __init__(
        self,
        llm_client,
        memory_store,
        config: Optional[Dict[str, Any]] = None
    ):
        self.llm = llm_client
        self.memory_store = memory_store
        self.config = config or {}
        self.plans: List[Plan] = []
        self.current_plan: Optional[Plan] = None
    
    def create_strategic_plan(
        self,
        identity: str,
        goal: str,
        context: str,
        deadline: datetime
    ) -> Plan:
        """
        Create a high-level strategic plan.
        
        Args:
            identity: Agent's role/identity
            goal: The high-level goal to achieve
            context: Recent context from memory
            deadline: When the plan should be completed
        
        Returns:
            A strategic-level Plan
        """
        prompt = self.STRATEGIC_PLAN_PROMPT.format(
            identity=identity,
            goal=goal,
            context=context[:500],
            deadline=deadline.strftime("%Y-%m-%d %H:%M")
        )
        
        plan_content = self.llm.generate(prompt)
        
        plan = Plan(
            id=self._generate_id(),
            level=PlanLevel.STRATEGIC,
            content=plan_content,
            start_time=time.time(),
            end_time=deadline.timestamp(),
            metadata={"identity": identity, "goal": goal}
        )
        
        self.plans.append(plan)
        return plan
    
    def decompose_to_tactical(
        self,
        strategic_plan: Plan,
        capabilities: List[str]
    ) -> List[Plan]:
        """
        Decompose a strategic plan into tactical subtasks.
        
        Args:
            strategic_plan: The high-level plan to decompose
            capabilities: Agent's available capabilities/tools
        
        Returns:
            List of tactical Plans
        """
        duration_hours = strategic_plan.duration_minutes() / 60
        
        prompt = self.TACTICAL_DECOMPOSITION_PROMPT.format(
            strategic_task=strategic_plan.content,
            hours=duration_hours,
            capabilities=", ".join(capabilities)
        )
        
        response = self.llm.generate(prompt)
        tactical_plans = self._parse_tactical_response(
            response, strategic_plan
        )
        
        strategic_plan.children = tactical_plans
        self.plans.extend(tactical_plans)
        
        return tactical_plans
    
    def decompose_to_operational(
        self,
        tactical_plan: Plan,
        context: str
    ) -> List[Plan]:
        """
        Decompose a tactical plan into operational actions.
        
        Args:
            tactical_plan: The tactical plan to decompose
            context: Current context
        
        Returns:
            List of operational Plans
        """
        duration_minutes = tactical_plan.duration_minutes()
        
        prompt = self.OPERATIONAL_DECOMPOSITION_PROMPT.format(
            tactical_task=tactical_plan.content,
            minutes=duration_minutes,
            context=context[:300]
        )
        
        response = self.llm.generate(prompt)
        operational_plans = self._parse_operational_response(
            response, tactical_plan
        )
        
        tactical_plan.children = operational_plans
        self.plans.extend(operational_plans)
        
        return operational_plans
    
    def get_current_action(self) -> Optional[Plan]:
        """
        Get the current operational action to execute.
        
        Uses lazy decomposition - only decomposes when needed.
        """
        current_time = time.time()
        
        # Find applicable tactical plan
        for plan in self.plans:
            if (plan.level == PlanLevel.TACTICAL and
                plan.start_time <= current_time <= plan.end_time):
                
                # Lazy decomposition: decompose only if no children
                if not plan.children:
                    self.decompose_to_operational(plan, "")
                
                # Find current operational action
                for op in plan.children:
                    if (op.start_time <= current_time <= op.end_time and
                        op.status == "pending"):
                        op.status = "in_progress"
                        self.current_plan = op
                        return op
        
        return None
    
    def should_replan(
        self,
        observation: str,
        observation_importance: float
    ) -> bool:
        """
        Determine if re-planning is needed based on observation.
        
        Stanford triggers replanning for high-importance observations (>7.0).
        """
        return observation_importance >= 7.0
    
    def replan(
        self,
        observation: str,
        current_plan: Plan
    ) -> Optional[Plan]:
        """
        Potentially adjust plan based on new observation.
        
        Args:
            observation: The new observation
            current_plan: The current plan being executed
        
        Returns:
            Updated plan if changed, None if keeping current
        """
        prompt = self.REPLAN_PROMPT.format(
            current_plan=current_plan.content,
            observation=observation
        )
        
        response = self.llm.generate(prompt)
        
        if "KEEP CURRENT PLAN" in response:
            return None
        
        # Create updated plan
        updated = Plan(
            id=self._generate_id(),
            level=current_plan.level,
            content=response,
            start_time=current_plan.start_time,
            end_time=current_plan.end_time,
            parent_id=current_plan.parent_id,
            metadata={"replan_reason": observation}
        )
        
        current_plan.status = "cancelled"
        self.plans.append(updated)
        
        return updated
    
    def _parse_tactical_response(
        self,
        response: str,
        parent: Plan
    ) -> List[Plan]:
        """Parse tactical decomposition response."""
        plans = []
        lines = response.strip().split("\n")
        
        for line in lines:
            if "[" in line and "]:" in line:
                # Parse time range and content
                time_part, content = line.split("]:", 1)
                time_part = time_part.strip("[")
                
                # Simple parsing - in production, use proper datetime parsing
                plans.append(Plan(
                    id=self._generate_id(),
                    level=PlanLevel.TACTICAL,
                    content=content.strip(),
                    start_time=parent.start_time,  # Simplified
                    end_time=parent.end_time,
                    parent_id=parent.id
                ))
        
        return plans
    
    def _parse_operational_response(
        self,
        response: str,
        parent: Plan
    ) -> List[Plan]:
        """Parse operational decomposition response."""
        # Similar to tactical parsing
        return self._parse_tactical_response(response, parent)
    
    def _generate_id(self) -> str:
        import uuid
        return str(uuid.uuid4())[:8]


class PlanningAwareAgent:
    """
    Example integration of HierarchicalPlanner with DevAll agents.
    
    This shows how to add planning capabilities to existing agent nodes.
    """
    
    def __init__(
        self,
        agent_config,
        llm_client,
        memory_store
    ):
        self.config = agent_config
        self.llm = llm_client
        self.memory = memory_store
        self.planner = HierarchicalPlanner(llm_client, memory_store)
    
    def step(self, observation: str, observation_importance: float = 5.0):
        """
        Execute one step of the planning-aware agent loop.
        
        This mirrors Stanford's agent loop: perceive -> plan -> execute
        """
        # 1. Check if we need to create a new strategic plan
        if not self._has_active_plan():
            self._create_new_plan(observation)
        
        # 2. Check for re-planning based on observation
        if self.planner.should_replan(observation, observation_importance):
            current = self.planner.current_plan
            if current:
                self.planner.replan(observation, current)
        
        # 3. Get current action
        action = self.planner.get_current_action()
        
        if action:
            # 4. Execute action
            result = self._execute_action(action)
            
            # 5. Mark as completed
            action.status = "completed"
            
            return result
        
        return None
    
    def _has_active_plan(self) -> bool:
        """Check if there's an active strategic plan."""
        current_time = time.time()
        return any(
            p.level == PlanLevel.STRATEGIC and
            p.status == "pending" and
            p.end_time > current_time
            for p in self.planner.plans
        )
    
    def _create_new_plan(self, context: str):
        """Create a new strategic plan based on context."""
        from datetime import datetime, timedelta
        
        deadline = datetime.now() + timedelta(hours=8)  # 8-hour planning horizon
        
        self.planner.create_strategic_plan(
            identity=self.config.get("role", "Agent"),
            goal=self.config.get("goal", "Complete assigned tasks"),
            context=context,
            deadline=deadline
        )
    
    def _execute_action(self, action: Plan) -> str:
        """Execute an operational action."""
        # This would integrate with DevAll's existing agent execution
        return f"Executed: {action.content}"
```

**Integration Point:** Create new file `runtime/node/agent/planning/hierarchical_planner.py` and integrate with agent execution flow.

---

### Pattern 6: Lazy Decomposition

**Stanford Approach:**
Plans are only decomposed when needed (typically 2 hours ahead), not all at once. This saves LLM calls and allows for dynamic adjustment.

**Proposed Enhancement for DevAll:**

```python
class LazyDecompositionMixin:
    """
    Mixin for lazy plan decomposition.
    
    Integrates with HierarchicalPlanner to only decompose plans
    when they are about to be executed.
    """
    
    DECOMPOSITION_HORIZON_HOURS = 2  # Only decompose 2 hours ahead
    
    def get_or_create_operational_plan(
        self,
        tactical_plan: Plan,
        current_time: float
    ) -> List[Plan]:
        """
        Get operational plans, creating them if within decomposition horizon.
        
        Args:
            tactical_plan: The tactical plan to potentially decompose
            current_time: Current timestamp
        
        Returns:
            List of operational plans (may be empty if not yet decomposed)
        """
        if tactical_plan.children:
            return tactical_plan.children
        
        # Check if within decomposition horizon
        horizon = current_time + (self.DECOMPOSITION_HORIZON_HOURS * 3600)
        
        if tactical_plan.start_time <= horizon:
            # Within horizon, decompose now
            return self.decompose_to_operational(tactical_plan, "")
        
        # Not yet within horizon, return empty
        return []
```

**Integration Point:** Add to `HierarchicalPlanner` class.

---

## Integration Points

### Existing DevAll Architecture

```
DevAll Current Structure:
├── entity/
│   └── configs/
│       └── node/
│           ├── memory.py          # MemoryAttachmentConfig
│           └── thinking.py        # ThinkingConfig
├── runtime/
│   └── node/
│       └── agent/
│           ├── memory/
│           │   ├── memory_base.py     # MemoryBase, MemoryItem
│           │   ├── simple_memory.py   # SimpleMemory (FAISS)
│           │   └── rlm_memory.py      # RLM-enhanced memory
│           └── thinking/
│               ├── thinking_manager.py    # ThinkingManagerBase
│               └── self_reflection.py     # SelfReflectionThinkingManager
```

### Proposed Additions

```
Proposed Structure:
├── entity/
│   └── configs/
│       └── node/
│           ├── memory.py          # Add: importance, memory_type fields
│           └── planning.py        # NEW: PlanningConfig
├── runtime/
│   └── node/
│       └── agent/
│           ├── memory/
│           │   ├── memory_base.py     # Extend MemoryItem
│           │   ├── weighted_retrieval.py  # NEW: Stanford-style scoring
│           │   └── typed_memory.py       # NEW: MemoryType classification
│           ├── thinking/
│           │   ├── thinking_manager.py
│           │   ├── self_reflection.py
│           │   └── accumulated_reflection.py  # NEW: Importance-based
│           └── planning/               # NEW DIRECTORY
│               ├── hierarchical_planner.py
│               ├── plan.py             # Plan dataclass
│               └── registry.py         # Planning mode registration
```

### Configuration Changes

**Memory Configuration:**
```yaml
memory:
  - name: enhanced_memory
    type: simple
    config:
      memory_path: WareHouse/agent/memory.json
      embedding:
        provider: openai
        model: text-embedding-3-small
      # NEW: Enable importance scoring
      importance_scoring: true
      # NEW: Memory type classification
      classify_memories: true
```

**Agent Configuration with Planning:**
```yaml
nodes:
  - id: planning_agent
    type: agent
    config:
      provider: openai
      model: gpt-4o
      prompt_template: planning_agent
      # NEW: Planning configuration
      planning:
        enabled: true
        mode: hierarchical
        strategic_horizon_hours: 8
        decomposition_horizon_hours: 2
      # Enhanced memory with importance
      memories:
        - name: enhanced_memory
          read: true
          write: true
          top_k: 10
          # NEW: Retrieval weights
          retrieval_weights:
            recency: 0.5
            relevance: 3.0
            importance: 2.0
```

---

## Implementation Roadmap

### Phase 1: Memory Enhancements (High Priority)

1. **Add importance scoring to MemoryItem**
   - File: `entity/configs/node/memory.py`
   - Add `importance: float` field with default 5.0
   - Add `last_accessed: float` field

2. **Implement importance scorer**
   - File: `runtime/node/agent/memory/importance_scorer.py`
   - LLM-based importance assignment
   - Integration with memory update flow

3. **Implement weighted retrieval**
   - File: `runtime/node/agent/memory/weighted_retrieval.py`
   - Stanford-style weighted scoring
   - Integration with `MemoryManager._score_memory()`

### Phase 2: Reflection Enhancements (High Priority)

4. **Implement accumulated reflection trigger**
   - File: `runtime/node/agent/thinking/accumulated_reflection.py`
   - Importance-based triggering
   - Register as new thinking mode

5. **Extend SelfReflectionThinkingManager**
   - Store reflections in memory
   - Add post-action reflection hook

### Phase 3: Planning System (Medium Priority)

6. **Create planning module structure**
   - Directory: `runtime/node/agent/planning/`
   - `plan.py` - Plan dataclass
   - `hierarchical_planner.py` - Main planner
   - `registry.py` - Registration system

7. **Implement hierarchical planning**
   - Strategic, tactical, operational levels
   - Lazy decomposition
   - Dynamic re-planning

8. **Integrate planning with agent execution**
   - Add planning hooks to agent execution flow
   - Configuration support in YAML

### Phase 4: Integration and Testing

9. **Update documentation**
   - Extend `docs/user_guide/en/modules/memory.md`
   - Create `docs/user_guide/en/modules/planning.md`

10. **Write tests**
    - Unit tests for each new component
    - Integration tests with existing agents

---

## Summary

### Patterns Already in DevAll

| Pattern | DevAll Implementation | Notes |
|---------|----------------------|-------|
| Memory persistence | SimpleMemory, FileMemory | JSON-based, FAISS indexing |
| Embedding-based retrieval | SimpleMemory.retrieve() | Uses FAISS cosine similarity |
| Post-generation reflection | SelfReflectionThinkingManager | Reflects on output, but not stored |
| Memory attachments | MemoryAttachmentConfig | Per-node memory configuration |

### Patterns to Add

| Pattern | Effort | Impact | Dependencies |
|---------|--------|--------|--------------|
| Importance scoring | Low | High | LLM client |
| Weighted retrieval | Low | High | Importance scoring |
| Memory type classification | Low | Medium | None |
| Accumulated reflection | Medium | High | Importance scoring |
| Post-action reflection | Medium | Medium | Memory storage |
| Hierarchical planning | High | High | All above |

### Recommended Starting Point

1. **First:** Add importance scoring to `MemoryItem` - unlocks weighted retrieval and reflection triggers
2. **Second:** Implement weighted retrieval in `MemoryManager._score_memory()`
3. **Third:** Create `AccumulatedReflectionManager` as new thinking mode

These three changes provide the foundation for more sophisticated agent behavior without major architectural changes.

---

## Related Papers and Analysis

### Comparative Analysis Documents
- **Memory Architecture Comparison**: [comparison-memory-architectures.md](./comparison-memory-architectures.md) - Detailed comparison of Stanford Memory Stream with DevAll memory systems
- **Planning Comparison**: [comparison-planning.md](./comparison-planning.md) - Analysis of hierarchical planning approaches across frameworks
- **Communication Comparison**: [comparison-communication.md](./comparison-communication.md) - Inter-agent communication protocol comparison
- **Gap Analysis**: [gap-analysis.md](./gap-analysis.md) - Consolidated gap analysis with prioritized roadmap
- **Literature Review**: [literature-review-synthesis.md](./literature-review-synthesis.md) - Academic synthesis of multi-agent systems

### Related Stanford Documentation
- **Research Summary**: [stanford-generative-agents-summary.md](./stanford-generative-agents-summary.md)
- **Architecture Documentation**: [stanford-generative-agents-architecture.md](./stanford-generative-agents-architecture.md)
- **Repository Analysis**: [stanford-generative-agents-repo-analysis.md](./stanford-generative-agents-repo-analysis.md)
- **Critical Review**: [stanford-generative-agents-critique.md](./stanford-generative-agents-critique.md)
- **Community Implementations**: [stanford-generative-agents-community.md](./stanford-generative-agents-community.md)

### Modern Multi-Agent Framework Papers
- **ChatDev**: [papers/chatdev-summary.md](./papers/chatdev-summary.md) - Chat-powered software development with chat chains and communicative dehallucination
- **AutoGen**: [papers/autogen-summary.md](./papers/autogen-summary.md) - Conversational multi-agent framework with human-in-the-loop support
- **MetaGPT**: [papers/metagpt-summary.md](./papers/metagpt-summary.md) - SOP-based software development with role specialization
- **CAMEL**: [papers/camel-summary.md](./papers/camel-summary.md) - Role-playing collaborative framework for problem-solving
- **AgentVerse**: [papers/agentverse-summary.md](./papers/agentverse-summary.md) - Emergent collaborative behaviors in expert agent groups

### Classic Multi-Agent Foundations
- **BDI Architecture**: [papers/classic/bdi-architecture-summary.md](./papers/classic/bdi-architecture-summary.md) - Belief-desire-intention theoretical foundation
- **Jason (AgentSpeak)**: [papers/classic/bdi-agentspeak-jason-summary.md](./papers/classic/bdi-agentspeak-jason-summary.md) - Practical BDI implementation
- **GOAL**: [papers/classic/goal-summary.md](./papers/classic/goal-summary.md) - Declarative goal-based agent programming
- **2APL**: [papers/classic/2apl-summary.md](./papers/classic/2apl-summary.md) - Hybrid BDI programming language
- **Communication Protocols**: [papers/classic/communication-protocols-summary.md](./papers/classic/communication-protocols-summary.md) - FIPA-ACL and KQML speech act protocols

### Key Insights from Related Papers

#### Memory Architecture Insights (from [comparison-memory-architectures.md](./comparison-memory-architectures.md))
- Stanford's three-factor retrieval (recency + importance + relevance) is SOTA approach
- MemGPT's OS-inspired hierarchical memory overcomes context limits
- DevAll's multimodal support and programmatic exploration are unique strengths
- **Key Gap**: DevAll lacks automatic reflection synthesis (see [gap-analysis.md](./gap-analysis.md#11-no-automatic-reflection-synthesis))

#### Planning Insights (from [comparison-planning.md](./comparison-planning.md))
- Stanford uses hierarchical reflection-based planning (daily → hourly → detailed)
- AutoGen uses conversation-driven planning
- MetaGPT uses SOP-based sequential planning
- BDI uses plan libraries with deliberation
- **Key Gap**: DevAll lacks dynamic re-planning and temporal reasoning (see [gap-analysis.md](./gap-analysis.md#21-no-automatic-re-planning))

#### Communication Insights (from [comparison-communication.md](./comparison-communication.md))
- FIPA-ACL and KQML provide formal speech act semantics
- ChatDev uses chat chains for structured dialogue
- DevAll's edge-based message routing is unique but lacks conversation tracking
- **Key Gap**: DevAll lacks formal protocol specification (see [gap-analysis.md](./gap-analysis.md#31-no-conversation-id-tracking))

## References

- Stanford Paper: https://arxiv.org/abs/2304.03442
- Stanford Repository: https://github.com/joonspk-research/generative_agents
- DevAll Memory Module: `docs/user_guide/en/modules/memory.md`
- Bibliography: [bibliography.md](./bibliography.md) - Complete bibliography of multi-agent systems papers
