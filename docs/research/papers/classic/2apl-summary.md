# 2APL: A Practical Agent Programming Language

**Paper:** 2APL: A Practical Agent Programming Language  
**Authors:** Mehdi Dastani  
**Journal:** Autonomous Agents and Multi-Agent Systems, 2008  
**DOI:** https://doi.org/10.1007/s10458-008-9036-y

---

## Problem Statement and Motivation

### The Challenge
Developing cognitive agents requires:
- Managing complex mental states (beliefs, goals, plans)
- Integrating different programming paradigms
- Handling events and exceptions
- Generating and repairing plans dynamically

### The Gap
Existing agent programming languages suffered from:
- **Paradigm limitations**: Purely declarative or purely imperative
- **Poor integration**: Difficulty combining different approaches
- **Limited plan management**: Weak support for plan generation/repair
- **Practical concerns**: Lack of practical programming constructs

### The Solution
2APL provides:
1. Hybrid declarative/imperative programming style
2. Practical constructs for plan generation and repair
3. Rich event and exception handling
4. Integration of multiple agent concepts
5. Bridge between theory and practice

---

## Architecture Overview

2APL (A Practical Agent Programming Language) is a BDI-based agent-oriented programming language that integrates declarative and imperative styles.

**Core Architecture Components:**
- **Mental State**: Beliefs (Declarative), Goals (Declarative), Plans (Imperative)
- **Reasoning Rules**: Plan Generation Rules, Plan Repair Rules, Action Selection Rules
- **Execution Engine**: Handles action execution and state updates

### Core Components

**Beliefs:**
- Agent's information about the world
- Represented as first-order logic literals
- Updated through perception and actions
- Queried in conditions

**Goals:**
- States the agent wants to achieve
- Declarative goals (what to achieve)
- Goal can be achievement or test goals
- Managed through commitment

**Plans:**
- Sequences of actions to achieve goals
- Imperative programming constructs
- Can be generated, modified, repaired
- Stored in plan base

**Reasoning Rules:**
- Generate new plans
- Repair failed plans
- Select actions
- Handle events

---

## Hybrid Programming Paradigm

### Declarative Aspects

**Beliefs and Goals:**
```2apl
// Declarative beliefs
Beliefs:
    location(robot, room1).
    carrying(robot, package).
    adjacent(room1, room2).

// Declarative goals
Goals:
    delivered(package, customer).
    at(robot, depot).
```

**Goal Queries:**
```2apl
// Check if goal exists
if (goal(delivered(Pkg, Cust))) then ...

// Check if belief holds
if (bel(location(Robot, Loc))) then ...
```

### Imperative Aspects

**Plan Actions:**
```2apl
// Sequential composition
move(room2); pick(package); move(room1)

// Conditional execution
if (condition) then { actions } else { actions }

// While loops
while (condition) { actions }

// Action blocks
{
    move(room2);
    pick(package);
    move(room1);
    drop(package)
}
```

### Integration Benefits

**Combined Power:**
- Declarative: Specify what to achieve (goals)
- Imperative: Specify how to achieve (plans)
- Flexible: Mix paradigms as needed
- Practical: Real-world programming constructs

---

## Plan Representation

### Basic Plans

**Plan Structure:**
```
<plan> ::= <action> | <plan> ; <plan> | 
           if (<condition>) { <plan> } else { <plan> } |
           while (<condition>) { <plan> } |
           { <plan> }
```

**Examples:**
```2apl
// Simple action plan
move(room2)

// Sequential plan
move(room2); pick(package); move(room1); drop(package)

// Conditional plan
if (bel(door(Door, open))) {
    move(room2)
} else {
    open(Door);
    move(room2)
}

// Iterative plan
while (bel(carrying(Item))) {
    drop(Item)
}
```

### Plan Variables

**Variable Binding:**
```2apl
// Variables in plans
move(Dest)  // Dest is variable

// Variables bound by conditions
if (bel(location(Robot, Loc)), goal(at(Robot, Dest)))
then plan: move(Loc); move(Dest)
```

### Abstract Plans

**Partial Plans:**
```2apl
// Plan with subgoal
move(room2); achieve(delivered(Package)); return(depot)

// Subgoal expansion
achieve(delivered(Pkg)) can be expanded to:
    move(dest(Pkg)); drop(Pkg)
```

---

## Plan Generation Rules

### Rule Structure

**Generation Rule Syntax:**
```2apl
<trigger> : <condition> <- <plan>.
```

**Components:**
- Trigger: Event or goal that initiates planning
- Condition: When rule is applicable
- Plan: Plan to be generated

### Goal Achievement Rules

**Achievement Goals:**
```2apl
// Generate plan to achieve goal
goal(at(Robot, Dest)) : 
    bel(location(Robot, Loc)), adjacent(Loc, Dest)
    <- move(Dest).

// More complex plan generation
goal(delivered(Pkg, Cust)) :
    bel(carrying(Robot, Pkg)), bel(location(Cust, Loc))
    <- move(Loc); drop(Pkg).
```

