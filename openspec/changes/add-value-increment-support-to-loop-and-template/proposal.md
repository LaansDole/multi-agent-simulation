# Proposal: Add Value Increment Support to Loop and Template Nodes

**Change ID:** `add-value-increment-support-to-loop-and-template`

**Status:** Draft

**Date:** 2026-02-11

## Problem Statement

Currently, workflows that need to track iteration counts (days, rounds, cycles) must rely on external edge processor functions that manipulate `global_state`. This creates several issues:

1. **Complexity**: Users must write custom Python edge processor functions like `increment_day_value_increment()` and `inject_day_to_message()`
2. **Boilerplate**: Each workflow requiring value increments duplicates similar value increment logic
3. **Template Limitations**: Template nodes cannot access `global_state`, requiring edge processors to inject value increment values into message content
4. **Loop Timer Gap**: The `loop_timer` node has timing logic but no built-in value increment support, forcing users to combine timing + edge processors
5. **Discoverability**: Value increment functionality is hidden in custom edge processors rather than being a first-class feature

### Example: Hospital Simulation

The hospital workflow needed to track simulation days across loop iterations:
- Required 3 custom edge processor functions (`increment_day_value_increment`, `inject_day_to_message`, `reset_day_value_increment`)
- Needed 10+ edge processor configurations to inject "Day X:" prefixes
- Template nodes couldn't display the current day without edge processor preprocessing
- DailySummary agent had to parse "Day X:" from message content instead of accessing state directly

## Proposed Solution

Add first-class value increment support to `loop_timer` and `template` nodes as built-in features:

### 1. Loop Timer Auto-Increment
Add optional value increment configuration to `loop_timer` nodes:
```yaml
- id: LoopGate
  type: loop_timer
  config:
    max_duration: 120
    duration_unit: seconds
    value_increment:
      key: simulation_day      # global_state key to track
      initial_value: 1         # starting value (default: 0)
      increment_by: 1          # amount to add per iteration (default: 1)
      increment_on: loop_back  # when to increment: 'loop_back' or 'emit' (default: loop_back)
```

### 2. Template Global State Access
Allow template nodes to access `global_state` directly in Jinja2 templates:
```yaml
- id: DayStartMessage
  type: template
  config:
    template: |
      Day {{ global_state.simulation_day }}: {{ input }}
      Total iterations: {{ global_state.iteration_count | default(0) }}
```

### 3. Value Increment Edge Condition Support
Enable keyword conditions to check value increment values:
```yaml
edges:
  - from: LoopGate
    to: FinalReport
    condition:
      type: keyword
      config:
        any: ["Time limit reached"]
    # OR check value increment threshold:
  - from: LoopGate
    to: MaxDaysReached
    condition:
      type: value_increment_threshold
      config:
        key: simulation_day
        operator: ">="
        value: 10
```

## Benefits

1. **Zero Python Code**: Users can create value increment-based workflows entirely in YAML
2. **Declarative**: Value increment logic is explicit in node configuration, not hidden in edge processors
3. **Composable**: Value increments work naturally with existing loop patterns
4. **Maintainable**: Value increment behavior is documented in the workflow YAML, not scattered across function files
5. **Backward Compatible**: Existing workflows continue to work; new features are opt-in

## Migration Path

Existing workflows using custom edge processors:
- **Keep Working**: No breaking changes
- **Gradual Migration**: Users can adopt new features incrementally
- **Side-by-Side**: New value increment features can coexist with custom edge processors

Example migration for hospital workflow:
```yaml
# Before: 3 edge processor functions + 10+ processor configs
edges:
  - from: LoopGate
    to: DayStart
    processor:
      type: function
      config:
        name: increment_day_value_increment

# After: Single value increment config on loop_timer
- id: LoopGate
  type: loop_timer
  config:
    max_duration: 120
    value_increment:
      key: hospital_day
      initial_value: 1
```

## Scope

### In Scope
- Add `value_increment` configuration to `loop_timer` node config
- Add `global_state` context variable to template node Jinja2 environment
- Update template executor to expose `global_state` in template context
- Update loop timer executor to handle optional value increment auto-increment
- Add value increment-based edge condition type (optional enhancement)
- Documentation and examples

### Out of Scope
- Value increment persistence across workflow runs (value increments reset each execution)
- Value increment synchronization in distributed environments
- Complex value increment operations (conditional increments, mathematical operations)
- Value increment visualization in UI (future enhancement)
- Migration tools to auto-convert edge processors to built-in value increments

## Dependencies

- No external dependencies
- Builds on existing `global_state` infrastructure
- Uses existing Jinja2 template engine
- Extends existing `loop_timer` and `template` node types

## Alternatives Considered

### Alternative 1: Enhanced Edge Processors Only
Keep edge processors but add `{{ global_state }}` to templates.

**Rejected because:**
- Still requires custom Python functions for value increment logic
- Doesn't reduce boilerplate for common use cases
- Value increment behavior remains non-declarative

### Alternative 2: New Value Increment Node Type
Create a dedicated `value_increment` node type.

**Rejected because:**
- Adds graph complexity (extra node per value increment)
- Loop timer already tracks iterations; adding value increments is natural
- Templates already format output; accessing state is logical

### Alternative 3: Value Increment as Graph-Level Config
Define value increments at graph level, separate from nodes.

**Rejected because:**
- Less intuitive than node-level config
- Harder to understand value increment lifecycle
- Doesn't leverage loop_timer's existing loop detection

## Success Criteria

1. **Functionality**: Users can create workflows with value increments using only YAML configuration
2. **Performance**: No measurable performance impact on workflows not using value increments
3. **Documentation**: Clear examples of value increment usage in loop workflows
4. **Tests**: Full test coverage for value increment increment, template access, and edge cases
5. **Migration**: Existing hospital workflow can be simplified to remove custom edge processors

## Related Changes

- **Spec Delta**: `loop-value-increment-support` - Loop timer value increment auto-increment
- **Spec Delta**: `template-global-state-access` - Template node global_state context
- **Spec Delta**: `value-increment-edge-conditions` - Value increment-based edge routing (optional)

## Questions for Review

1. Should value increment increment happen before or after loop_timer emits its message?
2. Should we limit value increment operations to integers only, or support floats?
3. Should templates have write access to `global_state`, or read-only?
4. Do we need value increment reset functionality, or rely on workflow restart?
5. Should we provide helper Jinja2 filters for value increment formatting (e.g., `{{ day | ordinal }}`)?
