# Tasks: Add Value Increment Support to Loop and Template Nodes

**Change ID:** `add-value-increment-support-to-loop-and-template`

## Task Breakdown

### Phase 1: Template Global State Access (Foundation)

#### Task 1.1: Add global_state to template context
**Goal:** Template nodes can access `{{ global_state.key }}` in Jinja2 templates

**Steps:**
1. Modify `runtime/node/executor/template_executor.py`:
   - Add `global_state` to `template_context` dictionary (line ~90)
   - Expose `self.context.global_state` in Jinja2 rendering context
2. Update `entity/configs/node/template.py`:
   - Update `FIELD_SPECS['template'].description` to document `{{ global_state }}` variable

**Validation:**
- Create test workflow with template node using `{{ global_state.test_value }}`
- Verify template renders global_state values correctly
- Verify undefined global_state keys raise appropriate errors in strict mode

**Files Modified:**
- `runtime/node/executor/template_executor.py`
- `entity/configs/node/template.py`

**Estimated Effort:** 1-2 hours

---

#### Task 1.2: Add Jinja2 filters for value increment formatting
**Goal:** Provide helper filters for common value increment formatting needs

**Steps:**
1. Add filter functions to `runtime/node/executor/template_executor.py`:
   - `ordinal_filter(n)`: Converts `1 → "1st"`, `2 → "2nd"`, etc.
   - `zero_pad_filter(n, width)`: Pads numbers with zeros (e.g., `5 → "05"`)
2. Register filters in `SandboxedEnvironment` (line ~76)
3. Update template config docs with filter examples

**Validation:**
- Test `{{ global_state.day | ordinal }}` → "1st day", "2nd day"
- Test `{{ global_state.count | zero_pad(3) }}` → "001", "042"
- Verify filters work with missing/null values gracefully

**Files Modified:**
- `runtime/node/executor/template_executor.py`
- `entity/configs/node/template.py`

**Estimated Effort:** 2-3 hours

---

### Phase 2: Loop Timer Value Increment Support

#### Task 2.1: Add value increment configuration to loop_timer
**Goal:** Loop timer nodes can auto-increment value increments

**Steps:**
1. Create `entity/configs/node/loop_timer_value_increment.py`:
   - Define `LoopTimerValueIncrementConfig` dataclass with fields:
     - `key: str` - global_state key
     - `initial_value: int` - starting value (default: 0)
     - `increment_by: int` - increment amount (default: 1)
     - `increment_on: str` - when to increment: "loop_back" or "emit" (default: "loop_back")
2. Modify `entity/configs/node/loop_timer.py`:
   - Add optional `value_increment: LoopTimerValueIncrementConfig | None` field to `LoopTimerConfig`
   - Add from_dict parsing for value_increment field
   - Add FIELD_SPECS for value increment configuration

**Validation:**
- Validate YAML parsing with value increment config
- Run `uv run python -m check.check` on test workflow
- Verify value increment config is optional (backward compatible)

**Files Created:**
- `entity/configs/node/loop_timer_value_increment.py`

**Files Modified:**
- `entity/configs/node/loop_timer.py`

**Estimated Effort:** 2-3 hours

---

#### Task 2.2: Implement value increment auto-increment in loop timer executor
**Goal:** Loop timer increments value increment on loop iterations

**Steps:**
1. Modify `runtime/node/executor/loop_timer_executor.py`:
   - In `execute()` method, check if `config.value_increment` is configured
   - Initialize value increment in `global_state` if not present (use `initial_value`)
   - Increment value increment based on `increment_on` setting:
     - `"loop_back"`: Increment when passthrough mode loops back
     - `"emit"`: Increment when limit message is emitted
   - Add debug logging for value increment operations

**Validation:**
- Create test workflow with loop_timer value increment
- Verify value increment initializes to `initial_value`
- Verify value increment increments by `increment_by` on each iteration
- Verify `increment_on: "loop_back"` vs `"emit"` behavior differs correctly
- Check global_state contains correct value increment value after loop

**Files Modified:**
- `runtime/node/executor/loop_timer_executor.py`

**Estimated Effort:** 3-4 hours

---

### Phase 3: Integration and Testing

#### Task 3.1: Create comprehensive test workflow
**Goal:** Demonstrate value increment features in realistic scenario

**Steps:**
1. Create `yaml_instance/demo_value_increment_loop.yaml`:
   - Loop timer with value increment configuration
   - Template nodes using `{{ global_state.value_increment }}`
   - Multiple value increments tracking different metrics
   - Edge conditions based on value increment values
2. Create `yaml_instance/demo_hospital_simplified.yaml`:
   - Simplified hospital workflow using built-in value increments instead of edge processors
   - Remove custom `day_value_increment.py` edge processor dependencies
   - Use loop_timer value increment for day tracking
   - Use template nodes with `{{ global_state.hospital_day }}`

