import { AgenticSystem, AgentNode } from '../../data/agents';
import { BackendClient } from './BackendClient';

// Helper to escape or format multi-line text for YAML
function formatYamlString(text: string, indent: string = '      '): string {
  const cleaned = (text || '').trim();
  if (cleaned.includes('\n')) {
    // Return block scalar format:
    // |
    //   line 1
    //   line 2
    const lines = cleaned.split('\n').map(l => `${indent}  ${l}`).join('\n');
    return `|\n${lines}`;
  } else {
    // Single line. Escape if it contains special characters
    if (
      cleaned.includes(':') ||
      cleaned.includes('{') ||
      cleaned.includes('}') ||
      cleaned.includes('[') ||
      cleaned.includes(']') ||
      cleaned.includes(',') ||
      cleaned.includes('&') ||
      cleaned.includes('*') ||
      cleaned.includes('#') ||
      cleaned.includes('?') ||
      cleaned.includes('|') ||
      cleaned.includes('-') ||
      cleaned.includes('<') ||
      cleaned.includes('>') ||
      cleaned.includes('=') ||
      cleaned.includes('!') ||
      cleaned.includes('%') ||
      cleaned.includes('@') ||
      cleaned.includes('`') ||
      cleaned.includes('"') ||
      cleaned.includes('\'')
    ) {
      return `"${cleaned.replace(/"/g, '\\"')}"`;
    }
    return cleaned || '""';
  }
}

/**
 * Converts an AgenticSystem (the ReactFlow team configuration model)
 * into DevAll YAML workflow configuration format (version 0.4.0).
 */
export function exportSystemToYaml(system: AgenticSystem): string {
  const nodesYaml: string[] = [];
  const edgesYaml: string[] = [];
  const allNodeIds: string[] = [];
  const nodesWithOutgoing = new Set<string>();

  const traverse = (agent: AgentNode) => {
    const currentId = agent.id;
    allNodeIds.push(currentId);
    const modelName = agent.model || 'gemini-3-flash-preview';
    const provider = agent.provider ?? (
      modelName.toLowerCase().startsWith('gemini') ? 'gemini' : 'openai'
    );

    // Build config block
    const configLines: string[] = [];
    configLines.push(`      provider: ${provider}`);
    configLines.push(`      name: ${modelName}`);

    if (provider === 'openai') {
      configLines.push(`      base_url: ${agent.baseUrl ? `"${agent.baseUrl}"` : '${BASE_URL}'}`);
      configLines.push(`      api_key: ${agent.apiKey ? `"${agent.apiKey}"` : '${API_KEY}'}`);
    }

    configLines.push(`      role: ${formatYamlString(agent.description, '        ')}`);
    configLines.push(`      params:`);
    configLines.push(`        temperature: 0.7`);
    configLines.push(`        max_tokens: 4000`);

    nodesYaml.push(`  - id: ${currentId}
    type: agent
    config:
${configLines.join('\n')}`);

    let outgoingSourceId = currentId;

    // 2. Handle Human-in-the-loop review node
    if (agent.humanInTheLoop) {
      const reviewId = `review_${currentId}`;
      allNodeIds.push(reviewId);
      nodesYaml.push(`  - id: ${reviewId}
    type: human
    config:
      description: Please review and approve the output from ${agent.name}.`);

      edgesYaml.push(`  - from: ${currentId}
    to: ${reviewId}`);
      nodesWithOutgoing.add(currentId);

      outgoingSourceId = reviewId;
    }

    // 3. Process subagents
    if (agent.subagents && agent.subagents.length > 0) {
      for (const sub of agent.subagents) {
        // Edge connects current output (either agent directly or human review) to subagent
        edgesYaml.push(`  - from: ${outgoingSourceId}
    to: ${sub.id}`);
        nodesWithOutgoing.add(outgoingSourceId);
        traverse(sub);
      }
    }
  };

  // Start traversal from lead agent
  traverse(system.leadAgent);

  // Find all sinks (nodes with no outgoing edges)
  const sinks = allNodeIds.filter(id => !nodesWithOutgoing.has(id));

  // Construct final YAML string
  const yamlLines = [
    `version: 0.4.0`,
    `vars: {}`,
    `graph:`,
    `  id: ${system.id}`,
    `  description: ${formatYamlString(system.teamDescription, '    ')}`,
    `  is_majority_voting: false`,
    `  start:`,
    `    - ${system.leadAgent.id}`,
    `  end:`,
    sinks.map(s => `    - ${s}`).join('\n'),
    `  nodes:`,
    nodesYaml.join('\n'),
    `  edges:`,
    edgesYaml.length > 0 ? edgesYaml.join('\n') : '    []',
  ];

  return yamlLines.join('\n') + '\n';
}

/**
 * Generates the YAML representation of a team configuration
 * and uploads/updates it on the DevAll backend.
 */
export async function uploadWorkflowYaml(client: BackendClient, system: AgenticSystem): Promise<void> {
  const yamlContent = exportSystemToYaml(system);
  const filename = `${system.id}.yaml`;
  await client.uploadWorkflow(filename, yamlContent);
}
