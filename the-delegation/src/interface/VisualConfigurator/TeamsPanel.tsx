import { Plus, Sparkles } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { AGENTIC_SETS, AgenticSystem } from '../../data/agents';
import { useCoreStore } from '../../integration/store/coreStore';
import { useTeamStore } from '../../integration/store/teamStore';
import { TeamCard } from './TeamCard';
import { GenerateFromTextModal } from './GenerateFromTextModal';

interface TeamsPanelProps {
  onSelectTeam: (id: string) => void;
  selectedTeamId: string;
  onModeChange: (mode: 'view' | 'edit') => void;
  mode: 'view' | 'edit';
}

export const TeamsPanel: React.FC<TeamsPanelProps> = ({ onSelectTeam, selectedTeamId, onModeChange, mode }) => {
  const { customSystems, selectedAgentSetId, saveCustomSystem } = useTeamStore();
  const [isGenerateOpen, setGenerateOpen] = useState(false);

  const allSystems = useMemo(() => {
    const combined = [...customSystems, ...AGENTIC_SETS];
    return combined.filter((sys, index, self) =>
      index === self.findIndex((s) => s.id === sys.id)
    );
  }, [customSystems]);

  const handleCreateNew = () => {
    const newId = `team-${Date.now()}`;
    const model = useCoreStore.getState().defaultTextModel;
    const newSystem: AgenticSystem = {
      id: newId,
      teamName: 'New Team',
      teamType: 'Custom',
      teamDescription: 'A custom agentic team.',
      color: '#A855F7',
      outputType: 'text',
      outputModel: model,
      user: {
        index: 0,
        model: 'Human',
        position: { x: 0, y: 0 }
      },
      leadAgent: {
        id: `agent-${Date.now()}`,
        index: 1,
        name: 'Lead Agent',
        description: 'Coordinate the team to finish the project.',
        color: '#A855F7',
        model,
        position: { x: 0, y: 150 },
        subagents: []
      }
    };
    saveCustomSystem(newSystem);
    onSelectTeam(newId);
    onModeChange('edit');
  };
  const handleGenerated = (system: AgenticSystem) => {
    saveCustomSystem(system);
    setGenerateOpen(false);
    onSelectTeam(system.id);
    onModeChange('edit');
  };

  return (
    <div className="w-96 border-l border-zinc-100 bg-white flex flex-col h-full shrink-0">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {allSystems.map((system) => {
          const isSelected = selectedTeamId === system.id;
          const isActive = selectedAgentSetId === system.id;
          const isPredefined = AGENTIC_SETS.some(s => s.id === system.id);

          return (
            <TeamCard
              key={system.id}
              system={system}
              isSelected={isSelected}
              isActive={isActive}
              isPredefined={isPredefined}
              mode={mode}
              onSelectTeam={onSelectTeam}
              onModeChange={onModeChange}
            />
          );
        })}
      </div>
      <div className="p-4 border-t border-zinc-50 bg-white space-y-2">
        <button
          onClick={handleCreateNew}
          className="w-full flex items-center justify-center gap-2 py-3 bg-darkDelegation hover:bg-darkDelegation text-white rounded-xl text-[10px] font-black uppercase tracking-[0.1em] transition-all shadow-lg shadow-black/5 active:scale-[0.98]"
        >
          <Plus size={14} strokeWidth={3} />
          Create New Team
        </button>
        <button
          onClick={() => setGenerateOpen(true)}
          className="w-full flex items-center justify-center gap-2 py-3 bg-white border border-zinc-200 hover:bg-zinc-50 text-darkDelegation rounded-xl text-[10px] font-black uppercase tracking-[0.1em] transition-all active:scale-[0.98]"
        >
          <Sparkles size={14} strokeWidth={3} />
          Generate from Text
        </button>
      </div>
      <GenerateFromTextModal
        isOpen={isGenerateOpen}
        onClose={() => setGenerateOpen(false)}
        onCreated={handleGenerated}
      />
    </div>
  );
};
