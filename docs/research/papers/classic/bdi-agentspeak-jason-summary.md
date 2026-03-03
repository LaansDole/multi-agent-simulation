# Jason: BDI Agent Programming in AgentSpeak

**Paper:** BDI Agent Programming in AgentSpeak Using Jason (Tutorial Paper)  
**Authors:** Rafael H. Bordini, Jomi F. Hübner  
**Conference:** AAMAS 2005  
**DOI:** https://doi.org/10.1145/1082473.1082761

---

## Problem Statement and Motivation

### The Challenge
Developing multi-agent systems requires:
- Programming individual agent behaviors
- Implementing agent communication and coordination
- Managing complex mental states (beliefs, goals, plans)
- Ensuring predictable and verifiable agent behavior

### The Gap
Prior agent programming approaches suffered from:
- **Gap between theory and practice**: BDI theory existed but no practical languages
- **Implementation complexity**: Building BDI agents from scratch is difficult
- **Lack of standardization**: No common programming model
- **Limited tooling**: No IDEs, debuggers, or testing frameworks

### The Solution
Jason provides:
1. An interpreter for an extended version of AgentSpeak(L)
2. A practical BDI-based agent-oriented programming language
3. Java-based implementation with rich tooling
4. Support for distributed multi-agent systems

---

## Architecture Overview

Jason implements the BDI architecture through the AgentSpeak language.

**Core Architecture Components:**
- **AgentSpeak Interpreter**: Belief Base (Prolog-like), Plan Library (Event-Plan), Intention Execution Engine
- **Agent Infrastructure (Java)**: Communication, Environment Interface, Scheduling

### Core Components

**Belief Base:**
- Stores agent's beliefs as first-order logic literals
- Implemented as a Prolog-like database
- Supports queries and updates
- Can include annotations (source, time)

**Plan Library:**
- Collection of plans triggered by events
- Each plan has:
  - Triggering event (add/delete belief/goal)
  - Context condition (when plan is applicable)
  - Body (sequence of actions/subgoals)

**Intention Execution Engine:**
- Manages concurrent intentions
- Executes plans step-by-step
- Handles plan failure and recovery
- Implements intention selection strategies

---

## AgentSpeak Language

### Basic Syntax

**Beliefs:**
```agentspeak
// Simple beliefs
likes(bob, alice).
location(robot1, room1).
weather(sunny).

// Beliefs with annotations
likes(bob, alice)[source(alice)].
weather(sunny)[time(10:30)].
```

**Goals:**
```agentspeak
// Achievement goals (want to achieve)
!clean(room1).
!deliver(package, destination).

// Test goals (want to know)
?location(robot1).
?next_move(Move).
```

**Plans:**
```agentspeak
// Plan structure: triggering_event : context <- body.

// Plan triggered by adding goal
+!greet(Person) : true
   <- .print("Hello, ", Person, "!").

// Plan triggered by belief addition
+temperature(Temp) : Temp > 30
   <- !activate_cooling.

// Plan with context condition
+!deliver(Item, Dest) : location(Item, Loc) & Loc != Dest
   <- !move(Loc, Dest);
      !drop(Item).
```

### Triggering Events

**Belief Events:**
- `+belief`: Belief added to base
- `-belief`: Belief removed from base

**Goal Events:**
- `+!goal`: Achievement goal added
- `-!goal`: Achievement goal dropped/failed
- `+?goal`: Test goal added
- `-?goal`: Test goal dropped/failed

### Plan Body Operations

**Actions:**
```agentspeak
// Internal actions (built-in)
.print("message");
.wait(1000);  // wait 1 second
.my_name(Name);

// External actions (environment)
move(robot, destination);
pick(robot, object);
```

**Subgoals:**
```agentspeak
// Achievement subgoal
!subgoal;

// Test subgoal
?information(Info);
```

**Belief Updates:**
```agentspeak
// Add belief
+belief;

// Remove belief
-belief;

// Update (remove old, add new)
-belief;
+new_belief;
```

**Mental State Tests:**
```agentspeak
// Check if believed
.belief;

// Check if not believed
.not .belief;
```

---

## Execution Model

### Agent Reasoning Cycle

Jason agents execute in cycles:

