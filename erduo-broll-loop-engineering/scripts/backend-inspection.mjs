#!/usr/bin/env node

import {mkdir, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';

import {
  assertProductionSourcePolicy,
  commandFailure,
  framesForWindow,
  readJson,
  runCommand,
  semanticSamplePoints,
} from './shot-media-lib.mjs';

export function shouldRunRuntimeInspection(plan) {
  return plan?.schemaVersion !== '4.0.0';
}

async function hyperframesSampleSeconds({assignment, plan, recipesDirectory}) {
  const seconds = [];
  for (const shotId of assignment.shotIds) {
    const shot = plan.shots.find((candidate) => candidate.shotId === shotId);
    if (!shot) throw new Error(`${shotId} is absent from the runtime plan`);
    const recipe = await readJson(path.join(recipesDirectory, `${shotId}.json`), `${shotId} Recipe`);
    const frameCount = framesForWindow(shot.window, plan.productionProfile.fps);
    for (const sample of semanticSamplePoints(recipe, shot.window, plan.productionProfile.fps, frameCount)) {
      seconds.push((shot.window.startMs + sample.localTimeMs) / 1_000);
    }
  }
  return [...new Set(seconds)].sort((left, right) => left - right);
}

export function minimalFailureRecord({assignment, sourceIdentity, error}) {
  const message = String(error?.message ?? error ?? 'unknown failure').replaceAll(/\s+/gu, ' ').slice(0, 800);
  const shotMatch = assignment.shotIds.find((shotId) => message.includes(shotId)) ?? null;
  return {
    schemaVersion: '1.0.0', status: 'attention', assignmentId: assignment.assignmentId,
    shotId: shotMatch, window: null, problemType: 'deterministic-check', message, sourceIdentity,
  };
}

async function clearDenseEvidence({productionRoot, assignment}) {
  const directory = path.join(path.resolve(productionRoot), '05-delivery', 'checks');
  const prefix = assignment.assignmentId;
  await Promise.all([
    rm(path.join(directory, `${prefix}.motion-layout-trace.json`), {force: true}),
    rm(path.join(directory, `${prefix}.motion-layout-metadata.json`), {force: true}),
    rm(path.join(directory, `${prefix}-diagnostics`), {recursive: true, force: true}),
  ]);
}

export async function writeMinimalFailureEvidence({productionRoot, assignment, sourceIdentity, error}) {
  const directory = path.join(path.resolve(productionRoot), '05-delivery', 'checks');
  const file = path.join(directory, `${assignment.assignmentId}.failure.json`);
  await mkdir(directory, {recursive: true});
  await clearDenseEvidence({productionRoot, assignment});
  await writeFile(file, `${JSON.stringify(minimalFailureRecord({assignment, sourceIdentity, error}), null, 2)}\n`);
  return file;
}

export async function clearMinimalFailureEvidence({productionRoot, assignment}) {
  await Promise.all([
    rm(path.join(path.resolve(productionRoot), '05-delivery', 'checks', `${assignment.assignmentId}.failure.json`), {force: true}),
    clearDenseEvidence({productionRoot, assignment}),
  ]);
}

export async function inspectAssignmentRuntime({
  assignment, plan, recipesDirectory, sourceRoot, sourceIdentity,
  hyperframes = 'hyperframes', runner = runCommand,
}) {
  await assertProductionSourcePolicy(sourceRoot);
  if (assignment.runtime === 'hyperframes') {
    const sampledAtSeconds = await hyperframesSampleSeconds({assignment, plan, recipesDirectory});
    const result = await runner({
      executable: hyperframes,
      args: ['check', '--json', '--at', sampledAtSeconds.join(','), '--at-transitions', sourceRoot],
      cwd: sourceRoot,
    });
    if (result.code !== 0) throw commandFailure('HyperFrames bounded official check', result);
    return {
      status: 'pass', adapter: 'hyperframes-check', assignmentId: assignment.assignmentId,
      sourceIdentity, sampledAtSeconds,
    };
  }
  if (assignment.runtime !== 'remotion') throw new Error(`unknown runtime ${assignment.runtime}`);
  return {
    status: 'pass', adapter: 'deterministic-media-contract', assignmentId: assignment.assignmentId,
    sourceIdentity,
  };
}
