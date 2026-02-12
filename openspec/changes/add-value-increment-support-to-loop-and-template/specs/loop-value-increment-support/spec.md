# loop-value-increment-support Specification Delta

## Purpose
Enable loop_timer nodes to automatically increment value increments in global_state on each loop iteration, eliminating the need for custom edge processor functions to track iteration counts.

## ADDED Requirements

### Requirement: Loop Timer Value Increment Configuration
The loop_timer node SHALL support optional value increment auto-increment configuration to track loop iterations without requiring custom edge processors.

#### Scenario: Configure value increment with default increment
- **GIVEN** a loop_timer node configuration with value increment enabled
- **AND** the value increment specifies a global_state key name
- **WHEN** the workflow is validated and executed
- **THEN** the value increment SHALL be initialized in global_state with the configured initial value (default: 0)
- **AND** the value increment SHALL increment by 1 on each loop iteration
- **AND** the value increment value SHALL persist in global_state across all nodes

**Example:**
```yaml
- id: LoopGate
  type: loop_timer
  config:
    max_duration: 60
    duration_unit: seconds
    value_increment:
      key: iteration_count
      initial_value: 0
      increment_by: 1
```

#### Scenario: Configure value increment with custom increment value
- **GIVEN** a loop_timer value increment configured with `increment_by: 5`
- **AND** the value increment starts at `initial_value: 10`
- **WHEN** the loop executes 3 iterations
- **THEN** the value increment value SHALL progress: 10 → 15 → 20 → 25
- **AND** downstream nodes SHALL see the updated value increment value in global_state

#### Scenario: Multiple independent value increments in one workflow
- **GIVEN** two loop_timer nodes with different value increment keys
- **AND** LoopGate1 value increment: `key: outer_loop`, `increment_by: 1`
- **AND** LoopGate2 value increment: `key: inner_loop`, `increment_by: 10`
- **WHEN** both loops execute
- **THEN** global_state SHALL contain both value increments independently
- **AND** each value increment SHALL increment according to its own configuration
- **AND** value increments SHALL NOT interfere with each other

### Requirement: Value Increment Increment Timing Control
The loop_timer value increment SHALL support configurable increment timing to control when the value increment increments relative to loop execution.

#### Scenario: Increment value increment on loop-back edge
- **GIVEN** a loop_timer value increment with `increment_on: "loop_back"`
- **AND** the loop_timer is in passthrough mode
- **WHEN** the loop condition triggers and execution loops back to the start node
- **THEN** the value increment SHALL increment BEFORE the start node receives the message
- **AND** the start node SHALL see the new value increment value immediately

**Example:**
```yaml
value_increment:
  key: day_number
  initial_value: 1
  increment_by: 1
  increment_on: "loop_back"  # Increment when looping, not when terminating
```

#### Scenario: Increment value increment on limit message emit
- **GIVEN** a loop_timer value increment with `increment_on: "emit"`
- **AND** the loop_timer reaches its time limit
- **WHEN** the loop_timer emits its termination message
- **THEN** the value increment SHALL increment BEFORE the message is sent
- **AND** the termination message SHALL reflect the incremented count

#### Scenario: Value increment initialization without prior execution
- **GIVEN** a loop_timer value increment configured with `initial_value: 100`
- **AND** the value increment key does not exist in global_state
- **WHEN** the loop_timer executes for the first time
- **THEN** the value increment SHALL be created in global_state with value 100
- **AND** no increment SHALL occur on the first execution (value increment remains at initial value)
- **AND** subsequent loop iterations SHALL increment from 100

### Requirement: Value Increment Backward Compatibility
The loop_timer value increment feature SHALL be entirely optional and backward compatible with existing workflows.

#### Scenario: Loop timer without value increment configuration
- **GIVEN** a loop_timer node configuration without a value_increment field
- **WHEN** the workflow is validated and executed
- **THEN** the loop_timer SHALL function exactly as before
- **AND** no value increments SHALL be created in global_state
- **AND** existing workflows SHALL continue to work without modification

