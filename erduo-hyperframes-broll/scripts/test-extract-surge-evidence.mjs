import test from 'node:test';
import assert from 'node:assert/strict';
import { extractSurgeEvidence, SurgeEvidenceError } from './extract-surge-evidence.mjs';
test('extracts only a real Claude Skill-tool invocation as SURGE evidence', () => {
  const stream = `${JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: 'video-script-builder', args: 'SRT is authoritative; do not create files.' } }] } })}\n`;
  const evidence = extractSurgeEvidence(stream); assert.equal(evidence.host, 'claude-code'); assert.match(evidence.args_sha256, /^[0-9a-f]{64}$/u);
  assert.throws(() => extractSurgeEvidence(JSON.stringify({ name: 'Skill', input: { skill: 'other', args: 'x' } })), (error) => error instanceof SurgeEvidenceError && error.code === 'surge_call_missing');
});