**Test Goals:**
```2apl
// Generate plan to test/query
goal(?location(Item)) :
    bel(adjacent(Loc1, Loc2))
    <- search(Loc1); search(Loc2).
```

### Event Handling Rules

**Belief Events:**
```2apl
// React to new belief
+belief(fire(Loc)) : true
    <- send(firefighter, tell, fire(Loc));
       adopt(goal(evacuated(Loc))).

// React to belief removal
-belief(battery(Level)) : true
    <- .print("Battery level unknown").
```

**Message Events:**
```2apl
// Handle received message
+message(Sender, tell, Content) : true
    <- adopt(bel(Content)).
```

### External Events

**Environment Events:**
```2apl
// Handle perception
+percept(obstacle(Loc)) : 
    bel(location(self, Loc))
    <- move(backward); replan.
```

---

## Plan Repair Rules

### Failure Handling

**Plan Failure Detection:**
- Actions can fail in environment
- Conditions can become false
- Resources can become unavailable

**Repair Rule Syntax:**
```2apl
<plan_pattern> | <condition> -> <repair_plan>.
```

### Repair Examples

**Replace Failed Action:**
```2apl
// Repair move failure
move(Loc) | bel(blocked(Loc)) 
    <- .print("Path blocked"); find_alternative(Loc).

// Repair pick failure
pick(Item) | bel(not(carrying(self, Item))) 
    <- .print("Pick failed"); retry(3, pick(Item)).
```

**Plan Modification:**
```2apl
// Modify plan sequence
Plan1; Plan2 | not(applicable(Plan2))
    <- Plan1; alternative(Plan2); Plan2.

// Insert recovery actions
move(Dest) | bel(low_battery) 
    <- recharge; move(Dest).
```

**Subgoal Replanning:**
```2apl
// Replan subgoal
achieve(Goal) | bel(impossible(Goal))
    <- .print("Goal impossible: ", Goal); 
       drop(Goal).
```

---

## Action Selection

### Actions Types

**Mental Actions:**
```2apl
// Belief updates
+belief(Condition)  // Add belief
-belief(Condition)  // Remove belief

// Goal management
adopt(goal(Goal))   // Adopt goal
drop(Goal)          // Drop goal
focus(Goal)         // Focus on goal
```

**External Actions:**
```2apl
// Environment actions
move(Location)
pick(Object)
drop(Object)
open(Door)
```

**Communication Actions:**
```2apl
// Send messages
send(Receiver, tell, Content)
send(Receiver, achieve, Goal)
send(Receiver, ask, Query)
```

### Action Execution

**Execution Semantics:**
1. Check preconditions
2. Execute action
3. Update mental state
4. Handle results/failures

**Precondition Checking:**
```2apl
// Action with precondition
move(Loc) requires bel(adjacent(CurrentLoc, Loc))
```

---

## Events and Exceptions

### Event Types

**Internal Events:**
```2apl
// Goal adoption event
+goal(Goal)

// Belief change event
+belief(Condition)
-belief(Condition)
```

**External Events:**
```2apl
// Perception event
+percept(perception)

// Message event
+message(Sender, Performative, Content)
```

### Exception Handling

**Exception Types:**
- Action failure
- Plan failure
- Communication failure
- Resource unavailability

**Handling Mechanisms:**
```2apl
// Catch and handle exception
try {
    move(Loc); pick(Item)
} catch (blocked) {
    find_alternative(Loc)
} catch (not_found) {
    search(Item)
}
```

---

## Example Application

### Warehouse Robot Agent

**2APL Agent Definition:**
```2apl
// Beliefs
Beliefs:
    location(robot, depot).
    battery(100).
    adjacent(depot, room1).
    adjacent(room1, room2).
    adjacent(room2, room3).

// Goals
Goals:
    delivered(package123, customer456).

// Plan Generation Rules
PG-rules:
    // Deliver package
    goal(delivered(Pkg, Cust)) : 
        bel(location(Pkg, Loc)), bel(location(Cust, CustLoc))
        <- move(Loc); pick(Pkg); move(CustLoc); drop(Pkg).
    
    // Move to adjacent location
    goal(at(Loc)) : 
        bel(location(robot, CurrentLoc)), 
        bel(adjacent(CurrentLoc, Loc))
        <- move(Loc).
    
    // Move with path planning
    goal(at(Dest)) :
        bel(location(robot, Loc)), 
        bel(adjacent(Loc, Next)),
        bel(path_to(Next, Dest))
        <- move(Next); achieve(at(Dest)).

// Plan Repair Rules
PR-rules:
    // Handle blocked path
    move(Loc) | bel(blocked(Loc)) 
        <- .print("Path to ", Loc, " blocked");
           find_alternative(Loc).
    
    // Handle low battery
    move(Loc) | bel(battery(Level)), Level < 10
        <- recharge; move(Loc).
    
    // Handle pick failure
    pick(Item) | not bel(carrying(robot, Item))
        <- .print("Failed to pick ", Item);
           search(Item); pick(Item).

// Event Handling Rules
Event-rules:
    // React to new delivery request
    +message(Sender, achieve, delivered(Pkg, Cust)) : true
        <- adopt(delivered(Pkg, Cust));
           send(Sender, tell, accepted).
    
    // React to obstacle perception
    +percept(obstacle(Loc)) : bel(location(robot, Loc))
        <- move(backward);
           .print("Obstacle detected at ", Loc).
    
    // React to low battery
    +percept(battery(Level)) : Level < 20
        <- .print("Low battery: ", Level);
           if (not bel(at(robot, depot))) {
               achieve(at(depot))
           };
           recharge.
```