#### Scenario: Coexistence with edge processor value increments
- **GIVEN** a workflow using custom edge processor functions for value increment logic
- **AND** a loop_timer node with built-in value increment configured
- **WHEN** both mechanisms are used in the same workflow
- **THEN** both value increment approaches SHALL function independently
- **AND** edge processor value increments SHALL NOT conflict with loop_timer value increments
- **AND** users MAY use different keys for built-in vs custom value increments

### Requirement: Value Increment Configuration Validation
The loop_timer value increment configuration SHALL be validated at workflow load time to prevent runtime errors.

#### Scenario: Invalid value increment configuration is rejected
- **GIVEN** a loop_timer value increment with missing required field `key`
- **WHEN** the workflow YAML is validated
- **THEN** validation SHALL fail with a clear error message
- **AND** the error message SHALL indicate which field is missing
- **AND** the workflow SHALL NOT execute

#### Scenario: Value increment key naming constraints
- **GIVEN** a loop_timer value increment configured with `key: "my-value-increment-123"`
- **WHEN** the workflow is validated
- **THEN** the key SHALL be accepted as valid
- **AND** keys SHALL support alphanumeric characters, underscores, and hyphens
- **AND** keys SHALL NOT contain spaces or special characters (except - and _)

#### Scenario: Value increment initial value and increment type validation
- **GIVEN** a loop_timer value increment with `initial_value: "ten"` (string instead of integer)
- **WHEN** the workflow is validated
- **THEN** validation SHALL fail with a type error
- **AND** the error SHALL indicate that initial_value must be an integer
- **AND** the same validation SHALL apply to `increment_by` field

### Requirement: Value Increment State Persistence Scope
Loop_timer value increments SHALL persist in global_state for the duration of workflow execution but reset between workflow runs.

#### Scenario: Value increment persists across graph cycles
- **GIVEN** a loop_timer value increment initialized to 1
- **AND** the workflow executes multiple graph cycles
- **WHEN** any node accesses global_state during execution
- **THEN** the value increment value SHALL be available across all cycles
- **AND** the value increment SHALL maintain its value between loop iterations
- **AND** all nodes SHALL see the same value increment value at any given point

#### Scenario: Value increment resets on workflow restart
- **GIVEN** a workflow has executed with a loop_timer value increment reaching value 10
- **AND** the workflow execution completes
- **WHEN** the same workflow is executed again (new run)
- **THEN** the value increment SHALL be reinitialized to its configured initial_value
- **AND** the previous run's value increment value SHALL NOT affect the new run
- **AND** value increments SHALL NOT persist to disk or across processes

### Requirement: Value Increment Debugging and Observability
Loop_timer value increment operations SHALL be logged to aid debugging and workflow development.

#### Scenario: Value increment initialization is logged
- **GIVEN** a loop_timer node with value increment configuration
- **WHEN** the loop_timer executes for the first time
- **THEN** a debug log message SHALL be emitted
- **AND** the log SHALL include the value increment key and initial value
- **AND** the log SHALL indicate that the value increment was initialized

#### Scenario: Value increment increment is logged
- **GIVEN** a loop_timer value increment incrementing on loop iterations
- **WHEN** the value increment increments
- **THEN** a debug log message SHALL be emitted
- **AND** the log SHALL include the value increment key, old value, and new value
- **AND** the log SHALL indicate which node triggered the increment

#### Scenario: Value increment state visible in workflow logs
- **GIVEN** a workflow execution with multiple loop_timer value increments
- **WHEN** reviewing the execution logs
- **THEN** users SHALL be able to trace value increment value changes over time
- **AND** logs SHALL clearly show when value increments initialize vs increment
- **AND** logs SHALL include enough context to debug value increment-related issues

## MODIFIED Requirements

None. This is a new feature addition with no modifications to existing behavior.

## REMOVED Requirements

None. All existing loop_timer functionality remains unchanged.
