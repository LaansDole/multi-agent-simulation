import { Edge, Node } from '@xyflow/react';
import { AgenticSystem, AgentNode, USER_COLOR, USER_ID, USER_NAME } from '../../data/agents';

export interface HandleData {
  id: string;
  type: 'hierarchy';
  color: string;
  role: 'source' | 'target';
}

export interface VisualAgentNodeData {
  label: string;
  agent?: AgentNode;
  isLead?: boolean;
  color?: string;
  isDimmed?: boolean;
  topHandles: HandleData[];
  bottomHandles: HandleData[];
  [key: string]: any;
}

export type VisualAgentNode = Node<VisualAgentNodeData, 'agent' | 'user'>;

export function systemToFlow(system: AgenticSystem): { nodes: VisualAgentNode[]; edges: Edge[] } {
  const allNodes: VisualAgentNode[] = [];
  const allEdges: Edge[] = [];
  const handles = new Map<string, { top: HandleData[]; bottom: HandleData[] }>();
  const agentMap = new Map<string, AgentNode>();
  const parentMap = new Map<string, string>();
  const processedAgentIds = new Set<string>();

  const addHandle = (nodeId: string, side: 'top' | 'bottom', h: HandleData) => {
    if (!handles.has(nodeId)) handles.set(nodeId, { top: [], bottom: [] });
    const nodeHandles = handles.get(nodeId)!;
    if (!nodeHandles[side].some(existing => existing.id === h.id)) {
      nodeHandles[side].push(h);
    }
  };

  const isParentOf = (parentId: string, childId: string): boolean => {
    let current = childId;
    while (current && parentMap.has(current)) {
      const p = parentMap.get(current)!;
      if (p === parentId) return true;
      current = p;
    }
    return false;
  };

  const traverse = (agent: AgentNode, parentId?: string) => {
    if (parentId) parentMap.set(agent.id, parentId);
    agentMap.set(agent.id, agent);
    if (processedAgentIds.has(agent.id)) return;
    processedAgentIds.add(agent.id);

    // 1. Hierarchy Edges (Subagents) - Always Parent (Bottom) -> Child (Top)
    if (agent.subagents) {
      agent.subagents.forEach(sub => {
        const edgeId = `h-${agent.id}-${sub.id}`;
        const color = `${agent.color}44`;
        
        addHandle(agent.id, 'bottom', { id: `${edgeId}-src`, type: 'hierarchy', color, role: 'source' });
        addHandle(sub.id, 'top', { id: `${edgeId}-tgt`, type: 'hierarchy', color, role: 'target' });

        allEdges.push({
          id: edgeId,
          source: agent.id,
          sourceHandle: `${edgeId}-src`,
          target: sub.id,
          targetHandle: `${edgeId}-tgt`,
          type: 'hierarchy',
          animated: true,
          style: { stroke: color, strokeWidth: 2, strokeDasharray: '5,5' }
        });
        traverse(sub, agent.id);
      });
    }

  };

  // Add User node
  allNodes.push({
    id: USER_ID,
    type: 'user',
    data: { 
      label: USER_NAME + " (You)", 
      color: USER_COLOR,
      topHandles: [],
      bottomHandles: []
    },
    position: system.user.position || { x: 0, y: 0 },
  });

  // Lead agent connection to User
  const lead = system.leadAgent;
  const leadEdgeId = `h-user-${lead.id}`;
  addHandle(USER_ID, 'bottom', { id: `${leadEdgeId}-src`, type: 'hierarchy', color: '#e4e4e7', role: 'source' });
  addHandle(lead.id, 'top', { id: `${leadEdgeId}-tgt`, type: 'hierarchy', color: '#e4e4e7', role: 'target' });
  
  allEdges.push({
    id: leadEdgeId,
    source: USER_ID,
    sourceHandle: `${leadEdgeId}-src`,
    target: lead.id,
    targetHandle: `${leadEdgeId}-tgt`,
    type: 'hierarchy',
    style: { stroke: '#e4e4e7', strokeWidth: 1, strokeDasharray: '5,5' }
  });

  // Start traversal
  traverse(lead);

  // Create nodes from collected agents
  agentMap.forEach((agent, id) => {
    allNodes.push({
      id,
      type: 'agent',
      data: {
        label: agent.name,
        agent,
        isLead: id === system.leadAgent.id,
        color: agent.color,
        topHandles: [], 
        bottomHandles: [] 
      },
      position: agent.position || { x: 0, y: 0 },
    });
  });

  allNodes.forEach(node => {
    const nodeHandles = handles.get(node.id);
    if (nodeHandles) {
      // We maintain the order of insertion (which follows the subagents array order)
      // to ensure connectors don't cross if x-positions are aligned.
      node.data.topHandles = nodeHandles.top;
      node.data.bottomHandles = nodeHandles.bottom;
    }
  });

  return { nodes: allNodes, edges: allEdges };
}
