# GOAL: Goal-Oriented Agent Language

**Paper:** GOAL: A Multi-Agent Programming Language Applied to an Exploration Game  
**Authors:** Koen V. Hindriks, Frank S. de Boer, Wiebe van der Hoek, John-Jules C. Meyer  
**Conference:** AAMAS 2007

---

## Problem Statement and Motivation

### The Challenge
Developing intelligent agents requires:
- Specifying what agents should achieve (goals)
- Managing agent's knowledge and beliefs
- Implementing goal-directed behavior
- Bridging agent logics with practical programming

### The Gap
Existing agent programming languages suffered from:
- **Focus on plans, not goals**: Emphasized how to achieve rather than what to achieve
- **Procedural bias**: Limited support for declarative goal specification
- **Logic gap**: Disconnect between agent logics and programming frameworks
- **Poor goal management**: Weak support for goal lifecycle and commitment

### The Solution
GOAL provides:
1. Declarative goals as first-class citizens
2. Clear separation between goals and plans
3. Logic-based agent programming
4. Commitment strategies for goal management
5. Bridge between agent theory and practice

---

## Architecture Overview

GOAL is a logic-based BDI agent programming language with emphasis on declarative goals.

**Core Architecture Components:**
- **Mental State**: Knowledge Base (Declarative), Belief Base (Declarative), Goal Base (Declarative)
- **Action Rules**: Condition → Action mappings
- **Environment Interface**: Perception and action execution

### Core Components

**Knowledge Base:**
- Static domain knowledge
- Defined using Prolog-like facts and rules
- Shared across all agents (typically)
- Represents immutable truths

**Belief Base:**
- Agent's current beliefs about the world
- Dynamic, updated through perception
- Represents agent's information state
- Can be incomplete or incorrect

**Goal Base:**
- States the agent wants to achieve
- Declarative: specify what, not how
- Goals are propositions to be realized
- Managed through commitment strategies

**Action Rules:**
- Condition-action pairs
- Specify when actions should be performed
- Can use beliefs and goals in conditions
- Generate agent behavior

---

## Declarative Goals

### Goal Concept

**What are Declarative Goals?**
- Goals specify a desired state of the world
- Not a sequence of actions (procedural)
- Not an abstract plan (partially specified)
- A proposition that should become true

**Example Goals:**
```prolog
% Goal: block A is on block B
on(a, b)

% Goal: robot is at location (5, 10)
at(robot, pos(5, 10))

% Goal: package is delivered
delivered(package123, customer456)
```

### Goal Semantics

**Achievement vs Maintenance:**

**Achievement Goals:**
- State that should become true
- Dropped when believed true
- Agent commits to achieving them

**Maintenance Goals:**
- State that should remain true
- Triggered when violated
- Agent works to restore condition

### Goal Adoption and Dropping

**Goal Adoption:**
```prolog
% Adopt goal when condition holds
if bel(condition(X)) then adopt(goal(X)).

% Adopt goal on perception
percept(event(Y)) -> adopt(goal(Y)).
```

**Goal Dropping:**
- Automatically dropped when achieved (believed true)
- Can be explicitly dropped with `drop`
- Can use commitment strategies

---

## Mental State

### Knowledge vs Beliefs vs Goals

**Knowledge (Static):**
```prolog
% Domain knowledge (doesn't change)
adjacent(room1, room2).
adjacent(room2, room3).
connected(room1, room3, door1).

% Rules
reachable(X, Y) :- adjacent(X, Y).
reachable(X, Y) :- adjacent(X, Z), reachable(Z, Y).
```

**Beliefs (Dynamic):**
```prolog
% Current beliefs about the world
bel(location(robot, room1)).
bel(carrying(robot, package)).
bel(door(door1, open)).
```

**Goals (Desired States):**
```prolog
% Goals to achieve
goal(at(robot, room3)).
goal(delivered(package)).
```

### Mental State Queries

**Querying Beliefs:**
```prolog
% Check if believed
if bel(location(robot, Room)) then ...

% Check if not believed
if not bel(obstacle(X)) then ...
```

**Querying Goals:**
```prolog
% Check if goal exists
if goal(at(robot, Dest)) then ...

% Check if goal doesn't exist
if not goal(at(robot, room1)) then ...
```

**Combining Queries:**
```prolog
% Complex conditions
if bel(location(robot, Loc)), goal(at(robot, Dest)), 
   reachable(Loc, Dest)
then ...
```

---

## Action Rules

### Rule Structure

**Basic Syntax:**
```prolog
if <condition> then <action>.
```

**Condition Components:**
- Belief conditions: `bel(...)`, `not bel(...)`
- Goal conditions: `goal(...)`, `not goal(...)`
- Combined with conjunction: `,`

**Action Types:**
- Mental actions: `adopt(...)`, `drop(...)`, `insert(...)`, `delete(...)`
- Environment actions: custom actions
- Communication actions: `send(...)`

