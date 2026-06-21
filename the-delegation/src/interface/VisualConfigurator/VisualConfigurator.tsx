import { applyEdgeChanges, applyNodeChanges, Background, Edge, EdgeChange, NodeChange, NodeTypes, ReactFlow, ReactFlowProvider, useReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Plus, Settings, User, X } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { AgentNode, getAllCharacters, getAgentSet, MAX_AGENTS, USER_COLOR } from '../../data/agents';
import { DEFAULT_MODELS } from '../../core/llm/constants';
import { useTeamStore } from '../../integration/store/teamStore';
import { useCoreStore } from '../../integration/store/coreStore';
import { AgentConfigPanel } from './AgentConfigPanel';
import { systemToFlow, VisualAgentNode } from './flowUtils';
import { TeamsPanel } from './TeamsPanel';

// Extracted Components & Hooks
import { VisualFlowNode } from './nodes/VisualFlowNode';
import { DirectionalEdge } from './edges/DirectionalEdge';
import { useFlowFocus } from './hooks/useFlowFocus';
import { SystemDebugOverlay } from './SystemDebugOverlay';

const nodeTypes: NodeTypes = {
  agent: VisualFlowNode,
  user: VisualFlowNode,
};

const edgeTypes = {
  default: DirectionalEdge,
  hierarchy: DirectionalEdge,
  smoothstep: DirectionalEdge,
};

// --- Internal Sub-components ---

const InternalHeader = ({ onClose, system }: { onClose: () => void, system: any }) => (
  <div className="h-14 border-b border-zinc-100 bg-white flex items-center justify-between px-6 z-50 shrink-0">
    <div className="flex items-center gap-2">
      <Settings size={18} className="text-darkDelegation" strokeWidth={2} />
      <h2 className="text-xs font-black text-darkDelegation uppercase tracking-[0.2em] ml-2">Manage Teams</h2>

      <div className="ml-4">
        <SystemDebugOverlay system={system} />
      </div>
    </div>

    <div className="flex items-center gap-3">
      <button
        onClick={onClose}
        className="p-2 hover:bg-zinc-100 rounded-xl transition-colors group border border-transparent hover:border-zinc-200"
      >
        <X className="w-5 h-5 text-zinc-400 group-hover:text-darkDelegation" />
      </button>
    </div>
  </div>
);

const AgentPlaceholder = () => (
  <div className="w-80 flex flex-col items-center justify-center p-8 text-center text-zinc-400">
    <User size={32} strokeWidth={1.5} className="mb-4 opacity-20" />
    <p className="text-[10px] uppercase font-bold tracking-widest">Select an agent</p>
    <p className="text-[9px] mt-2 leading-relaxed italic opacity-60">Click on any node in the flow to view and edit its details.</p>
  </div>
);

// --- Main Content ---

