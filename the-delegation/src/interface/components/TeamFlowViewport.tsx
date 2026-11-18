import { Background, ReactFlow, ReactFlowProvider, useReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import React, { useEffect, useMemo } from 'react';
import { AgenticSystem } from '../../data/agents';
import { DirectionalEdge } from '../VisualConfigurator/edges/DirectionalEdge';
import { VisualFlowNode } from '../VisualConfigurator/nodes/VisualFlowNode';
import { systemToFlow } from '../VisualConfigurator/flowUtils';
import { useFlowFocus } from '../VisualConfigurator/hooks/useFlowFocus';

const nodeTypes = {
  agent: VisualFlowNode,
  user: VisualFlowNode,
};

const edgeTypes = {
  default: DirectionalEdge,
  hierarchy: DirectionalEdge,
  smoothstep: DirectionalEdge,
};

/** Read-only ReactFlow render of an AgenticSystem's hierarchy. Fits view on mount/system change. */
const TeamFlowViewportInner: React.FC<{ system: AgenticSystem }> = ({ system }) => {
  const { fitView } = useReactFlow();
  const { nodes, edges } = useMemo(() => systemToFlow(system), [system]);

  // Focus lead agent by default
  const { nodesWithFocus, edgesWithFocus } = useFlowFocus(nodes, edges, null, system.leadAgent.id);

  useEffect(() => {
    const timer = setTimeout(() => {
      fitView({ padding: 0.2, duration: 800 });
    }, 100);
    return () => clearTimeout(timer);
  }, [fitView, system]);

  return (
    <ReactFlow
      nodes={nodesWithFocus}
      edges={edgesWithFocus}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      nodeOrigin={[0.5, 0]}
      fitView
      proOptions={{ hideAttribution: true }}
      nodesConnectable={false}
      nodesDraggable={false}
      elementsSelectable={false}
      zoomOnScroll={true}
      maxZoom={1.5}
      minZoom={0.2}
      className="bg-zinc-50/50"
    >
      <Background gap={24} color="#bbbbbb" size={2} />
    </ReactFlow>
  );
};

/** Provider-wrapped: drop in anywhere a read-only team graph is needed. */
export const TeamFlowViewport: React.FC<{ system: AgenticSystem }> = ({ system }) => (
  <ReactFlowProvider>
    <TeamFlowViewportInner system={system} />
  </ReactFlowProvider>
);
