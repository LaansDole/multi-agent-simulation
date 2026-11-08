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
