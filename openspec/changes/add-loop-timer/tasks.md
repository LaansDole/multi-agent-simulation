# Implementation Tasks

## 1. Configuration Schema

- [x] 1.1 Create `entity/configs/node/loop_timer.py` with `LoopTimerConfig` dataclass
- [x] 1.2 Define configuration fields: `max_duration`, `duration_unit`, `reset_on_emit`, `message`, `passthrough`
- [x] 1.3 Add validation logic for duration constraints (must be > 0)
- [x] 1.4 Define `FIELD_SPECS` for UI metadata

## 2. Executor Implementation

- [x] 2.1 Create `runtime/node/executor/loop_timer_executor.py` with `LoopTimerNodeExecutor` class
- [x] 2.2 Implement time tracking using `time.time()` in global state
- [x] 2.3 Implement standard mode (passthrough=False): suppress until time limit, then emit
- [x] 2.4 Implement terminal gate mode (passthrough=True): pass through, emit at limit, then transparent
- [x] 2.5 Add timer reset logic when `reset_on_emit=True`
- [x] 2.6 Convert duration units (seconds, minutes, hours) to seconds for tracking

## 3. Node Registration

- [x] 3.1 Add `loop_timer` import to `runtime/node/builtin_nodes.py`
- [x] 3.2 Register `LoopTimerNodeExecutor` in node type mapping
- [x] 3.3 Add `loop_timer` to supported node type list

## 4. Documentation

- [x] 4.1 Update `docs/user_guide/en/execution_logic.md` - add time-based exit condition
- [x] 4.2 Update `YAML_FORMAT_QUICK_GUIDE.md` - add `loop_timer` node type section
- [x] 4.3 Document configuration parameters and behavior modes

## 5. Example Workflow

- [x] 5.1 Create `yaml_instance/demo_loop_timer.yaml` demonstrating time-based loop control
- [x] 5.2 Test standard mode (passthrough=False)
- [x] 5.3 Test terminal gate mode (passthrough=True)
- [x] 5.4 Merge both modes into comprehensive demo with 2-minute duration
- [x] 5.5 Remove duplicate `demo_loop_timer_passthrough.yaml` file

## 6. Testing and Validation

- [x] 6.1 Create unit tests for `LoopTimerConfig` validation
- [x] 6.2 Create unit tests for `LoopTimerNodeExecutor` execution logic
- [x] 6.3 Test duration unit conversions (seconds, minutes, hours)
- [x] 6.4 Test timer reset behavior
- [x] 6.5 Validate with `uv run python -m check.check --path yaml_instance/demo_loop_timer.yaml`
- [x] 6.6 Run integration test with actual workflow execution
