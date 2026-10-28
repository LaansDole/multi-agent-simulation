// Run: npm run test:unit (node --test with built-in type stripping, Node >= 22.18).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  conversationLoop,
  feedingAgents,
  InteractionTracker,
  nearestToCentroid,
  speechSnippet,
  type GraphEdge,
} from '../../src/integration/api/interactionPlanner.ts';

const chain = (...ids: string[]): GraphEdge[] => ids.slice(1).map((to, i) => ({ from: ids[i], to }));

// yaml_instance/demo_hospital.yaml: DayStart (literal) and LoopGate (loop_timer) have no character.
const DEMO_HOSPITAL = [
  ...chain('DayStart', 'PatientData', 'Admission', 'TriageData', 'TriageReport', 'DailySummary', 'LoopGate', 'DayStart'),
  { from: 'LoopGate', to: 'FinalReport' },
];
const DEMO_AGENTS = new Set(['PatientData', 'Admission', 'TriageData', 'TriageReport', 'DailySummary', 'FinalReport']);

// yaml_instance/simulation_hospital.yaml, doctor <-> patient phase (Counter is a loop_counter).
const SIM_HOSPITAL: GraphEdge[] = [
  ...chain('Nurse', 'Intake', 'Interaction', 'Notes', 'Counter', 'Intake'),
  { from: 'Intake', to: 'Notes' },
  { from: 'Counter', to: 'Notes' },
  { from: 'Notes', to: 'Diagnosis' },
];
const SIM_AGENTS = new Set(['Nurse', 'Intake', 'Interaction', 'Notes', 'Diagnosis']);

/** Runs `nodes` start -> complete in order and returns each start's plan. */
function run(tracker: InteractionTracker, nodes: string[]) {
  return nodes.map((id) => {
    const plan = tracker.started(id);
    tracker.completed(id, `${id} says hello`);
    return plan;
  });
}

test('a hand-off skips non-agent nodes back to the nearest agent ancestor', () => {
  const tracker = new InteractionTracker(DEMO_HOSPITAL, (id) => DEMO_AGENTS.has(id));
  const round = ['DayStart', 'PatientData', 'Admission', 'TriageData', 'TriageReport', 'DailySummary', 'LoopGate'];
  const first = run(tracker, round);
  assert.equal(first[1].handOff, null, 'round 1: only a literal feeds PatientData');
  assert.deepEqual(first[2].handOff, { from: 'PatientData', to: 'Admission', also: [], text: 'PatientData says hello' });
  assert.equal(first[0].handOff, null, 'non-agent nodes never get a hand-off');

  const second = run(tracker, round);
  assert.equal(second[1].handOff?.from, 'DailySummary', 'round 2: through LoopGate and DayStart');
  assert.ok(second.every((p) => p.meetingStart === null), 'a 5-agent cycle is a relay, not a conversation');
});

test('fan-in: the most recent feeder speaks, the others are listed; stale outputs do not count', () => {
  const edges = [...chain('A', 'C'), ...chain('B', 'C')];
  const tracker = new InteractionTracker(edges, () => true);
  run(tracker, ['A', 'B']);
  assert.deepEqual(tracker.started('C').handOff, { from: 'B', to: 'C', also: ['A'], text: 'B says hello' });
  tracker.completed('C', '');
  run(tracker, ['A']);
  assert.deepEqual(tracker.started('C').handOff?.also, [], 'B completed before the previous C start');
});

test('feedingAgents ignores the node itself and cycles through non-agents', () => {
  const edges = [...chain('X', 'Loop', 'X'), ...chain('A', 'X')];
  const completedAt = new Map([['X', 3], ['A', 2], ['Loop', 4]]);
  assert.deepEqual(feedingAgents(edges, (id) => id !== 'Loop', completedAt, 'X', 0), ['A']);
  assert.deepEqual(feedingAgents(edges, (id) => id !== 'Loop', completedAt, 'X', 2), []);
});

test('doctor-patient trio meets on the second round and parts when the diagnosis starts', () => {
  const tracker = new InteractionTracker(SIM_HOSPITAL, (id) => SIM_AGENTS.has(id));
  const plans = run(tracker, ['Nurse', 'Intake', 'Interaction', 'Notes', 'Counter', 'Intake', 'Interaction', 'Notes', 'Counter', 'Intake']);
  assert.deepEqual(plans.slice(0, 5).map((p) => p.meetingStart), [null, null, null, null, null]);
  assert.equal(plans[3].handOff?.from, 'Interaction', 'Notes hears the patient last');
  assert.deepEqual(plans[3].handOff?.also, ['Intake']);
  assert.deepEqual(plans[5].handOff?.from, 'Notes');
  assert.deepEqual(new Set(plans[5].meetingStart), new Set(['Intake', 'Interaction', 'Notes']));
  assert.ok(plans.slice(6).every((p) => p.meetingStart === null && !p.meetingEnd), 'same conversation continues');

  const diagnosis = tracker.started('Diagnosis');
  assert.equal(diagnosis.meetingEnd, true);
  assert.equal(diagnosis.handOff?.from, 'Notes');
  assert.equal(diagnosis.meetingStart, null);
});

test('conversationLoop: pairs and trios alternate, longer relays do not', () => {
  assert.deepEqual(new Set(conversationLoop([['Critic', 'Synth'], ['Synth', 'Critic']])), new Set(['Critic', 'Synth']));
  assert.equal(conversationLoop([['A', 'B']]), null);
  assert.equal(conversationLoop([['A', 'B'], ['B', 'C'], ['C', 'D'], ['D', 'A']]), null, '4-cycle exceeds the trio limit');
  assert.equal(conversationLoop([['A', 'B'], ['C', 'D']]), null);
});

test('latestFeeder finds the content behind a literal end node', () => {
  // simulation_hospital tail: ... -> Formatter (template) -> ReportSaver (agent) -> SimulationEnd (literal)
  const edges = chain('Extractor', 'Formatter', 'ReportSaver', 'SimulationEnd');
  const tracker = new InteractionTracker(edges, () => true);
  run(tracker, ['Extractor', 'Formatter', 'ReportSaver', 'SimulationEnd']);
  assert.equal(tracker.latestFeeder('SimulationEnd', (id) => id !== 'SimulationEnd'), 'ReportSaver');
  assert.equal(tracker.outputOf('ReportSaver'), 'ReportSaver says hello');
});

test('speechSnippet and nearestToCentroid', () => {
  assert.equal(speechSnippet('  two\n\nlines  '), 'two lines');
  const long = speechSnippet('x'.repeat(200));
  assert.equal(long.length, 80);
  assert.ok(long.endsWith('…'));
  const areas = [{ id: 'hub', x: -2, z: 2 }, { id: 'boardroom', x: 1.3, z: 3.5 }];
  assert.equal(nearestToCentroid(areas, [{ x: 0, z: 4 }, { x: 3, z: 3 }])?.id, 'boardroom');
  assert.equal(nearestToCentroid(areas, []), undefined);
});
