# Agent Communication Protocols: FIPA-ACL and KQML

**Key Specifications:**

1. **FIPA ACL Message Structure Specification** - Foundation for Intelligent Physical Agents (2002)
2. **KQML as an Agent Communication Language** - Finin, T., Fritzson, R., McKay, D., & McEntire, R. (1994). CIKM'94

**FIPA URL:** https://www.fipa.org/repository/bysubject.html (FIPA ACL specifications)
**KQML DOI:** https://doi.org/10.1145/191246.191322

---

## Problem Statement and Motivation

### The Challenge
Enabling communication in multi-agent systems requires:
- Standardized message formats
- Clear semantic meaning
- Interoperability between heterogeneous agents
- Support for complex interaction patterns

### The Gap
Early multi-agent systems suffered from:
- **Proprietary protocols**: Each system had its own communication format
- **Semantic ambiguity**: Unclear meaning of messages
- **Limited interoperability**: Agents couldn't communicate across platforms
- **No standard interaction patterns**: No common coordination protocols

### The Solution
Standardized agent communication languages:
1. KQML (Knowledge Query and Manipulation Language) - Early standard
2. FIPA-ACL (Foundation for Intelligent Physical Agents ACL) - Refined standard
3. Speech act theory foundation
4. Formal semantics and interaction protocols

---

## Speech Act Theory Foundation

### Philosophical Basis

**Origin:**
- Developed by philosophers J.L. Austin and John Searle
- Speech acts are utterances that perform actions
- Saying something is doing something

**Key Concepts:**

**Locutionary Act:**
- The act of saying something
- The physical utterance

**Illocutionary Act:**
- The intention behind the utterance
- What is being done in saying it
- Examples: informing, requesting, promising

**Perlocutionary Act:**
- The effect of the utterance on the hearer
- Consequential effects
- Examples: convincing, persuading, surprising

### Application to Agent Communication

**Performatives:**
- Agent messages are illocutionary acts
- Performative defines the intention
- Content defines what is acted upon

**Example:**
```
Performative: inform
Content: "The temperature is 25 degrees"
Illocution: Informing about temperature
Perlocution: Receiver updates beliefs
```

---

## KQML (Knowledge Query and Manipulation Language)

### Overview

**Development:**
- Created as part of DARPA Knowledge Sharing Effort (1990s)
- Led by Tim Finin at UMBC
- One of the first agent communication languages
- Foundation for later standards

**Purpose:**
- Enable knowledge sharing among agents
- Provide extensible communication protocol
- Support heterogeneous agent systems

### KQML Architecture

**Three-Layer Structure:**

1. **Content Layer**: Actual message content, domain-specific language, application-dependent
2. **Message Layer**: Performative, defines message type, speech act specification
3. **Communication Layer**: Sender/receiver, message transport, low-level protocols

### KQML Message Structure

**Basic Format:**
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

**Example Messages:**
```kqml
// Tell another agent about a belief
(tell
    :sender agent1
    :receiver agent2
    :content "price(apple, 5)"
    :language Prolog
)

// Ask for information
(ask-one
    :sender agent1
    :receiver database
    :content "price(apple, ?Price)"
    :language Prolog
    :reply-with query1
)

// Achieve a goal
(achieve
    :sender manager
    :receiver worker
    :content "delivered(package123)"
    :language Prolog
)
```

### KQML Performatives

**Information Exchange:**
- `tell`: Inform about a belief
- `untell`: Retract a belief
- `deny`: Deny a proposition

**Queries:**
- `ask-one`: Request single answer
- `ask-all`: Request all answers
- `stream-all`: Stream all answers
- `eos`: End of stream

**Actions:**
- `achieve`: Request goal adoption
- `advertise`: Advertise capability
- `unadvertise`: Withdraw advertisement

**Brokerage:**
- `subscribe`: Subscribe to updates
- `register`: Register with facilitator
- `unregister`: Unregister from facilitator

