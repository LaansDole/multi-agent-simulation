import React from 'react';
import { getAgentSet, getAllAgents, getAllCharacters } from '../data/agents';
import { useCoreStore } from '../integration/store/coreStore';
import { useTeamStore, useActiveTeam } from '../integration/store/teamStore';
import { Avatar } from './components/Avatar';

import { formatTokens } from './ProjectView';

interface AgentStatusPanelProps {
  agentIndex: number;
}

const AgentStatusPanel: React.FC<AgentStatusPanelProps> = ({ agentIndex }) => {
  const { tasks } = useCoreStore();
  const system = useActiveTeam();
  const agents = getAllAgents(system);

  const agent = agents.find(a => a.index === agentIndex);
  if (!agent) return null;

  const activeTask = tasks.find(
    (t) => t.assignedAgentId === agentIndex && t.status === 'in_progress'
  ) ?? null;

  const usage = useCoreStore.getState().agentTokenUsage[agentIndex] || { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

  return (
    <div className="flex flex-col h-full p-6">
      {/* Agent Info */}
      <div className="mb-8 space-y-6">
        {/* Role/Description */}
        {agent.index !== 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Description</p>
              <div className="h-px flex-1 bg-zinc-100" />
            </div>
            <p className="text-xs text-zinc-600 leading-relaxed font-medium capitalize-first">{agent.description}</p>
          </div>
        )}
        {/* Model */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Model</p>
            <div className="h-px flex-1 bg-zinc-100" />
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-zinc-50 rounded-lg border border-zinc-100/60 font-mono">
            <p className="text-[11px] font-bold text-darkDelegation uppercase tracking-tighter">
              {agent.model}
            </p>
          </div>
        </div>
        {/* Token Usage */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Token Usage</p>
            <div className="h-px flex-1 bg-zinc-100" />
          </div>
          <div className="flex items-center gap-1.5 text-[11px] font-bold font-mono">
            <span className="text-zinc-700">{formatTokens(usage.promptTokens)} <span className="text-zinc-400 font-medium">input</span></span>
            <span className="text-zinc-300">+</span>
            <span className="text-zinc-700">{formatTokens(usage.completionTokens)} <span className="text-zinc-400 font-medium">output</span></span>
          </div>
        </div>
      </div>

      <div className="h-px bg-zinc-100 w-full mb-6" />

      {/* Task Status */}
      {activeTask ? (
        <div className="mb-6">
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2 flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: agent.color }}></span>
              <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: agent.color }}></span>
            </span>
            Doing Now
          </p>
          <p className="text-sm text-darkDelegation leading-snug font-bold">
            "{activeTask.title}"
          </p>
        </div>
      ) : (
        <div className="mb-6">
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400/50 mb-2">
            Status
          </p>
          <p className="text-sm text-zinc-300 leading-snug italic font-medium">
            Waiting for next task...
          </p>
        </div>
      )}
    </div>
  );
};

export default AgentStatusPanel;