---

## Key Experimental Results

### Application Domains

2APL has been applied in:

1. **Multi-Agent Coordination:**
   - Task allocation
   - Collaborative problem solving
   - Negotiation

2. **Robot Control:**
   - Mobile robot navigation
   - Multi-robot coordination
   - Environment exploration

3. **Simulation:**
   - Social simulation
   - Organizational modeling
   - Workflow management

4. **Game AI:**
   - Strategic game playing
   - NPC behavior
   - Multi-player coordination

### Performance Characteristics

**Advantages:**
- Hybrid programming flexibility
- Rich plan repair mechanisms
- Practical programming constructs
- Clear event handling
- Good tooling support

**Limitations:**
- Learning curve for hybrid approach
- Complexity of plan repair
- Performance overhead
- Limited built-in learning

---

## Implications for Multi-Agent Systems

### Architectural Patterns

1. **Hybrid Agent Design:**
   - Combine declarative goals with imperative plans
   - Use paradigms where most appropriate
   - Balance flexibility with structure

2. **Plan Management:**
   - Generate plans dynamically
   - Repair plans when they fail
   - Adapt to changing circumstances

3. **Event-Driven Behavior:**
   - React to events and exceptions
   - Handle failures gracefully
   - Maintain robust operation

### Design Principles

**For Agent Programming:**
- Use declarative goals for what to achieve
- Use imperative plans for how to achieve
- Implement plan generation and repair
- Handle events and exceptions

**For Multi-Agent Systems:**
- Communicate using events and messages
- Coordinate through goal delegation
- Share information through beliefs
- Handle coordination failures

### Comparison to Other BDI Languages

| Feature | 2APL | Jason | GOAL |
|---------|------|-------|------|
| **Programming** | Hybrid (Dec+Imp) | AgentSpeak | Declarative |
| **Goals** | Declarative | Achievement | Declarative |
| **Plans** | Imperative | Plan library | Action rules |
| **Plan Repair** | Explicit rules | Failure events | Limited |
| **Events** | Rich handling | Event queue | Percepts |
| **Exceptions** | Try-catch | Failure plans | Limited |

---

## Strengths and Limitations

### Strengths

- **Hybrid Paradigm:** Combines declarative and imperative
- **Plan Repair:** Explicit repair rule mechanism
- **Practical Constructs:** Rich programming features
- **Event Handling:** Comprehensive event system
- **Flexibility:** Multiple ways to achieve goals
- **Tooling:** IDE and debugging support

### Limitations

- **Complexity:** More complex than pure declarative/imperative
- **Learning Curve:** Requires understanding both paradigms
- **Performance:** Overhead from hybrid execution
- **Plan Repair Complexity:** Difficult to design good repair rules
- **Limited Learning:** No built-in machine learning
- **Documentation:** Less extensive than Jason

---

## Evolution and Modern Applications

### 2APL Variants

**Extended 2APL:**
- 2APL with planning integration
- 2APL with learning capabilities
- 2APL with emotions/affect

**Related Frameworks:**
- Jason: Pure BDI with plan libraries
- GOAL: Pure declarative goals
- Other hybrid approaches

### Modern Relevance

2APL concepts apply to:

1. **LLM-Based Agents:**
   - Hybrid prompt design (declarative goals, imperative plans)
   - Plan generation and repair in prompts
   - Event-driven prompt selection
   - Exception handling in workflows

2. **Multi-Agent Systems:**
   - Dynamic plan generation
   - Failure recovery strategies
   - Event-based coordination
   - Robust multi-agent behavior

3. **Autonomous Systems:**
   - Adaptive plan execution
   - Robust operation in dynamic environments
   - Exception handling and recovery
   - Hybrid cognitive architectures

---

## References

**Primary Paper:**
- Dastani, M. (2008). 2APL: A Practical Agent Programming Language. Autonomous Agents and Multi-Agent Systems, 16(3), 214-248.

**Related Papers:**
- Dastani, M., et al. (2005). Programming Multi-Agent Systems in 2APL. AAMAS 2005.
- Dastani, M., et al. (2010). Multi-Agent Programming Book.

**Resources:**
- 2APL Website: http://apapl.sourceforge.net/

**Related Summaries:**
- BDI Architecture: [bdi-architecture-summary.md](./bdi-architecture-summary.md)
- Jason: [bdi-agentspeak-jason-summary.md](./bdi-agentspeak-jason-summary.md)
- GOAL: [goal-summary.md](./goal-summary.md)
