// Run: npm run test:unit (node --test with built-in type stripping, Node >= 22.18).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ClinicEnvironment, parseDepleted, parseShiftStart } from '../../src/integration/api/clinicEnvironment.ts';
import { ROOMS, roomsFor, roomStatus, stationRole } from '../../src/simulation/world/clinicLayout.ts';

// The eight DynaClinic characters of dynaclinic_hospital.yaml / dynaclinic_mvp.yaml: [node type, sub_agent].
const DC_CHARACTERS: [string, string?][] = [
  ['dc_triage'], ['dc_primary_care'],
  ['dc_care_team', 'imaging'], ['dc_care_team', 'pathology'], ['dc_care_team', 'pharmacology'],
  ['dc_proponent'], ['dc_critic'], ['dc_synthesizer'],
];
// inject_day_and_start_shift's message; the day-3 text is the one tests/test_dynaclinic_environment.py asserts.
const DAY = (day: number, staffing: string, fatigue: number, stock: string) =>
  `Day ${day}: Starting hospital operations\nEnvironment: case_mix_context=baseline, bed_occupancy=20, staffing_level=${staffing}, staff_fatigue=${fatigue}, resource_availability=${stock}`;
const FULL = 'imaging:2;pathology:3;pharmacology:3';
const DAY_3 = DAY(3, 'short', 2, 'imaging:0;pathology:3;pharmacology:3');
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
  assert.deepEqual(parseShiftStart([DAY_3]), { day: 3, staffing: 'short', fatigue: 2, depleted: ['imaging'] });
  assert.deepEqual(parseShiftStart([DAY(1, 'day', 0, FULL)]), { day: 1, staffing: 'day', fatigue: 0, depleted: [] });
  assert.deepEqual(
    parseShiftStart(['Environment: case_mix_context=flu_surge, bed_occupancy=31, staffing_level=day, staff_fatigue=1, resource_availability=imaging:0;pathology:0;pharmacology:1']),
    { day: null, staffing: 'day', fatigue: 1, depleted: ['imaging', 'pathology'] },
  );
  assert.equal(parseShiftStart(['Day 3: Starting hospital operations']), null);
  assert.equal(parseShiftStart([`The patient asked about the ${DAY_3.split('\n')[1]}`]), null, 'not at a line start');
  assert.equal(parseShiftStart([]), null);
});

test('the newest day-start message wins among accumulated inputs', () => {
  // PatientDataGenerator keeps every earlier day's message (keep_message on DayStart -> PatientDataGenerator).
  const inputs = [DAY(1, 'day', 0, FULL), DAY(2, 'day', 0, 'imaging:1;pathology:2;pharmacology:2')];
  assert.equal(parseShiftStart(inputs)?.day, 2);
  assert.deepEqual(parseShiftStart([...inputs, DAY_3]), { day: 3, staffing: 'short', fatigue: 2, depleted: ['imaging'] });
  assert.equal(parseShiftStart([...inputs, DAY_3, 'Patient presents with chest pain.'])?.day, 3, 'later messages of another kind are skipped');

  const env = new ClinicEnvironment();
  const seen = [1, 2, 3].map((n) => env.shiftStarted(parseShiftStart([...inputs, DAY_3].slice(0, n))!) !== null);
  assert.deepEqual(seen, [true, true, true], 'every day registers');
  assert.deepEqual(env.state(), { staffing: 'short', depleted: ['imaging'] });
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

test('exactly one break per fatigue threshold crossing', () => {
  const env = new ClinicEnvironment();
  // staff_fatigue at each day start, as the backend prints it.
  const fatigue = [0, 0, 1, 2, 3, 2, 1, 0, 2, 2];
  const breaks = fatigue.map((value, i) => env.shiftStarted({ day: i + 1, staffing: 'day', fatigue: value, depleted: [] })?.fatigued);
  assert.deepEqual(breaks, [false, false, false, true, false, false, false, false, true, false]);
});

test('a day that has already started is ignored', () => {
  const env = new ClinicEnvironment();
  const day3 = parseShiftStart([DAY_3])!;
  assert.deepEqual(env.shiftStarted(day3), { fatigued: true });
  assert.equal(env.shiftStarted(day3), null, 'the same message in another log: no second break');
  assert.equal(env.shiftStarted({ day: 2, staffing: 'day', fatigue: 0, depleted: [] }), null, 'an older day never replaces a newer one');
  assert.deepEqual(env.state(), { staffing: 'short', depleted: ['imaging'] });
});

test('the environment state follows shifts, depletion and restock', () => {
  const env = new ClinicEnvironment();
  assert.deepEqual(env.state(), { staffing: null, depleted: [] });
  env.shiftStarted(parseShiftStart([DAY(2, 'day', 0, 'imaging:1;pathology:2;pharmacology:2')])!);
  assert.deepEqual(env.state(), { staffing: 'day', depleted: [] });
  env.careTeamCompleted(TEAM);
  assert.deepEqual(env.state(), { staffing: 'day', depleted: [] }, 'no note: nothing known until the next day start');
  env.shiftStarted(parseShiftStart([DAY_3])!);
  assert.deepEqual(env.state(), { staffing: 'short', depleted: ['imaging'] }, 'stock 0 at day start closes the room before any consult');
  env.careTeamCompleted('STAGE: care_team\nResource note: imaging unavailable today (depleted); pathology depleted; consulted anyway (no other specialist available).\n\n### pathology');
  assert.deepEqual(env.state(), { staffing: 'short', depleted: ['imaging', 'pathology'] }, 'a note adds to the day');
  env.shiftStarted(parseShiftStart([DAY(5, 'day', 2, FULL)])!);
  assert.deepEqual(env.state(), { staffing: 'day', depleted: [] }, 'the restocked line reopens every room');
});
