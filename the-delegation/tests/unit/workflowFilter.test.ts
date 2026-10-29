// Run: npm run test:unit (node --test with built-in type stripping, Node >= 22.18).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { filterWorkflows } from '../../src/interface/workflowFilter.ts';

const FILES = [
  'ChatDev_v1.yaml',
  'demo_hospital.yaml',
  'dynaclinic_mvp.yml',
  'simulation_hospital.yaml',
  'subgraphs/react_agent.yaml',
];

test('separators, case and extension are ignored', () => {
  for (const q of ['demo hosp', 'demo-hospital', 'DEMO_HOSPITAL', 'demo_hospital.yaml', '  demo   hospital ']) {
    assert.deepEqual(filterWorkflows(FILES, q), ['demo_hospital.yaml'], q);
  }
  assert.deepEqual(filterWorkflows(FILES, 'Hospital'), ['demo_hospital.yaml', 'simulation_hospital.yaml']);
  assert.deepEqual(filterWorkflows(FILES, 'mvp.yml'), ['dynaclinic_mvp.yml']);
});

test('every word must match, in any order; the extension itself is not searchable', () => {
  assert.deepEqual(filterWorkflows(FILES, 'hospital sim'), ['simulation_hospital.yaml']);
  assert.deepEqual(filterWorkflows(FILES, 'hospital zzz'), []);
  assert.deepEqual(filterWorkflows(FILES, 'yaml'), []);
});

test('subfolder paths match', () => {
  assert.deepEqual(filterWorkflows(FILES, 'subgraphs/react'), ['subgraphs/react_agent.yaml']);
  assert.deepEqual(filterWorkflows(FILES, 'subgraphs agent'), ['subgraphs/react_agent.yaml']);
});

test('blank query keeps every file in the original order', () => {
  assert.deepEqual(filterWorkflows(FILES, ''), FILES);
  assert.deepEqual(filterWorkflows(FILES, ' _- '), FILES);
});
