#!/usr/bin/env node

import { lstat, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSchemaValue } from './runtime-schema-validator.mjs';

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const eventSchemaPath = path.join(skillRoot, 'references', 'runtime', 'production-event.schema.json');
const metricsSchemaPath = path.join(skillRoot, 'references', 'runtime', 'production-metrics.schema.json');
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.mkv', '.webm', '.m4v']);
const SOURCE_EXTENSIONS = new Set(['.html', '.css', '.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.json', '.md', '.yaml', '.yml']);

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== '' && !path.isAbsolute(relative)
    && relative !== '..' && !relative.startsWith(`..${path.sep}`);
}

async function optionalJson(file) {
  if (!file) return null;
  try { return JSON.parse(await readFile(file, 'utf8')); } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw new Error(`${path.basename(file)} is not valid JSON`);
  }
}

async function canonicalTarget(file) {
  const absolute = path.resolve(file);
  const suffix = [path.basename(absolute)];
  let parent = path.dirname(absolute);
  while (true) {
    try {
      const canonicalParent = await realpath(parent);
      return path.join(canonicalParent, ...suffix);
    } catch (error) {
      if (error?.code !== 'ENOENT' || parent === path.dirname(parent)) throw error;
      suffix.unshift(path.basename(parent));
      parent = path.dirname(parent);
    }
  }
}

async function loadEvents(file) {
  if (!file) return [];
  let body;
  try { body = await readFile(file, 'utf8'); } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
  const schema = JSON.parse(await readFile(eventSchemaPath, 'utf8'));
  const events = [];
  const ids = new Set();
  for (const [index, line] of body.split(/\r?\n/u).entries()) {
    if (!line.trim()) continue;
    let event;
    try { event = JSON.parse(line); } catch { throw new Error(`production event line ${index + 1} is invalid JSON`); }
    const errors = validateSchemaValue(event, schema, schema);
    if (!Number.isFinite(Date.parse(event.occurredAt))) errors.push('#/occurredAt: must be an ISO timestamp');
    if (ids.has(event.eventId)) errors.push('#/eventId: duplicate event ID');
    ids.add(event.eventId);
    if (errors.length) throw new Error(`production event line ${index + 1} is invalid:\n${errors.join('\n')}`);
    events.push(event);
  }
  return events.sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt)
    || left.eventId.localeCompare(right.eventId));
}

function fileKind(relative, extension) {
  const parts = relative.split('/');
  if (parts.some((part) => part === 'node_modules' || part === '.remotion-toolchains' || part === '.cache')) return 'dependency-cache';
  if (extension === '.png') return 'png';
  if (VIDEO_EXTENSIONS.has(extension)) return 'video';
  if (parts.includes('source') || parts.includes('project') || SOURCE_EXTENSIONS.has(extension)) return 'source';
  return 'other';
}

async function scanProductionTree(root, excluded) {
  const byExtension = new Map();
  const byKind = new Map();
  const directories = [];
  let totalFiles = 0;
  let totalBytes = 0;
  async function visit(directory, relativeDirectory) {
    let bytes = 0;
    let files = 0;
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join('/');
      if (excluded.has(absolute)) continue;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        const child = await visit(absolute, relative);
        bytes += child.bytes;
        files += child.files;
        continue;
      }
      if (!entry.isFile()) continue;
      const info = await lstat(absolute);
      const extension = path.extname(entry.name).toLowerCase() || '[none]';
      const kind = fileKind(relative, extension);
      byExtension.set(extension, {
        count: (byExtension.get(extension)?.count ?? 0) + 1,
        bytes: (byExtension.get(extension)?.bytes ?? 0) + info.size,
      });
      byKind.set(kind, {
        count: (byKind.get(kind)?.count ?? 0) + 1,
        bytes: (byKind.get(kind)?.bytes ?? 0) + info.size,
      });
      totalFiles += 1;
      totalBytes += info.size;
      files += 1;
      bytes += info.size;
    }
    if (relativeDirectory) directories.push({ path: relativeDirectory, files, bytes });
    return { files, bytes };
  }
  await visit(root, '');
  const normalizeMap = (map) => Object.fromEntries([...map].sort(([left], [right]) => left.localeCompare(right)));
  const largestDirectory = directories.sort((left, right) => right.bytes - left.bytes || left.path.localeCompare(right.path))[0] ?? null;
  return {
    totalFiles, totalBytes,
    byKind: normalizeMap(byKind),
    byExtension: normalizeMap(byExtension),
    largestDirectory,
    scanPasses: 1,
  };
}