1. **Perceive:**
   - Get perceptions from environment
   - Update belief base
   - Generate belief events

2. **Process Messages:**
   - Receive messages from other agents
   - Add to belief base or generate events
   - Handle performatives (tell, achieve, etc.)

3. **Select Event:**
   - Choose event from event queue
   - Events include: belief changes, new goals, messages
   - Selection is fair but configurable

4. **Select Applicable Plans:**
   - Find plans with matching triggering event
   - Check context conditions against belief base
   - Create set of applicable plans

5. **Select Plan:**
   - Choose one plan from applicable plans
   - Default: first applicable plan
   - Can customize selection strategy

6. **Add Intention:**
   - Create new intention from selected plan
   - Push onto intention stack
   - If already has intention for this goal, add as subintention

7. **Execute Intention:**
   - Execute one step of top intention
   - Process action, subgoal, or belief update
   - Handle success/failure

8. **Act:**
   - Send actions to environment
   - Send messages to other agents
   - Update environment state

### Intention Management

**Intention Structure:**
- Stack of plan instances
- Top of stack is currently executing
- Subgoals push new plans onto stack
- Completion pops plan from stack

**Concurrent Intentions:**
- Multiple intentions can exist simultaneously
- Agent interleaves execution
- One step per intention per cycle (configurable)

**Intention Selection:**
- Round-robin by default
- Can implement custom selection strategies
- Considers intention priorities

---

## Communication

### Speech Act-Based Messaging

Jason supports agent communication through speech acts:

**Sending Messages:**
```agentspeak
// Tell (inform belief)
.send(bob, tell, weather(sunny));

// Achieve (request goal adoption)
.send(bob, achieve, !clean(room));

// Ask (request information)
.send(bob, askOne, location(alice, Loc));

// Tell performatives
.send(bob, tell, price(apple, 5));
```

**Standard Performatives:**
- `tell`: Inform about a belief
- `untell`: Retract a belief
- `achieve`: Request goal adoption
- `askOne`: Request single answer
- `askAll`: Request all answers
- `tellHow`: Share a plan
- `askHow`: Request a plan

**Message Handling:**
- Received messages generate events
- Can define plans to handle specific performatives
- Automatic belief base updates for `tell` messages

### KQML-like Communication

Jason implements KQML-inspired communication:

```agentspeak
// Define custom performatives
+!start_negotiation
   <- .send(seller, cfp, item(price));
      // Wait for propose
      +price(Item, P)[source(seller)]
         : P < budget
         <- .send(seller, accept_proposal, item);
         .send(seller, reject_proposal, item).
```

---

## Advanced Features

### Plan Failure Handling

**Failure Events:**
```agentspeak
// Plan triggered when goal fails
-!goal : true
   <- .print("Failed to achieve goal");
      !alternative_plan.

// Plan triggered when specific plan fails
-!deliver(Item, Dest) : true
   <- .print("Delivery failed");
      !try_alternative_route.
```

**Failure Recovery:**
- Automatic generation of failure events
- Can define recovery plans
- Enables robust agent behavior

### Strong Negation

**Explicit Negation:**
```agentspeak
// Strong negation with ~
~ raining.  // explicitly not raining

// Context with strong negation
+!go_outside : ~ raining
   <- !walk.
```

**Difference from Default Negation:**
- Default negation (`not`): "not known to be true"
- Strong negation (`~`): "known to be false"

### Annotations

**Belief Annotations:**
```agentspeak
// Source annotation
likes(bob, alice)[source(alice)].

// Custom annotations
weather(sunny)[time(10:30), confidence(0.9)].

// Querying annotations
+!check_source
   <- ?likes(bob, alice)[source(S)];
      .print("Source: ", S).
```

### Custom Internal Actions

**Java Integration:**
```java
// Java class for custom action
package my_actions;

import jason.asSemantics.*;
import jason.asSyntax.*;

public class my_calc extends DefaultInternalAction {
    public Object execute(TransitionSystem ts, 
                         Unifier un, 
                         Term[] args) {
        // Custom implementation
        int result = ...;
        return un.unifies(args[1], 
                         new NumberTermImpl(result));
    }
}
```

