#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeRuntimePlanIdentity } from './validate-runtime-plan.mjs';
import { validateVisualLock } from './validate-visual-lock.mjs';
import { canonicalJson } from './runtime-schema-validator.mjs';
import { roleInjection } from './generate-role-files.mjs';
import {
  buildBuilderAssignments,
  runtimeInspectionContract,
  standardRenderCommand,
} from './plan-runtime.mjs';

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

function identityOf(value) {
  const { identity: _identity, ...identityInput } = value;
  return `sha256:${createHash('sha256').update(canonicalJson(identityInput)).digest('hex')}`;
}

async function verifyFileHash(productionRoot, locator, expectedSha256, label) {
  const absolute = path.resolve(productionRoot, locator);
  const relative = path.relative(path.resolve(productionRoot), absolute);
  if (!relative || path.isAbsolute(relative) || relative === '..' || relative.startsWith(`..${path.sep}`)) {
    throw new Error(`${label} locator escapes the production root`);
  }
  const body = await readFile(absolute);
  if (createHash('sha256').update(body).digest('hex') !== expectedSha256) {
    throw new Error(`${label} file hash differs from its gate binding`);
  }
}

export async function validateCanaryReleaseGate(plan, {
  productionRoot,
  canaryTechnicalGate,
  canaryUserDecision,
} = {}) {
  if (plan?.schemaVersion !== '4.0.0' || plan.canaryGate?.required !== true) {
    throw new Error('canary release gate requires runtime plan v4');
  }
  if (!canaryTechnicalGate || !canaryUserDecision) {
    throw new Error('full production is blocked until both canary technical gate and user decision exist');
  }
  const shotIds = plan.canaryGate.shotIds;
  if (canaryTechnicalGate.schemaVersion !== '1.0.0'
    || canaryTechnicalGate.status !== 'passed'
    || canaryTechnicalGate.planIdentity !== plan.identity
    || canonicalJson(canaryTechnicalGate.shotIds) !== canonicalJson(shotIds)
    || canaryTechnicalGate.identity !== identityOf(canaryTechnicalGate)) {
    throw new Error('canary technical gate does not bind the planned five-shot canary');
  }
  for (const key of ['directRuntimeRender', 'fullDecode', 'sixFrameSheets', 'builderViews']) {
    if (canaryTechnicalGate.checks?.[key] !== 'passed') throw new Error(`canary technical check ${key} has not passed`);
  }
  if (canaryTechnicalGate.canaryPreview?.fullDecode !== 'passed') {
    throw new Error('canary preview has not passed full decode');
  }
  await verifyFileHash(
    productionRoot,
    canaryTechnicalGate.canaryPreview.locator,
    canaryTechnicalGate.canaryPreview.sha256,
    'canary preview',
  );
  if (canonicalJson(canaryTechnicalGate.contractBindings?.map(({ shotId }) => shotId)) !== canonicalJson(shotIds)) {
    throw new Error('canary technical gate must bind one direct media contract per canary shot');
  }
  const sha256 = /^[0-9a-f]{64}$/u;
  if (!canaryTechnicalGate.contractBindings.every((binding) => (
    typeof binding.contractLocator === 'string' && binding.contractLocator.length > 0
    && sha256.test(binding.contractSha256)
    && sha256.test(binding.mediaSha256)
    && sha256.test(binding.semanticCheckSha256)
    && /^sha256:[0-9a-f]{64}$/u.test(binding.sourceIdentity)
  ))) throw new Error('canary technical contract bindings are incomplete');
  if (!Array.isArray(canaryTechnicalGate.viewReceiptBindings)
    || canaryTechnicalGate.viewReceiptBindings.length === 0
    || !canaryTechnicalGate.viewReceiptBindings.every((binding) => (
      /^U[0-9]{3}$/u.test(binding.assignmentId)
      && typeof binding.locator === 'string' && binding.locator.length > 0
      && sha256.test(binding.sha256)
    ))) {
    throw new Error('canary technical gate requires Builder view receipt bindings');
  }
  if (canaryUserDecision.schemaVersion !== '1.0.0'
    || canaryUserDecision.status !== 'passed'
    || canaryUserDecision.planIdentity !== plan.identity
    || canaryUserDecision.technicalGateIdentity !== canaryTechnicalGate.identity
    || canaryUserDecision.canaryPreviewIdentity !== canaryTechnicalGate.canaryPreview.sha256
    || canonicalJson(canaryUserDecision.shotIds) !== canonicalJson(shotIds)
    || canaryUserDecision.identity !== identityOf(canaryUserDecision)) {
    throw new Error('canary user decision does not bind the technical gate and preview');
  }
  const decisions = canaryUserDecision.decisions ?? [];
  if (canonicalJson(decisions.map(({ shotId }) => shotId)) !== canonicalJson(shotIds)) {
    throw new Error('canary user decision must cover the exact five shots in order');
  }
  const oursPreferred = decisions.filter(({ choice }) => choice === 'ours').length;
  if (canaryUserDecision.oursPreferred !== oursPreferred || oursPreferred < 3) {
    throw new Error('canary user decision requires oursPreferred to be recomputed and at least 3');
  }
  for (const decision of decisions) {
    if (!['ours', 'comparison'].includes(decision.choice)
      || typeof decision.accepted !== 'boolean'
      || ![null, 'string'].includes(decision.issue === null ? null : typeof decision.issue)) {
      throw new Error(`${decision.shotId}: canary user choice is invalid`);
    }
    if (decision.choice === 'ours' && decision.accepted !== true) {
      throw new Error(`${decision.shotId}: an ours choice must be accepted`);
    }
    if (decision.choice === 'comparison'
      && (typeof decision.issue !== 'string' || decision.issue.length === 0)) {
      throw new Error(`${decision.shotId}: a comparison choice must record one concrete issue`);
    }
  }
  return {
    status: 'passed', technicalGateIdentity: canaryTechnicalGate.identity,
    userDecisionIdentity: canaryUserDecision.identity,
  };
}

