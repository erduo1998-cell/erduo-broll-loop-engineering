import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export class SurgeEvidenceError extends Error { constructor(code, message) { super(message); this.name = 'SurgeEvidenceError'; this.code = code; } }
const fail = (code, message) => { throw new SurgeEvidenceError(code, message); };
const sha256 = (value) => createHash('sha256').update(value, 'utf8').digest('hex');
function findInvocation(value) {
  if (!value || typeof value !== 'object') return null;
  if (value.name === 'Skill' && value.input?.skill === 'video-script-builder' && typeof value.input.args === 'string') return value.input.args;
  if (Array.isArray(value)) { for (const child of value) { const found = findInvocation(child); if (found) return found; } return null; }
  for (const child of Object.values(value)) { const found = findInvocation(child); if (found) return found; }
  return null;
}
export function extractSurgeEvidence(streamText) {
  if (typeof streamText !== 'string' || !streamText.trim()) fail('stream_missing', 'Claude Code stream output is required.');
  let args = null;
  for (const line of streamText.split(/\r?\n/u)) {
    if (!line.trim()) continue;
    try { args ??= findInvocation(JSON.parse(line)); } catch { /* non-JSON diagnostic lines do not carry tool input */ }
  }
  if (!args) fail('surge_call_missing', 'Claude Code did not invoke video-script-builder through the Skill tool.');
  return { host: 'claude-code', mechanism: 'skill-tool', args_sha256: sha256(args), transcript_sha256: sha256(streamText), status: 'verified' };
}
const main = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (main) { const file = process.argv[2]; if (!file) fail('usage', 'Usage: node extract-surge-evidence.mjs <claude-stream.jsonl>'); process.stdout.write(`${JSON.stringify(extractSurgeEvidence(await readFile(file, 'utf8')))}\n`); }
