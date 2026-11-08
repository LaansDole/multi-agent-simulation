// Runtime-value imports here must resolve under Node's native ESM loader (tests import this
// module directly, no bundler). `data/agents.ts` pulls in its own extensionless relative
// imports, so only its types are imported here; MAX_AGENTS is passed in by the caller instead.
import type { AgentNode, AgenticSystem } from '../../data/agents.ts';
import { DEFAULT_MODELS } from './constants.ts';
import type { LLMMessage, LLMProvider } from './types.ts';

const PALETTE = ['#4285F4', '#34A853', '#FBBC05', '#EA4335', '#A855F7', '#FF6B35', '#14B8A6', '#EC4899'];

export interface GenerationTurnResult {
  system: AgenticSystem;
  /** The model's own prose explanation, shown as the assistant's chat bubble. */
  assistantText: string;
}

function buildSystemPrompt(currentSystem: AgenticSystem | null, maxAgents: number): string {
  const shape = [
    'Respond with a short explanation (1-3 sentences) of what you built or changed, then exactly one fenced ```json code block containing the COMPLETE team as a single JSON object with this shape:',
    '{',
    '  "teamName": string,',
    '  "teamType": string,',
    '  "teamDescription": string,',
    '  "leadAgent": {',
    '    "name": string,',
    '    "description": string (the agent\'s role/responsibilities),',
    '    "model": string (optional; leave blank to use the default model),',
    '    "subagents": [ { "name": string, "description": string, "model": string (optional), "subagents": [...] }, ... ] (optional)',
    '  }',
    '}',
    `The team (lead agent plus every nested subagent) must total at most ${maxAgents} agents. Do not invent ids, colors, or positions -- they are assigned automatically. Output valid JSON with no comments.`,
  ].join('\n');

  if (!currentSystem) {
    return `You design multi-agent team configurations for a no-code agent orchestration tool.\n\n${shape}\n\nThe user will describe the team they want. Create one from scratch.`;
  }

  return [
    'You design multi-agent team configurations for a no-code agent orchestration tool.',
    '',
    shape,
    '',
    'The team currently looks like this:',
    '```json',
    JSON.stringify(currentSystem, null, 2),
    '```',
    '',
    'The user will describe a change. Return the COMPLETE updated team (not a diff) reflecting that change; keep everything the user did not ask to change as it was.',
  ].join('\n');
}

function extractJsonBlock(text: string): { prose: string; jsonText: string } {
  const match = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/);
  if (!match) {
    throw new Error("The model's response did not include a JSON code block.");
  }
  const prose = text.slice(0, match.index).trim() || text.slice((match.index || 0) + match[0].length).trim();
  return { prose, jsonText: match[1].trim() };
}

function countAgents(agent: AgentNode): number {
  return 1 + (agent.subagents || []).reduce((sum, sub) => sum + countAgents(sub), 0);
}

/** Assigns fresh id/index/position/color/model to every node, depth-first, mutating a fresh tree (does not mutate the input). */
function rebuildAgent(
  raw: unknown,
  depth: number,
  xCenter: number,
  siblingIndex: number,
  siblingCount: number,
  indexCounter: { next: number },
  fallbackModel: string
): AgentNode {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const name = typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim() : 'Agent';
  const description = typeof obj.description === 'string' ? obj.description : '';
  const model = typeof obj.model === 'string' && obj.model.trim() ? obj.model.trim() : fallbackModel;
  const index = indexCounter.next++;
  const color = PALETTE[(index - 1) % PALETTE.length];
  const spacing = 260;
  const x = xCenter + (siblingIndex - (siblingCount - 1) / 2) * spacing;
  const y = depth * 150;

  const rawSubagents = Array.isArray(obj.subagents) ? obj.subagents : [];
  const subagents = rawSubagents.length
    ? rawSubagents.map((sub, i) => rebuildAgent(sub, depth + 1, x, i, rawSubagents.length, indexCounter, fallbackModel))
    : undefined;

  return {
    id: `agent-${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    index,
    name,
    description,
    color,
    model,
    position: { x, y },
    ...(subagents ? { subagents } : {}),
  };
}

/**
 * Parses and validates a generation turn's raw text response into a complete AgenticSystem.
 * Pure (aside from no I/O) -- throws a descriptive Error on any malformed/oversized response.
 */
export function parseGeneratedSystem(
  responseText: string,
  existing: AgenticSystem | null,
  fallbackModel: string,
  maxAgents: number
): GenerationTurnResult {
  const { prose, jsonText } = extractJsonBlock(responseText);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    throw new Error(`The model's JSON block was not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (!parsed || typeof parsed !== 'object' || !('leadAgent' in parsed)) {
    throw new Error('The generated team is missing a "leadAgent".');
  }
  const obj = parsed as Record<string, unknown>;

  const leadAgentRaw = obj.leadAgent;
  if (!leadAgentRaw || typeof leadAgentRaw !== 'object') {
    throw new Error('The generated team\'s "leadAgent" is not an object.');
  }

  const indexCounter = { next: 1 };
  const leadAgent = rebuildAgent(leadAgentRaw, 1, 0, 0, 1, indexCounter, fallbackModel);

  const total = countAgents(leadAgent);
  if (total > maxAgents) {
    throw new Error(`The generated team has ${total} agents, but the max is ${maxAgents}. Try a narrower description.`);
  }

  const teamName = typeof obj.teamName === 'string' && obj.teamName.trim() ? obj.teamName.trim() : 'New Team';
  const teamType = typeof obj.teamType === 'string' && obj.teamType.trim() ? obj.teamType.trim() : 'Custom';
  const teamDescription = typeof obj.teamDescription === 'string' ? obj.teamDescription : '';

  const system: AgenticSystem = {
    id: existing?.id || `team-${Date.now()}`,
    teamName,
    teamType,
    teamDescription,
    color: leadAgent.color,
    // Output type/model are not part of generation; every generated team starts as text output,
    // same as a manually created team, editable later in TeamCard.
    outputType: 'text',
    outputModel: DEFAULT_MODELS.text,
    user: existing?.user || { index: 0, model: 'Human', position: { x: 0, y: 0 } },
    leadAgent,
  };

  return { system, assistantText: prose || `Updated the team: ${teamName}.` };
}

/** Runs one chat turn: calls the provider, then parses/validates its response into a complete AgenticSystem. */
export async function runGenerationTurn(
  provider: LLMProvider,
  modelName: string,
  history: LLMMessage[],
  currentSystem: AgenticSystem | null,
  instruction: string,
  maxAgents: number
): Promise<GenerationTurnResult> {
  const systemInstruction = buildSystemPrompt(currentSystem, maxAgents);
  const messages: LLMMessage[] = [...history, { role: 'user', content: instruction }];

  const response = await provider.generateCompletion(messages, undefined, systemInstruction, modelName);
  if (!response.content) {
    throw new Error('The model returned an empty response.');
  }

  return parseGeneratedSystem(response.content, currentSystem, modelName, maxAgents);
}