function expectedV4Assignment(assignment, plan, productionRoot) {
  const root = path.resolve(productionRoot);
  const assignments = buildBuilderAssignments(plan, {
    productionRoot: root,
    recipesDirectory: path.join(root, '01-director/shot-recipes'),
    narrativeEnvelopeFile: path.join(root, '01-director/narrative-envelope.json'),
    visualSystemFile: path.join(root, '01-director/visual-system.json'),
    representativeScenesFile: path.join(root, '01-director/representative-scenes.json'),
    motionMapFile: path.join(root, '01-director/motion-map.json'),
    originalSrtFile: path.join(root, plan.sourceContext.originalSrt.locator),
    originalDesignFile: path.join(root, plan.sourceContext.originalDesign.locator),
  });
  return assignments.find(({ assignmentId }) => assignmentId === assignment.assignmentId);
}

export async function gateBuilderAssignment(assignment, options = {}) {
  const {
    plan,
    productionRoot,
    canaryTechnicalGate,
    canaryUserDecision,
  } = options;
  if (plan?.schemaVersion === '4.0.0') {
    if (plan.status !== 'planned' || computeRuntimePlanIdentity(plan) !== plan.identity) {
      throw new Error('dispatch gate requires one valid planned runtime plan v4');
    }
    if (assignment?.schemaVersion !== '3.0.0' || assignment.planIdentity !== plan.identity) {
      throw new Error('assignment does not bind the planned runtime identity');
    }
    const expected = expectedV4Assignment(assignment, plan, productionRoot);
    if (!expected) throw new Error('assignment is not declared by the runtime plan');
    assertExactAssignment(assignment, expected);
    if (assignment.role === 'lead') {
      return { status: 'ready', role: 'lead', phase: 'lead-production' };
    }
    if (!canaryTechnicalGate || !canaryUserDecision) {
      if (assignment.canaryPhase.shotIds.length === 0) {
        throw new Error('full production is blocked until the five-shot canary technical gate and user decision pass');
      }
      return {
        status: 'ready', role: 'builder', phase: 'canary',
        allowedShotIds: assignment.canaryPhase.shotIds,
      };
    }
    const canary = await validateCanaryReleaseGate(plan, {
      productionRoot, canaryTechnicalGate, canaryUserDecision,
    });
    return {
      ...canary,
      status: 'ready', role: 'builder', phase: 'full-production',
      allowedShotIds: assignment.canaryPhase.deferredShotIds,
    };
  }
  const { visualLock } = options;
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
    const injection = roleInjection('lead');
    assertExactAssignment(assignment, {
      schemaVersion: '2.0.0',
      assignmentId: assignment.assignmentId,
      planIdentity: plan.identity,
      role: 'lead',
      phase: 'visual-lock',
      runtime: assignment.runtime,
      backendFailurePolicy: plan.backendFailurePolicy,
      mediaBoundary: plan.mediaBoundary,
      renderTargets: planned.map(({ shotId }) => ({ shotId, mode: 'direct-runtime-render' })),
      ...injection,
      finalProductionSource: true,
      sourceRoot: `${expectedRoot}/shared-source`,
      standardCommand: standardRenderCommand({
        root: path.resolve(productionRoot),
        assignmentId: assignment.assignmentId,
        sourceRoot: `${expectedRoot}/shared-source`,
      }),
      runtimeInspection: runtimeInspectionContract(assignment.runtime, assignment.assignmentId),
      shotIds: planned.map(({ shotId }) => shotId),
      representativeScenes: planned,
      stageSkill: expectedStageSkill(assignment.runtime),
      contextFiles: {
        assignment: locator,
        runtimePlan: '01-runtime-plan/runtime-plan.json',
        narrativeEnvelope: expectedDirectorLocator(plan.sharedArtifacts.narrativeEnvelope.locator),
        visualSystem: expectedDirectorLocator(plan.sharedArtifacts.visualSystem.locator),
        representativeScenes: expectedDirectorLocator(plan.sharedArtifacts.representativeScenes.locator),
        motionMap: expectedDirectorLocator(plan.sharedArtifacts.motionMap.locator),
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
    if (visualLock) {
      const validation = await validateVisualLock(visualLock, { plan, productionRoot });
      if (!['approved', 'skipped'].includes(validation.gate)) {
        throw new Error(`Lead final production source is blocked by visual-lock status ${validation.gate}`);
      }
      const runtimeSourceIdentity = visualLock.runtimeSources
        .find(({ runtime }) => runtime === assignment.runtime)?.sourceIdentity ?? null;
      if (!runtimeSourceIdentity) throw new Error('Lead final production source requires its identity-bound runtime source');
      return {
        status: 'ready', role: 'lead', gate: validation.gate,
        finalProductionSource: true,
        aestheticApproval: validation.gate === 'approved',
        visualLockIdentity: validation.identity,
        runtimeSourceIdentity,
      };
    }
    return { status: 'ready', role: 'lead', gate: 'visual-lock-production' };
  }
  if (assignment.role !== 'builder' || assignment.phase !== 'production') throw new Error('unknown Builder assignment role or phase');
  const unit = plan.authoringUnits.find(({ unitId }) => unitId === assignment.unitId);
  const representativeShotIds = new Set(plan.visualLock.representativeScenes.map(({ shotId }) => shotId));
  const expectedShotIds = unit?.shotIds.filter((shotId) => !representativeShotIds.has(shotId)) ?? [];
  const expectedLeadShotIds = unit?.shotIds.filter((shotId) => representativeShotIds.has(shotId)) ?? [];
  if (!unit || assignment.assignmentId !== unit.unitId
    || assignment.blockId !== unit.blockId
    || unit.runtime !== assignment.runtime
    || JSON.stringify(unit.window) !== JSON.stringify(assignment.window)
    || JSON.stringify(expectedShotIds) !== JSON.stringify(assignment.shotIds)) {
    throw new Error('production assignment does not match its planned authoring unit');
  }
  assertProfileBinding(assignment, plan);
  const expectedWorkDirectory = assignment.runtime === 'remotion'
    ? `03-remotion-build/${unit.unitId}`
    : `03-build/${unit.unitId}`;
  if (assignment.stageSkill !== expectedStageSkill(assignment.runtime)) {
    throw new Error('production assignment stage differs from the runtime plan');
  }
  const injection = roleInjection('builder');
  assertExactAssignment(assignment, {
    schemaVersion: '2.0.0',
    assignmentId: unit.unitId,
    role: 'builder',
    phase: 'production',
    planIdentity: plan.identity,
    unitId: unit.unitId,
    blockId: unit.blockId,
    runtime: unit.runtime,
    backendFailurePolicy: plan.backendFailurePolicy,
    mediaBoundary: plan.mediaBoundary,
    renderTargets: expectedShotIds.map((shotId) => ({ shotId, mode: 'direct-runtime-render' })),
    ...injection,
    leadFinalShotIds: expectedLeadShotIds,
    sourceRoot: `${expectedWorkDirectory}/source`,
    standardCommand: standardRenderCommand({
      root: path.resolve(productionRoot),
      assignmentId: unit.unitId,
      sourceRoot: `${expectedWorkDirectory}/source`,
    }),
    runtimeInspection: runtimeInspectionContract(unit.runtime, unit.unitId),
    window: unit.window,
    shotIds: expectedShotIds,
    stageSkill: expectedStageSkill(unit.runtime),
    contextFiles: {
      assignment: `01-runtime-plan/assignments/${unit.unitId}.json`,
      runtimePlan: '01-runtime-plan/runtime-plan.json',
      narrativeEnvelope: expectedDirectorLocator(plan.sharedArtifacts.narrativeEnvelope.locator),
      visualSystem: expectedDirectorLocator(plan.sharedArtifacts.visualSystem.locator),
      recipes: expectedShotIds.map((shotId) => `01-director/shot-recipes/${shotId}.json`),
      materialPlan: '02-assets/material-plan.md',
      fontPlan: '02-assets/font-plan.md',
    },
    seams: { previous: unit.context.previousSeam, next: unit.context.nextSeam },
    output: {
      workDirectory: expectedWorkDirectory,
      editableSourceRequired: true,
      receipt: `${expectedWorkDirectory}/receipt.json`,
      handoff: `${expectedWorkDirectory}/handoff.md`,
      shotMediaRequired: true,
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
    if (!['--plan', '--assignment', '--production-root', '--visual-lock', '--canary-technical-gate', '--canary-user-decision'].includes(name) || !value) throw new Error(`invalid argument ${name ?? ''}`);
    options[name.slice(2)] = path.resolve(value);
  }
  if (!options.plan || !options.assignment || !options['production-root']) throw new Error('--plan, --assignment, and --production-root are required');
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const [plan, assignment, visualLock, canaryTechnicalGate, canaryUserDecision] = await Promise.all([
    readFile(options.plan, 'utf8').then(JSON.parse),
    readFile(options.assignment, 'utf8').then(JSON.parse),
    options['visual-lock'] ? readFile(options['visual-lock'], 'utf8').then(JSON.parse) : null,
    options['canary-technical-gate'] ? readFile(options['canary-technical-gate'], 'utf8').then(JSON.parse) : null,
    options['canary-user-decision'] ? readFile(options['canary-user-decision'], 'utf8').then(JSON.parse) : null,
  ]);
  process.stdout.write(`${JSON.stringify(await gateBuilderAssignment(assignment, {
    plan,
    productionRoot: options['production-root'],
    visualLock,
    canaryTechnicalGate,
    canaryUserDecision,
  }))}\n`);
}

if (process.argv[1] && realpathSync(path.resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) {
  main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
