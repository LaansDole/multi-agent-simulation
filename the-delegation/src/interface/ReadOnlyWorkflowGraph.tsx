import React, { useMemo } from 'react';
import {
  ReactFlow, Background, Controls,
  type Node, type Edge, ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useWorkflowStore } from '../integration/store/workflowStore';
import type { NormalizedGraph } from '../integration/api/types';

const TYPE_COLORS: Record<string, string> = {
  agent: '#4285F4', human: '#FBBC05', literal: '#a1a1aa',
  loop_counter: '#64748B', loop_timer: '#64748B',
  template: '#14b8a6', python: '#14b8a6', passthrough: '#d4d4d8',
  subgraph: '#8b5cf6', rlm_memory: '#f59e0b',
};

const LAYER_X = 260;
const NODE_Y = 130;

/** Assign layered positions via BFS from start nodes. */
function layoutGraph(graph: NormalizedGraph): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {};
  const adj: Record<string, string[]> = {};
  for (const n of graph.nodes) adj[n.id] = [];
  for (const e of graph.edges) if (adj[e.from]) adj[e.from].push(e.to);

  const layer: Record<string, number> = {};
  const queue: string[] = [...(graph.start.length ? graph.start : graph.nodes.slice(0, 1).map((n) => n.id))];
  for (const id of queue) layer[id] = 0;
  while (queue.length) {
    const id = queue.shift()!;
    const depth = layer[id];
    for (const next of adj[id] ?? []) {
      if (layer[next] === undefined || layer[next] < depth + 1) {
        layer[next] = depth + 1;
        queue.push(next);
      }
    }
  }
  for (const n of graph.nodes) if (layer[n.id] === undefined) layer[n.id] = 0;

  const byLayer: Record<number, string[]> = {};
  for (const n of graph.nodes) (byLayer[layer[n.id]] ??= []).push(n.id);
  for (const [dStr, ids] of Object.entries(byLayer)) {
    const d = Number(dStr);
    ids.forEach((id, i) => { positions[id] = { x: d * LAYER_X, y: i * NODE_Y }; });
  }
  return positions;
}

const FlowInner: React.FC = () => {
  const workflowGraph = useWorkflowStore((s) => s.workflowGraph);

  const { nodes, edges } = useMemo(() => {
    if (!workflowGraph) return { nodes: [] as Node[], edges: [] as Edge[] };
    const positions = layoutGraph(workflowGraph);
    const startSet = new Set(workflowGraph.start);
    const endSet = new Set(workflowGraph.end ?? []);

    const nodes: Node[] = workflowGraph.nodes.map((n) => ({
      id: n.id,
      position: positions[n.id] ?? { x: 0, y: 0 },
      data: { label: `${n.label}  (${n.type})${startSet.has(n.id) ? '  [START]' : ''}${endSet.has(n.id) ? '  [END]' : ''}` },
      style: { borderLeft: `4px solid ${TYPE_COLORS[n.type] ?? '#d4d4d8'}`, fontSize: 11, opacity: n.is_agent ? 1 : 0.75 },
      draggable: false,
    }));

    const edges: Edge[] = workflowGraph.edges.map((e, i) => ({
      id: `e${i}-${e.from}-${e.to}`,
      source: e.from,
      target: e.to,
      animated: e.is_dynamic,
      style: { strokeDasharray: e.is_dynamic ? '6 4' : undefined },
    }));

    return { nodes, edges };
  }, [workflowGraph]);

  if (!workflowGraph) return null;

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        fitView
        fitViewOptions={{ padding: 0.15 }}
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
};

const ReadOnlyWorkflowGraph: React.FC = () => (
  <ReactFlowProvider>
    <FlowInner />
  </ReactFlowProvider>
);

export default ReadOnlyWorkflowGraph;