function summarizeStages(events) {
  const starts = new Map();
  const stages = [];
  for (const event of events) {
    if (event.type === 'stage-start') {
      if (!event.stage || !event.spanId || starts.has(event.spanId)) throw new Error(`invalid or duplicate stage start ${event.eventId}`);
      starts.set(event.spanId, event);
    } else if (event.type === 'stage-end') {
      const start = starts.get(event.spanId);
      if (!start || start.stage !== event.stage || start.unitId !== event.unitId) {
        throw new Error(`stage end ${event.eventId} has no matching start`);
      }
      const wallClockMs = Date.parse(event.occurredAt) - Date.parse(start.occurredAt);
      if (wallClockMs < 0) throw new Error(`stage end ${event.eventId} precedes its start`);
      stages.push({
        spanId: event.spanId, stage: event.stage,
        ...(event.unitId ? { unitId: event.unitId } : {}),
        startedAt: start.occurredAt, endedAt: event.occurredAt, wallClockMs,
        status: event.status,
      });
      starts.delete(event.spanId);
    }
  }
  for (const start of starts.values()) {
    stages.push({
      spanId: start.spanId, stage: start.stage,
      ...(start.unitId ? { unitId: start.unitId } : {}),
      startedAt: start.occurredAt, endedAt: null, wallClockMs: null, status: 'in-progress',
    });
  }
  return stages.sort((left, right) => left.startedAt.localeCompare(right.startedAt) || left.spanId.localeCompare(right.spanId));
}

function summarizeAgentCalls(events) {
  const result = { total: 0, director: 0, assets: 0, builder: 0, revision: 0, other: 0, fullHistory: 0 };
  for (const event of events.filter(({ type }) => type === 'agent-call')) {
    result.total += 1;
    result[event.agentRole] += 1;
    if (event.contextMode === 'full-history') result.fullHistory += 1;
  }
  return result;
}

function summarizeOperations(events) {
  const result = Object.fromEntries(['render', 'trace', 'full-decode', 'hash-scan', 'other'].map((name) => [name, { count: 0, bytesProcessed: 0 }]));
  for (const event of events.filter(({ type }) => type === 'operation')) {
    result[event.operation].count += 1;
    result[event.operation].bytesProcessed += event.bytesProcessed;
  }
  return result;
}

function summarizeProblems(events, type) {
  return events.filter((event) => event.type === type).map((event) => ({
    eventId: event.eventId, occurredAt: event.occurredAt, stage: event.stage,
    responsibilityUnit: event.responsibilityUnit ?? null, detailCode: event.detailCode ?? null,
  }));
}

function summarizePlan(plan) {
  if (!plan) return null;
  const units = plan.authoringUnits ?? plan.blocks ?? [];
  return {
    identity: plan.identity,
    status: plan.status,
    authoringUnitCount: units.length,
    units: units.map((unit) => ({
      unitId: unit.unitId ?? unit.blockId,
      runtime: unit.runtime,
      shotCount: unit.shotIds.length,
      durationMs: unit.window.endMs - unit.window.startMs,
    })),
  };
}

