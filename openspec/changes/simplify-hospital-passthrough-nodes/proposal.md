# Change: Simplify Hospital Simulation by Removing Unnecessary Passthrough Nodes

## Why

The hospital simulation workflow (`yaml_instance/simulation_hospital.yaml`) contains 4 passthrough nodes, but analysis shows that 3 of them provide no meaningful value for routing, filtering, or context management. This adds unnecessary complexity and makes the workflow harder to understand.

Comparing to `yaml_instance/GameDev_v1.yaml` (a similarly complex workflow with 0 passthrough nodes), the hospital workflow is over-engineered with routing nodes that don't serve the documented purposes for passthrough nodes:
1. Entry point context preservation
2. Loop result filtering
3. Conditional routing with centralized edge configuration

## What Changes

- **Remove `InputProcessor`** (lines 66-70): Route directly from start to `environment` node
- **Remove `PatientRouter`** (lines 257-261): Connect `PatientGenerator` directly to `PatientAgent` with dynamic execution
- **Remove `DiagnosisPhase`** (lines 608-612): Connect `DoctorNotes` directly to `PatientHistorySplitter` with existing keyword conditions
- **Keep `SimulationAggregator`** (lines 714-718): This aggregates parallel patient outcomes before human review, which is a valid use case

## Impact

- **Affected specs**: `specs/workflow-design/spec.md` (if exists) or new capability for workflow design patterns
- **Affected code**: 
  - `yaml_instance/simulation_hospital.yaml:66-70` (InputProcessor removal)
  - `yaml_instance/simulation_hospital.yaml:257-261` (PatientRouter removal)
  - `yaml_instance/simulation_hospital.yaml:608-612` (DiagnosisPhase removal)
  - Edge configurations connecting to/from removed nodes
- **Breaking changes**: None - This is a refactoring that maintains identical behavior
- **Benefits**:
  - Reduced node count from 22 to 19 (14% reduction)
  - Clearer workflow visualization
  - Easier maintenance and debugging
  - Aligns with best practices demonstrated in GameDev_v1.yaml
