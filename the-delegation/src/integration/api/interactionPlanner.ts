/**
 * interactionPlanner -- Pure hand-off / conversation logic for the 3D office. No imports, no IO:
 * the EventBridge feeds it backend node events plus the imported graph's edges, and turns its
 * plans into scene cues (who walks to whom, who talks).
 *
 * "Agent" here means a node with a 3D character. Every other node (literal, loop_counter,
 * loop_timer, template, passthrough, overflow agents without a character) is transparent: a
 * message that passes through it is attributed to the nearest agent ancestor.
 */

/** Directed edge of the imported workflow graph (NormalizedEdge subset). */
export interface GraphEdge {
  from: string;
  to: string;
}

/** One hand-off: `from` passes its output to `to`; `also` are the other agents that fed `to` this time. */
export interface HandOff {
  from: string;
  to: string;
  also: string[];
  text: string;
}

/** What the scene should show when a node starts. */
export interface StartPlan {
  handOff: HandOff | null;
  /** Members of a conversation loop that starts with this node (they meet and stay together). */
  meetingStart: string[] | null;
  /** The running conversation ended: an agent outside it started. */
  meetingEnd: boolean;
}

/** Largest group of agents treated as a conversation (pair or trio taking turns). */
export const MAX_CONVERSATION_AGENTS = 3;
/** Characters of a node's output shown in the speech bubble. */
export const SPEECH_CHARS = 80;

/**
 * Agents whose output reached `nodeId` after sequence number `since`, most recently completed first.
 * Walks the edges backwards; nodes for which `isAgent` is false are traversed, agents stop the walk.
 * `nodeId` itself never counts (self-loops, cycles through non-agent nodes).
 */
export function feedingAgents(
  edges: readonly GraphEdge[],
  isAgent: (nodeId: string) => boolean,
  completedAt: ReadonlyMap<string, number>,
  nodeId: string,
  since: number,
): string[] {
  const found = new Set<string>();
  const visited = new Set<string>([nodeId]);
  const queue = [nodeId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of edges) {
      if (edge.to !== current || visited.has(edge.from)) continue;
      visited.add(edge.from);
      if (isAgent(edge.from)) found.add(edge.from);
      else queue.push(edge.from);
    }
  }
  return [...found]
    .filter((id) => (completedAt.get(id) ?? 0) > since)
    .sort((a, b) => completedAt.get(b)! - completedAt.get(a)!);
}

/**
 * Members of the conversation the latest hand-off closes, or null. A conversation is a short cycle:
 * the latest listener spoke in one of the previous `maxAgents - 1` hand-offs (A->B, B->A; or
 * A->B, B->C, C->A), and the hand-offs since then involve at most `maxAgents` agents.
 */
export function conversationLoop(
  handOffs: readonly (readonly [string, string])[],
  maxAgents: number = MAX_CONVERSATION_AGENTS,
): string[] | null {
  const last = handOffs.length - 1;
  if (last < 1) return null;
  const listener = handOffs[last][1];
  for (let i = last - 1; i >= Math.max(0, last - (maxAgents - 1)); i--) {
    if (handOffs[i][0] !== listener) continue;
    const members = new Set(handOffs.slice(i).flat());
    return members.size <= maxAgents ? [...members] : null;
  }
  return null;
}

/** `patient_name` / `chiefComplaint` -> `patient name` / `chief complaint`. */
function readableKey(key: string): string {
  return key.replace(/[_-]+/g, ' ').replace(/([a-z\d])([A-Z])/g, (_, a: string, b: string) => `${a} ${b.toLowerCase()}`).trim();
}

