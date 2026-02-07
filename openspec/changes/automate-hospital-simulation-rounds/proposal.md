# Change: Automate Hospital Simulation to Run for Predetermined Rounds

## Why

The current hospital simulation workflow requires manual human intervention between each simulation round. The user must type "continue" or modify the scenario to progress to the next round, which is inefficient for running multiple rounds of the simulation automatically.

This creates friction when:
- Running batch simulations for testing or data collection
- Evaluating simulation behavior over multiple rounds without manual supervision
- Conducting automated scenario evolution experiments

The workflow should support autonomous execution for a configurable number of rounds with automatic scenario evolution between rounds, removing the need for human intervention during the simulation.

## What Changes

### Workflow Modifications

1. **Replace HumanControl with AutoLoop node**:
   - Remove the `HumanControl` human interaction node
   - Add a new `SimulationLoopCounter` loop_counter node to control rounds
   - Configure `max_iterations` on the loop counter to set the number of rounds

2. **Add ScenarioEvolver agent node**:
   - Create a new agent node that automatically generates scenario evolution prompts
   - This node simulates what a human would input (e.g., "continue", "day progresses", or introduce random events)
   - Uses randomization to evolve scenarios between rounds

3. **Add FinalReportAggregator node**:
   - Create a new aggregator node that collects outcomes from all rounds
   - Generates a comprehensive summary report at the end
   - Replaces the round-by-round human review with a final summary

4. **Update edge flow**:
   - Change: `SimulationAggregator → HumanControl → environment` 
   - To: `SimulationAggregator → ScenarioEvolver → SimulationLoopCounter → environment` (continue) or `→ FinalReportAggregator → SimulationEnd` (exit)
   - Remove conditional edges based on "SIMULATION ENDED." keyword
   - Use loop counter's automatic iteration tracking

5. **Remove initial_instruction from graph**:
   - Move scenario initialization to use `task_prompt` directly
   - No longer need user prompts between rounds

### Configuration Changes

- The number of rounds is specified in the `SimulationLoopCounter` node's `max_iterations` config
- No new variables needed in `vars` section
- Scenario evolution logic embedded in `ScenarioEvolver` node

## Impact

### Affected Files
- **yaml_instance/simulation_hospital.yaml**:
  - Lines 706-735: Remove `HumanControl` node
  - Lines 737-742: Remove/replace `SimulationEnd` node
  - Lines 1135-1192: Remove edges involving `HumanControl`
  - Add new nodes: `ScenarioEvolver`, `SimulationLoopCounter`, `FinalReportAggregator`
  - Add new edges for automated loop flow

### Breaking Changes
- **BREAKING**: Workflows using `HumanControl` for interactive simulation control will no longer work the same way
- Migration: Users who want interactive control should keep the old version or use a separate workflow variant

### Benefits
- Fully automated multi-round simulation without manual intervention
- Configurable number of rounds via loop counter
- Automatic scenario evolution with realistic progression
- Comprehensive final report aggregating all rounds
- Faster simulation execution for research and testing
- Enables batch processing and unattended operation

### Compatibility
- No impact on other workflow examples
- Memory persistence (patient_memory, environment_memory) continues to work correctly
- Dynamic execution and parallel patient processing unchanged
- Loop counter for doctor-patient interactions (existing) remains independent
