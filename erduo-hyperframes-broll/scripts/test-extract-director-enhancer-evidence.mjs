import test from 'node:test';
import assert from 'node:assert/strict';
import { DirectorEnhancerEvidenceError, extractDirectorEnhancerEvidence } from './extract-director-enhancer-evidence.mjs';
const enhancer = { name: 'licensed-director-helper', version: '1.2.3', license: 'MIT' };
test('extracts optional host-call evidence when present', () => {
  const stream = `${JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: enhancer.name, args: 'SRT is authoritative; do not create files.' } }] } })}\n`;
  const evidence = extractDirectorEnhancerEvidence(stream, { enhancer }); assert.equal(evidence.host, 'claude-code'); assert.deepEqual(evidence.enhancer, enhancer); assert.match(evidence.args_sha256, /^[0-9a-f]{64}$/u);
  assert.equal(extractDirectorEnhancerEvidence(JSON.stringify({ name: 'Skill', input: { skill: 'other', args: 'x' } }), { enhancer }), null);
  assert.equal(extractDirectorEnhancerEvidence(''), null);
  assert.throws(() => extractDirectorEnhancerEvidence('', { required: true, enhancer }), (error) => error instanceof DirectorEnhancerEvidenceError && error.code === 'enhancer_evidence_missing');
});

test('ignores unrelated streams and rejects fake static placeholders', () => {
  assert.equal(extractDirectorEnhancerEvidence(`called ${enhancer.name}`, { enhancer }), null);
  const placeholder = `${JSON.stringify({ name: 'Skill', input: { skill: enhancer.name, args: `called ${enhancer.name}` } })}\n`;
  assert.throws(() => extractDirectorEnhancerEvidence(placeholder, { enhancer }), (error) => error instanceof DirectorEnhancerEvidenceError && error.code === 'enhancer_evidence_placeholder');
  assert.throws(() => extractDirectorEnhancerEvidence('stream', { required: true, enhancer: { name: enhancer.name } }), (error) => error.code === 'enhancer_config_invalid');
});
