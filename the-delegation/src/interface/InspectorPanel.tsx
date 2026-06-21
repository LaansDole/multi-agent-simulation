import { FolderOpen, Lock, MessageSquare, MessageSquareWarning, GitPullRequest } from 'lucide-react';
import React, { useEffect, useRef } from 'react';
import { getAgentSet, getAllCharacters } from '../data/agents';
import { USER_COLOR, USER_COLOR_LIGHT, USER_COLOR_SOFT } from '../theme/brand';
import { useChatAvailability } from '../integration/hooks/useChatAvailability';
import { useCoreStore } from '../integration/store/coreStore';
import { useTeamStore, useActiveTeam } from '../integration/store/teamStore';
import { useUiStore } from '../integration/store/uiStore';
import { useSceneManager } from '../simulation/SceneContext';
import { Avatar } from './components/Avatar';
import AgentStatusPanel from './AgentStatusPanel';
import ChatPanel from './ChatPanel';
import ProjectView from './ProjectView';
import { ReferenceImages } from './components/ReferenceImages';

interface InspectorPanelProps {
  isFloating?: boolean;
}

const InspectorPanel: React.FC<InspectorPanelProps> = ({ isFloating }) => {
  const { selectedNpcIndex, isChatting } = useUiStore();
  const scene = useSceneManager();
  const { phase, setFinalOutputOpen, tasks } = useCoreStore();
  const system = useActiveTeam();
  const agents = getAllCharacters(system);
  const { canChat, reason } = useChatAvailability(selectedNpcIndex);
  const prevCanChat = useRef(canChat);

  const agent = selectedNpcIndex !== null ? agents.find(a => a.index === selectedNpcIndex) ?? null : null;
  const isProjectReady = phase === 'done' && selectedNpcIndex === system.leadAgent.index;

  const isLeadAgentIdle = selectedNpcIndex === system.leadAgent.index && phase === 'idle';
  const currentTask = tasks.find(t => t.assignedAgentId === selectedNpcIndex && t.status === 'in_progress');
  const tasksOnHold = agent ? tasks.filter(
    t => t.assignedAgentId === agent.index && t.status === 'on_hold'
  ) : [];
  const hasTaskOnHold = tasksOnHold.length > 0;

  const needsInput = isLeadAgentIdle || hasTaskOnHold;

  // When canChat transitions true → false, end any active chat
  useEffect(() => {
    if (prevCanChat.current && !canChat) {
      if (isChatting) useUiStore.getState().setChatting(false);
    }
    prevCanChat.current = canChat;
  }, [canChat, isChatting]);

  const handleEndChat = () => {
    useUiStore.getState().setChatting(false);
  };

  const handleStartChat = () => {
    if (canChat && selectedNpcIndex !== null) {
      scene?.startChat(selectedNpcIndex);
    }
  };

  return (
    <div className={`${isFloating ? 'w-full h-full max-h-[85vh] self-end rounded-2xl shadow-2xl border border-white/20' : 'w-80 h-full border-l border-zinc-100'} bg-white flex flex-col pointer-events-auto shrink-0 relative z-30 overflow-hidden transition-all duration-300`}>
      {!agent ? (
        !isFloating && <ProjectView />
      ) : (
        <>
          {/* Header Section */}
          <div className={`px-4 py-3 border-b border-zinc-100 bg-white ${isFloating ? 'bg-zinc-50/50' : ''}`}>
            <div className="flex flex-col gap-4">
              {/* Agent Title Row */}
              <div className="flex items-center gap-4">
                <div className="shrink-0 rounded-2xl p-0.5 bg-zinc-50 border border-zinc-100/50">
                  <Avatar
                    type={agent.index === system.user.index ? 'user' : (agent.index === system.leadAgent.index ? 'lead' : 'sub')}
                    color={agent.color}
                    size={48}
                  />
                </div>
                <div className="flex flex-col min-w-0">
                  <h2 className="text-xl font-black text-darkDelegation leading-tight truncate">
                    {agent.name}
                  </h2>
                  {agent.index !== system.user.index && (
                    <div className="flex mt-1">
                      {agent.index === system.leadAgent.index ? (
                        <div
                          className="text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter border shadow-sm leading-none flex items-center h-4 shrink-0"
                          style={{
                            backgroundColor: `${agent.color}15`,
                            color: agent.color,
                            borderColor: `${agent.color}30`
                          }}
                        >
                          Lead Agent
                        </div>
                      ) : (
                        <div
                          className="text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter border shadow-sm leading-none flex items-center h-4 shrink-0"
                          style={{
                            backgroundColor: `${agent.color}15`,
                            color: agent.color,
                            borderColor: `${agent.color}30`
                          }}
                        >
                          Subagent
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Conditional Discussion/Chat Actions */}
              {needsInput && isChatting && (
                <div
                  className="border rounded-xl p-3 shadow-sm animate-in fade-in slide-in-from-top-1"
                  style={{ backgroundColor: USER_COLOR_LIGHT, borderColor: USER_COLOR_SOFT }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center justify-center w-4 h-4 rounded text-white shadow-sm" style={{ backgroundColor: USER_COLOR }}>
                        <MessageSquareWarning size={10} strokeWidth={3} />
                      </div>
                      <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: USER_COLOR }}>Review Requested</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-[9px] font-black uppercase tracking-widest text-emerald-600">Active</span>
                    </div>
                  </div>
                  <p className="text-[12px] font-bold text-darkDelegation leading-tight mt-1.5">
                    {isLeadAgentIdle
                      ? "Waiting to review user brief."
                      : `${agent?.name} needs input.`}
                  </p>
                </div>
              )}

              {needsInput && !isChatting ? (
                <div className="flex flex-col gap-3 p-4 bg-zinc-50 border border-zinc-100 rounded-xl animate-in fade-in slide-in-from-top-1 shadow-sm">
                  <div className="flex items-center gap-1.5 font-black uppercase tracking-widest text-[9px]">
                    <div
                      className="flex items-center justify-center w-5 h-5 border rounded-lg"
                      style={{ backgroundColor: USER_COLOR_LIGHT, borderColor: USER_COLOR_SOFT, color: USER_COLOR }}
                    >
                      <MessageSquareWarning size={12} strokeWidth={3} />
                    </div>
                    <span style={{ color: USER_COLOR }}>Review Requested</span>
                  </div>
                  <div className="flex flex-col gap-2">
                    <p className="text-[12px] font-bold text-darkDelegation leading-tight">
                      {isLeadAgentIdle
                        ? "Review the user brief with the team."
                        : `I've finished the task "${tasksOnHold[0]?.title ?? 'Work'}". I've submitted my work for your review.`}
                    </p>

                    {isLeadAgentIdle && (system.outputType === 'image' || system.outputType === 'video') && (
                      <div className="mt-1 pt-3 border-t border-zinc-200/50">
                        <ReferenceImages />
                      </div>
                    )}

                    <button
                      onClick={isLeadAgentIdle ? handleStartChat : () => useUiStore.getState().setActiveAuditTaskId(tasksOnHold[0]?.id)}
                      disabled={isLeadAgentIdle ? !canChat : false}
                      className="flex items-center justify-center gap-2 bg-darkDelegation hover:bg-black active:scale-95 disabled:opacity-50 text-white px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm mt-1"
                    >
                      {isLeadAgentIdle ? (
                        <>
                          <MessageSquare size={14} strokeWidth={3} />
                          Chat about the brief
                        </>
                      ) : (
                        <>
                          <GitPullRequest size={14} strokeWidth={3} />
                          Review Task
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                /* Chat Action Button below name - ONLY SHOW IF NOT NEEDS DISCUSSION (OR IF CHATTING) */
                <div className="w-full">
                  {agent.index === system.user.index ? (
                    null // No chat button for the local player
                  ) : isProjectReady ? (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex flex-col gap-3 shadow-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-yellow-700">Project Ready</span>
                      </div>
                      <button
                        onClick={() => setFinalOutputOpen(true)}
                        className="flex items-center justify-center gap-2 bg-yellow-400 hover:bg-yellow-300 active:scale-95 text-black px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all w-full shadow-sm"
                      >
                        <FolderOpen size={14} strokeWidth={3} />
                        View Final Output
                      </button>
                    </div>
                  ) : isChatting ? (
                    null
                  ) : (
                    <button
                      onClick={handleStartChat}
                      disabled={!canChat}
                      title={!canChat ? reason : undefined}
                      className={`w-full h-10 px-4 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 text-[10px] font-black uppercase tracking-widest ${canChat
                          ? 'bg-darkDelegation text-white border-none shadow-md'
                          : 'bg-zinc-50 text-zinc-300 border border-transparent cursor-not-allowed'
                        }`}
                    >
                      {canChat ? (
                        <>
                          <MessageSquare size={13} className="text-white" />
                          Open Chat
                        </>
                      ) : (
                        <>
                          <Lock size={12} className="opacity-40" />
                          {reason}
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className={`flex-1 overflow-y-auto relative min-h-0 ${isFloating ? 'bg-white' : 'bg-zinc-50/30'}`}>
            {isChatting ? (
              <div className="flex flex-col h-full bg-white">
                <div className="flex-1 overflow-y-auto">
                  <ChatPanel />
                </div>
                {/* Close Chat button at the bottom when chatting */}
                <div className="p-3 bg-white border-t border-zinc-100 shrink-0">
                  <button
                    onClick={handleEndChat}
                    className="w-full h-10 px-4 bg-darkDelegation hover:bg-black text-white rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 text-[10px] font-black uppercase tracking-widest shadow-md"
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    Close Chat
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col h-full">
                <div className="flex-1">
                  <AgentStatusPanel agentIndex={selectedNpcIndex!} />
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default InspectorPanel;
