/**
 * workflowStore -- Holds the read-only normalized graph and the agent -> 3D
 * character slot mapping for an imported workflow. Edits to slot assignments
 * update nodeAgentMap here; the BackendAgentSimulation rebuilds its EventBridge
 * map from the team store's AgenticSystem (kept in sync via setImportedWorkflow).
 */

import { create } from 'zustand';
import type { NormalizedGraph } from '../api/types';
import type { ImportResult } from '../api/YamlImporter';
import { useTeamStore } from './teamStore';

interface WorkflowState {
  workflowGraph: NormalizedGraph | null;
  nodeAgentMap: Record<string, number>; // node_id -> slot 1-5

  setImportedWorkflow: (result: ImportResult, graph: NormalizedGraph) => void;
  swapSlots: (nodeIdA: string, nodeIdB: string) => void;
  clearImportedWorkflow: () => void;
}

export const useWorkflowStore = create<WorkflowState>()((set, get) => ({
  workflowGraph: null,
  nodeAgentMap: {},

  setImportedWorkflow: (result, graph) => {
    // Register the imported system as the active custom team.
    useTeamStore.getState().saveCustomSystem(result.system);
    useTeamStore.getState().setActiveTeam(result.system.id);
    set({ workflowGraph: graph, nodeAgentMap: { ...result.nodeAgentMap } });
  },

  swapSlots: (nodeIdA, nodeIdB) => {
    const map = { ...get().nodeAgentMap };
    const slotA = map[nodeIdA];
    const slotB = map[nodeIdB];
    if (slotA === undefined || slotB === undefined) return;
    map[nodeIdA] = slotB;
    map[nodeIdB] = slotA;
    set({ nodeAgentMap: map });
    // Reflect the swap in the team store's AgenticSystem agent indices.
    const { selectedAgentSetId, customSystems } = useTeamStore.getState();
    const system = customSystems.find((s) => s.id === selectedAgentSetId);
    if (!system) return;
    const all = [system.leadAgent, ...(system.leadAgent.subagents ?? [])];
    const agentA = all.find((a) => a.id === nodeIdA);
    const agentB = all.find((a) => a.id === nodeIdB);
    if (agentA) agentA.index = slotB;
    if (agentB) agentB.index = slotA;
    useTeamStore.getState().saveCustomSystem({ ...system });
  },

  clearImportedWorkflow: () => set({ workflowGraph: null, nodeAgentMap: {} }),
}));
