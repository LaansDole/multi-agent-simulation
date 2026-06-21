import React, { useState } from 'react';
import { X, CheckCircle2, AlertCircle, GitPullRequest } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useCoreStore } from '../integration/store/coreStore';
import { useUiStore } from '../integration/store/uiStore';
import { getAllAgents } from '../data/agents';
import { useActiveTeam } from '../integration/store/teamStore';
import { Avatar } from './components/Avatar';
import { InfoBubble } from './components/InfoBubble';
import { USER_COLOR, USER_COLOR_LIGHT, USER_COLOR_SOFT } from '../theme/brand';

interface AuditModalProps {
  taskId: string;
  isOpen: boolean;
  onClose: () => void;
  viewOnly?: boolean;
}

export const AuditModal: React.FC<AuditModalProps> = ({ taskId, isOpen, onClose, viewOnly }) => {
  const { tasks, approveTask, rejectTask } = useCoreStore();
  const { setSelectedNpc, setChatting } = useUiStore();
  const activeTeam = useActiveTeam();
  const agents = getAllAgents(activeTeam);
  const [feedback, setFeedback] = useState('');
  const [selectedRevisionIndex, setSelectedRevisionIndex] = useState<number | null>(null);

  const task = tasks.find(t => t.id === taskId);
  if (!task || !isOpen) return null;

  const isViewMode = viewOnly || task.status === 'done';

  const agent = agents.find(a => a.index === task.assignedAgentId);

  const handleApprove = () => {
    approveTask(taskId);
    setSelectedNpc(null);
    setChatting(false);
    onClose();
  };

  const handleReject = () => {
    if (!feedback.trim()) return;
    rejectTask(taskId, feedback);
    setSelectedNpc(null);
    setChatting(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-6 md:p-12">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-white/60 backdrop-blur-xl animate-in fade-in duration-500"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="relative bg-white w-full max-w-4xl max-h-full rounded-[32px] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.1)] border border-zinc-200/50 flex flex-col overflow-hidden animate-in zoom-in-95 fade-in duration-500 ease-out fill-mode-both">

        {/* Header: Character Focus */}
        <div className="px-8 py-8 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-6">
            <div className="relative">
              <Avatar
                type={agent?.index === 0 ? 'user' : 'sub'}
                color={agent?.color}
                size={64}
              />
              <div
                className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full border-4 border-white flex items-center justify-center text-white"
                style={{ backgroundColor: agent?.color || '#333' }}
              >
                <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              </div>
            </div>

            <div className="flex flex-col">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-black text-darkDelegation uppercase tracking-widest">{agent?.name}</span>
                {!isViewMode && (
                  <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ backgroundColor: USER_COLOR_LIGHT, color: USER_COLOR }}>Requires Review</span>
                )}
              </div>
              <h2 className="text-2xl font-semibold text-darkDelegation tracking-tight leading-tight">
                {task.title}
              </h2>
              {isViewMode && (
                <div className="flex items-center gap-2 mt-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600">COMPLETED WORK</span>
                </div>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-3 hover:bg-zinc-100 rounded-2xl transition-all group"
          >
            <X size={24} className="text-zinc-300 group-hover:text-darkDelegation transition-colors" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto [scrollbar-width:none] px-6 pb-6">
          <div className="flex gap-6">
            {/* Main content */}
            <div className={`flex-1 space-y-10 ${task.revisions.length > 0 ? 'border-r border-zinc-100 pr-6' : ''}`}>
              {/* Draft / Result Output */}
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-1 h-4 bg-darkDelegation rounded-full" />
                    <h3 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                      {selectedRevisionIndex !== null ? `Revision V${selectedRevisionIndex + 1}` : (isViewMode ? 'Final Output' : 'Current Proposal')}
                    </h3>
                  </div>
                  {selectedRevisionIndex !== null && (
                    <button
                      onClick={() => setSelectedRevisionIndex(null)}
                      className="text-[9px] font-black uppercase text-zinc-400 hover:text-darkDelegation transition-colors"
                    >
                      Back to latest
                    </button>
                  )}
                </div>
                <div className="p-8 bg-zinc-50/50 rounded-3xl border border-zinc-100 min-h-[350px] shadow-inner">
                  <div className="markdown-content text-darkDelegation text-sm leading-relaxed">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {selectedRevisionIndex !== null
                        ? task.revisions[selectedRevisionIndex].output
                        : (isViewMode ? (task.output || task.draftOutput) : (task.draftOutput || 'No content produced.'))}
                    </ReactMarkdown>
                  </div>
                </div>
              </section>

            </div>

            {/* Revision Sidebar (Creativa) */}
            {(task.revisions?.length ?? 0) > 0 && (
              <div className="w-56 shrink-0 flex flex-col pt-4 animate-in fade-in slide-in-from-right-4 duration-700">
                <div className="flex items-center gap-2 mb-6" style={{ color: USER_COLOR }}>
                  <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: USER_COLOR }} />
                  <span className="text-[10px] font-black uppercase tracking-widest">Version History</span>
                  <InfoBubble text="View previous iterations of this task. You can see how the work evolved or revert to a stronger version." />
                </div>
                <div className="space-y-2 overflow-y-auto pr-2 max-h-[60vh] [scrollbar-width:none]">
                  {task.revisions.map((rev, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedRevisionIndex(idx)}
                      className={`
                        w-full text-left p-2.5 rounded-xl transition-all border group/rev
                        ${selectedRevisionIndex === idx
                          ? 'bg-darkDelegation border-darkDelegation text-white shadow-xl'
                          : 'bg-white border-zinc-100 text-darkDelegation hover:border-zinc-300 hover:bg-zinc-50'}
                      `}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-[10px] font-black uppercase tracking-widest ${selectedRevisionIndex === idx ? 'text-zinc-400' : 'text-zinc-400'}`}>Version {idx + 1}</span>
                        <span className="text-[9px] font-bold opacity-50 uppercase">{new Date(rev.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      {rev.feedback && (
                        <p className={`text-[12px] leading-tight line-clamp-2 italic ${selectedRevisionIndex === idx ? 'text-zinc-300' : 'text-zinc-500'}`}>
                          "{rev.feedback}"
                        </p>
                      )}
                    </button>
                  ))}
                  {/* Current one indicator */}
                  {!isViewMode && (
                    <button
                      onClick={() => setSelectedRevisionIndex(null)}
                      className={`
                        w-full text-left p-3 rounded-xl transition-all border mt-2 flex flex-col gap-1
                        ${selectedRevisionIndex === null
                          ? 'bg-emerald-50 border-emerald-100'
                          : 'bg-white border-zinc-100 hover:border-emerald-200'}
                      `}
                    >
                      <span className="text-[12px] font-black uppercase tracking-widest text-emerald-600">Active Review</span>
                      <p className="text-[12px] text-emerald-400 font-medium leading-none">In review process...</p>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Feedback Area (Always Visible in Review Mode) */}
        {!isViewMode && selectedRevisionIndex === null && (
          <div className="px-8 py-4 border-t border-zinc-100 bg-white">
            <div className="flex items-center gap-2 mb-2 text-zinc-400">
              <div className="flex items-center gap-2">
                <GitPullRequest size={12} />
                <span className="text-[9px] font-black uppercase tracking-widest">Your Feedback</span>
              </div>
              <InfoBubble text="Provide specific instructions for what to change. The agent will read this and attempt a new version." />
            </div>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Describe what needs to be changed before rejecting..."
              className="w-full bg-zinc-50 border border-zinc-100 rounded-xl p-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-darkDelegation/5 transition-all resize-none h-20 placeholder:text-zinc-300 placeholder:italic"
            />
          </div>
        )}

        {/* Footer Actions */}
        <div className="px-8 py-8 bg-zinc-50/50 border-t border-zinc-100 flex items-center justify-end gap-4 shrink-0">
          {(isViewMode || selectedRevisionIndex !== null) ? (
            <button
              onClick={selectedRevisionIndex !== null ? () => setSelectedRevisionIndex(null) : onClose}
              className="h-12 px-10 bg-darkDelegation text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all hover:bg-black active:scale-95 flex items-center gap-2 shadow-xl shadow-darkDelegation/10"
            >
              {selectedRevisionIndex !== null ? 'Show Active Review' : 'Close Viewer'}
            </button>
          ) : (
            <>
              <button
                onClick={handleReject}
                disabled={!feedback.trim()}
                className={`
                  h-12 px-8 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2
                  ${!feedback.trim()
                    ? 'bg-white border border-zinc-200 text-zinc-200 cursor-not-allowed opacity-50'
                    : 'bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-100 active:scale-95 shadow-sm'}
                `}
              >
                <AlertCircle size={14} strokeWidth={3} />
                Reject with Feedback
              </button>

              <button
                onClick={handleApprove}
                className="h-12 px-10 bg-darkDelegation text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all hover:bg-black active:scale-95 flex items-center gap-2 shadow-xl shadow-darkDelegation/10"
              >
                <CheckCircle2 size={14} strokeWidth={3} />
                Approve Task
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
