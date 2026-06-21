import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { AgenticSystem, DEFAULT_AGENTIC_SET_ID, getAgentSet } from '../../data/agents';
import { exportSystemToYaml } from '../api/YamlExporter';

export type AgentSet = AgenticSystem;

interface TeamState {
  selectedAgentSetId: string;
  customSystems: AgenticSystem[];

  saveCustomSystem: (system: AgenticSystem) => void;
  deleteCustomSystem: (id: string) => void;
  updateActiveSystem: (changes: Partial<AgenticSystem>) => void;
  updateSystem: (id: string, changes: Partial<AgenticSystem>) => void;
  setActiveTeam: (id: string) => void;
  exportActiveTeamToYaml: () => string;
}

export const useTeamStore = create<TeamState>()(
  persist(
    (set) => ({
      selectedAgentSetId: DEFAULT_AGENTIC_SET_ID,
      customSystems: [],
      exportActiveTeamToYaml: () => {
        return exportSystemToYaml(getActiveAgentSet());
      },

      saveCustomSystem: (system) =>
        set((s) => ({
          customSystems: s.customSystems.some((cs) => cs.id === system.id)
            ? s.customSystems.map((cs) => (cs.id === system.id ? system : cs))
            : [...s.customSystems, system],
        })),

      deleteCustomSystem: (id) =>
        set((s) => ({
          customSystems: s.customSystems.filter((cs) => cs.id !== id),
          selectedAgentSetId: s.selectedAgentSetId === id ? DEFAULT_AGENTIC_SET_ID : s.selectedAgentSetId,
        })),

      updateActiveSystem: (changes) => set((s) => {
        const currentSystem = getAgentSet(s.selectedAgentSetId, s.customSystems);
        const updatedSystem = { ...currentSystem, ...changes };
        return {
          customSystems: s.customSystems.some((cs) => cs.id === updatedSystem.id)
            ? s.customSystems.map((cs) => (cs.id === updatedSystem.id ? updatedSystem : cs))
            : [...s.customSystems, updatedSystem],
        };
      }),

      updateSystem: (id, changes) => set((s) => {
        const system = getAgentSet(id, s.customSystems);
        const updatedSystem = { ...system, ...changes };
        return {
          customSystems: s.customSystems.some((cs) => cs.id === id)
            ? s.customSystems.map((cs) => (cs.id === id ? updatedSystem : cs))
            : [...s.customSystems, updatedSystem],
        };
      }),

      setActiveTeam: (id) => set({
        selectedAgentSetId: id,
      }),
    }),
    {
      name: 'team-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

/** Returns the currently active AgentSet. Safe to call from service/non-React contexts. */
export function getActiveAgentSet(): AgentSet {
  const { selectedAgentSetId, customSystems } = useTeamStore.getState();
  return getAgentSet(selectedAgentSetId, customSystems);
}

/** React hook for accessing the currently active team. */
export function useActiveTeam(): AgentSet {
  const { selectedAgentSetId, customSystems } = useTeamStore();
  return getAgentSet(selectedAgentSetId, customSystems);
}
