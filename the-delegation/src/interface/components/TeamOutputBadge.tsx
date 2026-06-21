import { FileText, Image as ImageIcon, Music, Video } from 'lucide-react';
import React from 'react';
import { AgenticSystem } from '../../data/agents';
import { InfoTooltip } from './InfoTooltip';
import { USER_COLOR, USER_COLOR_SOFT } from '../../theme/brand';

interface TeamOutputBadgeProps {
  system: AgenticSystem;
  className?: string;
}

export const TeamOutputBadge: React.FC<TeamOutputBadgeProps> = ({ system, className = '' }) => {
  return (
    <div className={`flex items-center gap-3 px-3 py-1.5 bg-zinc-50/50 border border-zinc-100/50 cursor-pointer rounded-xl backdrop-blur-sm ${className}`}>
      {/* Left Column: Stacked type and status */}
      <div className="flex flex-col justify-center gap-1 pr-3">
        {/* Output Type Row */}
        <div className="flex items-center gap-1.5 text-zinc-400">
          {system.outputType === 'text' && <FileText size={11} strokeWidth={2.5} />}
          {system.outputType === 'image' && <ImageIcon size={11} strokeWidth={2.5} />}
          {system.outputType === 'music' && <Music size={11} strokeWidth={2.5} />}
          {system.outputType === 'video' && <Video size={11} strokeWidth={2.5} />}
          <span className="text-[8px] font-black uppercase tracking-widest text-zinc-500 leading-none">
            {system.outputType || 'TEXT'}
          </span>
        </div>
        
        {/* Auto-Approve Status Row */}
        {system.outputAutoApprove !== undefined && (
          <InfoTooltip
            text={system.outputAutoApprove
              ? 'Output will be generated and delivered automatically'
              : 'Output requires your manual review and approval before generation'}
          >
            <div className="flex items-center gap-1.5">
              <div 
                className="w-1 h-1 rounded-full" 
                style={{ 
                  backgroundColor: system.outputAutoApprove ? '#10b981' : USER_COLOR,
                  boxShadow: system.outputAutoApprove ? undefined : `0 0 8px ${USER_COLOR_SOFT}`
                }} 
              />
              <span className="text-[7px] font-bold text-zinc-300 uppercase tracking-tighter leading-none whitespace-nowrap">
                {system.outputAutoApprove ? 'AUTO APPROVE' : 'MANUAL REVIEW'}
              </span>
            </div>
          </InfoTooltip>
        )}
      </div>

      <div className="w-px h-6 bg-zinc-200/50" />

      {/* Right Column: Model Name */}
      <div className="flex flex-col gap-0.5 flex-1 min-w-0 pl-1">
        <span className="text-[7px] font-black text-zinc-300 uppercase tracking-widest leading-none">GENERATION MODEL</span>
        <span className="text-[10px] font-bold text-zinc-600 font-mono lowercase leading-tight">
          {system.outputModel}
        </span>
      </div>
    </div>
  );
};
