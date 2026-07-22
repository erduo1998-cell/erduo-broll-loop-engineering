import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export class DirectorEnhancerEvidenceError extends Error { constructor(code, message) { super(message); this.name = 'DirectorEnhancerEvidenceError'; this.code = code; } }
const fail = (code, message) => { throw new DirectorEnhancerEvidenceError(code, message); };
const sha256 = (value) => createHash('sha256').update(value, 'utf8').digest('hex');
function normalizeEnhancer(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(['license', 'name', 'version'])
    || ![value.name, value.version, value.license].every((item) => typeof item === 'string' && item.trim() && item.length <= 160)) fail('enhancer_config_invalid', 'Enhancer identity, pinned version, and license are required.');
  return { name: value.name.trim(), version: value.version.trim(), license: value.license.trim() };
}
const isPlaceholderInvocation = (value, name) => typeof value === 'string' && value.trim().toLowerCase() === `called ${name}`.toLowerCase();
function findInvocation(value, enhancerName) {
  if (!value || typeof value !== 'object') return null;
  if (value.name === 'Skill' && value.input?.skill === enhancerName && typeof value.input.args === 'string') return value.input.args;
  if (Array.isArray(value)) { for (const child of value) { const found = findInvocation(child, enhancerName); if (found) return found; } return null; }
  for (const child of Object.values(value)) { const found = findInvocation(child, enhancerName); if (found) return found; }
  return null;
}
export function extractDirectorEnhancerEvidence(streamText, { required = false, enhancer } = {}) {
  if (enhancer === undefined && !required) return null;
  const identity = normalizeEnhancer(enhancer);
  if (typeof streamText !== 'string' || !streamText.trim()) {
    if (required) fail('enhancer_evidence_missing', 'Declared enhancer use has no host-call evidence.');
    return null;
  }
  let args = null;
  for (const line of streamText.split(/\r?\n/u)) {
    if (!line.trim()) continue;
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch { /* non-JSON diagnostic lines do not carry tool input */ }
    if (parsed === undefined) continue;
    const found = findInvocation(parsed, identity.name);
    if (found && isPlaceholderInvocation(found, identity.name)) fail('enhancer_evidence_placeholder', 'Enhancer evidence must include actual arguments, not a static placeholder.');
    if (found) args = found;
  }
  if (!args) {
    if (required) fail('enhancer_evidence_missing', 'Declared enhancer use has no matching host-call evidence.');
    return null;
  }
  if (isPlaceholderInvocation(args, identity.name)) fail('enhancer_evidence_placeholder', 'Enhancer evidence must include actual arguments, not a static placeholder.');
  return { enhancer: identity, host: 'claude-code', mechanism: 'skill-tool', args_sha256: sha256(args), transcript_sha256: sha256(streamText), status: 'verified' };
}
const main = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (main) { const [file, name, version, license] = process.argv.slice(2); if (!file || !name || !version || !license) fail('usage', 'Usage: node extract-director-enhancer-evidence.mjs <host-stream.jsonl> <enhancer-name> <version> <license>'); process.stdout.write(`${JSON.stringify(extractDirectorEnhancerEvidence(await readFile(file, 'utf8'), { required: true, enhancer: { name, version, license } }))}\n`); }
