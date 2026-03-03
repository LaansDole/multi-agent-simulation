# Stanford Generative Agents Repository Analysis

**Repository:** https://github.com/joonspk-research/generative_agents  
**Paper:** "Generative Agents: Interactive Simulacra of Human Behavior" (arXiv:2304.03442)  
**Analysis Date:** February 27, 2026  
**Stars:** 20.7k+ | **Forks:** 2.9k+ | **License:** Apache-2.0

---

## Table of Contents

1. [Repository Structure](#repository-structure)
2. [Core Agent Class Implementation](#core-agent-class-implementation)
3. [Memory Stream Implementation](#memory-stream-implementation)
4. [Reflection Module](#reflection-module)
5. [Planning Module](#planning-module)
6. [Smallville Environment](#smallville-environment)
7. [Paper vs Code Discrepancies](#paper-vs-code-discrepancies)
8. [Key Takeaways](#key-takeaways)

---

## Repository Structure

```
generative_agents/
├── reverie/                          # Core simulation engine
│   └── backend_server/
│       ├── reverie.py                # Main simulation server (ReverieServer class)
│       ├── maze.py                   # 2D world map representation
│       ├── path_finder.py            # A* pathfinding algorithm
│       ├── global_methods.py         # Utility functions
│       ├── utils.py                  # Configuration (API keys, paths)
│       │
│       └── persona/                  # Agent implementation
│           ├── persona.py            # Core Persona (Agent) class
│           │
│           ├── memory_structures/    # Memory modules
│           │   ├── spatial_memory.py     # Spatial memory tree
│           │   ├── associative_memory/   # Memory stream (long-term memory)
│           │   └── scratch.py            # Short-term working memory
│           │
│           └── cognitive_modules/    # Cognitive functions
│               ├── perceive.py       # Perception module
│               ├── retrieve.py       # Memory retrieval
│               ├── reflect.py        # Reflection module
│               ├── plan.py           # Planning module
│               ├── execute.py        # Action execution
│               └── converse.py       # Conversation system
│
├── environment/
│   └── frontend_server/              # Django web server
│       ├── manage.py                 # Django management
│       ├── static_dirs/assets/       # Game assets (sprites, tiles)
│       │   └── the_ville/            # Smallville map data
│       ├── storage/                  # Saved simulations
│       └── compressed_storage/       # Demo recordings
│
├── requirements.txt                  # Python dependencies
└── README.md                         # Setup instructions
```

### Key Files Summary

| File | Purpose | Lines |
|------|---------|-------|
| `reverie.py` | Main simulation orchestrator | ~400 |
| `persona.py` | Agent class definition | ~200 |
| `plan.py` | Planning and scheduling | ~800 |
| `reflect.py` | Reflection and insight generation | ~200 |
| `retrieve.py` | Memory retrieval scoring | ~200 |
| `perceive.py` | Event perception | ~150 |
| `execute.py` | Action execution and movement | ~150 |
| `scratch.py` | Working memory state | ~400 |
| `maze.py` | World map management | ~350 |

---

## Core Agent Class Implementation

### Persona Class (`persona/persona.py`)

The `Persona` class is the central agent implementation. Key components:

```python
class Persona:
    def __init__(self, name, folder_mem_saved=False):
        self.name = name
        
        # Memory systems
        self.s_mem = MemoryTree(f_s_mem_saved)      # Spatial memory
        self.a_mem = AssociativeMemory(f_a_mem_saved)  # Associative/memory stream
        self.scratch = Scratch(scratch_saved)       # Working memory

    def move(self, maze, personas, curr_tile, curr_time):
        """Main cognitive loop - called each simulation step"""
        # 1. Update current state
        self.scratch.curr_tile = curr_tile
        self.scratch.curr_time = curr_time
        
        # 2. Main cognitive sequence
        perceived = self.perceive(maze)      # Perceive environment
        retrieved = self.retrieve(perceived) # Retrieve relevant memories
        plan = self.plan(maze, personas, new_day, retrieved)  # Plan actions
        self.reflect()                        # Reflect if triggered
        
        # 3. Execute movement
        return self.execute(maze, personas, plan)
```

### Terminology Note

The code uses different terms than the paper:
- **"Persona"** = Generative Agent
- **"Associative Memory"** = Memory Stream
- **"Reverie"** = The overarching simulation framework
- **"Scratch"** = Working/short-term memory

---

## Memory Stream Implementation

### Associative Memory (`persona/memory_structures/associative_memory/`)

The memory stream stores three types of memories:

1. **Events** - Observations of the world
2. **Thoughts** - Self-generated reflections
3. **Chats** - Conversations with other agents

### Concept Node Structure

Each memory is stored as a `ConceptNode` with:

```python
# Core attributes
node_id: str           # Unique identifier (e.g., "node_123")
node_type: str         # "event", "thought", or "chat"
created: datetime      # When the memory was formed
expiration: datetime   # When memory expires (30 days default)

# Content (subject-predicate-object triple)
subject: str           # e.g., "Isabella Rodriguez"
predicate: str         # e.g., "is", "chat with", "plan"
object: str            # e.g., "idle", "Maria Lopez"

# Metadata
description: str       # Full text description
keywords: set          # Extracted keywords for retrieval
poignancy: int         # Importance score (1-10)
embedding_key: str     # Key for embedding lookup
evidence: list         # Supporting node IDs (for thoughts)
```

### Memory Retrieval Algorithm (`cognitive_modules/retrieve.py`)

The retrieval function combines three scoring factors:

```python
def new_retrieve(persona, focal_points, n_count=30):
    """
    Retrieves relevant memories using weighted scoring.
    
    Final score = recency_w * recency * 0.5 
                + relevance_w * relevance * 3 
                + importance_w * importance * 2
    """
    for focal_pt in focal_points:
        nodes = get_all_nodes_sorted_by_access_time()
        
        # Calculate component scores
        recency_out = extract_recency(persona, nodes)      # Time decay
        importance_out = extract_importance(persona, nodes) # Poignancy
        relevance_out = extract_relevance(persona, nodes, focal_pt)  # Embedding similarity
        
        # Normalize each to [0, 1]
        recency_out = normalize_dict_floats(recency_out, 0, 1)
        importance_out = normalize_dict_floats(importance_out, 0, 1)
        relevance_out = normalize_dict_floats(relevance_out, 0, 1)
        
        # Combine with weights (gw = [0.5, 3, 2])
        master_out = {}
        for key in recency_out.keys():
            master_out[key] = (recency_w * recency_out[key] * 0.5
                             + relevance_w * relevance_out[key] * 3
                             + importance_w * importance_out[key] * 2)
        
        # Return top n_count nodes
        return top_highest_x_values(master_out, n_count)
```

### Recency Calculation

```python
def extract_recency(persona, nodes):
    """
    Recency uses exponential decay: 0.995^(hours_since_access)
    Paper states 0.99 decay, code uses configurable recency_decay
    """
    recency_vals = [persona.scratch.recency_decay ** i 
                    for i in range(1, len(nodes) + 1)]
    # Most recent nodes get highest scores
```

### Relevance Calculation

```python
def extract_relevance(persona, nodes, focal_pt):
    """
    Uses cosine similarity between node embeddings and focal point embedding.
    """
    focal_embedding = get_embedding(focal_pt)
    for node in nodes:
        node_embedding = persona.a_mem.embeddings[node.embedding_key]
        relevance = cos_sim(node_embedding, focal_embedding)
```

---

## Reflection Module

### Reflection Trigger (`cognitive_modules/reflect.py`)

Reflection is triggered when accumulated importance reaches threshold:

```python
def reflection_trigger(persona):
    """
    Trigger reflection when accumulated importance <= 0.
    
    Default threshold: importance_trigger_max = 150
    Each event subtracts its poignancy from importance_trigger_curr.
    """
    if (persona.scratch.importance_trigger_curr <= 0 
        and persona.a_mem has events/thoughts):
        return True
    return False

# After each event perception:
persona.scratch.importance_trigger_curr -= event_poignancy
persona.scratch.importance_ele_n += 1
```

### Reflection Process

```python
def run_reflect(persona):
    """
    1. Generate focal points from recent high-importance memories
    2. Retrieve relevant nodes for each focal point
    3. Generate insights with GPT
    4. Store new thoughts in memory
    """
    # Step 1: Generate 3 focal points
    focal_points = generate_focal_points(persona, n=3)
    
    # Step 2: Retrieve relevant memories
    retrieved = new_retrieve(persona, focal_points)
    
    # Step 3: For each focal point, generate insights
    for focal_pt, nodes in retrieved.items():
        thoughts = generate_insights_and_evidence(persona, nodes, n=5)
        
        for thought, evidence in thoughts.items():
            # Create new thought node
            persona.a_mem.add_thought(
                created, expiration, s, p, o,
                thought, keywords, thought_poignancy,
                thought_embedding_pair, evidence
            )
```

### Post-Conversation Reflection

The code also includes automatic reflection after conversations:

```python
def reflect(persona):
    # ... main reflection ...
    
    # After conversation ends, generate two thoughts:
    if persona.scratch.chatting_end_time == curr_time:
        all_utt = format_conversation(persona.scratch.chat)
        
        # 1. Planning thought: "For X's planning: ..."
        planning_thought = generate_planning_thought_on_convo(persona, all_utt)
        
        # 2. Memo thought: "X <summary of conversation>"
        memo_thought = generate_memo_on_convo(persona, all_utt)
        
        # Add both to memory
        persona.a_mem.add_thought(...)
```

---

## Planning Module

### Hierarchical Planning (`cognitive_modules/plan.py`)

Planning occurs at multiple levels:

```
1. Long-term Planning (Daily)
   └── generate_first_daily_plan() - Broad daily requirements
       └── generate_hourly_schedule() - Hour-by-hour breakdown
           └── generate_task_decomp() - 5-15 minute detailed actions
```

### Long-Term Planning (New Day)

```python
def _long_term_planning(persona, new_day):
    """
    Called at the start of each new day.
    """
    # 1. Determine wake-up hour
    wake_up_hour = generate_wake_up_hour(persona)
    
    # 2. Generate daily requirements
    if new_day == "First day":
        persona.scratch.daily_req = generate_first_daily_plan(persona, wake_up_hour)
    elif new_day == "New day":
        revise_identity(persona)  # Update based on recent events
        
    # 3. Create hourly schedule
    persona.scratch.f_daily_schedule = generate_hourly_schedule(persona, wake_up_hour)
    
    # 4. Store original hourly for reference
    persona.scratch.f_daily_schedule_hourly_org = persona.scratch.f_daily_schedule[:]
    
    # 5. Add plan to memory
    persona.a_mem.add_thought(
        f"This is {name}'s plan for {date}: {daily_req}"
    )
```

### Hourly Schedule Generation

```python
def generate_hourly_schedule(persona, wake_up_hour):
    """
    Creates schedule in format: [['sleeping', 360], ['waking up...', 60], ...]
    Total should equal 1440 minutes (24 hours).
    """
    for each hour:
        if before wake_up_hour:
            activity = "sleeping"
        else:
            activity = run_gpt_prompt_generate_hourly_schedule(
                persona, curr_hour_str, previous_activities
            )
    
    # Compress consecutive same activities
    # Expand hours to minutes (multiply by 60)
    return hourly_compressed  # e.g., [['sleeping', 360], ['eating', 60], ...]
```

### Task Decomposition

```python
def generate_task_decomp(persona, task, duration):
    """
    Decompose hour-long tasks into 5-15 minute subtasks.
    
    Example input:  task="waking up and morning routine", duration=60
    Example output: [['going to bathroom', 5], ['getting dressed', 5], 
                     ['eating breakfast', 15], ['checking email', 5], ...]
    """
    return run_gpt_prompt_task_decomp(persona, task, duration)
```

### Action Determination

```python
def _determine_action(persona, maze):
    """
    Determine the next concrete action for the persona.
    """
    # Get current schedule index
    curr_index = persona.scratch.get_f_daily_schedule_index()
    
    # Decompose if needed (look ahead 60 minutes)
    if action_duration >= 60 and not sleeping:
        persona.scratch.f_daily_schedule[curr_index:curr_index+1] = (
            generate_task_decomp(persona, act_desp, act_dura)
        )
    
    # Get current action
    act_desp, act_dura = persona.scratch.f_daily_schedule[curr_index]
    
    # Determine location
    act_world = maze.access_tile(persona.scratch.curr_tile)["world"]
    act_sector = generate_action_sector(act_desp, persona, maze)
    act_arena = generate_action_arena(act_desp, persona, maze, act_world, act_sector)
    act_game_object = generate_action_game_object(act_desp, act_address, persona, maze)
    
    # Generate action details
    act_pronunciatio = generate_action_pronunciatio(act_desp, persona)  # Emoji
    act_event = generate_action_event_triple(act_desp, persona)  # (s, p, o)
    act_obj_description = generate_act_obj_desc(act_game_object, act_desp, persona)
    
    # Add to scratch
    persona.scratch.add_new_action(new_address, act_dura, act_desp, ...)
```

### Reaction to Events

```python
def _should_react(persona, retrieved, personas):
    """
    Determine how to react to perceived events.
    Returns: "chat with {name}", "wait: {time}", or False
    """
    curr_event = retrieved["curr_event"]
    
    if curr_event.subject is another_persona:
        # Check if should talk
        if lets_talk(persona, target_persona, retrieved):
            return f"chat with {curr_event.subject}"
        
        # Check if should wait/react
        if lets_react(persona, target_persona, retrieved):
            return "wait: {until_target_finishes}"
    
    return False
```

### Re-Planning on Disruption

```python
def _create_react(persona, inserted_act, inserted_act_dur, ...):
    """
    When an event disrupts the schedule, re-plan the affected time block.
    """
    # Get affected time range (2 hours typically)
    start_hour, end_hour = get_affected_hours()
    
    # Generate new decomposed schedule for that block
    new_schedule = generate_new_decomp_schedule(
        persona, inserted_act, inserted_act_dur, start_hour, end_hour
    )
    
    # Replace affected portion of daily schedule
    persona.scratch.f_daily_schedule[start_index:end_index] = new_schedule
```

---

## Smallville Environment

### Maze Class (`maze.py`)

The world is represented as a 2D tile-based map:

```python
class Maze:
    def __init__(self, maze_name):
        # Map dimensions (e.g., 70 x 40 tiles)
        self.maze_width = 70
        self.maze_height = 40
        self.sq_tile_size = 32  # pixels per tile
        
        # Tile matrix with hierarchical addressing
        # Each tile has: world, sector, arena, game_object, collision, events
        self.tiles[row][col] = {
            'world': 'the Ville',
            'sector': 'Harvey Oak Supply Store',
            'arena': 'store',
            'game_object': 'shelf',
            'collision': False,
            'events': set()  # Active events on this tile
        }
        
        # Reverse lookup: address -> set of tile coordinates
        self.address_tiles = {
            'the Ville:Harvey Oak Supply Store:store:shelf': {(50, 30), (51, 30)}
        }
```

### Tile Hierarchy

```
World (the Ville)
├── Sector (e.g., Harvey Oak Supply Store)
│   ├── Arena (e.g., store, bedroom)
│   │   └── Game Object (e.g., shelf, bed, stove)
```

### Environment Files

The environment data is stored in CSV files from the Tiled map editor:

```
environment/frontend_server/static_dirs/assets/the_ville/
├── matrix/
│   ├── maze/
│   │   ├── collision_maze.csv      # Walkable vs blocked tiles
│   │   ├── sector_maze.csv         # Sector assignments
│   │   ├── arena_maze.csv          # Arena assignments
│   │   └── game_object_maze.csv    # Object placements
│   ├── special_blocks/
│   │   ├── world_blocks.csv
│   │   ├── sector_blocks.csv
│   │   ├── arena_blocks.csv
│   │   └── game_object_blocks.csv
│   └── maze_meta_info.json
└── visuals/
    └── ... (tile images, character sprites)
```

### Perception System

```python
def perceive(persona, maze):
    """
    Perceives events within vision radius.
    """
    # Get nearby tiles within vision_r (default: 4 tiles)
    nearby_tiles = maze.get_nearby_tiles(persona.scratch.curr_tile, 
                                         persona.scratch.vision_r)
    
    # Update spatial memory
    for tile in nearby_tiles:
        # Add world/sector/arena/game_object to spatial memory tree
        persona.s_mem.tree[world][sector][arena] += [game_objects]
    
    # Perceive events (limited by att_bandwidth, default: 3)
    events_in_arena = get_events_in_same_arena(nearby_tiles)
    perceived_events = events_in_arena[:persona.scratch.att_bandwidth]
    
    # Filter out recently perceived (retention, default: 5)
    latest_events = persona.a_mem.get_summarized_latest_events(retention)
    new_events = [e for e in perceived_events if e not in latest_events]
    
    # Add new events to memory
    for event in new_events:
        poignancy = generate_poig_score(persona, "event", description)
        persona.a_mem.add_event(...)
        persona.scratch.importance_trigger_curr -= poignancy
    
    return new_events
```

### Frontend Server (Django)

The frontend is a Django web application providing:
- **Visual simulation viewer** at `http://localhost:8000/simulator_home`
- **Replay mode** at `http://localhost:8000/replay/<sim_name>/<step>`
- **Demo mode** at `http://localhost:8000/demo/<sim_name>/<step>/<speed>`

### Simulation Storage

```
environment/frontend_server/storage/
└── <simulation_name>/
    ├── reverie/
    │   └── meta.json           # Simulation metadata
    ├── environment/
    │   ├── 0.json              # Agent positions at step 0
    │   ├── 1.json              # Agent positions at step 1
    │   └── ...
    ├── movement/
    │   ├── 0.json              # Movement commands at step 0
    │   └── ...
    └── personas/
        └── <persona_name>/
            └── bootstrap_memory/
                ├── spatial_memory.json
                ├── associative_memory/
                └── scratch.json
```

---

## Paper vs Code Discrepancies

### 1. Terminology Differences

| Paper Term | Code Term | Location |
|------------|-----------|----------|
| Generative Agent | Persona | `persona/persona.py` |
| Memory Stream | Associative Memory | `memory_structures/associative_memory/` |
| Working Memory | Scratch | `memory_structures/scratch.py` |
| Simulation | Reverie | `reverie.py` |

### 2. Recency Decay Factor

- **Paper:** States 0.99 decay rate
- **Code:** Uses configurable `recency_decay = 0.995` in `scratch.py`
- **Impact:** Slightly slower decay in implementation

### 3. Reflection Threshold

- **Paper:** States importance threshold of 150
- **Code:** Confirmed `importance_trigger_max = 150` in `scratch.py`
- **Match:** Yes, this matches

### 4. Retrieval Weights

- **Paper:** States equal weights [1, 1, 1]
- **Code:** Uses weighted `[0.5, 3, 2]` for recency, relevance, importance
- **Impact:** Code prioritizes relevance (3x) and importance (2x) over recency

```python
# Code uses these weights:
gw = [0.5, 3, 2]  # recency, relevance, importance
```

### 5. Daily Reflection Timing

- **Paper:** Implies periodic reflection
- **Code:** Uses accumulated importance trigger, not time-based
- **Also:** Includes automatic post-conversation reflection not mentioned in paper

### 6. Vision Radius

- **Paper:** Not explicitly specified
- **Code:** `vision_r = 4` tiles by default

### 7. Attention Bandwidth

- **Paper:** Not explicitly specified  
- **Code:** `att_bandwidth = 3` events per perception

### 8. Retention Window

- **Paper:** Not explicitly specified
- **Code:** `retention = 5` recent events to avoid re-perceiving

### 9. Schedule Decomposition

- **Paper:** Describes hierarchical decomposition
- **Code:** Implements lazy decomposition - only decomposes 2 hours ahead
- **Impact:** More efficient, decomposes only when needed

### 10. Conversation System

- **Paper:** Describes agent conversations
- **Code:** Has two implementations (`agent_chat_v1`, `agent_chat_v2`)
- **Note:** Post-conversation reflection generates planning thoughts and memos

### 11. Embedding Implementation

- **Paper:** Uses generative model for embeddings
- **Code:** Calls `get_embedding()` which uses OpenAI's embedding API

---

## Key Takeaways

### Architecture Strengths

1. **Modular Cognitive Design:** Each cognitive function (perceive, retrieve, reflect, plan, execute) is cleanly separated into its own module.

2. **Hierarchical Memory:** Three-tier memory system (spatial, associative, scratch) mirrors human cognition.

3. **Lazy Decomposition:** Only decomposes schedules when needed, saving LLM calls.

4. **Event-Driven Reflection:** Triggered by importance accumulation rather than fixed intervals.

5. **Reactive Planning:** Can dynamically adjust plans when important events occur.

### Implementation Details

1. **Python 3.9.12** - Tested on this version
2. **Django 2.2** - For frontend server
3. **OpenAI API** - For all LLM and embedding calls
4. **Tiled Map Editor** - For creating/editing the Smallville map

### Performance Considerations

1. **LLM Call Frequency:** Each agent makes multiple LLM calls per step:
   - Perception poignancy scoring
   - Memory retrieval (if new events)
   - Planning (if action finished)
   - Reflection (if triggered)
   - Task decomposition (if needed)

2. **Cost:** The README warns that "running these simulations... could be somewhat costly"

3. **Rate Limiting:** Code includes handling for OpenAI API rate limits

### Applicable Patterns for DevAll

1. **Scratch as Working Memory:** The `Scratch` class pattern for managing temporary state
2. **Weighted Retrieval:** The scoring formula for memory retrieval
3. **Lazy Decomposition:** Only expanding plans when needed
4. **Importance-Based Triggers:** Using accumulated importance for reflection
5. **Event-Action Mapping:** How perceived events trigger potential reactions
6. **Conversation Memory:** How chat interactions are stored and reflected upon

---

## Related Papers and Analysis

### Comparative Analysis
- **Memory Architecture Comparison**: [comparison-memory-architectures.md](./comparison-memory-architectures.md) - Comparison of memory stream implementation with alternatives
- **Planning Comparison**: [comparison-planning.md](./comparison-planning.md) - Analysis of planning module across frameworks
- **Communication Comparison**: [comparison-communication.md](./comparison-communication.md) - Communication patterns analysis
- **Gap Analysis**: [gap-analysis.md](./gap-analysis.md) - Technical gaps between implementation and DevAll
- **Literature Review**: [literature-review-synthesis.md](./literature-review-synthesis.md) - Academic positioning of the implementation

### Related Stanford Documentation
- **Research Summary**: [stanford-generative-agents-summary.md](./stanford-generative-agents-summary.md)
- **Architecture Documentation**: [stanford-generative-agents-architecture.md](./stanford-generative-agents-architecture.md)
- **DevAll Patterns**: [stanford-generative-agents-devall-patterns.md](./stanford-generative-agents-devall-patterns.md)
- **Critical Review**: [stanford-generative-agents-critique.md](./stanford-generative-agents-critique.md)
- **Community Implementations**: [stanford-generative-agents-community.md](./stanford-generative-agents-community.md)

### Related Multi-Agent Papers
- **ChatDev**: [papers/chatdev-summary.md](./papers/chatdev-summary.md) - Software development multi-agent framework
- **AutoGen**: [papers/autogen-summary.md](./papers/autogen-summary.md) - Conversational multi-agent framework
- **MetaGPT**: [papers/metagpt-summary.md](./papers/metagpt-summary.md) - SOP-based framework
- **CAMEL**: [papers/camel-summary.md](./papers/camel-summary.md) - Role-playing framework
- **AgentVerse**: [papers/agentverse-summary.md](./papers/agentverse-summary.md) - Emergent behaviors

### Classic Foundations
- **BDI Architecture**: [papers/classic/bdi-architecture-summary.md](./papers/classic/bdi-architecture-summary.md) - Theoretical foundation
- **Communication Protocols**: [papers/classic/communication-protocols-summary.md](./papers/classic/communication-protocols-summary.md) - FIPA-ACL and KQML protocols

## References

- **Repository:** https://github.com/joonspk-research/generative_agents
- **Paper:** https://arxiv.org/abs/2304.03442
- **Authors:** Joon Sung Park, Joseph C. O'Brien, Carrie J. Cai, Meredith Ringel Morris, Percy Liang, Michael S. Bernstein
- **Conference:** UIST '23 (36th Annual ACM Symposium on User Interface Software and Technology)
- **Bibliography:** [bibliography.md](./bibliography.md)