**Miscellaneous:**
- `error`: Error message
- `sorry`: Cannot comply
- `ready`: Ready to receive
- `next`: Request next item

### Communication Facilitators

**Role of Facilitators:**
- Route messages between agents
- Maintain registry of agent capabilities
- Match agents with requests
- Enable anonymous communication

**Facilitator Architecture:**

Agent1/Agent2/Agent3/Agent4 connect to central Facilitator Agent, which routes messages between agents and maintains registry of capabilities.

**Facilitator Functions:**
```kqml
// Agent registers capability
(register
    :sender worker1
    :content (advertise
                :content (achieve
                           :content delivered(?Pkg))))

// Agent requests service
(broker-one
    :sender client
    :content (achieve :content delivered(pkg123)))
// Facilitator routes to appropriate worker
```

---

## FIPA-ACL (Foundation for Intelligent Physical Agents ACL)

### Overview

**Development:**
- Standardized by FIPA (Foundation for Intelligent Physical Agents)
- Built on KQML foundation
- More formal semantics
- Widely adopted standard

**Purpose:**
- Enable interoperability between agent systems
- Provide formal semantic foundation
- Support complex interaction protocols
- Enable multi-agent coordination

### FIPA-ACL Message Structure

**Basic Format:**
```fipa
(performative
    :sender <agent-id>
    :receiver <agent-id>
    :content <expression>
    :language <language>
    :encoding <encoding>
    :ontology <ontology>
    :protocol <interaction-protocol>
    :conversation-id <id>
    :reply-with <id>
    :reply-by <time>
    :in-reply-to <id>
)
```

**Example Messages:**
```fipa
// Inform about a belief
(inform
    :sender agent1
    :receiver agent2
    :content "temperature(room1, 25)"
    :language FIPA-SL
    :ontology building-ontology
)

// Request an action
(request
    :sender manager
    :receiver worker
    :content "action(move, robot1, room2)"
    :language FIPA-SL
    :protocol fipa-request
    :conversation-id conv123
)

// Propose a deal
(propose
    :sender seller
    :receiver buyer
    :content "price(apple, 3)"
    :language FIPA-SL
    :protocol fipa-contract-net
)
```

### FIPA-ACL Performatives

**Communication Acts:**
- `inform`: Inform about a belief
- `confirm`: Confirm a proposition
- `disconfirm`: Disconfirm a proposition
- `not-understood`: Indicate lack of understanding

**Requesting Actions:**
- `request`: Request action execution
- `agree`: Agree to perform action
- `refuse`: Refuse to perform action
- `failure`: Indicate action failure
- `inform-done`: Inform action completed
- `inform-result`: Inform action result

**Querying:**
- `query-if`: Query if proposition is true
- `query-ref`: Query referential expression
- `subscribe`: Subscribe to state changes

**Negotiation:**
- `cfp` (call for proposals): Request proposals
- `propose`: Submit a proposal
- `accept-proposal`: Accept a proposal
- `reject-proposal`: Reject a proposal

**Proxy Acts:**
- `proxy`: Request to forward to another
- `propagate`: Propagate to group

### FIPA-ACL Semantics

**Formal Foundation:**
- Based on modal logic
- Uses BDI-like concepts
- Formal semantics for each performative

**Semantic Model:**

**Informative Acts:**
```
inform(i, j, φ) means:
- i believes φ is true
- i intends j to believe φ
- i assumes j does not already believe φ
```

**Request Acts:**
```
request(i, j, action) means:
- i intends j to perform action
- i believes j can perform action
- j may accept or refuse
```

**Query Acts:**
```
query-if(i, j, φ) means:
- i wants to know if φ is true
- i believes j knows whether φ is true
- i expects j to inform about φ
```

---

## Interaction Protocols

### Purpose

**Why Interaction Protocols?**
- Structure complex multi-agent interactions
- Ensure correct message sequencing
- Enable predictable coordination
- Support common patterns

