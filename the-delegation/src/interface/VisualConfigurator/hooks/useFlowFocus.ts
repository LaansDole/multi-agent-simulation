
import { useMemo } from 'react';
import { VisualAgentNode } from '../flowUtils';
import { USER_ID } from '../../../data/agents';

export const useFlowFocus = (
  nodes: VisualAgentNode[],
  edges: any[],
  selectedAgentId: string | null,
  leadAgentId: string
) => {
  const nodesWithFocus = useMemo(() => {
    const selectedNode = selectedAgentId ? nodes.find(n => n.id === selectedAgentId) : null;
    const isSubagentSelected = selectedNode?.type === 'agent' && !selectedNode.data.isLead;

    if (!isSubagentSelected) {
      return nodes.map(node => ({
        ...node,
        data: { ...node.data, isDimmed: false }
      }));
    }

    return nodes.map(node => ({
      ...node,
      data: { 
        ...node.data, 
        isDimmed: (node.type === 'agent' && !node.data.isLead && node.id !== selectedAgentId)
      }
    }));
  }, [nodes, selectedAgentId]);

  const edgesWithFocus = useMemo(() => {
    const selectedNode = selectedAgentId ? nodes.find(n => n.id === selectedAgentId) : null;
    const isSubagentSelected = selectedNode?.type === 'agent' && !selectedNode.data.isLead;

    if (!isSubagentSelected) {
      return edges.map(edge => ({
        ...edge,
        style: { ...edge.style, opacity: 1 },
        animated: edge.animated,
      }));
    }

    return edges.map(edge => {
      const involvesSelected = edge.source === selectedAgentId || edge.target === selectedAgentId;
      const isCorePath = (edge.source === USER_ID || edge.target === USER_ID) && 
                         (edge.source === leadAgentId || edge.target === leadAgentId);
      
      const shouldBeOpaque = involvesSelected || isCorePath;

      return {
        ...edge,
        style: { 
          ...edge.style, 
          opacity: shouldBeOpaque ? 1 : 0.05 
        },
        animated: shouldBeOpaque ? edge.animated : false,
      };
    });
  }, [edges, nodes, selectedAgentId, leadAgentId]);

  return { nodesWithFocus, edgesWithFocus };
};