const count = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? '' : 's'}`;

/** A JSON value in a few words: `key: value` pairs at the top, nested arrays/objects as counts. */
function summarise(value: unknown, top: boolean): string {
  if (Array.isArray(value)) {
    if (!top || value.length === 0) return count(value.length, 'item');
    return `${count(value.length, 'item')}: ${summarise(value[0], !Array.isArray(value[0]))}`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value);
    if (!top) return count(entries.length, 'field');
    return entries.map(([key, v]) => `${readableKey(key)}: ${summarise(v, false)}`).join(', ');
  }
  return value === null ? 'none' : String(value);
}

/**
 * `text` without its markup: a JSON payload (bare, fenced or after a preface; at least half of the
 * text) as `key: value` pairs, Markdown without headings, emphasis, list markers, fences and link
 * targets. Anything else comes back unchanged.
 */
function readable(text: string): string {
  const start = text.search(/[{[]/);
  const end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
  if (start >= 0 && end > start && 2 * (end - start + 1) >= text.trim().length) {
    try {
      const summary = summarise(JSON.parse(text.slice(start, end + 1)), true);
      if (summary) return summary;
    } catch {
      // Not JSON: read it as Markdown / plain text.
    }
  }
  return text
    .replace(/^[ \t]*```.*$/gm, '') // code fences
    .replace(/^[ \t]*(?:[-*_][ \t]*){3,}$/gm, '') // horizontal rules
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, '') // headings
    .replace(/^[ \t]*>[ \t]?/gm, '') // block quotes
    .replace(/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+/gm, '') // list markers
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // links and images: keep the text
    .replace(/(\*\*|__|~~)(.+?)\1/g, '$2') // bold, strikethrough
    .replace(/(?<!\w)([*_])(?!\s)(.+?)(?<!\s)\1(?!\w)/g, '$2') // italics
    .replace(/`([^`]*)`/g, '$1'); // inline code
}

/** Readable first `max` characters of `text` on one line, with an ellipsis when cut. */
export function speechSnippet(text: string, max: number = SPEECH_CHARS): string {
  const line = readable(text).replace(/\s+/g, ' ').trim();
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

/** Candidate nearest to the centroid of `points` (meeting spot for a group), or undefined. */
export function nearestToCentroid<T extends { x: number; z: number }>(
  candidates: readonly T[],
  points: readonly { x: number; z: number }[],
): T | undefined {
  if (points.length === 0) return undefined;
  const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length;
  const cz = points.reduce((sum, p) => sum + p.z, 0) / points.length;
  let best: T | undefined;
  let bestDist = Infinity;
  for (const c of candidates) {
    const dist = (c.x - cx) ** 2 + (c.z - cz) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = c;
    }
  }
  return best;
}

/**
 * Event-driven state for one workflow run: completion order, outputs, recent hand-offs and the
 * running conversation. Feed it node_started / node_completed in arrival order.
 */
export class InteractionTracker {
  private seq = 0;
  private readonly completedAt = new Map<string, number>();
  private readonly startedAt = new Map<string, number>();
  private readonly outputs = new Map<string, string>();
  private handOffs: [string, string][] = [];
  private conversation: Set<string> | null = null;
  private readonly edges: readonly GraphEdge[];
  private readonly isAgent: (nodeId: string) => boolean;

  // Plain fields, not parameter properties: node --test runs this file with strip-only TypeScript.
  constructor(edges: readonly GraphEdge[] = [], isAgent: (nodeId: string) => boolean = () => false) {
    this.edges = edges;
    this.isAgent = isAgent;
  }

  public started(nodeId: string): StartPlan {
    const since = this.startedAt.get(nodeId) ?? 0;
    this.startedAt.set(nodeId, ++this.seq);
    const plan: StartPlan = { handOff: null, meetingStart: null, meetingEnd: false };
    if (!this.isAgent(nodeId)) return plan;

    if (this.conversation && !this.conversation.has(nodeId)) {
      this.conversation = null;
      plan.meetingEnd = true;
    }

    const [from, ...also] = feedingAgents(this.edges, this.isAgent, this.completedAt, nodeId, since);
    if (!from) return plan;
    plan.handOff = { from, to: nodeId, also, text: speechSnippet(this.outputs.get(from) ?? '') };
    // ponytail: keeps the last few hand-offs, enough for MAX_CONVERSATION_AGENTS-sized cycles.
    this.handOffs = [...this.handOffs, [from, nodeId] as [string, string]].slice(-2 * MAX_CONVERSATION_AGENTS);

    const loop = conversationLoop(this.handOffs);
    if (loop && !(this.conversation && loop.every((id) => this.conversation!.has(id)))) {
      if (this.conversation) plan.meetingEnd = true;
      this.conversation = new Set(loop);
      plan.meetingStart = loop;
    }
    return plan;
  }

  public completed(nodeId: string, output: string): void {
    this.completedAt.set(nodeId, ++this.seq);
    this.outputs.set(nodeId, output); // a blank output replaces the previous one: no stale speech
  }

  /**
   * Text of the content behind `nodeId` (e.g. a literal end node): the most recently completed
   * feeder for which `isSource` holds, walking further back past feeders whose text is blank (a
   * tool-calling agent that only saved a file), at most `maxDepth` feeders deep. Leading blank
   * lines are dropped. Null when no feeder has text.
   */
  public feederText(
    nodeId: string,
    isSource: (nodeId: string) => boolean,
    textOf: (nodeId: string) => string | null | undefined,
    maxDepth: number = 5,
  ): string | null {
    const visited = new Set([nodeId]);
    let layer = [nodeId];
    for (let depth = 0; depth < maxDepth && layer.length > 0; depth++) {
      layer = [...new Set(layer.flatMap((id) => feedingAgents(this.edges, isSource, this.completedAt, id, 0)))]
        .filter((id) => !visited.has(id))
        .sort((a, b) => this.completedAt.get(b)! - this.completedAt.get(a)!);
      for (const id of layer) {
        const text = textOf(id);
        if (text?.trim()) return text.replace(/^\s*\n/, '');
        visited.add(id);
      }
    }
    return null;
  }

  /** Last output seen for `nodeId` (node_completed payload, truncated by the backend). */
  public outputOf(nodeId: string): string | undefined {
    return this.outputs.get(nodeId);
  }
}