### FIPA Request Protocol

**Basic Request Pattern:**
```
Agent A                 Agent B
   │                       │
   │──── request ─────────>│
   │                       │
   │<──── agree ───────────│
   │      or refuse        │
   │                       │
   │<──── inform-done ─────│
   │      or failure       │
   │                       │
```

**Example:**
```fipa
// Step 1: Request
(request
    :sender manager
    :receiver worker
    :content "action(deliver, package123)"
    :protocol fipa-request
    :conversation-id conv1
)

// Step 2: Agree
(agree
    :sender worker
    :receiver manager
    :content "action(deliver, package123)"
    :protocol fipa-request
    :conversation-id conv1
)

// Step 3: Inform done
(inform
    :sender worker
    :receiver manager
    :content "done(action(deliver, package123))"
    :protocol fipa-request
    :conversation-id conv1
)
```

### FIPA Contract Net Protocol

**Contract Net Pattern:**
```
Initiator                Participants
   │                         │
   │──── cfp ───────────────>│
   │                         │
   │<──── propose ───────────│
   │      or refuse          │
   │                         │
   │──── accept-proposal ───>│
   │      or reject          │
   │                         │
   │<──── inform-done ───────│
   │      or failure         │
   │                         │
```

**Example:**
```fipa
// Step 1: Call for proposals
(cfp
    :sender manager
    :receiver (set worker1 worker2 worker3)
    :content "task(deliver, package, destination)"
    :protocol fipa-contract-net
    :conversation-id auction1
)

// Step 2: Proposals
(propose
    :sender worker1
    :receiver manager
    :content "bid(deliver, 100)"
    :protocol fipa-contract-net
    :conversation-id auction1
)

(propose
    :sender worker2
    :receiver manager
    :content "bid(deliver, 80)"
    :protocol fipa-contract-net
    :conversation-id auction1
)

// Step 3: Accept best proposal
(accept-proposal
    :sender manager
    :receiver worker2
    :content "bid(deliver, 80)"
    :protocol fipa-contract-net
    :conversation-id auction1
)

(reject-proposal
    :sender manager
    :receiver worker1
    :content "bid(deliver, 100)"
    :protocol fipa-contract-net
    :conversation-id auction1
)

// Step 4: Task completion
(inform
    :sender worker2
    :receiver manager
    :content "done(deliver)"
    :protocol fipa-contract-net
    :conversation-id auction1
)
```

### Other FIPA Protocols

**FIPA Query Protocol:**
```
Agent A                 Agent B
   │                       │
   │──── query-if ────────>│
   │      or query-ref     │
   │                       │
   │<──── inform ──────────│
   │      or refuse        │
   │                       │
```

**FIPA Subscribe Protocol:**
```
Agent A                 Agent B
   │                       │
   │──── subscribe ───────>│
   │                       │
   │<──── agree ───────────│
   │      or refuse        │
   │                       │
   │<──── inform ──────────│  (multiple)
   │      (updates)        │
   │                       │
   │──── cancel ──────────>│
   │                       │
```

---

## Ontologies and Content Languages

### Ontologies

**Purpose:**
- Define vocabulary for domain
- Provide shared understanding
- Enable semantic interoperability

**Example Ontology:**
```xml
<ontology name="warehouse-ontology">
    <concept name="Package">
        <attribute name="id" type="String"/>
        <attribute name="weight" type="Float"/>
        <attribute name="destination" type="Location"/>
    </concept>
    
    <concept name="Location">
        <attribute name="building" type="String"/>
        <attribute name="room" type="String"/>
    </concept>
    
    <predicate name="delivered">
        <parameter name="package" type="Package"/>
        <parameter name="destination" type="Location"/>
    </predicate>
    
    <action name="move">
        <parameter name="agent" type="Robot"/>
        <parameter name="from" type="Location"/>
        <parameter name="to" type="Location"/>
    </action>
</ontology>
```

