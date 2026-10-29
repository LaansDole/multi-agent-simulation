import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { DEFAULT_MODELS, GEMINI_TEXT_MODEL } from '../../core/llm/constants';
import { AgenticSystem, AgentNode, DEFAULT_AGENTIC_SET_ID, getAgentSet, getAllAgents } from '../../data/agents';
import { BackendClient } from '../api/BackendClient';
import { exportSystemToYaml } from '../api/YamlExporter';
import { importWorkflow } from '../api/YamlImporter';

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

/** Maps every agent of a team tree through `fn`, keeping the tree shape. */
const mapAgents = (agent: AgentNode, fn: (a: AgentNode) => AgentNode): AgentNode => {
  const next = fn(agent);
  return agent.subagents ? { ...next, subagents: agent.subagents.map((s) => mapAgents(s, fn)) } : next;
};

/**
 * v0 -> v1: teams saved before the text default moved to OpenAI (0d3ed91) carry the old implicit
 * Gemini default. Text teams switch it to DEFAULT_MODELS.text / openai (hydration is synchronous,
 * so the backend default is not known yet; imported teams get the backend's model from
 * syncImportedTeams right after). Image/music/video teams and user-edited agents are kept.
 */
const migrateGeminiDefault = (system: AgenticSystem): AgenticSystem => {
  if (system.outputType !== 'text') return system;
  return {
    ...system,
    outputModel: system.outputModel === GEMINI_TEXT_MODEL ? DEFAULT_MODELS.text : system.outputModel,
    leadAgent: mapAgents(system.leadAgent, (a) =>
      !a.userEdited && a.model === GEMINI_TEXT_MODEL && (a.provider ?? 'gemini') === 'gemini'
        ? { ...a, model: DEFAULT_MODELS.text, provider: 'openai' }
        : a,
    ),
  };
};

/** Refreshes a saved imported team from a fresh import; slots, colours, positions and user-edited agents are kept (the YAML-derived role always follows). */
const resyncSystem = (saved: AgenticSystem, fresh: AgenticSystem): AgenticSystem => {
  const freshById = new Map(getAllAgents(fresh).map((a) => [a.id, a]));
  const leadAgent = mapAgents(saved.leadAgent, (a) => {
    const src = freshById.get(a.id);
    if (!src) return a;
    return a.userEdited
      ? { ...a, role: src.role }
      : { ...a, name: src.name, description: src.description, role: src.role, model: src.model, provider: src.provider };
  });
  // The importer derives outputModel from the lead; keep it following unless the user picked another one.
  const outputModel = saved.outputModel === saved.leadAgent.model ? leadAgent.model : saved.outputModel;
  return { ...saved, leadAgent, outputModel };
};

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
      version: 1,
      migrate: (persisted, version) => {
        const state = persisted as TeamState;
        if (version < 1) state.customSystems = (state.customSystems ?? []).map(migrateGeminiDefault);
        return state;
      },
    }
  )
);

/** Returns the currently active AgentSet. Safe to call from service/non-React contexts. */
export function getActiveAgentSet(): AgentSet {
  const { selectedAgentSetId, customSystems } = useTeamStore.getState();
  return getAgentSet(selectedAgentSetId, customSystems);
}

const warned = new Set<string>();

/**
 * Imported teams are a view of a backend workflow: re-import each one's graph and refresh agent
 * name/description/model/provider from its config_summary. A workflow that is gone or fails to
 * load keeps its saved team and warns once. Agents added or removed in the YAML since the import
 * are not reconciled; re-import picks those up.
 */
export async function syncImportedTeams(): Promise<void> {
  const files = [...new Set(useTeamStore.getState().customSystems.flatMap((s) => (s.sourceYamlFile ? [s.sourceYamlFile] : [])))];
  if (files.length === 0) return;
  const client = new BackendClient();
  let available: string[];
  try {
    available = await client.listWorkflows();
  } catch {
    return; // backend unreachable: the next (re)connect retries
  }
  const warnOnce = (file: string, reason: string) => {
    if (warned.has(file)) return;
    warned.add(file);
    console.warn(`[teamStore] Imported team from ${file} not resynced: ${reason}. Keeping the saved team.`);
  };
  const fresh = new Map<string, AgenticSystem>();
  await Promise.all(files.map(async (file) => {
    if (!available.includes(file)) return warnOnce(file, 'workflow no longer exists on the backend');
    try {
      fresh.set(file, importWorkflow(await client.fetchWorkflowGraph(file)).system);
    } catch (e) {
      warnOnce(file, e instanceof Error ? e.message : String(e));
    }
  }));
  if (fresh.size === 0) return;
  useTeamStore.setState((s) => ({
    customSystems: s.customSystems.map((cs) => {
      const src = cs.sourceYamlFile ? fresh.get(cs.sourceYamlFile) : undefined;
      return src ? resyncSystem(cs, src) : cs;
    }),
  }));
}

/** React hook for accessing the currently active team. */
export function useActiveTeam(): AgentSet {
  const { selectedAgentSetId, customSystems } = useTeamStore();
  return getAgentSet(selectedAgentSetId, customSystems);
}