function summarizeTokens(hostUsage) {
  if (!hostUsage) {
    return {
      status: 'unknown', source: null, input: null, cachedInput: null,
      nonCachedInput: null, output: null,
    };
  }
  const fields = ['input', 'cachedInput', 'nonCachedInput', 'output'];
  for (const field of fields) {
    if (!Number.isSafeInteger(hostUsage[field]) || hostUsage[field] < 0) {
      throw new Error(`host token usage ${field} must be a non-negative integer`);
    }
  }
  if (hostUsage.input !== hostUsage.cachedInput + hostUsage.nonCachedInput) {
    throw new Error('host token usage input must equal cachedInput plus nonCachedInput');
  }
  if (!['parent-provided', 'host-export'].includes(hostUsage.source)) {
    throw new Error('host token usage source must be parent-provided or host-export');
  }
  return { status: 'known', source: hostUsage.source, ...Object.fromEntries(fields.map((field) => [field, hostUsage[field]])) };
}

export async function collectProductionMetrics({
  productionRoot,
  eventsFile,
  planFile,
  hostUsageFile,
  outputFile,
  now = () => new Date(),
}) {
  const root = await realpath(path.resolve(productionRoot));
  const rootInfo = await lstat(root);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw new Error('production root must be a real directory');
  const output = await canonicalTarget(outputFile ?? path.join(root, 'production-metrics.json'));
  if (!inside(root, output)) throw new Error('production metrics output must be inside the production root');
  try { await lstat(output); throw new Error('production metrics output already exists'); } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const resolveOptional = (file, fallback) => canonicalTarget(file ?? path.join(root, fallback));
  const eventPath = await resolveOptional(eventsFile, 'production-events.ndjson');
  const planPath = await resolveOptional(planFile, '01-runtime-plan/runtime-plan.json');
  const usagePath = hostUsageFile ? await canonicalTarget(hostUsageFile) : null;
  for (const [label, file] of [['events', eventPath], ['plan', planPath], ['host usage', usagePath]]) {
    if (file && !inside(root, file)) throw new Error(`${label} input must be inside the production root`);
  }
  const [events, plan, hostUsage, files] = await Promise.all([
    loadEvents(eventPath), optionalJson(planPath), optionalJson(usagePath),
    scanProductionTree(root, new Set([output])),
  ]);
  const metrics = {
    schemaVersion: '1.0.0', generatedAt: now().toISOString(), productionRoot: '.',
    plan: summarizePlan(plan),
    stages: summarizeStages(events),
    agentCalls: summarizeAgentCalls(events),
    files,
    operations: summarizeOperations(events),
    failures: summarizeProblems(events, 'failure'),
    retries: summarizeProblems(events, 'retry'),
    tokens: summarizeTokens(hostUsage),
    privacy: {
      absolutePathsIncluded: false,
      privateSessionPathsRead: false,
      freeformEventTextIncluded: false,
    },
  };
  const schema = JSON.parse(await readFile(metricsSchemaPath, 'utf8'));
  const errors = validateSchemaValue(metrics, schema, schema);
  if (errors.length) throw new Error(`production metrics are invalid:\n${errors.join('\n')}`);
  await writeFile(output, `${JSON.stringify(metrics, null, 2)}\n`, { flag: 'wx' });
  return { status: 'created', file: output, metrics };
}

function parseArgs(argv) {
  const options = {};
  const known = new Set(['--production-root', '--events', '--plan', '--host-usage', '--output']);
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (!known.has(name)) throw new Error(`unknown argument ${name}`);
    const value = argv[++index];
    if (!value) throw new Error(`${name} requires a value`);
    options[name.slice(2)] = value;
  }
  if (!options['production-root']) throw new Error('--production-root is required');
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await collectProductionMetrics({
    productionRoot: options['production-root'], eventsFile: options.events,
    planFile: options.plan, hostUsageFile: options['host-usage'], outputFile: options.output,
  });
  process.stdout.write(`${JSON.stringify({ status: result.status, file: result.file })}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
