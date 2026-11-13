
import React, { useEffect, useRef, useState } from 'react';
import { getAgentSet, getAllAgents, getAllCharacters } from '../data/agents';
import { useUiStore } from '../integration/store/uiStore';
import InfoModal from './InfoModal';

import { MessageSquareWarning, PartyPopper, Siren, Loader2 } from 'lucide-react';
import { Task, useCoreStore } from '../integration/store/coreStore';
import { useTeamStore, useActiveTeam } from '../integration/store/teamStore';
import { USER_COLOR, USER_COLOR_LIGHT, USER_COLOR_SOFT } from '../theme/brand';
import { placeNameplates, type Rect } from './nameplateLayout';

/** Gap (px) between a character's head and its nameplate, without / with an alert bubble in between. */
const PLATE_GAP = 6;
const ALERT_PLATE_GAP = 46;

let measureContext: CanvasRenderingContext2D | undefined;
const textWidths = new Map<string, number>();
/** Rendered width (px) of `text` in the page font at `style` (e.g. 'bold 11px'); cached once web fonts have loaded. */
function textWidth(text: string, style: string): number {
  const key = `${style}|${text}`;
  const cached = textWidths.get(key);
  if (cached !== undefined) return cached;
  measureContext ??= document.createElement('canvas').getContext('2d')!;
  measureContext.font = `${style} ${getComputedStyle(document.body).fontFamily}`;
  const width = measureContext.measureText(text).width;
  if (document.fonts.status === 'loaded') textWidths.set(key, width);
  return width;
}

/**
 * Hover/selection pill rectangle, sized like its markup: px-3 + border, 8 px dot, gap-2, gap-1.5 between the uppercase
 * tracking-widest (0.1em) 10px spans (measured at the heaviest weight, 900), 15 px line + py-1.5 + border, 10 px above the head.
 */
function pillRect(pos: { x: number; y: number }, spans: string[]): Rect {
  const text = spans.reduce((sum, span) => sum + textWidth(span.toUpperCase(), '900 10px') + span.length, 6 * (spans.length - 1));
  const w = Math.ceil(text) + 42;
  return [pos.x - w / 2, pos.y - 39, pos.x + w / 2, pos.y - 10];
}

/**
 * Speech bubble rectangle, sized like its markup: 11px text in leading-snug lines, px-3 py-2 + border, max-w-[240px],
 * 34 px above the head. ponytail: lines from text width over 200 of the 214 px (slack for word wrap); measure the DOM
 * if plates still touch bubbles.
 */
function speechRect(pos: { x: number; y: number }, text: string): Rect {
  const width = textWidth(text, '11px');
  const w = Math.min(240, Math.ceil(width) + 26);
  const h = Math.ceil(width / 200) * 15.125 + 18;
  return [pos.x - w / 2, pos.y - 34 - h, pos.x + w / 2, pos.y - 34];
}

interface AlertBubbleProps {
  icon: React.ReactNode;
  position: { x: number; y: number };
  visible: boolean;
  color?: string;
  onClick?: () => void;
}

const AlertBubble: React.FC<AlertBubbleProps> = ({ icon, position, visible, color = '#facc15', onClick }) => {
  if (!visible) return null;

  return (
    <div
      className={`absolute z-20 ${onClick ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none'}`}
      style={{
        left: position.x,
        top: position.y,
        transform: 'translate(-50%, -100%) translateY(-10px)'
      }}
      onClick={(e) => {
        if (onClick) {
          e.stopPropagation();
          onClick();
        }
      }}
    >
      <div
        className={`bg-darkDelegation/90 backdrop-blur-md p-1.5 rounded-full border border-white/10 shadow-xl flex items-center justify-center hover:scale-110 active:scale-95 transition-transform ${onClick ? 'hover:border-white/30' : ''}`}
        style={{ color }}
      >
        {icon}
      </div>
    </div>
  );
};

type PhaseLabel = { text: string; className: string };

function getAgentPhaseLabel(
  agentIndex: number,
  leadAgentIndex: number,
  tasks: Task[],
  phase: string,
  isGeneratingAsset: boolean,
  fallback: string,
): PhaseLabel {
  if (isGeneratingAsset && agentIndex === leadAgentIndex) {
    return { text: 'Delivering...', className: 'text-indigo-400 animate-pulse' };
  }
  if (agentIndex === leadAgentIndex && phase === 'done') {
    return { text: 'Project Ready!', className: 'text-yellow-400' };
  }
  const holdTask = tasks.find(
    t => t.assignedAgentId === agentIndex && t.status === 'on_hold',
  );
  if (holdTask && phase !== 'done') {
    return { text: 'Approval Needed', className: 'text-[#7EACEA]' };
  }
  const activeTask = tasks.find(
    t => t.assignedAgentId === agentIndex && t.status === 'in_progress',
  );
  if (activeTask) {
    return { text: 'Working', className: 'text-emerald-400' };
  }
  return { text: fallback, className: 'text-white/70' };
}

