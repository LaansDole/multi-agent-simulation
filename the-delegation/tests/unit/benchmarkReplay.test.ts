// Run: npm run test:unit (node --test with built-in type stripping, Node >= 22.18).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ARM_LABEL,
  ARM_TITLE,
  ARMS,
  matchesFilter,
  nodeFor,
  questionMs,
  QUESTION_MS,
  replayEvents,
  runningTotals,
  type ArmResult,
  type Question,
} from '../../src/integration/api/benchmarkReplay.ts';
import { stageRole } from '../../src/integration/api/interactionPlanner.ts';

const arm = (answer: string, correct: boolean, extra: Partial<ArmResult> = {}): ArmResult => ({
  answer, correct, mode: null, C: null, U: null, tau_c: null, tau_u: null, mode_reason: null,
  calls: 1, roles: [], steps: [], latency_s: null, ...extra,
});

// medqa-test-0005 in 2026-10-28-f15-medqa50-dynamic-gpt-6-luna (route minus planner/ingest/cache_lookup).
const ADVERSARIAL = arm('D', true, {
  mode: 'adversarial', C: 1, U: 0.3805, tau_c: 0.5, tau_u: 0.15, calls: 9,
  roles: ['triage', 'generalist', 'imaging', 'pathology', 'pharmacology', 'proponent', 'critic', 'critic_judge', 'synthesizer'],
  steps: ['triage:HIGH', 'uncertainty:0.38', 'mode:adversarial:uncertainty', 'care_team:imaging,pathology,pharmacology',
    'divergence:0.00:stay', 'proponent', 'critic', 'synthesizer', 'safety_gate:pass'],
});
// medqa-test-0050: hierarchical, with a safety-gate regeneration added to exercise `regenerate`.
const HIERARCHICAL = arm('D', true, {
  mode: 'hierarchical', C: 0.0417, U: 0.149, calls: 3, roles: ['triage', 'generalist', 'primary_care'],
  steps: ['triage:LOW', 'uncertainty:0.15', 'mode:hierarchical', 'primary_care', 'safety_gate:blocked', 'regenerate', 'primary_care', 'safety_gate:pass'],
});

const QUESTIONS: Question[] = [
  { case_id: 'q1', question: '', options: {}, gold: 'D', arms: { single: arm('D', true), dynamic: ADVERSARIAL, static: arm('D', true) } },
  { case_id: 'q2', question: '', options: {}, gold: 'B', arms: { single: arm('A', false), dynamic: arm('B', true, { mode: 'collaborative' }), static: arm('B', true) } },
  { case_id: 'q3', question: '', options: {}, gold: 'C', arms: { single: arm('C', true), dynamic: arm('A', false, { mode: 'adversarial' }) } },
];

test('every arm has a display label; the dynamic arm is shown as DynamiClinic', () => {
  assert.deepEqual(ARMS.map((a) => ARM_LABEL[a]), ['Single', 'DynamiClinic', 'Static']);
  assert.equal(ARM_TITLE.single, 'One model call');
  assert.equal(ARM_TITLE.static, 'Full care team and critic on every question, no Meta-Controller');
});

test('runningTotals counts only the replayed questions and only arms that answered', () => {
  assert.deepEqual(runningTotals(QUESTIONS, ['single', 'dynamic', 'static'], 0).single, { n: 0, correct: 0, accuracy: 0 });
  const two = runningTotals(QUESTIONS, ['single', 'dynamic', 'static'], 2);
  assert.deepEqual(two.single, { n: 2, correct: 1, accuracy: 0.5 });
  assert.deepEqual(two.dynamic, { n: 2, correct: 2, accuracy: 1 });
  const all = runningTotals(QUESTIONS, ['single', 'dynamic', 'static'], 3);
  assert.deepEqual(all.dynamic, { n: 3, correct: 2, accuracy: 2 / 3 });
  assert.deepEqual(all.static, { n: 2, correct: 2, accuracy: 1 }); // q3 has no static answer
});

test('filters pick disagreeing arms, adversarial mode and dynamic misses', () => {
  const ids = (filter: Parameters<typeof matchesFilter>[1]) => QUESTIONS.filter((q) => matchesFilter(q, filter)).map((q) => q.case_id);
  assert.deepEqual(ids('all'), ['q1', 'q2', 'q3']);
  assert.deepEqual(ids('disagree'), ['q2', 'q3']);
  assert.deepEqual(ids('adversarial'), ['q1', 'q3']);
  assert.deepEqual(ids('dynamicWrong'), ['q3']);
});

