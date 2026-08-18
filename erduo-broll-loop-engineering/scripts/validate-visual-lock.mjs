#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson, validateSchemaValue } from './runtime-schema-validator.mjs';
import {
  bindRepresentativeScenes,
  computeRuntimePlanIdentity,
} from './validate-runtime-plan.mjs';

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schemaPath = path.join(skillRoot, 'references', 'runtime', 'visual-lock.schema.json');

export function computeVisualLockIdentity(lock) {
  const { identity: _identity, directorWitness: _legacyWitness, ...identityInput } = lock;
  return createHash('sha256').update(canonicalJson(identityInput)).digest('hex');
}

export function computeVisualLockApprovalIdentity(lock) {
  return createHash('sha256').update(canonicalJson({
    planIdentity: lock.planIdentity,
    representativeScenesIdentity: lock.representativeScenesIdentity,
    tokens: lock.tokens,
    representativeScenes: lock.representativeScenes,
    runtimeSources: lock.runtimeSources,
  })).digest('hex');
}

export function computeRuntimeSourceIdentity(source) {
  const { sourceIdentity: _identity, ...identityInput } = source;
  return createHash('sha256').update(canonicalJson(identityInput)).digest('hex');
}

function relativeInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== '' && !path.isAbsolute(relative)
    && relative !== '..' && !relative.startsWith(`..${path.sep}`);
}

async function resolveBoundPath(productionRoot, locator, kind) {
  if (typeof locator !== 'string' || path.isAbsolute(locator)) throw new Error(`${kind} locator must be production-root relative`);
  const rootReal = await realpath(productionRoot);
  const candidate = path.resolve(rootReal, locator);
  if (!relativeInside(rootReal, candidate)) throw new Error(`${kind} locator escapes the production root`);
  const candidateReal = await realpath(candidate);
  if (!relativeInside(rootReal, candidateReal)) throw new Error(`${kind} resolves outside the production root`);
  const info = await lstat(candidate);
  if (info.isSymbolicLink()) throw new Error(`${kind} must not be a symlink`);
  return { rootReal, candidate: candidateReal, info };
}

async function validateArtifact(productionRoot, artifact, label, requiredPrefix) {
  const { rootReal, candidate, info } = await resolveBoundPath(productionRoot, artifact.locator, label);
  if (!info.isFile()) throw new Error(`${label} must be a real file`);
  if (requiredPrefix) {
    const prefix = path.resolve(rootReal, requiredPrefix);
    if (!relativeInside(prefix, candidate)) throw new Error(`${label} must stay inside ${requiredPrefix}`);
  }
  const body = await readFile(candidate);
  const actual = createHash('sha256').update(body).digest('hex');
  if (actual !== artifact.sha256) throw new Error(`${label} hash differs from the visual lock`);
}

function validateTokens(tokens, errors) {
  if (!tokens || typeof tokens !== 'object' || Array.isArray(tokens)) {
    errors.push('#/tokens: approved visual lock requires executable tokens');
    return;
  }
  for (const key of ['fonts', 'assets', 'colors', 'hierarchy', 'motion']) {
    if (!Array.isArray(tokens[key]) || tokens[key].length === 0) errors.push(`#/tokens/${key}: requires at least one entry`);
  }
  for (const key of ['grid', 'safeArea', 'world']) {
    if (!tokens[key] || typeof tokens[key] !== 'object' || Array.isArray(tokens[key])) errors.push(`#/tokens/${key}: requires one frozen object`);
  }
}

function validateProducedContent(lock, plan, errors) {
  validateTokens(lock.tokens, errors);
  const plannedScenes = plan.visualLock?.representativeScenes ?? [];
  const actualScenes = lock.representativeScenes ?? [];
  if (actualScenes.length !== 3) errors.push('#/representativeScenes: produced visual lock requires three dynamic scenes');
  for (const scene of plannedScenes) {
    const actual = actualScenes.find(({ shotId }) => shotId === scene.shotId);
    if (!actual || actual.runtime !== scene.runtime) errors.push(`#/representativeScenes: missing planned ${scene.shotId} scene or runtime`);
  }
  const sourceRuntimes = (lock.runtimeSources ?? []).map(({ runtime }) => runtime).toSorted();
  if (new Set(sourceRuntimes).size !== sourceRuntimes.length
    || JSON.stringify(sourceRuntimes) !== JSON.stringify([...plan.requiredBackends].toSorted())) {
    errors.push('#/runtimeSources: requires exactly one isolated shared source per planned backend');
  }
}

