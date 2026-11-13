// Runtime-value imports here must resolve under Node's native ESM loader (tests import this
// module directly, no bundler). `data/agents.ts` pulls in its own extensionless relative
// imports, so only its types are imported here; MAX_AGENTS is passed in by the caller instead.
import type { AgentNode, AgenticSystem } from '../../data/agents.ts';
import { AVAILABLE_MODELS, DEFAULT_MODELS, inferProvider } from './constants.ts';
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
    '    "model": string (optional; leave empty "" unless the user names a model),',
    '    "subagents": [ { "name": string, "description": string, "model": string (optional, same rule), "subagents": [...] }, ... ] (optional)',
    '  }',
    '}',
    `The team (lead agent plus every nested subagent) must total at most ${maxAgents} agents. Do not invent ids, colors, or positions -- they are assigned automatically. Output valid JSON with no comments.`,
    'Agents run on one of two providers. If the user names a model, use one of these exact ids:',
    `- OpenAI-compatible: ${AVAILABLE_MODELS.text.filter((m) => inferProvider(m) === 'openai').join(', ')}`,
    `- Gemini: ${AVAILABLE_MODELS.text.filter((m) => inferProvider(m) === 'gemini').join(', ')}`,
    'Otherwise leave "model" empty so the default model is used.',
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

/** Counts agents in the raw (untrusted) tree iteratively, stopping once past `limit` so deep nesting cannot overflow the stack. */
function countRawAgents(root: unknown, limit: number): number {
  let total = 0;
  const stack: unknown[] = [root];
  while (stack.length && total <= limit) {
    const node = stack.pop();
    total++;
    const subs = node && typeof node === 'object' ? (node as Record<string, unknown>).subagents : undefined;
    if (Array.isArray(subs)) stack.push(...subs);
  }
  return total;
}

// Values below are written unquoted into the backend YAML (YamlExporter), so model-written text is restricted.
const SAFE_MODEL = /^[\w.\-:/@]+$/;
const stripControl = (s: string) => s.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();

/** Assigns fresh id/index/color/model to every node, depth-first, building a fresh tree (does not mutate the input). Positions are set by `layoutAgent`. */
function rebuildAgent(raw: unknown, indexCounter: { next: number }, fallbackModel: string): AgentNode {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const name = typeof obj.name === 'string' && stripControl(obj.name) ? stripControl(obj.name) : 'Agent';
  const description = typeof obj.description === 'string' ? stripControl(obj.description) : '';
  const rawModel = typeof obj.model === 'string' ? obj.model.trim() : '';
  const model = SAFE_MODEL.test(rawModel) ? rawModel : fallbackModel;
  const index = indexCounter.next++;
  const color = PALETTE[(index - 1) % PALETTE.length];

  const rawSubagents = Array.isArray(obj.subagents) ? obj.subagents : [];
  const subagents = rawSubagents.map((sub) => rebuildAgent(sub, indexCounter, fallbackModel));

  return {
    id: `agent-${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    index,
    name,
    description,
    color,
    model,
    position: { x: 0, y: 0 },
    ...(subagents.length ? { subagents } : {}),
  };
}

function countLeaves(agent: AgentNode): number {
  const subs = agent.subagents || [];
  return subs.length ? subs.reduce((sum, sub) => sum + countLeaves(sub), 0) : 1;
}

/**
 * Gives every leaf its own column and centers each parent over its children, so sibling subtrees
 * never overlap. `firstLeaf` is the column of the subtree's leftmost leaf; returns its leaf count.
 */
function layoutAgent(agent: AgentNode, depth: number, firstLeaf: number): number {
  let leaves = 0;
  for (const sub of agent.subagents || []) leaves += layoutAgent(sub, depth + 1, firstLeaf + leaves);
  const width = Math.max(leaves, 1);
  agent.position = { x: (firstLeaf + (width - 1) / 2) * 260, y: depth * 150 };
  return width;
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

  // Count the raw tree first: rebuilding/laying out an over-deep tree recursively would throw RangeError.
  const total = countRawAgents(leadAgentRaw, maxAgents);
  if (total > maxAgents) {
    throw new Error(`The generated team has more than ${maxAgents} agents, but the max is ${maxAgents}. Try a narrower description.`);
  }

  const indexCounter = { next: 1 };
  const leadAgent = rebuildAgent(leadAgentRaw, indexCounter, fallbackModel);
  // Start the leftmost column so the lead agent lands at x = 0, under the user node.
  layoutAgent(leadAgent, 1, -(countLeaves(leadAgent) - 1) / 2);

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

/**
 * Runs one chat turn: calls the provider, then parses/validates its response into a complete AgenticSystem.
 * `modelName` is the model doing the generating; `agentFallbackModel` is what generated agents run on when
 * the reply leaves their model blank (the backend default, not the generator's possibly-local model).
 */
export async function runGenerationTurn(
  provider: LLMProvider,
  modelName: string,
  history: LLMMessage[],
  currentSystem: AgenticSystem | null,
  instruction: string,
  maxAgents: number,
  agentFallbackModel: string
): Promise<GenerationTurnResult> {
  const systemInstruction = buildSystemPrompt(currentSystem, maxAgents);
  const messages: LLMMessage[] = [...history, { role: 'user', content: instruction }];

  const response = await provider.generateCompletion(messages, undefined, systemInstruction, modelName);
  if (!response.content) {
    throw new Error('The model returned an empty response.');
  }

  return parseGeneratedSystem(response.content, currentSystem, agentFallbackModel, maxAgents);
}