test('nodeFor maps route steps and call roles to dynaclinic_mvp node ids', () => {
  const expected: Record<string, string | null> = {
    'triage:HIGH': 'Triage', triage: 'Triage', generalist: 'GeneralistSweep', 'uncertainty:0.38': 'GeneralistSweep',
    primary_care: 'PrimaryCare', 'care_team:imaging,pathology': 'CareTeam', imaging: 'CareTeam', pathology: 'CareTeam',
    pharmacology: 'CareTeam', imaging_mesh: 'MeshExchange', pharmacology_mesh: 'MeshExchange', mesh_exchange: 'MeshExchange',
    'mesh_exchange:pathology,pharmacology': 'MeshExchange', 'divergence:0.00:stay': 'DivergenceGate', proponent: 'Proponent',
    critic: 'Critic', critic_judge: 'Critic', synthesizer: 'Synthesizer', 'safety_gate:pass': 'SafetyGate', end: 'Report',
    'mode:adversarial:uncertainty': null, single_agent: null, regenerate: null, 'planner:terminal': null, constructor: null,
  };
  for (const [name, node] of Object.entries(expected)) assert.equal(nodeFor(name), node, name);
});

test('replayEvents walks the adversarial path, Synthesizer as Mediator saying the answer', () => {
  const events = replayEvents(ADVERSARIAL);
  assert.deepEqual(events.filter((e) => e.kind === 'start').map((e) => e.nodeId),
    ['Triage', 'GeneralistSweep', 'CareTeam', 'DivergenceGate', 'Proponent', 'Critic', 'Synthesizer', 'SafetyGate', 'Report']);
  const output = (nodeId: string) => events.flatMap((e) => (e.kind === 'complete' && e.nodeId === nodeId ? [e.output] : []))[0];
  assert.equal(stageRole(output('Synthesizer')), 'Mediator (Conflict Resolver)');
  assert.equal(stageRole(output('Critic')), 'Opponent');
  assert.match(output('Triage'), /C 1\.00, U 0\.38 -> adversarial/);
  assert.match(output('CareTeam'), /imaging, pathology, pharmacology/);
  const says = events.flatMap((e) => (e.kind === 'say' ? [{ nodeId: e.nodeId, text: e.text }] : []));
  assert.deepEqual(says, [{ nodeId: 'Synthesizer', text: 'Answer D' }, { nodeId: 'Synthesizer', text: null }]);
  // The answer is said once the Synthesizer completes (Mediator role set) and cleared during Report.
  const at = (kind: string, nodeId: string) => events.find((e) => e.kind === kind && e.nodeId === nodeId)!.at;
  assert.equal(events.find((e) => e.kind === 'say')!.at, at('complete', 'Synthesizer'));
  assert.ok(events.filter((e) => e.kind === 'say')[1].at > at('start', 'Report'));
  // Events are in time order, so each node completes before the next one starts.
  for (let i = 1; i < events.length; i++) assert.ok(events[i].at >= events[i - 1].at);
});

test('replayEvents keeps a regeneration loop, ignores regenerate and mode steps', () => {
  const starts = replayEvents(HIERARCHICAL).filter((e) => e.kind === 'start').map((e) => e.nodeId);
  assert.deepEqual(starts, ['Triage', 'GeneralistSweep', 'PrimaryCare', 'SafetyGate', 'PrimaryCare', 'SafetyGate', 'Report']);
  const synth = replayEvents(arm('B', true, { mode: 'collaborative', steps: ['synthesizer'] }))
    .flatMap((e) => (e.kind === 'complete' && e.nodeId === 'Synthesizer' ? [e.output] : []))[0];
  assert.equal(stageRole(synth), 'Consensus Builder');
});

test('replayEvents is empty for an arm without a dynaclinic path', () => {
  assert.deepEqual(replayEvents(undefined), []);
  assert.deepEqual(replayEvents(arm('A', false, { steps: ['single_agent'] })), []);
});

test('one question takes 15-20 s at 1x and 4-5 s at 4x', () => {
  for (const a of [ADVERSARIAL, HIERARCHICAL]) {
    const end = Math.max(...replayEvents(a).map((e) => e.at));
    assert.ok(end <= QUESTION_MS);
  }
  assert.ok(questionMs(1) >= 15000 && questionMs(1) <= 20000);
  assert.ok(questionMs(4) >= 4000 && questionMs(4) <= 5000);
});