**Using in AgentSpeak:**
```agentspeak
// Use custom internal action
+!calculate
   <- my_actions.my_calc(5, Result);
      .print("Result: ", Result).
```

---

## Environment Interface

### Environment Model

Jason agents interact with environments through:

**Environment Class (Java):**
```java
import jason.environment.*;

public class MyEnvironment extends Environment {
    @Override
    public void init(String[] args) {
        // Initialize environment
    }
    
    @Override
    public boolean executeAction(String agName, 
                                  Structure action) {
        // Handle agent actions
        if (action.getFunctor().equals("move")) {
            // Process move action
            return true;
        }
        return false;
    }
    
    @Override
    public void stop() {
        // Cleanup
    }
}
```

**Agent Actions:**
```agentspeak
// Agent performs environment action
+!move_to(Destination)
   <- move(Destination);  // Environment action
      +location(self, Destination).
```

**Perception:**
- Environment can add perceptions to agents
- Agents automatically update beliefs
- Perceptions can be scheduled or event-driven

---

## Multi-Agent System Configuration

### MAS Definition

**MAS2J Configuration File:**
```java
MAS mySystem {
    infrastructure: Centralised
    
    agents:
        agent1 agentArchClass;
        agent2;
        agent3;
    
    environment: my_package.MyEnvironment
    
    // Optional: custom agent architecture
    agentArchClass: my_package.MyAgentArch
}
```

**Running the MAS:**
```bash
java jason.infra.centralised.RunCentralisedMAS system.mas2j
```

### Agent Distribution

**Centralized vs Distributed:**
- Centralized: All agents in one JVM
- Distributed: Agents across multiple JVMs/machines
- Same AgentSpeak code works in both

**Distributed Configuration:**
```java
MAS distributedSystem {
    infrastructure: Jadex  // or SACI
    
    agents:
        agent1 at "host1";
        agent2 at "host2";
}
```

---

## Tooling and Debugging

### Mind Inspector

**Visual Debugging:**
- Inspect agent mental states in real-time
- View belief base, plan library, intentions
- Track message passing
- Step-through execution

**Using Mind Inspector:**
```bash
# Start with GUI
java jason.infra.centralised.RunCentralisedMAS -debug system.mas2j
```

### Logger and Tracing

**Logging:**
```agentspeak
// Use .print for debugging
+!debug_example
   <- .print("Current beliefs: ", .my_beliefs);
      .print("Current intentions: ", .my_intentions).
```

**Java Logging:**
```java
// Configure logging in Java
import jason.asSemantics.*;

public class MyAgent extends Agent {
    @Override
    public void addBel(Literal bel) {
        getTS().getLogger().info("Adding belief: " + bel);
        super.addBel(bel);
    }
}
```

---

## Example Application

### Simple Warehouse Robot

**Agent Definition:**
```agentspeak
// Warehouse Robot Agent

/* Initial beliefs */
location(robot1, depot).
battery(100).
capacity(50).

/* Plan library */

// Handle new delivery task
+!deliver(Item, Destination) : 
   location(Item, Loc) & 
   location(self, SelfLoc) & 
   SelfLoc != Loc
   <- !move(SelfLoc, Loc);
      !pick(Item);
      !move(Loc, Destination);
      !drop(Item).

// Move to adjacent location
+!move(From, To) : 
   adjacent(From, To) & 
   battery(B) & B > 10
   <- move(To);  // Environment action
      -location(self, From);
      +location(self, To);
      -battery(B);
      +battery(B-5).

// Pick up item
+!pick(Item) : 
   location(self, Loc) & 
   location(Item, Loc)
   <- pick(Item);  // Environment action
      -location(Item, Loc);
      +carrying(Item).

// Drop item
+!drop(Item) : 
   carrying(Item)
   <- drop(Item);  // Environment action
      -carrying(Item);
      location(self, Loc);
      +location(Item, Loc).

// Handle low battery
+!move(From, To) : battery(B) & B =< 10
   <- !recharge.

+!recharge : location(self, depot)
   <- recharge;
      -battery(_);
      +battery(100).

// Failure handling
-!deliver(Item, Dest) : true
   <- .print("Failed to deliver ", Item);
      !notify_failure(Item, Dest).
```

---

## Key Experimental Results

