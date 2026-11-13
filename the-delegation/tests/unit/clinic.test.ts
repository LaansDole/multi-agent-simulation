// Run: npm run test:unit (node --test with built-in type stripping, Node >= 22.18).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ClinicEnvironment, fatigueClamped, parseDepleted, parseShiftStart } from '../../src/integration/api/clinicEnvironment.ts';
import { ROOMS, roomsFor, roomStatus, stationRole } from '../../src/simulation/world/clinicLayout.ts';

// The eight DynaClinic characters of dynaclinic_hospital.yaml / dynaclinic_mvp.yaml: [node type, sub_agent].
const DC_CHARACTERS: [string, string?][] = [
  ['dc_triage'], ['dc_primary_care'],
  ['dc_care_team', 'imaging'], ['dc_care_team', 'pathology'], ['dc_care_team', 'pharmacology'],
  ['dc_proponent'], ['dc_critic'], ['dc_synthesizer'],
];
const DAY = (day: number, staffing: string) =>
  `Day ${day}: Starting hospital operations\nEnvironment: case_mix_context=baseline, bed_occupancy=28, staffing_level=${staffing}`;
// dynaclinic/devall_nodes.py CareTeamExecutor output, with and without a resource note.
const TEAM = 'STAGE: care_team\n\n### imaging\nNo acute finding.';
const TEAM_DEPLETED = 'STAGE: care_team\nResource note: imaging unavailable today (depleted).\n\n### pathology\nCBC normal.';

test('every DynaClinic character has exactly one station, in the room of its role', () => {
  const roles = DC_CHARACTERS.map(([type, sub]) => stationRole(type, sub));
  assert.deepEqual(roles, [
    'dc_triage', 'dc_primary_care', 'dc_care_team:imaging', 'dc_care_team:pathology', 'dc_care_team:pharmacology',
    'dc_proponent', 'dc_critic', 'dc_synthesizer',
  ]);
  const room = (role: string) => ROOMS.filter((r) => r.stations.some((s) => s.role === role)).map((r) => r.id);
  assert.deepEqual(roles.map((role) => room(role ?? '')), [
    ['triage'], ['primary_care'], ['imaging'], ['lab'], ['pharmacy'], ['case_review'], ['case_review'], ['case_review'],
  ]);
  const stations = ROOMS.flatMap((r) => r.stations);
  assert.equal(new Set(stations.map((s) => s.role)).size, stations.length, 'one station per role');
  assert.ok(stations.every((s) => !!s.desk !== !!s.seat), 'a station is a claimed desk or a new seat');
});

test('nodes without a station keep the office behaviour', () => {
  for (const [type, sub] of [['agent'], ['dc_care_team'], ['dc_care_team', 'cardiology'], ['dc_safety_gate'], ['dc_uncertainty'], ['literal']]) {
    assert.equal(stationRole(type, sub), undefined, `${type}:${sub}`);
  }
});

test('no room without an agent', () => {
  assert.deepEqual(roomsFor([]), []);
  assert.deepEqual(roomsFor(['dc_care_team:imaging', 'dc_critic']).map((r) => [r.id, r.stations.map((s) => s.role)]), [
    ['imaging', ['dc_care_team:imaging']],
    ['case_review', ['dc_critic']],
  ]);
  assert.equal(roomsFor(ROOMS.flatMap((r) => r.stations.map((s) => s.role))).length, ROOMS.length);
});

test('depleted stock closes a Care Team room, a short shift dims the others', () => {
  const status = (state: Parameters<typeof roomStatus>[1]) => Object.fromEntries(ROOMS.map((r) => [r.id, roomStatus(r, state)]));
  const open = { triage: 'open', primary_care: 'open', imaging: 'open', lab: 'open', pharmacy: 'open', case_review: 'open' };
  assert.deepEqual(status(null), open);
  assert.deepEqual(status({ staffing: 'day', depleted: [] }), open);
  assert.deepEqual(status({ staffing: 'short', depleted: [] }), { ...open, imaging: 'short', lab: 'short', pharmacy: 'short' });
  assert.deepEqual(status({ staffing: 'day', depleted: ['pathology'] }), { ...open, lab: 'closed' });
  assert.deepEqual(status({ staffing: 'short', depleted: ['imaging', 'pharmacology'] }), { ...open, imaging: 'closed', lab: 'short', pharmacy: 'closed' });
});

