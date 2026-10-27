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
  nodeAgentMap: Record<string, number>; // character id (YamlImporter.characterId) -> slot 1-MAX_AGENTS

  setImportedWorkflow: (result: ImportResult, graph: NormalizedGraph) => void;
  swapSlots: (characterIdA: string, characterIdB: string) => void;
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

  swapSlots: (characterIdA, characterIdB) => {
    const map = { ...get().nodeAgentMap };
    const slotA = map[characterIdA];
    const slotB = map[characterIdB];
    if (slotA === undefined || slotB === undefined) return;
    map[characterIdA] = slotB;
    map[characterIdB] = slotA;
    set({ nodeAgentMap: map });
    // Reflect the swap in the team store's AgenticSystem agent indices.
    const { selectedAgentSetId, customSystems } = useTeamStore.getState();
    const system = customSystems.find((s) => s.id === selectedAgentSetId);
    if (!system) return;
    const all = [system.leadAgent, ...(system.leadAgent.subagents ?? [])];
    const agentA = all.find((a) => a.id === characterIdA);
    const agentB = all.find((a) => a.id === characterIdB);
    if (agentA) agentA.index = slotB;
    if (agentB) agentB.index = slotA;
    useTeamStore.getState().saveCustomSystem({ ...system });
  },

  clearImportedWorkflow: () => set({ workflowGraph: null, nodeAgentMap: {} }),
}));
