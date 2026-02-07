# Spec Delta: Workflow Optimization - Passthrough Node Guidelines

## ADDED Requirements

### Requirement: Passthrough Node Usage Guidelines
The workflow design SHOULD minimize the use of passthrough nodes. Passthrough nodes MUST only be used when they provide clear value through context management, conditional routing, data aggregation, or state preservation that cannot be achieved through direct edge connections.

#### Scenario: Valid use - Aggregating parallel execution results
- **WHEN** a workflow uses dynamic execution to spawn multiple parallel agent instances (map-reduce pattern)
- **AND** the results from parallel instances need to be collected into a single aggregated output
- **THEN** use a passthrough node with appropriate aggregation configuration
- **EXAMPLE** SimulationAggregator collecting outcomes from multiple parallel patient processing workflows

#### Scenario: Valid use - Entry point with context preservation
- **WHEN** a workflow needs to preserve and attach metadata to initial user input
- **AND** subsequent nodes require both original input and added context
- **THEN** use a passthrough node as entry point with keep_message: true edges
- **EXAMPLE** Adding timestamp, session ID, or user credentials to initial request

#### Scenario: Valid use - Conditional routing with complex logic
- **WHEN** routing logic depends on runtime evaluation of message content or state
- **AND** the routing cannot be expressed through simple edge conditions
- **THEN** use a passthrough node with custom routing logic
- **EXAMPLE** Routing patient to specialist based on diagnosis severity score calculation

#### Scenario: Invalid use - Simple linear forwarding
- **WHEN** a node receives input and forwards it unchanged to a single downstream node
- **AND** no filtering, transformation, or context management occurs
- **THEN** connect the upstream and downstream nodes directly using edges
- **COUNTER-EXAMPLE** InputProcessor that only forwards UserInput to PatientGenerator

#### Scenario: Invalid use - One-to-one routing without conditions
- **WHEN** a node receives input from one upstream node and always sends to the same downstream node
- **AND** no branching, filtering, or data transformation occurs
- **THEN** remove the passthrough node and connect nodes directly
- **COUNTER-EXAMPLE** PatientRouter forwarding PatientGenerator output directly to PatientAgent

#### Scenario: Invalid use - Phase markers without functionality
- **WHEN** a passthrough node exists only to mark workflow phases or stages
- **AND** it provides no data processing, routing, or state management
- **THEN** remove the node and use node names or comments to indicate phases
- **COUNTER-EXAMPLE** DiagnosisPhase that only forwards DoctorNotes to PatientHistorySplitter

### Requirement: Direct Edge Connections Preferred
When connecting nodes in a workflow, designers MUST first evaluate whether direct edge connections can achieve the desired data flow. Passthrough nodes SHOULD only be introduced when direct edges cannot express the required logic.

#### Scenario: Preferred approach - Direct connection for linear flow
- **WHEN** node A produces output that node B consumes without modification
- **AND** no intermediate processing or routing is required
- **THEN** create a direct edge from node A to node B
- **EXAMPLE** DoctorNotes directly connected to PatientHistorySplitter via edge configuration

#### Scenario: Preferred approach - Edge conditions for simple routing
- **WHEN** routing depends on simple field value checks or pattern matching
- **AND** the logic can be expressed in edge condition syntax
- **THEN** use multiple edges with conditions instead of a routing passthrough node
- **EXAMPLE** Using edge conditions to route high-priority vs low-priority patients

### Requirement: Workflow Simplification Review
Existing workflows SHALL be periodically reviewed to identify and remove unnecessary passthrough nodes that were added during initial development but are no longer needed.

#### Scenario: Review trigger - Workflow maintenance cycle
- **WHEN** a workflow undergoes maintenance or enhancement
- **AND** the workflow contains passthrough nodes
- **THEN** evaluate each passthrough node against the usage guidelines
- **AND** remove nodes that do not meet valid use case criteria

#### Scenario: Review trigger - Performance optimization
- **WHEN** workflow execution performance needs improvement
- **AND** profiling shows overhead in message passing between nodes
- **THEN** identify passthrough nodes contributing to latency and evaluate for removal

## Modified Requirements

None - this spec delta only adds new guidelines for passthrough node usage.

## Removed Requirements

None - this spec delta does not deprecate any existing requirements.

## Rationale

Passthrough nodes add execution overhead and complexity to workflows without providing functional value when used inappropriately. By establishing clear guidelines for when passthrough nodes are justified versus when direct edge connections should be used, we improve:

1. **Performance** - Fewer node executions and message passing operations
2. **Maintainability** - Simpler graph structure easier to understand and debug
3. **Clarity** - Workflow intent is clearer when nodes represent actual processing steps
4. **Consistency** - Standard patterns across workflows reduce cognitive load

The hospital simulation workflow analysis revealed 3 passthrough nodes (InputProcessor, PatientRouter, DiagnosisPhase) that provide no filtering, routing logic, or state management beyond what edges already handle. Removing these nodes while retaining the justified SimulationAggregator demonstrates the practical application of these guidelines.

## Impact

- **Breaking Changes:** None - this is a guideline addition that does not affect existing valid passthrough node usage
- **Migration Required:** No - existing workflows continue to function; optimization is recommended but optional
- **Performance Impact:** Positive - following these guidelines reduces workflow execution overhead
- **Developer Experience:** Improved - clearer patterns for workflow design decisions
