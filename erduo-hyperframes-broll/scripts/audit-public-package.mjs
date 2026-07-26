#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NeutralScaffoldError, validateNeutralScaffold } from './validate-neutral-scaffold.mjs';

const TEXT_EXTENSIONS = new Set(['.json', '.md', '.mjs', '.yaml', '.yml', '.html', '.txt']);
const MEDIA_EXTENSIONS = new Set(['.mp4', '.mov', '.mkv', '.webm', '.avi', '.mp3', '.wav', '.m4a', '.png', '.jpg', '.jpeg', '.gif', '.webp']);
const PRIVATE_PATH = /(?:\/Users\/|\/home\/|[A-Za-z]:\\Users\\)/u;
const SECRET_VALUE = /(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:sk|ghp|xox[bpras])[-_][A-Za-z0-9_-]{12,})/u;
const PRIVATE_CALIBRATION_PATH = /(?:^|\/)(?:reachsurge(?:[-_][^/]*)?|private[-_]calibration(?:[-_][^/]*)?)(?:\/|$)/iu;
const PRIVATE_CALIBRATION_JSON = /\breachsurge\b|"(?:private|positive)[-_]calibration(?:[-_][^"]*)?"\s*:/iu;

export class PublicPackageAuditError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PublicPackageAuditError';
    this.code = code;
  }
}

const fail = (code, message) => { throw new PublicPackageAuditError(code, message); };
const relativeSafe = (value) => !value.startsWith('..') && !path.isAbsolute(value) && !value.split(path.sep).includes('..');

async function listFiles(root, directory = root) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === '.DS_Store' || entry.name === 'node_modules') continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(root, absolute));
    else if (entry.isFile()) files.push({ absolute, relative: path.relative(root, absolute).split(path.sep).join('/') });
    else fail('unsafe_entry', 'Public package contains an unsupported filesystem entry.');
  }
  return files.sort((a, b) => a.relative.localeCompare(b.relative));
}

export async function auditPublicPackage(root) {
  if (typeof root !== 'string' || !root) fail('invalid_root', 'Public package root is invalid.');
  let stat;
  try { stat = await fs.stat(root); } catch { fail('root_unreadable', 'Public package root cannot be read.'); }
  if (!stat.isDirectory()) fail('invalid_root', 'Public package root is invalid.');
  const files = await listFiles(root);
  const findings = [];
  let byte_count = 0;
  for (const file of files) {
    if (!relativeSafe(file.relative)) findings.push({ code: 'unsafe_relative_path', file: file.relative });
    if (PRIVATE_CALIBRATION_PATH.test(file.relative)) {
      findings.push({ code: 'private_calibration_artifact', file: file.relative });
    }
    const extension = path.extname(file.relative).toLowerCase();
    const contents = await fs.readFile(file.absolute);
    byte_count += contents.byteLength;
    if (MEDIA_EXTENSIONS.has(extension)) findings.push({ code: 'embedded_media', file: file.relative });
    if (TEXT_EXTENSIONS.has(extension)) {
      const text = contents.toString('utf8');
      const productionFile = !file.relative.startsWith('scripts/test-');
      if (productionFile && PRIVATE_PATH.test(text)) findings.push({ code: 'private_path', file: file.relative });
      if (productionFile && SECRET_VALUE.test(text)) findings.push({ code: 'secret_value', file: file.relative });
      if (extension === '.json' && PRIVATE_CALIBRATION_JSON.test(text)) {
        findings.push({ code: 'private_calibration_payload', file: file.relative });
      }
    }
  }
  const scaffoldRoot = path.join(root, 'assets', 'hyperframes-template');
  try {
    const scaffoldStat = await fs.stat(scaffoldRoot);
    if (scaffoldStat.isDirectory()) await validateNeutralScaffold(scaffoldRoot);
  } catch (error) {
    if (error instanceof NeutralScaffoldError) {
      findings.push({ code: 'neutral_scaffold_invalid', reason: error.code });
    } else if (error?.code !== 'ENOENT') {
      findings.push({ code: 'neutral_scaffold_unreadable' });
    }
  }
  return { schema_version: 1, file_count: files.length, byte_count, findings, ok: findings.length === 0 };
}

async function main(argv) {
  if (argv.length > 1) fail('usage', 'Usage: node scripts/audit-public-package.mjs [skill-root]');
  const root = argv[0] ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const result = await auditPublicPackage(root);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.ok || result.findings.length > 0) process.exitCode = 2;
}

const mainModule = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (mainModule) {
  try { await main(process.argv.slice(2)); } catch (error) { process.stderr.write(`${JSON.stringify({ ok: false, error: { code: error instanceof PublicPackageAuditError ? error.code : 'audit_failed', message: error instanceof PublicPackageAuditError ? error.message : 'Public package audit failed.' } })}\n`); process.exitCode = error instanceof PublicPackageAuditError && error.code === 'usage' ? 64 : 2; }
}
