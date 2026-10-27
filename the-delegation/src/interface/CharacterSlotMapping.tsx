import { ArrowLeftRight } from 'lucide-react';
import React, { useState } from 'react';
import { MAX_AGENTS } from '../data/agents';
import { characterId, SLOT_COLORS } from '../integration/api/YamlImporter';
import { useWorkflowStore } from '../integration/store/workflowStore';

const SLOTS = Array.from({ length: MAX_AGENTS }, (_, i) => i + 1);

const CharacterSlotMapping: React.FC = () => {
  const { workflowGraph, nodeAgentMap, swapSlots } = useWorkflowStore();
  const [selected, setSelected] = useState<string | null>(null);

  if (!workflowGraph) return null;

  const slotToCharacter: Record<number, string> = {};
  for (const [id, slot] of Object.entries(nodeAgentMap)) slotToCharacter[slot] = id;
  const overflow = workflowGraph.agent_nodes.filter(
    (a) => !Object.prototype.hasOwnProperty.call(nodeAgentMap, characterId(a)),
  );

  const handleNodeClick = (id: string) => {
    if (selected === null) {
      setSelected(id);
    } else if (selected === id) {
      setSelected(null);
    } else {
      swapSlots(selected, id);
      setSelected(null);
    }
  };

  return (
    <div className="flex flex-col gap-3 p-4 bg-white rounded-2xl border border-zinc-100">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-black text-darkDelegation uppercase tracking-wider">Character Slots</h3>
        <span className="text-[10px] text-zinc-400">{selected ? 'Select another agent to swap' : 'Click two to swap'}</span>
      </div>

      <div className="flex flex-col gap-2">
        {SLOTS.map((slot) => {
          const id = slotToCharacter[slot];
          const node = workflowGraph.agent_nodes.find((a) => characterId(a) === id);
          return (
            <button
              key={slot}
              onClick={() => id && handleNodeClick(id)}
              disabled={!id}
              className={`flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-all disabled:opacity-40 ${selected === id ? 'ring-2 ring-darkDelegation' : 'hover:bg-zinc-50'}`}
            >
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-black shrink-0" style={{ backgroundColor: SLOT_COLORS[slot - 1] }}>
                {slot}
              </div>
              <span className="text-sm font-medium text-zinc-700 truncate">{node ? node.label : '(empty)'}</span>
              {id && <ArrowLeftRight size={12} className="ml-auto text-zinc-300" />}
            </button>
          );
        })}
      </div>

      {overflow.length > 0 && (
        <div className="mt-2">
          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">Unmapped Agents (log/flow only)</p>
          <div className="flex flex-col gap-1">
            {overflow.map((a) => (
              <div
                key={characterId(a)}
                onClick={() => handleNodeClick(characterId(a))}
                className={`px-3 py-1.5 rounded-lg text-xs text-zinc-500 cursor-pointer transition-all ${selected === characterId(a) ? 'ring-2 ring-darkDelegation bg-zinc-50' : 'hover:bg-zinc-50'}`}
              >
                {a.label}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default CharacterSlotMapping;
