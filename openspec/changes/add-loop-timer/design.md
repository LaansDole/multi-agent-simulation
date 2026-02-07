## Context

The DevAll platform currently supports iteration-based loop control via the `loop_counter` node. This change introduces a complementary time-based loop control mechanism via a new `loop_timer` node type.

**Background:**
- Existing `loop_counter` tracks iterations and emits after N passes
- Time-based control is needed for scenarios where duration matters more than iteration count
- Must maintain consistency with existing loop control patterns

**Constraints:**
- Follow existing `loop_counter` architecture for consistency
- Reuse `passthrough` and `reset_on_emit` patterns
- Minimize code duplication
- Support standard Python time units

## Goals / Non-Goals

**Goals:**
- Add time-based loop termination capability
- Support seconds, minutes, and hours as duration units
- Maintain behavioral consistency with `loop_counter` (standard mode and passthrough mode)
- Provide clear error messages for invalid configurations

**Non-Goals:**
- Replace or deprecate existing `loop_counter` (both coexist)
- Support sub-second precision (milliseconds, microseconds)
- Support calendar-based durations (days, weeks, months)
- Support dynamic duration modification during execution

## Decisions

### Decision 1: Separate Node Type vs Unified Configuration

**Chosen:** Separate `loop_timer` node type

**Rationale:**
- Clearer semantics: users explicitly choose iteration-based vs time-based
- Simpler configuration schemas (no conditional logic for mode switching)
- Easier documentation and examples
- Follows single responsibility principle

**Alternatives considered:**
- Unified `loop_guard` with `mode: counter|timer` - rejected due to configuration complexity
- Extend `loop_counter` with optional `max_duration` - rejected due to unclear semantics when both are set

### Decision 2: Duration Unit Representation

**Chosen:** Separate `max_duration` (numeric) and `duration_unit` (enum) fields

**Rationale:**
- Explicit and unambiguous (e.g., `max_duration: 5, duration_unit: minutes`)
- Easy validation and conversion
- Consistent with industry patterns (Kubernetes, Terraform)

**Alternatives considered:**
- Single string field with units (e.g., `"5m"`, `"2h"`) - rejected due to parsing complexity
- Duration in seconds only - rejected due to poor UX for long durations

### Decision 3: Time Tracking Implementation

**Chosen:** Store start timestamp in global state, compare on each execution

**Rationale:**
- Leverages existing `global_state` infrastructure (same as `loop_counter`)
- Simple elapsed time calculation: `current_time - start_time`
- Survives node execution cycles
- No background timers or threading needed

**Alternatives considered:**
- Background timer thread - rejected due to complexity and potential race conditions
- Event-based scheduling - rejected due to infrastructure requirements

### Decision 4: Timer Reset Behavior

**Chosen:** Reset timer to current timestamp when `reset_on_emit=True`

**Rationale:**
- Mirrors `loop_counter` reset semantics (counter resets to 0)
- Allows timer to be reused in multi-round workflows
- Predictable behavior for users familiar with `loop_counter`

## Risks / Trade-offs

**Risk:** Time drift in long-running workflows
- **Mitigation:** Document that timer measures elapsed time since first execution, not wall-clock time
- **Impact:** Low - most use cases involve minutes/hours, not days

**Risk:** Timezone and clock changes affecting timer accuracy
- **Mitigation:** Use `time.time()` (monotonic since epoch), not `time.localtime()`
- **Impact:** Minimal for typical workflow durations

**Trade-off:** No sub-second precision
- **Rationale:** Workflow execution overhead (I/O, LLM calls) is typically seconds or more
- **Workaround:** Users needing millisecond precision can implement custom nodes

## Migration Plan

**No migration required** - this is a new additive feature. Existing workflows using `loop_counter` are unaffected.

**Adoption path:**
1. Users read updated documentation showing both node types
2. Choose `loop_timer` for new time-based workflows
3. Gradually migrate existing time-sensitive `loop_counter` workflows (optional)

**Rollback:** Remove node type registration if critical issues are found post-deployment.

## Open Questions

1. **Should we support combined iteration + time limits?**
   - Example: Exit after 10 iterations OR 5 minutes, whichever comes first
   - Decision deferred to future iteration based on user feedback

2. **Should timer pause when node is not actively executing?**
   - Current design: Timer runs continuously from first execution
   - Alternative: Only count time during active execution cycles
   - **Recommendation:** Keep current design (simpler), add pause feature if requested

3. **How should timer behave in nested loops?**
   - Current design: Each `loop_timer` node maintains independent state
   - **Recommendation:** Document clearly in examples, no special handling needed
