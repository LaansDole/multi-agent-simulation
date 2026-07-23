import { ArrowLeftRight } from 'lucide-react';
import React, { useState } from 'react';
import { useWorkflowStore } from '../integration/store/workflowStore';

const SLOT_COLORS = ['#4285F4', '#34A853', '#FBBC05', '#EA4335', '#64748B'];

const CharacterSlotMapping: React.FC = () => {
  const { workflowGraph, nodeAgentMap, swapSlots } = useWorkflowStore();
  const [selected, setSelected] = useState<string | null>(null);

  if (!workflowGraph) return null;

  const slotToNode: Record<number, string> = {};
  for (const [nodeId, slot] of Object.entries(nodeAgentMap)) slotToNode[slot] = nodeId;
  const overflow = workflowGraph.agent_nodes.filter(
    (a) => !Object.prototype.hasOwnProperty.call(nodeAgentMap, a.node_id),
  );

  const handleNodeClick = (nodeId: string) => {
    if (selected === null) {
      setSelected(nodeId);
    } else if (selected === nodeId) {
      setSelected(null);
    } else {
      swapSlots(selected, nodeId);
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
        {[1, 2, 3, 4, 5].map((slot) => {
          const nodeId = slotToNode[slot];
          const node = workflowGraph.agent_nodes.find((a) => a.node_id === nodeId);
          return (
            <button
              key={slot}
              onClick={() => nodeId && handleNodeClick(nodeId)}
              disabled={!nodeId}
              className={`flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-all disabled:opacity-40 ${selected === nodeId ? 'ring-2 ring-darkDelegation' : 'hover:bg-zinc-50'}`}
            >
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-black shrink-0" style={{ backgroundColor: SLOT_COLORS[slot - 1] }}>
                {slot}
              </div>
              <span className="text-sm font-medium text-zinc-700 truncate">{node ? node.label : '(empty)'}</span>
              {nodeId && <ArrowLeftRight size={12} className="ml-auto text-zinc-300" />}
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
                key={a.node_id}
                onClick={() => handleNodeClick(a.node_id)}
                className={`px-3 py-1.5 rounded-lg text-xs text-zinc-500 cursor-pointer transition-all ${selected === a.node_id ? 'ring-2 ring-darkDelegation bg-zinc-50' : 'hover:bg-zinc-50'}`}
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