### Application Domains

Jason has been applied in:

1. **Robotics:**
   - Multi-robot coordination
   - Warehouse automation
   - Search and rescue

2. **Simulation:**
   - Social simulation
   - Traffic simulation
   - Organizational modeling

3. **Information Systems:**
   - Information retrieval
   - Data integration
   - Workflow management

4. **Games:**
   - NPC behavior
   - Strategy game AI
   - Interactive storytelling

### Performance Characteristics

**Advantages:**
- Clear BDI semantics
- Rich programming constructs
- Strong Java integration
- Excellent tooling support
- Active community

**Limitations:**
- Learning curve for AgentSpeak
- Performance overhead vs. pure Java
- Limited built-in learning capabilities
- Requires careful plan library design

---

## Implications for Multi-Agent Systems

### Architectural Patterns

1. **Event-Driven Plans:**
   - Trigger behaviors based on events
   - Use context conditions for flexibility
   - Separate what to do from when to do it

2. **Goal Decomposition:**
   - Decompose high-level goals into subgoals
   - Create hierarchical plan structures
   - Enable plan reuse and modularity

3. **Failure Handling:**
   - Define explicit failure handling plans
   - Implement recovery strategies
   - Build robust agents

### Design Principles

**For Agent-Oriented Programming:**
- Use declarative beliefs for knowledge
- Define reactive plans for events
- Implement goal-directed behavior
- Handle failures gracefully

**For Multi-Agent Systems:**
- Use speech acts for communication
- Model agent interactions explicitly
- Implement coordination protocols
- Test with mind inspector

### Comparison to Other BDI Languages

| Feature | Jason | GOAL | 2APL |
|---------|-------|------|------|
| **Language Base** | AgentSpeak | GOAL Language | 2APL Language |
| **Goals** | Achievement goals | Declarative goals | Declarative + Procedural |
| **Plans** | Plan library | Action rules | Plan rules |
| **Implementation** | Java | Java | Java |
| **Communication** | KQML-like | Custom | FIPA ACL |

---

## Strengths and Limitations

### Strengths

- **Mature Implementation:** Well-tested, widely used
- **Rich Semantics:** Full BDI implementation
- **Java Integration:** Easy to extend with Java
- **Tooling:** Excellent debugging and visualization
- **Community:** Active development and support
- **Documentation:** Comprehensive book and tutorials

### Limitations

- **Learning Curve:** AgentSpeak requires learning
- **Performance:** Overhead compared to direct Java
- **Scalability:** Limited by centralized architecture
- **Learning:** No built-in machine learning
- **Environment Coupling:** Requires custom environment code

---

## Evolution and Modern Applications

### Extensions and Variants

**Jason Extensions:**
- AgentSpeak-X: Extended syntax
- Jason-JaCaMo: Integration with Moise+ organizations
- Jason-Java: Better Java integration

**Related Frameworks:**
- GOAL: Declarative goals focus
- 2APL: Hybrid declarative/imperative
- ASTRA: Modern AgentSpeak implementation

### Modern Relevance

Jason concepts apply to:

1. **LLM-Based Agents:**
   - Event-driven prompt selection
   - Goal decomposition in prompts
   - Plan libraries as prompt templates

2. **Multi-Agent Orchestration:**
   - Role-based agent definition
   - Speech-act inspired communication
   - Event-driven coordination

3. **Autonomous Systems:**
   - BDI-based behavior modeling
   - Robust failure handling
   - Explainable decision-making

---

## References

**Primary Paper:**
- Bordini, R. H., & Hübner, J. F. (2005). BDI Agent Programming in AgentSpeak Using Jason. AAMAS 2005.

**Book:**
- Bordini, R. H., Hübner, J. F., & Wooldridge, M. (2007). Programming Multi-Agent Systems in AgentSpeak using Jason. Wiley.

**Official Resources:**
- Jason Website: http://jason-lang.github.io/
- GitHub: https://github.com/jason-lang/jason

**Related Summaries:**
- BDI Architecture: [bdi-architecture-summary.md](./bdi-architecture-summary.md)
- GOAL: [goal-summary.md](./goal-summary.md)
- 2APL: [2apl-summary.md](./2apl-summary.md)
