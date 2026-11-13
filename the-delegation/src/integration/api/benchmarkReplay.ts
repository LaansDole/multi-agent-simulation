/**
 * benchmarkReplay -- Pure logic of the Benchmark panel: running accuracy, table filters, recorded
 * route -> dynaclinic_mvp node mapping and the timed node events that replay one question in the
 * office. No imports, no IO: the data is a recorded run from GET /api/benchmarks/{id}.
 */

export const ARMS = ['single', 'dynamic', 'static'] as const;
export type Arm = (typeof ARMS)[number];

/** User-visible arm names; the data keys stay `single` / `dynamic` / `static`. */
export const ARM_LABEL: Record<Arm, string> = {
  single: 'Single',
  dynamic: 'DynamiClinic',
  static: 'Static',
};

/** Header tooltips for the baseline arms. */
export const ARM_TITLE: Partial<Record<Arm, string>> = {
  single: 'One model call',
  static: 'Full care team and critic on every question, no Meta-Controller',
};

/** One arm's recorded answer to one question (server/routes/benchmarks.py). */
export interface ArmResult {
  answer: string | null;
  correct: boolean;
  mode: string | null;
  C: number | null;
  U: number | null;
  tau_c: number | null;
  tau_u: number | null;
  mode_reason: string | null;
  calls: number;
  roles: string[];
  steps: string[];
  latency_s: number | null;
}

export interface Question {
  case_id: string;
  question: string;
  options: Record<string, string>;
  gold: string;
  arms: Partial<Record<Arm, ArmResult>>;
}

export interface Totals {
  n: number;
  correct: number;
  accuracy: number;
}

export interface RunInfo {
  id: string;
  label: string;
  model: string;
  arms: Arm[];
  n: number;
  accuracy: Partial<Record<Arm, number>>;
}

export interface BenchmarkRun {
  id: string;
  label: string;
  model: string;
  arms: Arm[];
  n: number;
  totals: Partial<Record<Arm, Totals>>;
  questions: Question[];
}

/** Accuracy per arm over the first `count` questions (the replayed ones). */
export function runningTotals(questions: readonly Question[], arms: readonly Arm[], count: number): Record<string, Totals> {
  const totals: Record<string, Totals> = {};
  for (const arm of arms) {
    const results = questions.slice(0, count).flatMap((q) => (q.arms[arm] ? [q.arms[arm]!] : []));
    const correct = results.filter((r) => r.correct).length;
    totals[arm] = { n: results.length, correct, accuracy: results.length ? correct / results.length : 0 };
  }
  return totals;
}

export type Filter = 'all' | 'disagree' | 'adversarial' | 'dynamicWrong';

export function matchesFilter(q: Question, filter: Filter): boolean {
  const dynamic = q.arms.dynamic;
  switch (filter) {
    case 'all':
      return true;
    case 'disagree':
      return new Set(Object.values(q.arms).map((r) => r?.answer ?? null)).size > 1;
    case 'adversarial':
      return dynamic?.mode === 'adversarial';
    case 'dynamicWrong':
      return !!dynamic && !dynamic.correct;
  }
}

/** Route step or call role (text before the first ':') -> dynaclinic_mvp node id. */
const NODE_OF: Record<string, string> = {
  triage: 'Triage',
  generalist: 'GeneralistSweep',
  uncertainty: 'GeneralistSweep',
  primary_care: 'PrimaryCare',
  care_team: 'CareTeam',
  imaging: 'CareTeam',
  pathology: 'CareTeam',
  pharmacology: 'CareTeam',
  divergence: 'DivergenceGate',
  mesh_exchange: 'MeshExchange',
  proponent: 'Proponent',
  critic: 'Critic',
  critic_judge: 'Critic',
  synthesizer: 'Synthesizer',
  safety_gate: 'SafetyGate',
  end: 'Report',
};

/** Node a route step / call role belongs to; null for steps with no node (mode, single_agent, regenerate). */
export function nodeFor(stepOrRole: string): string | null {
  const key = stepOrRole.split(':')[0];
  if (key.endsWith('_mesh')) return 'MeshExchange';
  return Object.hasOwn(NODE_OF, key) ? NODE_OF[key] : null;
}

/** One question's replay at 1x takes this long; speed divides it (4x: 4.75 s). */
export const QUESTION_MS = 19000;
/** Share of a beat after which its node completes, leaving a gap before the next node starts. */
const WORK_SHARE = 0.85;
/**
 * Beat length in units: gates are short, characters get time to walk and talk, and Report is the
 * tail that keeps the answer bubble, then the final nameplate roles, on screen.
 */