### Example Rules

**Goal-Directed Behavior:**
```prolog
% Move to destination if not there
if bel(location(self, Loc)), 
   goal(at(self, Dest)), 
   Loc \= Dest,
   adjacent(Loc, Next)
then move(Next).

% Pick up item if at location
if bel(location(self, Loc)), 
   bel(at(Item, Loc)), 
   goal(carried(Item))
then pick(Item).

% Drop item if at destination
if bel(carried(Item)), 
   bel(location(self, Loc)), 
   goal(at(Item, Loc))
then drop(Item).
```

**Reactive Behavior:**
```prolog
% Recharge if battery low
if bel(battery(Level)), Level < 10
then recharge.

% Avoid obstacle
if bel(obstacle(Loc)), 
   bel(location(self, Loc))
then move(backward).
```

**Goal Management:**
```prolog
% Adopt subgoal
if goal(at(self, Dest)),
   not bel(at(self, Dest)),
   bel(location(self, Loc))
then adopt(path(Loc, Dest)).

% Drop achieved goal
if goal(State), bel(State)
then drop(State).
```

---

## Commitment Strategies

### Blind Commitment

**Definition:**
- Agent maintains goal until it believes it's achieved
- Never drops goal otherwise
- Simple but inflexible

**Implementation:**
```prolog
% Goals are only dropped when achieved
% (default behavior in GOAL)
```

**Use Case:**
- Critical goals that must be achieved
- Simple environments with predictable outcomes

### Single-Minded Commitment

**Definition:**
- Agent maintains goal until:
  - Goal is achieved, OR
  - Goal is believed impossible

**Implementation:**
```prolog
% Drop goal if impossible
if goal(State), bel(impossible(State))
then drop(State).

% Define when impossible
if bel(blocked(Dest)), goal(at(self, Dest))
then insert(impossible(at(self, Dest))).
```

**Use Case:**
- Environments where goals may become unachievable
- Resource-bounded agents

### Open-Minded Commitment

**Definition:**
- Agent maintains goal until:
  - Goal is achieved, OR
  - Goal is impossible, OR
  - Motivation for goal no longer holds

**Implementation:**
```prolog
% Drop goal if no longer relevant
if goal(State), not bel(motivation(State))
then drop(State).

% Define motivations
if bel(emergency(Location)) 
then adopt(at(self, Location)).

% Motivation disappears
if bel(emergency_resolved(Location))
then insert(motivation(at(self, Location))).
```

**Use Case:**
- Dynamic environments
- Agents with changing priorities

---

## Communication

### Send Action

**Basic Syntax:**
```prolog
send(Receiver, Performative, Content).
```

**Performatives:**
- `tell`: Inform about belief
- `achieve`: Request goal adoption
- `ask`: Query information

**Examples:**
```prolog
% Tell another agent about belief
if bel(fire(Location))
then send(firefighter, tell, fire(Location)).

% Request goal adoption
if goal(evacuated(Location))
then send(evacuation_team, achieve, evacuated(Location)).

% Query information
if goal(at(self, Dest)), not bel(path_to(Dest))
then send(navigator, ask, path_to(Dest)).
```

### Receiving Messages

**Percept Rules:**
```prolog
% Handle received message
percept(tell(Sender, fire(Loc))) 
   -> insert(fire(Loc)).

percept(achieve(Sender, Goal)) 
   -> adopt(Goal).

percept(ask(Sender, Question)) 
   -> handle_query(Sender, Question).
```

---

## Modules

### Module Concept

GOAL supports modular agent design:

**Module Structure:**
```prolog
module navigator {
    % Knowledge
    knowledge:
        adjacent(room1, room2).
        adjacent(room2, room3).
    
    % Beliefs
    beliefs:
        location(self, room1).
    
    % Goals
    goals:
        at(self, room3).
    
    % Action rules
    program:
        if goal(at(self, Dest)), 
           bel(location(self, Loc)),
           adjacent(Loc, Next)
        then move(Next).
}
```

### Module Composition

**Using Modules:**
```prolog
module main_agent {
    % Include navigator module
    use navigator.
    
    % Main agent rules
    program:
        if bel(fire(Loc)) 
        then send(firefighter, tell, fire(Loc)).
}
```

**Benefits:**
- Separate concerns
- Reusable components
- Easier testing and debugging
- Clear agent architecture

---

## Example Application

### Blocks World Agent

**Knowledge Base:**
```prolog
knowledge:
    % Block properties
    block(a). block(b). block(c).
    
    % Clear predicate rules
    clear(X) :- block(X), not on(_, X).
    clear(table).  % Table is always clear
```

**Initial Beliefs:**
```prolog
beliefs:
    on(a, table).
    on(b, table).
    on(c, a).
```

**Goals:**
```prolog
goals:
    on(a, b).
    on(b, c).
    on(c, table).
```