const UIOverlay: React.FC = () => {
  const {
    selectedNpcIndex,
    selectedPosition,
    hoveredNpcIndex,
    hoveredPoiLabel,
    hoverPosition,
    npcScreenPositions,
    speech,
    liveRoles,
    setSelectedNpc,
  } = useUiStore();
  const [isHelpOpen, setHelpOpen] = useState(false);
  // The 3D view's size: plates stay inside it.
  const overlayRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const overlay = overlayRef.current!;
    const observer = new ResizeObserver(() => setView({ w: overlay.clientWidth, h: overlay.clientHeight }));
    observer.observe(overlay);
    return () => observer.disconnect();
  }, []);
  const {
    tasks,
    phase,
    isGeneratingAsset,
  } = useCoreStore();
  const system = useActiveTeam();
  const npcAgents = getAllAgents(system);
  const allPossibleAgents = getAllCharacters(system);

  const selectedAgent = selectedNpcIndex != null ? allPossibleAgents.find(a => a.index === selectedNpcIndex) as any ?? null : null;
  const hoveredAgent = hoveredNpcIndex != null ? allPossibleAgents.find(a => a.index === hoveredNpcIndex) as any ?? null : null;
  // A DynaClinic stage may declare its role for this run (e.g. the Synthesizer as Mediator).
  const roleOf = (agent: (typeof npcAgents)[number]): string | undefined => {
    const role = liveRoles[agent.index] ?? agent.role;
    return role && role !== agent.name ? role : undefined;
  };
  const alertOf = (index: number): { icon: React.ReactNode; color: string } | null => {
    const isLead = index === system.leadAgent.index;
    if (isLead && isGeneratingAsset) return { icon: <Loader2 size={18} className="animate-spin" />, color: '#818cf8' };
    if (isLead && phase === 'idle') return { icon: <Siren size={18} />, color: '#ffffff' };
    if (isLead && phase === 'done') return { icon: <PartyPopper size={18} />, color: '#facc15' };
    // Waiting for the user's approval.
    if (tasks.some(t => t.status === 'on_hold' && t.assignedAgentId === index)) return { icon: <MessageSquareWarning size={18} />, color: USER_COLOR };
    return null;
  };
  // Hover/selection pill: the selected agent's (priority 1), else the hovered one's; its spans as rendered below.
  const pill = selectedAgent && selectedPosition ? { agent: selectedAgent, pos: selectedPosition }
    : hoveredAgent && hoverPosition && hoveredNpcIndex !== selectedNpcIndex ? { agent: hoveredAgent, pos: hoverPosition } : null;
  const pillLabel = pill && getAgentPhaseLabel(pill.agent.index, system.leadAgent.index, tasks, phase, isGeneratingAsset, '');
  const pillIsUser = pill?.agent.index === system.user.index;
  const pillReady = pill?.agent.index === system.leadAgent.index && phase === 'done';
  const pillSpans = !pill || !pillLabel ? [] : pillIsUser ? [`${pill.agent.name} (You)`] : pillReady ? [pillLabel.text]
    : pillLabel.text ? [pill.agent.name, '·', pillLabel.text] : [pill.agent.name];
  // Plates give way to the pill and the speech bubbles.
  const obstacles: Rect[] = Object.entries(speech).flatMap(([key, text]) => {
    const pos = npcScreenPositions[Number(key)];
    return pos ? [speechRect(pos, text)] : [];
  });
  if (pill) obstacles.push(pillRect(pill.pos, pillSpans));
  // Plates actually drawn (a speaking character shows its bubble, a hovered/selected one the pill), sized like the
  // markup below: text plus px-1.5 padding (+1 px rounding), capped by max-w-[180px]; one line 18 px, two lines 31 px.
  const plateRects = placeNameplates(npcAgents.flatMap((agent) => {
    const pos = npcScreenPositions[agent.index];
    if (!pos || speech[agent.index] || hoveredNpcIndex === agent.index || selectedNpcIndex === agent.index) return [];
    const role = roleOf(agent);
    const text = Math.max(textWidth(agent.name, 'bold 11px'), role ? textWidth(role, '10px') : 0);
    const gap = alertOf(agent.index) ? ALERT_PLATE_GAP : PLATE_GAP;
    return [{ index: agent.index, x: pos.x, y: pos.y, gap, w: Math.min(180, Math.ceil(text) + 13), h: role ? 31 : 18 }];
  }), view, obstacles);

  return (
    <div ref={overlayRef} className="absolute inset-0 pointer-events-none z-10 overflow-hidden select-none">
      {/* 1. Nameplates (name + role) and parallel alert bubbles; both give way to the hover/selection pill */}
      {npcAgents.map((agent) => {
        const pos = npcScreenPositions[agent.index];
        if (!pos) return null;

        // Condition: Alert and nameplate disappear when hovered or selected (the pill shows the name)
        const isCurrentlyHovered = hoveredNpcIndex === agent.index || selectedNpcIndex === agent.index;
        if (isCurrentlyHovered) return null;

        const alert = alertOf(agent.index);
        const role = roleOf(agent);
        const rect = plateRects[agent.index]; // undefined: no room, hidden

        return (
          <React.Fragment key={`agent-${agent.index}`}>
            {rect && (
              <div
                className="absolute pointer-events-none max-w-[180px] flex flex-col items-center text-center leading-tight bg-darkDelegation/70 rounded-md px-1.5 py-0.5 transition-opacity duration-300"
                style={{
                  // Placed above the alert icon, the plates in front and the pill, inside the view; faded with an overlapping character.
                  left: (rect[0] + rect[2]) / 2,
                  top: rect[3],
                  transform: 'translate(-50%, -100%)',
                  opacity: pos.alpha < 0.9 ? 0.2 : 1,
                }}
              >
                <span className="max-w-full truncate text-[11px] font-bold text-white">{agent.name}</span>
                {role && <span className="max-w-full truncate text-[10px] text-white/75">{role}</span>}
              </div>
            )}
            {alert && (
              <AlertBubble
                icon={alert.icon}
                position={pos}
                visible={true}
                color={alert.color}
                onClick={() => setSelectedNpc(agent.index)}
              />
            )}
          </React.Fragment>
        );
      })}

      {/* Hand-off speech: the agent passing its output on says its first words (SceneManager.handOff) */}
      {Object.entries(speech).map(([key, text]) => {
        const pos = npcScreenPositions[Number(key)];
        if (!pos) return null;
        return (
          <div
            key={`speech-${key}`}
            className="absolute z-20 pointer-events-none w-max max-w-[240px]"
            style={{ left: pos.x, top: pos.y, transform: 'translate(-50%, -100%) translateY(-34px)' }}
          >
            <div className="bg-white/95 text-darkDelegation text-[11px] leading-snug px-3 py-2 rounded-2xl shadow-xl border border-black/5 animate-in fade-in zoom-in-95 duration-200">
              {text}
            </div>
          </div>
        );
      })}

      {/* 2. Selection/Hover/Project Ready Bubble (Detailed) */}
      {pill && pillLabel && (
        <div
          className="absolute z-25 pointer-events-none transition-all duration-75 ease-out"
          style={{
            left: pill.pos.x,
            top: pill.pos.y,
            transform: 'translate(-50%, -100%) translateY(-10px)'
          }}
        >
          <div className="bg-darkDelegation/90 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 shadow-xl flex items-center gap-2 whitespace-nowrap animate-in fade-in zoom-in-95 duration-200">
            <div
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: pill.agent.color }}
            />
            <div className="flex items-center gap-1.5">
              {pillIsUser ? (
                <span className="text-[10px] font-black uppercase tracking-widest text-white">{pill.agent.name} (You)</span>
              ) : pillReady ? (
                <span className={`text-[10px] font-black uppercase tracking-widest ${pillLabel.className}`}>
                  {pillLabel.text}
                </span>
              ) : (
                <>
                  <span className="text-[10px] font-black uppercase tracking-widest text-white">
                    {pill.agent.name}
                  </span>
                  {pillLabel.text && (
                    <>
                      <span className="text-[10px] font-medium uppercase tracking-widest text-white/40">·</span>
                      <span className={`text-[10px] font-bold uppercase tracking-widest ${pillLabel.className}`}>
                        {pillLabel.text}
                      </span>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* POI Hover Bubble */}
      {hoveredPoiLabel && hoverPosition && (
        <div
          className="absolute z-10 pointer-events-none transition-all duration-75 ease-out"
          style={{
            left: hoverPosition.x,
            top: hoverPosition.y,
            transform: 'translate(-50%, -100%) translateY(-10px)'
          }}
        >
          <div className="bg-darkDelegation/90 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 shadow-xl flex items-center gap-2 whitespace-nowrap animate-in fade-in zoom-in-95 duration-200">
            <span className="text-[10px] font-black uppercase tracking-widest text-white">{hoveredPoiLabel}</span>
          </div>
        </div>
      )}

      {/* Help Modal */}
      {isHelpOpen && <InfoModal onClose={() => setHelpOpen(false)} />}
    </div>
  );
};

export default UIOverlay;