export async function validateVisualLock(lock, { plan, productionRoot }) {
  const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
  const errors = validateSchemaValue(lock, schema, schema);
  if (!['3.0.0', '4.0.0'].includes(plan?.schemaVersion) || plan.status !== 'planned') {
    errors.push('#/planIdentity: visual lock requires one planned runtime plan v3 or v4');
  }
  if (plan?.identity && computeRuntimePlanIdentity(plan) !== plan.identity) errors.push('#/planIdentity: runtime plan identity is invalid');
  if (lock?.planIdentity !== plan?.identity) errors.push('#/planIdentity: does not match the runtime plan');
  if (lock?.identity && computeVisualLockIdentity(lock) !== lock.identity) errors.push('#/identity: does not match the visual-lock contents');

  const representativeFile = path.join(productionRoot, '01-director', 'representative-scenes.json');
  let selection;
  try {
    selection = await bindRepresentativeScenes(representativeFile);
    if (selection.value.identity !== lock?.representativeScenesIdentity) errors.push('#/representativeScenesIdentity: does not match the Director selection');
    if (selection.binding.sha256 !== plan?.sharedArtifacts?.representativeScenes?.sha256) errors.push('#/representativeScenesIdentity: Director selection differs from the plan binding');
  } catch (error) {
    errors.push(`#/representativeScenesIdentity: ${error.message}`);
  }

  const hasProducedContent = lock?.tokens !== null
    || (lock?.representativeScenes?.length ?? 0) > 0
    || (lock?.runtimeSources?.length ?? 0) > 0;
  if (lock?.status === 'skipped') {
    if (lock.userDecision?.status !== 'skipped' || !lock.userDecision?.riskAcknowledgement?.trim()) {
      errors.push('#/userDecision: skipped visual lock requires explicit non-empty risk acknowledgement');
    }
    if (lock.userDecision?.approvedContentIdentity !== null) errors.push('#/userDecision/approvedContentIdentity: skipped lock must not claim content approval');
    if (!hasProducedContent) {
      errors.push('#/representativeScenes: skipped review still requires the produced Lead scenes and final source');
    }
    validateProducedContent(lock, plan, errors);
  } else if (lock?.status === 'approved') {
    if (lock.userDecision?.status !== 'approved') errors.push('#/userDecision/status: approved lock requires user approval');
    if (lock.userDecision?.approvedContentIdentity !== computeVisualLockApprovalIdentity(lock)) {
      errors.push('#/userDecision/approvedContentIdentity: approved content changed after the user decision');
    }
    validateProducedContent(lock, plan, errors);
  } else if (['pending', 'ready-for-review', 'revision-required'].includes(lock?.status)) {
    if (lock.userDecision?.status === 'approved' || lock.userDecision?.status === 'skipped') errors.push('#/userDecision/status: does not match the incomplete visual lock');
  }

  if (errors.length) throw new Error(`visual lock validation failed:\n${errors.join('\n')}`);

  if (lock.status === 'approved' || (lock.status === 'skipped' && hasProducedContent)) {
    for (const artifact of [...lock.tokens.fonts, ...lock.tokens.assets]) {
      await validateArtifact(productionRoot, artifact, 'visual token artifact');
    }
    for (const scene of lock.representativeScenes) {
      await validateArtifact(productionRoot, scene.media, `${scene.shotId} representative media`, `04-visual-lock/${scene.runtime}/scenes`);
    }
    for (const source of lock.runtimeSources) {
      if (computeRuntimeSourceIdentity(source) !== source.sourceIdentity) throw new Error(`${source.runtime} shared source identity differs from its manifest`);
      const expectedRoot = `04-visual-lock/${source.runtime}/shared-source`;
      const resolvedRoot = await resolveBoundPath(productionRoot, source.rootLocator, `${source.runtime} shared source root`);
      if (!resolvedRoot.info.isDirectory()) throw new Error(`${source.runtime} shared source root must be a real directory`);
      if (source.rootLocator !== expectedRoot) throw new Error(`${source.runtime} shared source root must equal ${expectedRoot}`);
      for (const file of source.files) await validateArtifact(productionRoot, file, `${source.runtime} shared source file`, expectedRoot);
    }
    if (plan.requiredBackends.length === 2
      && lock.runtimeSources[0].rootLocator === lock.runtimeSources[1].rootLocator) {
      throw new Error('Hybrid visual lock must not share runtime source roots');
    }
  }
  return { status: 'valid', gate: lock.status, identity: lock.identity };
}

async function main() {
  const [lockFile, planFile, productionRoot] = process.argv.slice(2);
  if (!lockFile || !planFile || !productionRoot) {
    throw new Error('usage: node scripts/validate-visual-lock.mjs <visual-lock.json> <runtime-plan.json> <production-root>');
  }
  const [lock, plan] = await Promise.all([
    readFile(path.resolve(lockFile), 'utf8').then(JSON.parse),
    readFile(path.resolve(planFile), 'utf8').then(JSON.parse),
  ]);
  process.stdout.write(`${JSON.stringify(await validateVisualLock(lock, { plan, productionRoot: path.resolve(productionRoot) }))}\n`);
}

if (process.argv[1] && realpathSync(path.resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) {
  main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
