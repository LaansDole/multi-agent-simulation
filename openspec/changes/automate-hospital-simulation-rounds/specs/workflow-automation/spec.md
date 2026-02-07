## ADDED Requirements

### Requirement: Automated Multi-Round Workflow Execution
The workflow system SHALL support automated execution for a configurable number of rounds without requiring human intervention between rounds.

#### Scenario: Automated round execution with loop counter
- **WHEN** a workflow contains a loop_counter node with max_iterations configured
- **AND** the loop connects back to the start of the workflow
- **THEN** the workflow executes the configured number of iterations automatically
- **AND** exits the loop after max_iterations is reached

#### Scenario: Scenario evolution between rounds
- **WHEN** executing multiple rounds automatically
- **AND** an agent node is configured to generate evolution prompts
- **THEN** the agent generates varied evolution instructions for each round
- **AND** the workflow state evolves between rounds based on generated instructions

#### Scenario: Final aggregation after all rounds
- **WHEN** the loop exits after completing all iterations
- **AND** an aggregator node is configured to summarize results
- **THEN** the aggregator collects data from all rounds
- **AND** produces a comprehensive final report

### Requirement: Loop Counter Round Control
The loop_counter node type SHALL control multi-round workflow execution by tracking iteration count and emitting exit signals when maximum iterations are reached.

#### Scenario: Loop counter tracks rounds
- **WHEN** a loop_counter node is positioned in a workflow cycle
- **AND** max_iterations is set to N
- **THEN** the node allows N iterations before emitting exit signal
- **AND** the workflow can route to different paths based on iteration state

#### Scenario: Loop counter exit condition
- **WHEN** loop counter reaches max_iterations
- **AND** edges check for the exit message keyword
- **THEN** the exit edge is triggered
- **AND** the continue edge is not triggered

### Requirement: Memory Persistence Across Rounds
Memory stores SHALL persist data across all workflow rounds, enabling agents to access historical context from previous iterations.

#### Scenario: Environment memory continuity
- **WHEN** an agent writes to memory in round N
- **AND** the same agent retrieves memory in round N+1
- **THEN** the agent receives data from all previous rounds
- **AND** memory similarity thresholds filter relevant historical context

#### Scenario: Cross-round data aggregation
- **WHEN** an aggregator node retrieves memory after multiple rounds
- **AND** memory contains entries from all completed rounds
- **THEN** the aggregator can access and summarize all round data
- **AND** produce comprehensive multi-round analytics

## Rationale

The current hospital simulation workflow requires manual human intervention between each round, creating friction for batch processing, automated testing, and research scenarios. By introducing automated round control using loop counters and scenario evolution agents, the workflow becomes suitable for unattended operation while maintaining realistic scenario progression.

This change aligns with the existing loop counter pattern already used for doctor-patient interactions, extending the same mechanism to the outer simulation round control. The memory persistence behavior remains unchanged, ensuring continuity across rounds.

## Impact

- **Breaking Changes:** Workflows using HumanControl for interactive simulation rounds will need migration to separate workflow variants
- **Migration Required:** Users wanting interactive control should maintain a separate workflow file (e.g., simulation_hospital_interactive.yaml)
- **Performance Impact:** Neutral - automated execution may be faster due to elimination of human wait time
- **Developer Experience:** Improved - enables automated batch simulations and research workflows
