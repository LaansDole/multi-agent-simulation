import { X } from 'lucide-react';
import React from 'react';
import { AgenticSystem, getAllAgents, getAllCharacters } from '../data/agents';
import { useEscapeToClose } from './components/useEscapeToClose';
import { TeamBadge } from './components/TeamBadge';
import { TeamOutputBadge } from './components/TeamOutputBadge';
import { TeamFlowViewport } from './components/TeamFlowViewport';

interface TeamFlowModalProps {
  isOpen: boolean;
  onClose: () => void;
  system: AgenticSystem;
}

const TeamFlowModal: React.FC<TeamFlowModalProps> = ({ isOpen, onClose, system }) => {
  useEscapeToClose(onClose, isOpen);
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-10 pointer-events-none">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-white/60 backdrop-blur-sm pointer-events-auto animate-in fade-in duration-300"
        onClick={onClose}
      />

      {/* Resilience check: only clear task if not waiting for review or meeting */}
      {/* Modal Content */}
      <div className="relative w-full h-full max-w-7xl bg-white rounded-3xl shadow-2xl overflow-hidden border border-zinc-200/50 flex flex-col pointer-events-auto animate-in zoom-in-95 fade-in duration-300 ease-out">
        {/* Header */}
        <div className="h-16 border-b border-zinc-100 flex items-center justify-between px-6 bg-white shrink-0">
          <div className="flex items-center gap-4">
            <TeamBadge system={system} />
            <TeamOutputBadge system={system} className="hidden sm:flex" />
          </div>

          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 hover:bg-zinc-100 rounded-xl transition-colors group"
          >
            <X className="w-6 h-6 text-zinc-400 group-hover:text-darkDelegation" />
          </button>
        </div>

        {/* Flow Area */}
        <div className="flex-1 relative">
          <TeamFlowViewport system={system} />
        </div>

        {/* Footer/Legend */}
        <div className="px-6 py-4 bg-zinc-50 border-t border-zinc-100 flex items-center justify-between gap-6 overflow-x-auto shrink-0">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-3 h-0.5 bg-zinc-300 border-t border-dashed border-zinc-400" />
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Hierarchy (Managed)</span>
            </div>
          </div>

          <p className="text-[10px] font-medium text-zinc-400 italic">
            Visual representation of the team's operational flow.
          </p>
        </div>
      </div>
    </div>
  );
};

export default TeamFlowModal;
