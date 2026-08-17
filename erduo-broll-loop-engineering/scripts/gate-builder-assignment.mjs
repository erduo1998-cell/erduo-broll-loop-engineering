#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeRuntimePlanIdentity } from './validate-runtime-plan.mjs';
import { validateVisualLock } from './validate-visual-lock.mjs';
import { canonicalJson } from './runtime-schema-validator.mjs';

function expectedStageSkill(runtime) {
  return runtime === 'remotion' ? 'broll-remotion-build' : 'broll-master-build';
}

function assertProfileBinding(assignment, plan) {
  if (assignment.productionProfileIdentity !== plan.productionProfile.identity
    || canonicalJson(assignment.productionProfile) !== canonicalJson(plan.productionProfile)) {
    throw new Error('assignment production profile differs from the planned profile identity');
  }
}

function expectedDirectorLocator(locator) {
  return `01-director/${locator}`;
}

const CONTEXT_POLICY = 'Load only the listed files, selected references named by the assigned Recipes, and files named by the shared asset plans. Do not inherit the parent transcript or read unrelated Recipes.';
const LEAD_CONTEXT_POLICY = 'Load only the listed representative Recipes and shared plans. Do not inherit the parent transcript or read unrelated Recipes.';
const SEAM_LIMIT = 'A live transition cannot cross independently rendered units. Keep a live shared-element transition inside one unit; otherwise close this unit on the planned readable state and use the declared matched seam.';

function assertExactAssignment(assignment, expected) {
  if (canonicalJson(assignment) !== canonicalJson(expected)) {
    throw new Error('assignment differs from the complete planned dispatch packet');
  }
}

