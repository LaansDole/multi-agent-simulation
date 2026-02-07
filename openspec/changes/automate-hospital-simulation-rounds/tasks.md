# Tasks for automate-hospital-simulation-rounds

## Overview

Implementation plan for converting the hospital simulation from manual human-controlled rounds to automated multi-round execution with scenario evolution.

## Tasks

### Task 1: Add ScenarioEvolver agent node
**File:** `yaml_instance/simulation_hospital.yaml`

**Changes:**
- Add new agent node `ScenarioEvolver` after existing nodes
- Configure with role to generate scenario evolution prompts automatically
- Use randomization to choose between "continue" or introducing new events
- Node should output evolution instructions similar to human input

**Validation:**
- Node definition follows agent node schema
- Role prompt includes logic for scenario progression vs. evolution
- Randomization mechanism produces varied outputs

### Task 2: Add SimulationLoopCounter loop_counter node
**File:** `yaml_instance/simulation_hospital.yaml`

**Changes:**
- Add new loop_counter node `SimulationLoopCounter`
- Set `max_iterations` to control number of simulation rounds
- Configure `message` to indicate when rounds complete
- Set `passthrough: true` to allow message flow
- Position after `SimulationAggregator` in node list

**Validation:**
- Loop counter configuration matches schema
- max_iterations set to reasonable default (e.g., 5 rounds)
- message field populated with completion indicator

### Task 3: Add FinalReportAggregator agent node
**File:** `yaml_instance/simulation_hospital.yaml`

**Changes:**
- Add new agent node `FinalReportAggregator` before `SimulationEnd`
- Configure role to summarize all rounds of patient outcomes
- Use memory retrieval to collect data from all previous rounds
- Generate comprehensive final report

**Validation:**
- Node can access memory from all rounds
- Role prompt includes aggregation and summarization logic
- Output format provides meaningful insights across rounds

### Task 4: Remove HumanControl node
**File:** `yaml_instance/simulation_hospital.yaml`

**Changes:**
- Remove `HumanControl` node definition (lines 706-735)
- Remove environment_memory attachment from this node

**Validation:**
- Node definition completely removed
- No orphaned references to HumanControl in edges

### Task 5: Update edge flow for automated rounds
**File:** `yaml_instance/simulation_hospital.yaml`

**Changes:**
- Remove edge: `HumanControl → environment` (lines 1145-1177)
- Remove edge: `HumanControl → SimulationEnd` (lines 1179-1192)
- Remove edge: `SimulationAggregator → HumanControl` (lines 1135-1143)
- Add edge: `SimulationAggregator → ScenarioEvolver` with appropriate processor
- Add edge: `ScenarioEvolver → SimulationLoopCounter` with carry_data
- Add edge: `SimulationLoopCounter → environment` (continue condition - when NOT max iterations)
- Add edge: `SimulationLoopCounter → FinalReportAggregator` (exit condition - when max iterations reached)
- Add edge: `FinalReportAggregator → SimulationEnd`

**Validation:**
- All edges reference valid node IDs
- Loop cycle correctly identified by execution engine
- Exit conditions properly trigger based on iteration count
- Context management (clear_context, keep_message) appropriate for loop

### Task 6: Remove initial_instruction field
**File:** `yaml_instance/simulation_hospital.yaml`

**Changes:**
- Remove `initial_instruction` field from graph configuration (line 1212)
- Scenario should be provided only via `task_prompt` at runtime

**Validation:**
- Field removed from YAML
- Workflow validation still passes
- Initial scenario passed correctly through task_prompt

### Task 7: Validate YAML structure
**File:** `yaml_instance/simulation_hospital.yaml`

**Commands:**
```bash
BASE_URL=http://localhost:1234/v1 API_KEY=dummy-key uv run python -m check.check --path yaml_instance/simulation_hospital.yaml
```

**Validation:**
- No YAML syntax errors
- All node references valid
- Graph structure well-formed
- Loop detection identifies the simulation round cycle
- No orphaned nodes

### Task 8: Update node memory configurations
**File:** `yaml_instance/simulation_hospital.yaml`

**Changes:**
- Ensure `ScenarioEvolver` has read access to `environment_memory`
- Ensure `FinalReportAggregator` has read access to all relevant memories
- Verify memory attachments don't conflict with loop structure

**Validation:**
- Memory references match defined memory stores
- retrieve_stage appropriately set
- No circular memory dependencies

### Task 9: Test automated workflow execution
**File:** `yaml_instance/simulation_hospital.yaml`

**Commands:**
```bash
uv run python run.py --path yaml_instance/simulation_hospital.yaml --name test_automated_hospital
```

**Validation:**
- Workflow executes without requiring user input
- All configured rounds complete successfully
- Scenario evolution occurs between rounds
- Final report aggregates all round outcomes
- Execution terminates automatically after max iterations
- Output structure is clear and useful

## Success Criteria

- [x] ScenarioEvolver node added and configured with evolution logic
- [x] SimulationLoopCounter node added with max_iterations setting
- [x] FinalReportAggregator node added with summarization logic
- [x] HumanControl node and its edges completely removed
- [x] New edge flow creates valid loop cycle
- [x] Loop automatically exits after configured rounds
- [x] YAML validation passes
- [x] Workflow executes fully automated (no user prompts)
- [x] Scenario evolves realistically between rounds
- [x] Final report provides comprehensive summary
- [x] Memory persistence works across rounds
- [x] No behavioral regressions in patient processing

## Rollback Plan

If issues arise during implementation:
1. Revert changes to `yaml_instance/simulation_hospital.yaml`
2. Restore HumanControl node and original edge configuration
3. Re-test original interactive workflow
4. Document specific failure mode for future reference

## Notes

- This is a significant workflow restructuring - test thoroughly
- The loop counter mechanism follows the same pattern as the existing `Doctor-Patient Phase Loop Counter`
- ScenarioEvolver randomization should be deterministic-seed based for reproducibility
- Consider keeping a backup copy of the original interactive version as `simulation_hospital_interactive.yaml`
- Final report format should be human-readable and include summary statistics
