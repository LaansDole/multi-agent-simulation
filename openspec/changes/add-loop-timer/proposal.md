# Change: Add Loop Timer Node for Time-Based Loop Control

## Why

The current `loop_counter` node provides iteration-based loop control, exiting after a specified number of iterations. However, there are scenarios where time-based loop control is more appropriate:

- Long-running simulations that should terminate after a specific duration
- Workflows with variable iteration times where iteration count is unreliable
- Real-time systems requiring strict time constraints regardless of work completed

Users need a time-based alternative to count-based loop termination.

## What Changes

- Add new `loop_timer` node type that tracks elapsed time instead of iteration count
- Configure maximum duration in seconds, minutes, or hours
- Support for timer reset on emission (similar to `loop_counter` reset behavior)
- Support for passthrough mode (similar to `loop_counter` passthrough behavior)
- Maintain similar API and configuration patterns to `loop_counter` for consistency

## Impact

**Affected specs:**
- New capability: `loop-control` (consolidates loop counter and loop timer semantics)

**Affected code:**
- `entity/configs/node/` - New `loop_timer.py` config class
- `runtime/node/executor/` - New `loop_timer_executor.py` executor
- `runtime/node/builtin_nodes.py` - Register `loop_timer` node type
- `docs/user_guide/en/execution_logic.md` - Document time-based exit condition
- `YAML_FORMAT_QUICK_GUIDE.md` - Add `loop_timer` node type documentation

**User-facing changes:**
- New node type available: `type: loop_timer`
- Configuration parameters: `max_duration`, `duration_unit`, `reset_on_emit`, `message`, `passthrough`
- Similar behavior patterns to `loop_counter` for ease of adoption
