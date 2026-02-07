## ADDED Requirements

### Requirement: Loop Timer Node Type

The system SHALL provide a `loop_timer` node type that controls loop execution based on elapsed time rather than iteration count.

#### Scenario: Time limit not reached

- **GIVEN** a `loop_timer` node configured with `max_duration: 5` and `duration_unit: seconds`
- **AND** `passthrough: false`
- **WHEN** the node is executed and only 2 seconds have elapsed since first execution
- **THEN** the node SHALL return an empty message list (suppress downstream execution)

#### Scenario: Time limit reached in standard mode

- **GIVEN** a `loop_timer` node configured with `max_duration: 5` and `duration_unit: seconds`
- **AND** `passthrough: false`
- **WHEN** the node is executed and 5 or more seconds have elapsed since first execution
- **THEN** the node SHALL emit a message with the configured message content
- **AND** include metadata with elapsed time and limit information

#### Scenario: Time limit reached with custom message

- **GIVEN** a `loop_timer` node configured with `max_duration: 10`, `duration_unit: seconds`, and `message: "Time's up!"`
- **WHEN** 10 seconds have elapsed
- **THEN** the emitted message SHALL contain the content "Time's up!"

#### Scenario: Timer reset after emission

- **GIVEN** a `loop_timer` node configured with `max_duration: 5`, `duration_unit: seconds`, and `reset_on_emit: true`
- **WHEN** the time limit is reached and message is emitted
- **THEN** the timer SHALL reset to the current timestamp
- **AND** subsequent executions SHALL measure time from the reset point

#### Scenario: Timer not reset after emission

- **GIVEN** a `loop_timer` node configured with `max_duration: 5`, `duration_unit: seconds`, and `reset_on_emit: false`
- **WHEN** the time limit is reached and message is emitted
- **THEN** the timer SHALL continue from the original start time
- **AND** all subsequent executions SHALL emit the configured message

#### Scenario: Passthrough mode before limit

- **GIVEN** a `loop_timer` node configured with `max_duration: 5`, `duration_unit: seconds`, and `passthrough: true`
- **WHEN** the node is executed and only 2 seconds have elapsed
- **THEN** the node SHALL pass through all input messages unchanged

#### Scenario: Passthrough mode at limit

- **GIVEN** a `loop_timer` node configured with `max_duration: 5`, `duration_unit: seconds`, and `passthrough: true`
- **WHEN** the node is executed and exactly 5 seconds have elapsed
- **THEN** the node SHALL emit the configured limit message
- **AND** suppress the original input messages

#### Scenario: Passthrough mode after limit

- **GIVEN** a `loop_timer` node configured with `max_duration: 5`, `duration_unit: seconds`, and `passthrough: true`
- **WHEN** the node is executed and more than 5 seconds have elapsed
- **THEN** the node SHALL act as a transparent gate
- **AND** pass through all subsequent messages unchanged

### Requirement: Duration Unit Support

The system SHALL support multiple time units for specifying loop duration.

#### Scenario: Duration in seconds

- **GIVEN** a `loop_timer` node configured with `max_duration: 30` and `duration_unit: seconds`
- **WHEN** 30 seconds have elapsed
- **THEN** the timer SHALL trigger emission

#### Scenario: Duration in minutes

- **GIVEN** a `loop_timer` node configured with `max_duration: 2` and `duration_unit: minutes`
- **WHEN** 120 seconds (2 minutes) have elapsed
- **THEN** the timer SHALL trigger emission

#### Scenario: Duration in hours

- **GIVEN** a `loop_timer` node configured with `max_duration: 1` and `duration_unit: hours`
- **WHEN** 3600 seconds (1 hour) have elapsed
- **THEN** the timer SHALL trigger emission

### Requirement: Configuration Validation

The system SHALL validate loop timer configuration parameters at workflow load time.

#### Scenario: Valid configuration

- **GIVEN** a workflow with `loop_timer` node configured with `max_duration: 10` and `duration_unit: seconds`
- **WHEN** the workflow is loaded via `check.check` module
- **THEN** validation SHALL pass without errors

#### Scenario: Invalid duration value

- **GIVEN** a workflow with `loop_timer` node configured with `max_duration: 0`
- **WHEN** the workflow is loaded via `check.check` module
- **THEN** validation SHALL fail with error "max_duration must be > 0"

#### Scenario: Negative duration value

- **GIVEN** a workflow with `loop_timer` node configured with `max_duration: -5`
- **WHEN** the workflow is loaded via `check.check` module
- **THEN** validation SHALL fail with error "max_duration must be > 0"

#### Scenario: Invalid duration unit

- **GIVEN** a workflow with `loop_timer` node configured with `duration_unit: "days"`
- **WHEN** the workflow is loaded via `check.check` module
- **THEN** validation SHALL fail with error "duration_unit must be one of: seconds, minutes, hours"

### Requirement: Timer State Management

The system SHALL maintain timer state across node executions within a workflow run using global state.

#### Scenario: First execution initializes timer

- **GIVEN** a `loop_timer` node that has never been executed in the current workflow run
- **WHEN** the node is executed for the first time
- **THEN** the system SHALL record the current timestamp in global state under the node ID

#### Scenario: Subsequent executions use existing timer

- **GIVEN** a `loop_timer` node that has been executed previously in the current workflow run
- **WHEN** the node is executed again
- **THEN** the system SHALL retrieve the start timestamp from global state
- **AND** calculate elapsed time as `current_time - start_time`

#### Scenario: Independent timers for different nodes

- **GIVEN** two `loop_timer` nodes with IDs "timer1" and "timer2"
- **WHEN** both nodes are executed in the same workflow
- **THEN** each node SHALL maintain its own independent start timestamp
- **AND** timers SHALL not interfere with each other

### Requirement: Metadata Inclusion

The system SHALL include timer metadata in emitted messages for debugging and observability.

#### Scenario: Metadata in limit message

- **GIVEN** a `loop_timer` node configured with `max_duration: 5`, `duration_unit: seconds`
- **WHEN** the time limit is reached and message is emitted
- **THEN** the message metadata SHALL include:
  - `elapsed_time`: actual elapsed time in seconds
  - `max_duration`: configured maximum duration value
  - `duration_unit`: configured duration unit
  - `reset_on_emit`: configured reset behavior
  - `passthrough`: configured passthrough mode

#### Scenario: Metadata format

- **GIVEN** a `loop_timer` message with metadata
- **WHEN** the metadata is inspected
- **THEN** it SHALL be structured as a dictionary under the key "loop_timer"
- **AND** all values SHALL be JSON-serializable types