**Action Rules:**
```prolog
program:
    % Move block to destination if clear
    if goal(on(Block, Dest)),
       bel(on(Block, Current)),
       bel(clear(Block)),
       bel(clear(Dest)),
       Current \= Dest
    then move(Block, Dest).
    
    % Clear destination if blocked
    if goal(on(Block, Dest)),
       bel(on(Top, Dest)),
       Top \= Block
    then adopt(clear(Dest)).
    
    % Clear means move top block to table
    if goal(clear(Location)),
       bel(on(Block, Location)),
       bel(clear(Block))
    then adopt(on(Block, table)).
```

---

## Key Experimental Results

### Application Domains

GOAL has been applied in:

1. **Exploration Games:**
   - Multi-agent coordination
   - Goal-driven exploration
   - Dynamic environment interaction

2. **Blocks World:**
   - Planning problems
   - Goal decomposition
   - Action selection

3. **Robot Control:**
   - Mobile robot navigation
   - Goal-oriented behavior
   - Environment interaction

4. **Multi-Agent Coordination:**
   - Task allocation
   - Goal delegation
   - Collaborative problem solving

### Performance Characteristics

**Advantages:**
- Clear goal semantics
- Declarative goal specification
- Strong theoretical foundation
- Modular design support

**Limitations:**
- Limited plan representation
- No explicit plan failure handling
- Requires careful rule design
- Learning curve for logic programming

---

## Implications for Multi-Agent Systems

### Architectural Patterns

1. **Declarative Goal Specification:**
   - Separate what to achieve from how to achieve
   - Use goals to drive behavior
   - Enable flexible plan selection

2. **Mental State Modeling:**
   - Clear separation of knowledge, beliefs, goals
   - Explicit representation of agent's information
   - Support for introspection and reasoning

3. **Commitment Strategies:**
   - Choose appropriate commitment level
   - Balance flexibility with persistence
   - Handle goal conflicts and priorities

### Design Principles

**For Goal-Oriented Agents:**
- Specify goals declaratively
- Use action rules to achieve goals
- Implement commitment strategies
- Handle goal lifecycle

**For Multi-Agent Systems:**
- Communicate about goals
- Delegate goals between agents
- Coordinate goal achievement
- Share relevant beliefs

### Comparison to Other BDI Languages

| Feature | GOAL | Jason | 2APL |
|---------|------|-------|------|
| **Goal Type** | Declarative | Achievement | Declarative + Procedural |
| **Goal Spec** | Propositions | !goal | Mixed |
| **Plans** | Action rules | Plan library | Plan rules |
| **Knowledge** | Explicit KB | Implicit | Implicit |
| **Modularity** | Modules | Limited | Limited |

---

## Strengths and Limitations

### Strengths

- **Clear Goal Semantics:** Declarative goals are well-defined
- **Theoretical Foundation:** Strong logical basis
- **Knowledge Separation:** Clear distinction between knowledge/beliefs/goals
- **Modularity:** Support for modular agent design
- **Commitment Strategies:** Flexible goal management

### Limitations

- **Limited Plan Representation:** No rich plan structures
- **Rule-Based Only:** Less flexible than plan libraries
- **No Plan Failure Handling:** Limited recovery mechanisms
- **Learning Curve:** Requires logic programming skills
- **Performance:** Rule matching overhead

---

## Evolution and Modern Applications

### GOAL Variants and Extensions

**GOAL Extensions:**
- GOAL with planning
- GOAL with learning
- GOAL with emotions

**Related Frameworks:**
- 2APL: Combines GOAL's declarative goals with plans
- Jason: Achievement goals with plan libraries
- Other BDI languages

### Modern Relevance

GOAL concepts apply to:

1. **LLM-Based Agents:**
   - Declarative goals in prompts
   - Goal-driven prompt selection
   - Commitment to task completion

2. **Multi-Agent Systems:**
   - Goal delegation and coordination
   - Shared knowledge bases
   - Goal-based communication

3. **Autonomous Systems:**
   - Goal-oriented behavior
   - Commitment strategies
   - Mental state modeling

---

## References

**Primary Paper:**
- Hindriks, K. V., de Boer, F. S., van der Hoek, W., & Meyer, J. J. C. (2007). GOAL: A Multi-Agent Programming Language Applied to an Exploration Game. AAMAS 2007.
- ACM DL: https://dl.acm.org/doi/10.1145/1329125.1329305

**Related Papers:**
- Hindriks, K. V., et al. (2009). Programming Mental State in GOAL. AAMAS 2009.
- Hindriks, K. V. (2008). Programming Rational Agents in GOAL. Multi-Agent Programming Book.

**Resources:**
- GOAL Documentation: https://goalapl.github.io/

**Related Summaries:**
- BDI Architecture: [bdi-architecture-summary.md](./bdi-architecture-summary.md)
- Jason: [bdi-agentspeak-jason-summary.md](./bdi-agentspeak-jason-summary.md)
- 2APL: [2apl-summary.md](./2apl-summary.md)
