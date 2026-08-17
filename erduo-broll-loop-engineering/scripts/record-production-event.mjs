#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { appendFile, lstat, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSchemaValue } from './runtime-schema-validator.mjs';

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schemaPath = path.join(skillRoot, 'references', 'runtime', 'production-event.schema.json');

function parseArgs(argv) {
  const values = {};
  const known = new Set([
    '--events', '--event-id', '--occurred-at', '--type', '--stage', '--span', '--unit',
    '--status', '--role', '--context', '--operation', '--bytes', '--responsibility', '--detail-code',
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (!known.has(name)) throw new Error(`unknown argument ${name}`);
    const value = argv[++index];
    if (!value) throw new Error(`${name} requires a value`);
    values[name.slice(2)] = value;
  }
  if (!values.events || !values.type) throw new Error('--events and --type are required');
  return values;
}

export async function recordProductionEvent({ eventsFile, ...input }) {
  const event = {
    schemaVersion: '1.0.0',
    eventId: input.eventId ?? randomUUID(),
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    type: input.type,
    ...(input.stage ? { stage: input.stage } : {}),
    ...(input.spanId ? { spanId: input.spanId } : {}),
    ...(input.unitId ? { unitId: input.unitId } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.agentRole ? { agentRole: input.agentRole } : {}),
    ...(input.contextMode ? { contextMode: input.contextMode } : {}),
    ...(input.operation ? { operation: input.operation } : {}),
    ...(input.bytesProcessed !== undefined ? { bytesProcessed: Number(input.bytesProcessed) } : {}),
    ...(input.responsibilityUnit !== undefined ? { responsibilityUnit: input.responsibilityUnit } : {}),
    ...(input.detailCode !== undefined ? { detailCode: input.detailCode } : {}),
  };
  const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
  const errors = validateSchemaValue(event, schema, schema);
  const required = {
    'stage-start': ['stage', 'spanId'], 'stage-end': ['stage', 'spanId', 'status'],
    'agent-call': ['agentRole', 'contextMode'], operation: ['operation', 'bytesProcessed'],
    failure: ['stage'], retry: ['stage'],
  }[event.type] ?? [];
  for (const field of required) if (event[field] === undefined) errors.push(`#/${field}: required for ${event.type}`);
  if (!Number.isFinite(Date.parse(event.occurredAt))) errors.push('#/occurredAt: must be an ISO timestamp');
  if (errors.length) throw new Error(`production event is invalid:\n${errors.join('\n')}`);
  const target = path.resolve(eventsFile);
  await mkdir(path.dirname(target), { recursive: true });
  try {
    const info = await lstat(target);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('events file must be a regular non-symlink file');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  await appendFile(target, `${JSON.stringify(event)}\n`, { encoding: 'utf8', flag: 'a' });
  return event;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const event = await recordProductionEvent({
    eventsFile: options.events,
    eventId: options['event-id'], occurredAt: options['occurred-at'], type: options.type,
    stage: options.stage, spanId: options.span, unitId: options.unit, status: options.status,
    agentRole: options.role, contextMode: options.context, operation: options.operation,
    bytesProcessed: options.bytes, responsibilityUnit: options.responsibility,
    detailCode: options['detail-code'],
  });
  process.stdout.write(`${JSON.stringify({ status: 'recorded', eventId: event.eventId })}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
