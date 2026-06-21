import { Handle, Position } from '@xyflow/react';
import { User } from 'lucide-react';
import { HandleData } from '../flowUtils';
import { USER_COLOR, USER_COLOR_LIGHT, USER_COLOR_SOFT } from '../../../theme/brand';
import { Avatar } from '../../components/Avatar';

const NodeHandle = ({ h, i, total, position }: { h: HandleData, i: number, total: number, position: 'top' | 'bottom' }) => (
  <Handle
    type={h.role}
    position={position === 'top' ? Position.Top : Position.Bottom}
    id={h.id}
    className="!w-2.5 !h-2.5 !border-white shadow-sm hover:scale-125 transition-transform"
    style={{
      left: `calc(50% + ${(i - (total - 1) / 2) * 28}px)`,
      backgroundColor: h.color,
      [position]: 0,
      transform: `translate(-50%, ${position === 'top' ? '-50%' : '50%'})`,
    }}
  />
);

export const VisualFlowNode = ({ data, selected, type }: any) => {
  const isUser = type === 'user';
  const topHandles: HandleData[] = data.topHandles || [];
  const bottomHandles: HandleData[] = data.bottomHandles || [];

  return (
    <div
      className={`
        relative px-3 py-2.5 shadow-sm rounded-2xl border-2 pointer-events-auto transition-all duration-300 w-fit min-w-[280px] bg-white
        ${selected ? 'ring-4 scale-105 z-20 shadow-lg' : 'z-10'}
        ${data.isDimmed ? 'opacity-20 translate-y-1' : 'opacity-100'}

      `}
      style={{
        borderColor: selected ? (isUser ? USER_COLOR : data.color) : (isUser ? USER_COLOR : data.color || '#ccc'),
        boxShadow: selected ? `0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05), 0 0 0 4px ${isUser ? USER_COLOR : data.color}30` : undefined
      }}
    >
      {/* Handles */}
      {topHandles.map((h, i) => <NodeHandle key={h.id} h={h} i={i} total={topHandles.length} position="top" />)}
      {bottomHandles.map((h, i) => <NodeHandle key={h.id} h={h} i={i} total={bottomHandles.length} position="bottom" />)}

      <div className="flex items-center gap-3">
        <div className="shrink-0 p-0.5 rounded-xl bg-zinc-50 border border-zinc-100/50">
          <Avatar
            type={isUser ? "user" : (data.isLead ? "lead" : "sub")}
            color={isUser ? USER_COLOR : data.color}
            size={48}
          />
        </div>

        <div className="flex flex-col min-w-0 flex-1 gap-1">
          <div
            className="font-black text-[13px] tracking-tight truncate min-w-0"
            style={{ color: isUser ? USER_COLOR : undefined }}
          >
            {data.label}
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap gap-1.5 items-center">
              {data.isLead && !isUser && (
                <div
                  className="text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter border shadow-sm leading-none flex items-center h-4 shrink-0 w-fit"
                  style={{
                    backgroundColor: `${data.color}20`,
                    color: data.color,
                    borderColor: `${data.color}40`
                  }}
                >
                  Lead Agent
                </div>
              )}

              {!data.isLead && !isUser && (
                <div
                  className="text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter border shadow-sm leading-none flex items-center h-4 shrink-0 w-fit"
                  style={{
                    backgroundColor: `${data.color}20`,
                    color: data.color,
                    borderColor: `${data.color}40`
                  }}
                >
                  Subagent
                </div>
              )}

              {data.agent?.humanInTheLoop && (
                <div
                  className="text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-tighter border leading-none flex items-center h-4 shrink-0 w-fit gap-1"
                  style={{
                    backgroundColor: USER_COLOR_LIGHT,
                    color: USER_COLOR,
                    borderColor: USER_COLOR_SOFT
                  }}
                >
                  <User size={8} strokeWidth={3} />
                  Human-in-the-loop
                </div>
              )}
            </div>

            {!isUser && (
              <div
                className="text-[9px] font-mono px-1.5 py-0.5 rounded border inline-block italic w-fit"
                style={{
                  color: '#a1a1aa', // text-zinc-400
                  borderColor: '#f4f4f5', // border-zinc-100
                  backgroundColor: '#fafafa' // bg-zinc-50
                }}
              >
                {data.agent?.model}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