### Content Languages

**FIPA-SL (Semantic Language):**
- Expressive logic-based language
- Supports quantification, modalities
- Standard FIPA content language

**Example FIPA-SL:**
```fipa
// Simple proposition
(delivered package123 room5)

// Conjunction
(and (delivered package123 room5)
     (paid customer456))

// Disjunction
(or (available item1)
    (available item2))

// Implication
(implies (paid customer) (shipped package))

// Quantification
(forall ?x (implies (package ?x) (delivered ?x)))
(exists ?y (and (package ?y) (urgent ?y)))

// Modal operators
(B agent1 (temperature room 25))  // Belief
(I agent1 (achieve (delivered pkg)))  // Intention
```

---

## Comparison: KQML vs FIPA-ACL

### Architectural Differences

| Aspect | KQML | FIPA-ACL |
|--------|------|----------|
| **Development** | DARPA KSE (1990s) | FIPA (1998-2002) |
| **Performatives** | ~40 performatives | ~20 performatives |
| **Semantics** | Informal | Formal (modal logic) |
| **Facilitators** | Central feature | Optional |
| **Protocols** | Limited | Rich set |

### Semantic Rigor

**KQML:**
- Pragmatic, less formal
- Focus on functionality
- Extensible performatives

**FIPA-ACL:**
- Formal semantics based on BDI logic
- Clear meaning for each performative
- Rigorous specification

### Practical Adoption

**KQML:**
- Early research systems
- Legacy applications
- Influence on FIPA-ACL

**FIPA-ACL:**
- Industry standard
- Wide adoption
- Implemented in major platforms (JADE, JACK, Jason)

---

## Implementation Considerations

### Message Transport

**Transport Protocols:**
- HTTP/HTTPS
- TCP/IP sockets
- IIOP (CORBA)
- SMTP (email)

**Message Encoding:**
- String representation (default)
- XML encoding
- Bit-efficient encoding

### Platform Support

**JADE (Java Agent DEvelopment Framework):**
- Full FIPA-ACL support
- Built-in interaction protocols
- Message transport and encoding
- Agent management

**Jason:**
- KQML-like messaging
- Speech act support
- Integration with FIPA-ACL

**Other Platforms:**
- JACK
- 2APL
- GOAL
- Various research platforms

---

## Example Multi-Agent Interaction

### Scenario: Warehouse Delivery Coordination

**Agents Involved:**
- Manager: Coordinates deliveries
- Worker1, Worker2: Perform deliveries
- Inventory: Manages inventory

**Interaction Using FIPA-ACL:**

```fipa
// 1. Manager queries inventory
(query-ref
    :sender manager
    :receiver inventory
    :content "(available ?Pkg)"
    :language FIPA-SL
    :protocol fipa-query
    :conversation-id query1
)

// 2. Inventory informs
(inform
    :sender inventory
    :receiver manager
    :content "(= (available ?Pkg) (package123))"
    :language FIPA-SL
    :protocol fipa-query
    :conversation-id query1
)

// 3. Manager calls for proposals
(cfp
    :sender manager
    :receiver (set worker1 worker2)
    :content "(deliver package123 room5)"
    :language FIPA-SL
    :ontology warehouse-ontology
    :protocol fipa-contract-net
    :conversation-id delivery1
)

// 4. Workers propose
(propose
    :sender worker1
    :receiver manager
    :content "(bid (deliver package123 room5) 10)"
    :language FIPA-SL
    :protocol fipa-contract-net
    :conversation-id delivery1
)

(propose
    :sender worker2
    :receiver manager
    :content "(bid (deliver package123 room5) 8)"
    :language FIPA-SL
    :protocol fipa-contract-net
    :conversation-id delivery1
)

// 5. Manager accepts best proposal
(accept-proposal
    :sender manager
    :receiver worker2
    :content "(bid (deliver package123 room5) 8)"
    :protocol fipa-contract-net
    :conversation-id delivery1
)

// 6. Worker informs completion
(inform
    :sender worker2
    :receiver manager
    :content "(done (deliver package123 room5))"
    :protocol fipa-contract-net
    :conversation-id delivery1
)
```