**Validation:**
- Both workflows pass `uv run python -m check.check`
- Workflows execute successfully with `uv run python run.py`
- Value increment values progress correctly across loop iterations
- Template nodes render value increment values accurately

**Files Created:**
- `yaml_instance/demo_value_increment_loop.yaml`
- `yaml_instance/demo_hospital_simplified.yaml`

**Estimated Effort:** 3-4 hours

---

#### Task 3.2: Add unit tests for value increment functionality
**Goal:** Comprehensive test coverage for new features

**Steps:**
1. Create `tests/test_loop_timer_value_increment.py`:
   - Test value increment initialization
   - Test value increment increment on loop iterations
   - Test `increment_on` variants ("loop_back", "emit")
   - Test multiple independent value increments
   - Test value increment with loop timer timeout
2. Create `tests/test_template_global_state.py`:
   - Test template access to global_state
   - Test undefined key handling (strict mode)
   - Test ordinal and zero_pad filters
   - Test global_state with nested data structures

**Validation:**
- All tests pass: `uv run pytest tests/test_loop_timer_value_increment.py tests/test_template_global_state.py -v`
- Code coverage >= 90% for new code

**Files Created:**
- `tests/test_loop_timer_value_increment.py`
- `tests/test_template_global_state.py`

**Estimated Effort:** 4-5 hours

---

### Phase 4: Documentation

#### Task 4.1: Update user documentation
**Goal:** Users can discover and use value increment features

**Steps:**
1. Update `docs/user_guide/en/nodes/loop_timer.md`:
   - Add value increment configuration section
   - Provide examples with day value increments, iteration value increments
   - Explain `increment_on` behavior
2. Update `docs/user_guide/en/nodes/template.md`:
   - Document `{{ global_state }}` context variable
   - Provide examples of value increment access in templates
   - Document ordinal and zero_pad filters
3. Create `docs/user_guide/en/patterns/loop_value_increments.md`:
   - Common patterns for loop value increments
   - Migration guide from edge processors to built-in value increments
   - Troubleshooting value increment issues

**Validation:**
- Documentation includes working code examples
- Examples are tested and verified
- Links between related docs are correct

**Files Modified:**
- `docs/user_guide/en/nodes/loop_timer.md`
- `docs/user_guide/en/nodes/template.md`

**Files Created:**
- `docs/user_guide/en/patterns/loop_value_increments.md`

**Estimated Effort:** 3-4 hours

---

#### Task 4.2: Add inline code documentation
**Goal:** Code is well-documented for maintainers

**Steps:**
1. Add docstrings to new functions and classes:
   - `LoopTimerValueIncrementConfig` class and fields
   - Value increment increment logic in `loop_timer_executor.py`
   - Template filter functions (`ordinal_filter`, `zero_pad_filter`)
2. Update module-level docstrings to mention value increment support
3. Add inline comments explaining value increment lifecycle

**Validation:**
- All public functions have docstrings
- Docstrings follow Google or NumPy style
- Complex logic has explanatory comments

**Files Modified:**
- `entity/configs/node/loop_timer_value_increment.py`
- `runtime/node/executor/loop_timer_executor.py`
- `runtime/node/executor/template_executor.py`

**Estimated Effort:** 1-2 hours

---

## Task Dependencies

```
Task 1.1 (Template global_state) ──┐
                                   ├──> Task 3.1 (Test workflows)
Task 2.2 (Loop value increment logic)  ────┘         │
         ↑                                    │
         │                                    ↓
Task 2.1 (Loop value increment config)        Task 3.2 (Unit tests)
                                             │
Task 1.2 (Jinja2 filters) ───────────────────┤
                                             │
                                             ↓
                                      Task 4.1 (User docs)
                                             │
                                             ↓
                                      Task 4.2 (Code docs)
```

## Parallel Work Opportunities

- **Task 1.1 and Task 2.1** can be done in parallel (different files)
- **Task 1.2 and Task 2.2** can be done in parallel (different features)
- **Task 4.1 and Task 4.2** can be done in parallel (different audiences)

## Total Estimated Effort

- **Phase 1:** 3-5 hours
- **Phase 2:** 5-7 hours
- **Phase 3:** 7-9 hours
- **Phase 4:** 4-6 hours

**Total:** 19-27 hours (2.5-3.5 days)

## Success Metrics

1. Zero breaking changes - all existing workflows continue to work
2. Hospital workflow can be simplified by removing custom edge processors
3. New demo workflows demonstrate value increment features clearly
4. Test coverage >= 90% for new value increment functionality
5. Documentation includes at least 3 working examples
6. Validation passes: `uv run python -m check.check --path yaml_instance/demo_value_increment_loop.yaml`
