# Tasks for simplify-hospital-passthrough-nodes

## Overview
Implementation checklist for removing 3 unnecessary passthrough nodes from the hospital simulation workflow while preserving the 1 justified aggregator node.

## Tasks

### Task 1: Remove InputProcessor passthrough node
**File:** `yaml_instance/simulation_hospital.yaml`

**Changes:**
- Remove InputProcessor node definition (lines 66-70)
- Update UserInput node's outgoing edges to connect directly to PatientGenerator
- Change edge from `UserInput -> InputProcessor` to `UserInput -> PatientGenerator`
- Ensure edge configuration preserves message content appropriately

**Validation:**
- Verify YAML syntax is valid
- Confirm PatientGenerator receives initial user input correctly
- Check no other nodes reference InputProcessor

### Task 2: Remove PatientRouter passthrough node
**File:** `yaml_instance/simulation_hospital.yaml`

**Changes:**
- Remove PatientRouter node definition (lines 257-261)
- Update PatientGenerator's outgoing edges to connect directly to PatientAgent
- Change edge from `PatientGenerator -> PatientRouter -> PatientAgent` to `PatientGenerator -> PatientAgent`
- Preserve dynamic execution behavior (map-reduce pattern should still work)

**Validation:**
- Verify edge correctly handles dynamic patient list
- Confirm PatientAgent receives patient data with correct structure
- Test map-reduce execution still functions

### Task 3: Remove DiagnosisPhase passthrough node
**File:** `yaml_instance/simulation_hospital.yaml`

**Changes:**
- Remove DiagnosisPhase node definition (lines 608-612)
- Update DoctorNotes node's outgoing edges to connect directly to PatientHistorySplitter
- Change edge from `DoctorNotes -> DiagnosisPhase -> PatientHistorySplitter` to `DoctorNotes -> PatientHistorySplitter`
- Maintain edge configuration for diagnosis data flow

**Validation:**
- Verify PatientHistorySplitter receives diagnosis notes correctly
- Confirm parallel split to TreatmentGenerator and FollowUpAgent works
- Check diagnostic data structure is preserved

### Task 4: Validate YAML syntax and structure
**File:** `yaml_instance/simulation_hospital.yaml`

**Changes:**
- Run YAML validation using check module
- Verify all edge references point to existing nodes
- Confirm no orphaned or unreachable nodes exist

**Commands:**
```bash
uv run python -m check.check --path yaml_instance/simulation_hospital.yaml
```

**Validation:**
- No YAML syntax errors
- All node references are valid
- Graph structure is well-formed

### Task 5: Test workflow execution
**File:** `yaml_instance/simulation_hospital.yaml`

**Changes:**
- Execute workflow with sample patient data
- Verify end-to-end patient journey flow
- Confirm all agents receive correct inputs

**Commands:**
```bash
uv run python run.py --path yaml_instance/simulation_hospital.yaml --name test_hospital_simplified
```

**Validation:**
- Workflow executes without errors
- Patient data flows correctly through all stages
- Output matches expected behavior from original workflow
- SimulationAggregator (kept passthrough) still aggregates correctly

## Success Criteria

- [x] All 3 passthrough nodes removed (InputProcessor, PatientRouter, DiagnosisPhase)
- [x] SimulationAggregator passthrough node retained (justified for aggregation)
- [x] YAML validation passes
- [x] Workflow executes successfully
- [x] Patient journey flow preserved
- [x] No behavioral changes to workflow outputs
- [x] Code reduction: ~64 lines removed (1,280 -> 1,216 lines)
- [x] Graph structure cleaner and more direct

## Rollback Plan

If issues arise during implementation:
1. Revert changes to `yaml_instance/simulation_hospital.yaml`
2. Restore original node definitions and edge configurations
3. Re-test original workflow to confirm stability
4. Document specific failure mode for future reference

## Notes

- This is a refactoring change - behavior must remain identical
- SimulationAggregator is intentionally kept as it serves a valid aggregation purpose
- Focus on preserving dynamic execution patterns (map-reduce)
- Edge configurations may need adjustment to preserve message passing semantics