---

## Implications for Modern Multi-Agent Systems

### Architectural Patterns

1. **Speech Act-Based Communication:**
   - Use performatives to structure messages
   - Define clear semantics for message types
   - Enable rich agent interactions

2. **Interaction Protocols:**
   - Use standard protocols for common patterns
   - Structure complex interactions
   - Ensure predictable coordination

3. **Ontology-Based Interoperability:**
   - Define shared vocabularies
   - Enable semantic understanding
   - Support heterogeneous agents

### Design Principles

**For LLM-Based Agents:**
- Use structured message formats (JSON with performative field)
- Define clear message semantics
- Implement interaction protocols in prompts
- Use ontologies for domain knowledge

**For Multi-Agent Systems:**
- Standardize communication protocols
- Implement interaction protocols
- Use ontologies for shared understanding
- Support interoperability

### Modern Applications

**LLM Multi-Agent Communication:**
- Structured prompts as messages
- Role-based communication patterns
- Protocol-guided interactions
- Ontology-informed responses

**Distributed AI Systems:**
- Standardized APIs based on FIPA concepts
- Structured message exchange
- Protocol-based coordination
- Semantic interoperability

---

## Strengths and Limitations

### Strengths

**KQML:**
- Pioneered agent communication
- Extensible design
- Facilitator concept
- Rich set of performatives

**FIPA-ACL:**
- Formal semantics
- Industry standard
- Rich interaction protocols
- Wide adoption
- Clear specifications

### Limitations

**KQML:**
- Informal semantics
- Less rigor than FIPA
- Limited tool support
- Legacy status

**FIPA-ACL:**
- Complexity of formal semantics
- Learning curve
- Implementation overhead
- Can be overkill for simple systems

---

## Evolution and Modern Relevance

### Historical Impact

**Legacy:**
- Foundation for agent communication
- Influenced modern standards
- Core concepts still relevant

**Current Status:**
- FIPA-ACL still used in research and industry
- KQML mostly historical interest
- Concepts adapted for modern systems

### Modern Adaptations

**Web Services and APIs:**
- REST APIs with semantic meaning
- Structured message formats (JSON, XML)
- Protocol-based interactions
- Service discovery (like facilitators)

**LLM-Based Systems:**
- Structured prompts as messages
- Role-based communication
- Protocol patterns in multi-agent coordination
- Ontologies as knowledge bases

**Microservices:**
- Message-based communication
- Service discovery
- Structured protocols
- Semantic interoperability

---

## References

**Primary Specifications:**
1. Foundation for Intelligent Physical Agents (FIPA). (2002). FIPA ACL Message Structure Specification. https://www.fipa.org/specs/fipa00061/
2. Finin, T., Fritzson, R., McKay, D., & McEntire, R. (1994). KQML as an Agent Communication Language. CIKM'94. https://doi.org/10.1145/191246.191322

**Related Works:**
- Austin, J. L. (1962). How to Do Things with Words. Oxford University Press.
- Searle, J. R. (1969). Speech Acts. Cambridge University Press.
- Labrou, Y., & Finin, T. (1997). A Proposal for a New KQML Specification. Technical Report.

**Platform Documentation:**
- JADE: http://jade.tilab.com/
- FIPA: http://www.fipa.org/

**Related Summaries:**
- BDI Architecture: [bdi-architecture-summary.md](./bdi-architecture-summary.md)
- Jason: [bdi-agentspeak-jason-summary.md](./bdi-agentspeak-jason-summary.md)
- GOAL: [goal-summary.md](./goal-summary.md)
- 2APL: [2apl-summary.md](./2apl-summary.md)
