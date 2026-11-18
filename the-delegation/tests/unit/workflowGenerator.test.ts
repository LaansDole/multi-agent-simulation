// Run: npm run test:unit (node --test with built-in type stripping, Node >= 22.18).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseGeneratedSystem } from '../../src/core/llm/workflowGenerator.ts';

// Mirrors MAX_AGENTS in src/data/agents.ts; not imported directly because that module's own
// relative imports are extensionless and break under Node's native ESM test runner.
const MAX_AGENTS = 13;

const fenced = (obj: unknown, prose = 'Built the team.') => `${prose}\n\`\`\`json\n${JSON.stringify(obj)}\n\`\`\`\n`;

test('valid fenced JSON produces a complete AgenticSystem with ids/positions assigned', () => {
  const text = fenced({
    teamName: 'Research Squad',
    teamType: 'Research',
    teamDescription: 'Finds and writes things up.',
    leadAgent: {
      name: 'Lead',
      description: 'Coordinates the team.',
      subagents: [
        { name: 'Researcher', description: 'Finds sources.' },
        { name: 'Writer', description: 'Writes the report.' },
      ],
    },
  });

  const { system, assistantText } = parseGeneratedSystem(text, null, 'gpt-5-mini', MAX_AGENTS);

  assert.equal(system.teamName, 'Research Squad');
  assert.equal(system.outputType, 'text');
  assert.equal(system.leadAgent.name, 'Lead');
  assert.equal(system.leadAgent.model, 'gpt-5-mini');
  assert.equal(system.leadAgent.subagents?.length, 2);
  assert.ok(system.leadAgent.id);
  assert.ok(system.leadAgent.subagents?.every((a) => a.id && a.id !== system.leadAgent.id));
  assert.equal(assistantText, 'Built the team.');
});

test('a team over MAX_AGENTS is rejected', () => {
  const subagents = Array.from({ length: MAX_AGENTS }, (_, i) => ({
    name: `Agent ${i}`,
    description: 'x',
  }));
  const text = fenced({
    teamName: 'Too Big',
    teamType: 'Custom',
    teamDescription: '',
    leadAgent: { name: 'Lead', description: 'x', subagents },
  });

  assert.throws(() => parseGeneratedSystem(text, null, 'gpt-5-mini', MAX_AGENTS), /agents.*max/i);
});

test('nested subtrees never share a position, and the lead stays centered under the user', () => {
  // 1 lead + 3 subagents + 3x3 grandchildren = 13 nodes; sibling-only spacing used to stack grandchildren.
  const branch = (name: string) => ({
    name,
    description: 'x',
    subagents: [1, 2, 3].map((i) => ({ name: `${name}-${i}`, description: 'x' })),
  });
  const text = fenced({
    teamName: 'Deep',
    teamType: 'Custom',
    teamDescription: '',
    leadAgent: { name: 'Lead', description: 'x', subagents: [branch('A'), branch('B'), branch('C')] },
  });

  const { system } = parseGeneratedSystem(text, null, 'gpt-5-mini', MAX_AGENTS);

  const positions: string[] = [];
  const walk = (a: typeof system.leadAgent) => {
    positions.push(`${a.position.x},${a.position.y}`);
    a.subagents?.forEach(walk);
  };
  walk(system.leadAgent);

  assert.equal(positions.length, 13);
  assert.equal(new Set(positions).size, 13);
  assert.equal(system.leadAgent.position.x, 0);
});

test('malformed JSON is rejected', () => {
  const text = 'Here you go.\n```json\n{ not valid json\n```\n';
  assert.throws(() => parseGeneratedSystem(text, null, 'gpt-5-mini', MAX_AGENTS), /not valid JSON/i);
});

test('a response missing leadAgent is rejected', () => {
  const text = fenced({ teamName: 'No Lead', teamType: 'Custom', teamDescription: '' });
  assert.throws(() => parseGeneratedSystem(text, null, 'gpt-5-mini', MAX_AGENTS), /leadAgent/);
});

test('a response with no fenced JSON block is rejected', () => {
  assert.throws(() => parseGeneratedSystem('just some prose, no code block', null, 'gpt-5-mini', MAX_AGENTS), /JSON code block/i);
});

test('an unsafe model string falls back to the default model instead of reaching the YAML', () => {
  const text = fenced({
    teamName: 'T',
    teamType: 'Custom',
    teamDescription: '',
    leadAgent: { name: 'Lead\nbase_url: x', description: 'x', model: 'gpt-4o\n      base_url: "http://evil"' },
  });

  const { system } = parseGeneratedSystem(text, null, 'gpt-5-mini', MAX_AGENTS);

  assert.equal(system.leadAgent.model, 'gpt-5-mini');
  assert.ok(!system.leadAgent.name.includes('\n'));
});

test('an over-deep tree is rejected with the max-agents error, not a stack overflow', () => {
  // Built as a string: JSON.stringify itself would overflow on this depth.
  const depth = 20000;
  const lead = '{"name":"A","subagents":['.repeat(depth) + '{"name":"A"}' + ']}'.repeat(depth);
  const text = `Deep.\n\`\`\`json\n{"teamName":"Deep","leadAgent":${lead}}\n\`\`\`\n`;

  assert.throws(() => parseGeneratedSystem(text, null, 'gpt-5-mini', MAX_AGENTS), /agents.*max/i);
});
