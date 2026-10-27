/**
 * YamlImporter -- Converts a NormalizedGraph (from the backend graph endpoint)
 * into an AgenticSystem + nodeAgentMap for the-delegation's 3D visualization.
 *
 * Pure transform, no IO. Agent nodes fill character slots 1-5 in YAML order;
 * a node with sub_agent slots (e.g. the DynaClinic Care Team) fills one slot
 * per sub-agent. nodeAgentMap is keyed by character id; overflow agents and
 * all non-agent nodes are absent from it (they resolve to -1 / log-only in the
 * EventBridge). The original YAML file runs unchanged on the backend; this
 * mapping is purely a visualization layer.
 */

import type { AgentNodeSlot, NormalizedGraph } from './types';
import type { AgenticSystem, AgentNode } from '../../data/agents';
import { MAX_AGENTS } from '../../data/agents';
import { DEFAULT_MODELS } from '../../core/llm/constants';

const SLOT_COLORS = ['#4285F4', '#34A853', '#FBBC05', '#EA4335', '#64748B'];

export interface ImportResult {
  system: AgenticSystem;
  nodeAgentMap: Record<string, number>;
}

/** Character id: the node id, or `node_id:sub_agent` when one node hosts several characters. */
export function characterId(slot: AgentNodeSlot): string {
  return slot.sub_agent ? `${slot.node_id}:${slot.sub_agent}` : slot.node_id;
}

export function importWorkflow(graph: NormalizedGraph): ImportResult {
  const nodeAgentMap: Record<string, number> = {};
  const nodeLookup = new Map(graph.nodes.map((n) => [n.id, n]));

  const buildFromSlot = (slot: AgentNodeSlot, index: number): AgentNode => {
    const fullNode = nodeLookup.get(slot.node_id);
    const summary = fullNode?.config_summary;
    return {
      id: characterId(slot),
      nodeId: slot.node_id,
      index,
      name: slot.label,
      description: summary?.role || fullNode?.description || 'Imported agent node',
      color: SLOT_COLORS[index - 1] ?? SLOT_COLORS[0],
      model: summary?.model || DEFAULT_MODELS.text,
      provider: summary?.provider,
      position: { x: (index - 2) * 220, y: index === 1 ? 130 : 320 },
    };
  };

  const mapped = graph.agent_nodes
    .filter((a) => a.proposed_slot !== null)
    .slice(0, MAX_AGENTS);

  let leadAgent: AgentNode;
  if (mapped.length > 0) {
    leadAgent = buildFromSlot(mapped[0], 1);
    nodeAgentMap[characterId(mapped[0])] = 1;
    leadAgent.subagents = mapped.slice(1).map((slot, i) => {
      const idx = i + 2;
      nodeAgentMap[characterId(slot)] = idx;
      return buildFromSlot(slot, idx);
    });
  } else {
    leadAgent = {
      id: 'imported-lead',
      index: 1,
      name: 'Workflow',
      description: graph.description || 'Imported workflow with no agent nodes.',
      color: SLOT_COLORS[0],
      model: DEFAULT_MODELS.text,
      position: { x: 0, y: 130 },
    };
  }

  const system: AgenticSystem = {
    id: graph.graph_id || graph.filename.replace(/\.ya?ml$/, ''),
    teamName: graph.graph_id || graph.filename,
    teamType: 'Imported',
    teamDescription: graph.description || `Imported from ${graph.filename}`,
    color: SLOT_COLORS[0],
    outputType: 'text',
    outputModel: DEFAULT_MODELS.text,
    outputAutoApprove: true,
    user: { index: 0, model: 'Human', position: { x: 0, y: 0 } },
    leadAgent,
    sourceYamlFile: graph.filename,
  };

  return { system, nodeAgentMap };
}