test('the day-start message is read from event text', () => {
  assert.deepEqual(parseShiftStart(DAY(3, 'short')), { day: 3, staffing: 'short' });
  assert.deepEqual(parseShiftStart('Environment: case_mix_context=flu_surge, bed_occupancy=31, staffing_level=day'), { day: null, staffing: 'day' });
  assert.equal(parseShiftStart('Day 3: Starting hospital operations'), null);
  assert.equal(parseShiftStart('The patient asked about the Environment: staffing_level=short'), null, 'not at a line start');
});

test('the Care Team resource note lists the depleted roles', () => {
  assert.deepEqual(parseDepleted(TEAM), []);
  assert.deepEqual(parseDepleted(TEAM_DEPLETED), ['imaging']);
  assert.deepEqual(
    parseDepleted('STAGE: care_team\nResource note: imaging, pathology unavailable today (depleted); pharmacology depleted; consulted anyway (no other specialist available).\n\n### pharmacology'),
    ['imaging', 'pathology', 'pharmacology'],
  );
  assert.deepEqual(parseDepleted('### imaging\nThe scanner is unavailable today (depleted).'), [], 'only the note line counts');
});

test('the sweep reports a fatigue clamp', () => {
  assert.ok(fatigueClamped('MODE: hierarchical\nRule: C 0.75 > tau_c 0.5: collaborative; staff_fatigue>=2 overrides to hierarchical (staff are tired)'));
  assert.ok(!fatigueClamped('MODE: hierarchical\nRule: C 0.75 > tau_c 0.5: collaborative; staffing_level=short overrides to hierarchical (fewer hands available today)'));
});

test('exactly one break per fatigue threshold crossing', () => {
  const env = new ClinicEnvironment();
  const consult = (team: string) => {
    env.careTeamCompleted(team);
    return env.consultEnded();
  };
  assert.equal(env.consultEnded(), false, 'nothing happened yet');

  env.shiftStarted({ day: 1, staffing: 'day' });
  assert.equal(consult(TEAM), false, 'fatigue 1');
  assert.equal(consult(TEAM), true, 'fatigue 2: crossed');
  assert.equal(env.consultEnded(), false, 'the crossing is reported once');
  assert.equal(consult(TEAM_DEPLETED), false, 'fatigue 4: still above, no new crossing');

  env.shiftStarted({ day: 2, staffing: 'day' }); // fatigue 3
  assert.equal(consult(TEAM), false);
  env.shiftStarted({ day: 3, staffing: 'short' }); // fatigue 3
  env.shiftStarted({ day: 4, staffing: 'day' }); // fatigue 2
  env.shiftStarted({ day: 5, staffing: 'day' }); // fatigue 1: recovered
  assert.equal(consult(TEAM_DEPLETED), true, 'fatigue 3: crossed again');
  assert.equal(consult(TEAM), false);
});

test('a sweep clamp counts as a crossing only when the tracker was below the threshold', () => {
  const clamp = 'MODE: hierarchical\nRule: collaborative; staff_fatigue>=2 overrides to hierarchical';
  const env = new ClinicEnvironment();
  env.sweepCompleted(clamp);
  env.sweepCompleted(clamp);
  assert.equal(env.consultEnded(), true);
  env.sweepCompleted(clamp);
  assert.equal(env.consultEnded(), false);
});

test('the environment state follows shifts, depletion and restock days', () => {
  const env = new ClinicEnvironment();
  assert.deepEqual(env.state(), { staffing: null, depleted: [] });
  assert.equal(env.shiftStarted({ day: 3, staffing: 'short' }), true);
  assert.equal(env.shiftStarted({ day: 3, staffing: 'short' }), false, 'the same day again is ignored');
  env.careTeamCompleted(TEAM_DEPLETED);
  assert.deepEqual(env.state(), { staffing: 'short', depleted: ['imaging'] });
  env.shiftStarted({ day: 4, staffing: 'day' });
  assert.deepEqual(env.state(), { staffing: 'day', depleted: ['imaging'] }, 'no restock on day 4');
  env.shiftStarted({ day: 5, staffing: 'day' });
  assert.deepEqual(env.state(), { staffing: 'day', depleted: [] }, 'restock on day 5');
});