const BEAT_UNITS: Record<string, number> = { GeneralistSweep: 1, DivergenceGate: 1, MeshExchange: 1, SafetyGate: 1, Report: 5 };
const CHARACTER_UNITS = 3;
/** Share of the Report beat after which the answer bubble clears, uncovering the nameplate role. */
const ANSWER_SHARE = 0.4;

export type ReplayEvent =
  | { at: number; kind: 'start'; nodeId: string }
  | { at: number; kind: 'complete'; nodeId: string; output: string }
  | { at: number; kind: 'say'; nodeId: string; text: string | null };

/** Replay duration of one question at `speed` (1 or 4). */
export function questionMs(speed: number): number {
  return QUESTION_MS / speed;
}

const num = (label: string, value: number | null) => (value === null ? [] : [`${label} ${value.toFixed(2)}`]);

/** Node output in the DynaClinic stage format (`STAGE: <name> (<role>)` drives the nameplate role). */
function stageOutput(nodeId: string, step: string, arm: ArmResult, debate: boolean): string {
  const detail = step.split(':').slice(1).join(':');
  const answer = `Answer ${arm.answer ?? '?'}`;
  switch (nodeId) {
    case 'Triage':
      return `STAGE: triage\n${[...num('C', arm.C), ...num('U', arm.U)].join(', ')} -> ${arm.mode ?? 'unknown'}`;
    case 'GeneralistSweep':
      return `STAGE: uncertainty\n${num('U', arm.U).join('') || 'U not measured'}`;
    case 'CareTeam':
      return `STAGE: care_team\nSpecialists: ${detail.replaceAll(',', ', ') || 'none'}`;
    case 'DivergenceGate':
      return `STAGE: divergence\nDivergence ${detail.replace(':', ', ')}`;
    case 'MeshExchange':
      return 'STAGE: mesh_exchange\nPeers exchange revised answers';
    case 'Proponent':
      return 'STAGE: proponent\nArguing for the leading hypothesis';
    case 'Critic':
      return debate ? 'STAGE: critic (Opponent)\nChallenging both hypotheses' : 'STAGE: critic\nFlagged claims';
    case 'Synthesizer':
      return `STAGE: synthesizer (${arm.mode === 'adversarial' ? 'Mediator (Conflict Resolver)' : 'Consensus Builder'})\n${answer}`;
    case 'PrimaryCare':
      return `STAGE: primary_care\n${answer}`;
    case 'SafetyGate':
      return `GATE: ${(detail || 'pass').toUpperCase()}`;
    default:
      return `${answer} (recorded)`;
  }
}

/**
 * Timed node_started / node_completed events (ms at 1x) replaying the recorded path of one arm,
 * plus a `say` of the final answer by the node that gave it (text null clears the bubble).
 * Consecutive steps on one node are one beat; the path always ends at Report. Empty without a
 * recorded path.
 */
export function replayEvents(arm: ArmResult | undefined): ReplayEvent[] {
  if (!arm) return [];
  const beats: { nodeId: string; step: string }[] = [];
  for (const step of [...arm.steps, 'end']) {
    const nodeId = nodeFor(step);
    if (!nodeId) continue;
    if (beats.at(-1)?.nodeId === nodeId) beats[beats.length - 1].step = step;
    else beats.push({ nodeId, step });
  }
  if (beats.length === 1) return []; // only Report: nothing was recorded for this arm's path

  const debate = beats.some((b) => b.nodeId === 'Proponent');
  const units = beats.map((b) => BEAT_UNITS[b.nodeId] ?? CHARACTER_UNITS);
  const unit = QUESTION_MS / units.reduce((sum, u) => sum + u, 0);
  const ids = beats.map((b) => b.nodeId);
  const answerBeat = Math.max(ids.lastIndexOf('Synthesizer'), ids.lastIndexOf('PrimaryCare'));
  const answerer = ids[answerBeat];
  const events: ReplayEvent[] = [];
  let at = 0;
  beats.forEach(({ nodeId, step }, i) => {
    const length = units[i] * unit;
    const done = at + length * WORK_SHARE;
    events.push({ at, kind: 'start', nodeId });
    if (nodeId === 'Report' && answerer) events.push({ at: at + length * ANSWER_SHARE, kind: 'say', nodeId: answerer, text: null });
    events.push({ at: done, kind: 'complete', nodeId, output: stageOutput(nodeId, step, arm, debate) });
    if (i === answerBeat) events.push({ at: done, kind: 'say', nodeId, text: `Answer ${arm.answer ?? '?'}` });
    at += length;
  });
  return events;
}