export async function gateBuilderAssignment(assignment, { plan, productionRoot, visualLock }) {
  if (plan?.schemaVersion !== '3.0.0' || plan.status !== 'planned'
    || computeRuntimePlanIdentity(plan) !== plan.identity) throw new Error('dispatch gate requires one valid planned runtime plan v3');
  if (assignment?.schemaVersion !== '2.0.0' || assignment.planIdentity !== plan.identity) throw new Error('assignment does not bind the planned runtime identity');
  if (assignment.role === 'lead' && assignment.phase === 'visual-lock') {
    const locator = `01-runtime-plan/assignments/${assignment.assignmentId}.json`;
    const leadIndex = plan.visualLock.leadAssignmentLocators.indexOf(locator);
    if (leadIndex < 0) throw new Error('Lead Builder assignment is not declared by the plan');
    if (assignment.runtime !== plan.requiredBackends[leadIndex]
      || assignment.stageSkill !== expectedStageSkill(assignment.runtime)) {
      throw new Error('Lead Builder assignment runtime differs from its planned backend');
    }
    const planned = plan.visualLock.representativeScenes.filter(({ runtime }) => runtime === assignment.runtime);
    if (planned.length === 0
      || canonicalJson(planned) !== canonicalJson(assignment.representativeScenes)
      || JSON.stringify(planned.map(({ shotId }) => shotId)) !== JSON.stringify(assignment.shotIds)) {
      throw new Error('Lead Builder assignment does not contain its backend representative scenes');
    }
    assertProfileBinding(assignment, plan);
    const expectedRoot = `04-visual-lock/${assignment.runtime}`;
    assertExactAssignment(assignment, {
      schemaVersion: '2.0.0',
      assignmentId: assignment.assignmentId,
      planIdentity: plan.identity,
      role: 'lead',
      phase: 'visual-lock',
      runtime: assignment.runtime,
      shotIds: planned.map(({ shotId }) => shotId),
      representativeScenes: planned,
      stageSkill: expectedStageSkill(assignment.runtime),
      contextFiles: {
        assignment: locator,
        runtimePlan: '01-runtime-plan/runtime-plan.json',
        narrativeEnvelope: expectedDirectorLocator(plan.sharedArtifacts.narrativeEnvelope.locator),
        visualSystem: expectedDirectorLocator(plan.sharedArtifacts.visualSystem.locator),
        representativeScenes: expectedDirectorLocator(plan.sharedArtifacts.representativeScenes.locator),
        recipes: planned.map(({ shotId }) => `01-director/shot-recipes/${shotId}.json`),
        materialPlan: '02-assets/material-plan.md',
        fontPlan: '02-assets/font-plan.md',
      },
      output: {
        workDirectory: expectedRoot,
        representativeMediaRoot: `${expectedRoot}/scenes`,
        sharedSourceRoot: `${expectedRoot}/shared-source`,
        visualLockContract: plan.visualLock.contractLocator,
        editableSourceRequired: true,
        frozenMediaRequired: false,
      },
      shared: {
        assetsRoot: '02-assets',
        copyAssetsIntoUnit: false,
        sourceIsolation: 'per-runtime',
        mayImportRuntimeSourceFrom: assignment.runtime,
      },
      productionProfile: plan.productionProfile,
      productionProfileIdentity: plan.productionProfile.identity,
      contextPolicy: LEAD_CONTEXT_POLICY,
    });
    return { status: 'ready', role: 'lead', gate: 'visual-lock-production' };
  }
  if (assignment.role !== 'builder' || assignment.phase !== 'production') throw new Error('unknown Builder assignment role or phase');
  const unit = plan.authoringUnits.find(({ unitId }) => unitId === assignment.unitId);
  if (!unit || assignment.assignmentId !== unit.unitId
    || assignment.blockId !== unit.blockId
    || unit.runtime !== assignment.runtime
    || JSON.stringify(unit.window) !== JSON.stringify(assignment.window)
    || JSON.stringify(unit.shotIds) !== JSON.stringify(assignment.shotIds)) {
    throw new Error('production assignment does not match its planned authoring unit');
  }
  assertProfileBinding(assignment, plan);
  const expectedWorkDirectory = assignment.runtime === 'remotion'
    ? `03-remotion-build/${unit.unitId}`
    : `03-build/${unit.unitId}`;
  if (assignment.stageSkill !== expectedStageSkill(assignment.runtime)) {
    throw new Error('production assignment stage differs from the runtime plan');
  }
  assertExactAssignment(assignment, {
    schemaVersion: '2.0.0',
    assignmentId: unit.unitId,
    role: 'builder',
    phase: 'production',
    planIdentity: plan.identity,
    unitId: unit.unitId,
    blockId: unit.blockId,
    runtime: unit.runtime,
    window: unit.window,
    shotIds: unit.shotIds,
    stageSkill: expectedStageSkill(unit.runtime),
    contextFiles: {
      assignment: `01-runtime-plan/assignments/${unit.unitId}.json`,
      runtimePlan: '01-runtime-plan/runtime-plan.json',
      narrativeEnvelope: expectedDirectorLocator(plan.sharedArtifacts.narrativeEnvelope.locator),
      visualSystem: expectedDirectorLocator(plan.sharedArtifacts.visualSystem.locator),
      recipes: unit.context.recipes.map(expectedDirectorLocator),
      materialPlan: '02-assets/material-plan.md',
      fontPlan: '02-assets/font-plan.md',
    },
    seams: { previous: unit.context.previousSeam, next: unit.context.nextSeam },
    output: {
      workDirectory: expectedWorkDirectory,
      editableSourceRequired: true,
      receipt: `${expectedWorkDirectory}/receipt.json`,
      handoff: `${expectedWorkDirectory}/handoff.md`,
      frozenMediaRequired: true,
      frozenMediaContract: `${expectedWorkDirectory}/block-media.json`,
    },
    shared: {
      assetsRoot: '02-assets',
      copyAssetsIntoUnit: false,
      dependencyMode: assignment.runtime === 'remotion'
        ? 'shared-by-exact-identity'
        : 'shared-pinned-runtime',
      dependencyRoot: assignment.runtime === 'remotion' ? '.remotion-toolchains' : null,
    },
    visualLock: {
      required: true,
      contract: plan.visualLock.contractLocator,
      requiredStatus: ['approved', 'skipped'],
      sourceRoot: `04-visual-lock/${assignment.runtime}/shared-source`,
      sourceIsolation: 'same-runtime-only',
    },
    productionProfile: plan.productionProfile,
    productionProfileIdentity: plan.productionProfile.identity,
    contextPolicy: CONTEXT_POLICY,
    seamLimit: SEAM_LIMIT,
  });
  if (!visualLock) throw new Error('production Builder dispatch is blocked until visual lock is approved or explicitly skipped');
  const validation = await validateVisualLock(visualLock, { plan, productionRoot });
  if (!['approved', 'skipped'].includes(validation.gate)) throw new Error(`production Builder dispatch is blocked by visual-lock status ${validation.gate}`);
  const runtimeSourceIdentity = visualLock.runtimeSources
    .find(({ runtime }) => runtime === assignment.runtime)?.sourceIdentity ?? null;
  if (validation.gate === 'approved' && !runtimeSourceIdentity) {
    throw new Error('approved visual lock does not expose the assigned backend shared source identity');
  }
  return {
    status: 'ready', role: 'builder', gate: validation.gate,
    visualLockIdentity: validation.identity,
    runtimeSourceIdentity,
  };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!['--plan', '--assignment', '--production-root', '--visual-lock'].includes(name) || !value) throw new Error(`invalid argument ${name ?? ''}`);
    options[name.slice(2)] = path.resolve(value);
  }
  if (!options.plan || !options.assignment || !options['production-root']) throw new Error('--plan, --assignment, and --production-root are required');
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const [plan, assignment, visualLock] = await Promise.all([
    readFile(options.plan, 'utf8').then(JSON.parse),
    readFile(options.assignment, 'utf8').then(JSON.parse),
    options['visual-lock'] ? readFile(options['visual-lock'], 'utf8').then(JSON.parse) : null,
  ]);
  process.stdout.write(`${JSON.stringify(await gateBuilderAssignment(assignment, {
    plan,
    productionRoot: options['production-root'],
    visualLock,
  }))}\n`);
}

if (process.argv[1] && realpathSync(path.resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) {
  main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