const VisualConfiguratorContent: React.FC = () => {
  const { selectedAgentSetId, customSystems } = useTeamStore();
  const { setViewMode, viewMode } = useCoreStore();
  const { fitView } = useReactFlow();

  const [configMode, setConfigMode] = useState<'view' | 'edit'>('view');
  const [selectedTeamId, setSelectedTeamId] = useState<string>(selectedAgentSetId);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const initialSystemRef = useRef<any>(null);

  // Sync selectedTeamId when the active one changes
  useEffect(() => {
    setSelectedTeamId(selectedAgentSetId);
  }, [selectedAgentSetId]);

  const system = useMemo(() => getAgentSet(selectedTeamId, customSystems), [selectedTeamId, customSystems]);

  const characters = useMemo(() => getAllCharacters(system), [system]);

  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => systemToFlow(system), [system]);

  const [nodes, setNodes] = useState<VisualAgentNode[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);

  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges]);

  const activeAgent = useMemo(() =>
    selectedAgentId ? characters.find(a => a.id === selectedAgentId) : null
    , [selectedAgentId, characters]);

  // Fit view on appearance or team change
  useEffect(() => {
    if (viewMode === 'design') {
      const timer = setTimeout(() => fitView({ padding: 0.1, duration: 400 }), 100);
      return () => clearTimeout(timer);
    }
  }, [viewMode, selectedTeamId, initialNodes, fitView]);

  // Use custom hook for focus logic
  const { nodesWithFocus, edgesWithFocus } = useFlowFocus(nodes, edges, selectedAgentId, system.leadAgent.id);

  const onNodesChange = useCallback((changes: NodeChange<VisualAgentNode>[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((eds) => applyEdgeChanges(changes, eds));
  }, []);

  // Recursive helpers for tree mutation
  const updateAgentInTree = useCallback((node: AgentNode, id: string, changes: Partial<AgentNode>): AgentNode => {
    if (node.id === id) return { ...node, ...changes };
    if (!node.subagents) return node;
    return {
      ...node,
      subagents: node.subagents.map(s => updateAgentInTree(s, id, changes))
    };
  }, []);

  const removeAgentFromTree = useCallback((node: AgentNode, id: string): AgentNode | null => {
    if (node.id === id) return null;
    if (!node.subagents) return node;
    return {
      ...node,
      subagents: node.subagents
        .map(s => removeAgentFromTree(s, id))
        .filter((s): s is AgentNode => s !== null)
    };
  }, []);

  const handleAgentLiveUpdate = useCallback((updatedAgent: AgentNode) => {
    const updatedSystem = { ...system };
    updatedSystem.leadAgent = updateAgentInTree(updatedSystem.leadAgent, updatedAgent.id, updatedAgent);
    useTeamStore.getState().updateActiveSystem(updatedSystem);
  }, [system, updateAgentInTree]);

  const onNodeDragStop = useCallback((_: any, node: any) => {
    const { id, position } = node;
    const roundedPosition = { x: Math.round(position.x), y: Math.round(position.y) };
    const updatedSystem = { ...system };

    if (id === 'user') {
      updatedSystem.user = { ...updatedSystem.user, position: roundedPosition };
    } else {
      updatedSystem.leadAgent = updateAgentInTree(updatedSystem.leadAgent, id, { position: roundedPosition });
    }

    useTeamStore.getState().saveCustomSystem(updatedSystem);
  }, [system, updateAgentInTree]);

  const handleClose = useCallback((wasSaved: boolean = false) => {
    if (!wasSaved && initialSystemRef.current) {
      useTeamStore.getState().updateActiveSystem(initialSystemRef.current);
    }
    initialSystemRef.current = null;
    setSelectedAgentId(null);
    setNodes(nds => nds.map(n => ({ ...n, selected: false })));
    if (!selectedAgentId) {
      setConfigMode('view');
      setViewMode('simulation');
    }
  }, [setViewMode, setNodes, selectedAgentId]);

  const onNodeClick = useCallback((_: any, node: any) => {
    if (selectedAgentId !== node.id && node.id !== 'user') {
      initialSystemRef.current = { ...system }; // Snapshot before editing
    }
    setSelectedAgentId(node.id);
  }, [system, selectedAgentId]);

  const onPaneClick = useCallback(() => {
    setSelectedAgentId(null);
  }, []);

  const handleAddAgent = useCallback(() => {
    if (characters.length >= MAX_AGENTS + 1) return; // Total limit check (agents + user)

    const newId = `agent-${Date.now()}`;
    const targetParentId = selectedAgentId && selectedAgentId !== 'user' ? selectedAgentId : system.leadAgent.id;
    const parentAgent = characters.find(a => a.id === targetParentId);

    // Calculate new position
    let newPosition = { x: 0, y: 0 };
    if (parentAgent) {
      const parentPos = parentAgent.position || { x: 0, y: 0 };
      const siblings = parentAgent.subagents || [];
      const siblingCount = siblings.length;

      // Vertical gap (below parent)
      const verticalGap = 160;

      // Horizontal distribution
      // Alternating offsets to spread them: 0, -280, 280, -560, 560
      const offsets = [0, -280, 280, -560, 560];
      const xOffset = offsets[siblingCount % offsets.length];

      newPosition = {
        x: parentPos.x + xOffset,
        y: parentPos.y + verticalGap
      };

      // Safety check: ensure we don't overlap with ANY existing agent's position
      const isOverlapping = (pos: { x: number, y: number }) =>
        characters.some(a => {
          if (!a.position) return false;
          const dx = Math.abs(a.position.x - pos.x);
          const dy = Math.abs(a.position.y - pos.y);
          return dx < 200 && dy < 100; // Node collision box
        });

      let attempts = 0;
      while (isOverlapping(newPosition) && attempts < 8) {
        newPosition.y += 130; // Move to a "new row" below if horizontal space is filled
        attempts++;
      }
    }

    const newAgent: AgentNode = {
      id: newId,
      index: characters.length,
      name: `Specialist ${characters.length}`,
      description: 'Collaborate with the team to achieve the project goals.',
      color: '#A855F7',
      model: DEFAULT_MODELS.text,
      position: newPosition
    };

    const updatedSystem = { ...system };

    // Always add to the subagents of the target parent
    updatedSystem.leadAgent = updateAgentInTree(updatedSystem.leadAgent, targetParentId, {
      subagents: [...(parentAgent?.subagents || []), newAgent]
    });

    useTeamStore.getState().saveCustomSystem(updatedSystem);
    setSelectedAgentId(newId);
  }, [system, characters, selectedAgentId, updateAgentInTree]);

  const handleRemoveAgent = useCallback((agentId: string) => {
    const updatedSystem = { ...system };
    const newLead = removeAgentFromTree(updatedSystem.leadAgent, agentId);
    if (newLead) {
      updatedSystem.leadAgent = newLead;
      useTeamStore.getState().saveCustomSystem(updatedSystem);
    }
    setSelectedAgentId(null);
  }, [system, removeAgentFromTree]);

  return (
    <div className="w-full h-full relative bg-zinc-50 flex flex-col overflow-hidden">
      <InternalHeader onClose={() => handleClose(false)} system={system} />

      <div className="flex-1 min-h-0 relative flex overflow-hidden">
        {/* Left Panel: Agent Config */}
        <div className="relative shrink-0 flex border-r border-zinc-100 bg-white">
          {activeAgent && activeAgent.id !== 'user' ? (
            <AgentConfigPanel
              agent={activeAgent}
              system={system}
              onClose={handleClose}
              onUpdate={handleAgentLiveUpdate}
              onRemove={() => handleRemoveAgent(activeAgent.id)}
              mode={configMode}
            />
          ) : (
            <AgentPlaceholder />
          )}
        </div>

        {/* Center Canvas */}
        <div className="flex-1 relative overflow-hidden">
          <ReactFlow
            nodes={nodesWithFocus}
            edges={edgesWithFocus}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onNodeDragStop={onNodeDragStop}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            nodeOrigin={[0.5, 0]}
            fitView
            proOptions={{ hideAttribution: true }}
            nodesConnectable={configMode === 'edit'}
            nodesDraggable={configMode === 'edit'}
            elementsSelectable={true}
            zoomOnScroll={true}
            maxZoom={1.5}
            minZoom={0.5}
          >
            <Background gap={24} color="#bbbbbb" size={2} />
            {configMode === 'edit' && selectedAgentId && selectedAgentId !== 'user' && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 z-10 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <button
                  onClick={handleAddAgent}
                  disabled={characters.length >= MAX_AGENTS + 1}
                  className={`flex items-center gap-2 px-8 py-3 bg-darkDelegation text-white rounded-xl text-[10px] font-black uppercase tracking-[0.1em] shadow-lg shadow-black/5 transition-all ${characters.length >= MAX_AGENTS + 1
                    ? 'opacity-40 cursor-not-allowed grayscale'
                    : 'hover:bg-black hover:scale-105 active:scale-95'
                    }`}
                >
                  <Plus size={16} strokeWidth={3} />
                  Add Subagent to {characters.find(a => a.id === (selectedAgentId && selectedAgentId !== 'user' ? selectedAgentId : system.leadAgent.id))?.name || 'Lead'}
                </button>
                <p className="text-[10px] text-zinc-400 font-bold tracking-widest">
                  Maximum {MAX_AGENTS} agents allowed
                </p>
              </div>
            )}
          </ReactFlow>
        </div>

        {/* Right Panel: Teams */}
        <TeamsPanel
          selectedTeamId={selectedTeamId}
          onSelectTeam={(id) => {
            if (id !== selectedTeamId) {
              setSelectedTeamId(id);
              setSelectedAgentId(null);
              setConfigMode('view');
            }
          }}
          mode={configMode}
          onModeChange={setConfigMode}
        />
      </div>
    </div>
  );
};

export const VisualConfigurator: React.FC = () => (
  <ReactFlowProvider>
    <VisualConfiguratorContent />
  </ReactFlowProvider>
);
