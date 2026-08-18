import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  generatedRoleFiles,
  roleInjection,
  syncRoleFiles,
} from '../erduo-broll-loop-engineering/scripts/generate-role-files.mjs';
import { validateMotionMap } from '../erduo-broll-loop-engineering/scripts/validate-motion-map.mjs';
import { validateRecipeDirectory } from '../erduo-broll-loop-engineering/scripts/validate-shot-recipes.mjs';
import { canonicalJson } from '../erduo-broll-loop-engineering/scripts/runtime-schema-validator.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skillRoot = path.join(repoRoot, 'erduo-broll-loop-engineering');
const commonCapabilities = [
  'semantic.integer-ms-window',
  'semantic.visual-state-transition',
  'semantic.readable-hold',
];

function schemaContractTokens(value, result = { fields: new Set(), literals: new Set() }) {
  if (Array.isArray(value)) {
    for (const item of value) schemaContractTokens(item, result);
    return result;
  }
  if (!value || typeof value !== 'object') return result;
  if (value.properties) {
    for (const field of Object.keys(value.properties)) result.fields.add(field);
  }
  if (typeof value.const === 'string') result.literals.add(value.const);
  for (const literal of value.enum ?? []) {
    if (typeof literal === 'string') result.literals.add(literal);
  }
  for (const child of Object.values(value)) schemaContractTokens(child, result);
  return result;
}

function identity(value) {
  const unsigned = structuredClone(value);
  delete unsigned.identity;
  return createHash('sha256').update(canonicalJson(unsigned)).digest('hex');
}

function recipe(shotId, startMs, compositionFamily) {
  const endMs = startMs + 1000;
  return {
    schemaVersion: '3.0.0', shotId, window: { startMs, endMs }, cueIds: [`cue-${shotId}`],
    audienceUnderstanding: `Understand ${shotId}.`, visualJob: `Show ${shotId}.`, focus: `${shotId} result`,
    keyStates: {
      start: `${shotId} source is visible.`, turn: `${shotId} changes state.`,
      result: `${shotId} result is complete.`, hold: `${shotId} result remains readable.`,
    },
    elementLifecycles: [{
      elementId: `${shotId}-hero`, enter: 'Present at the start.', hold: 'Carries the primary action.',
      destination: 'retain', reason: 'The resolved hero remains for the readable hold.',
    }],
    compositionFamily,
    heroFrame: {
      relationship: 'The changed subject reveals the result.',
      layers: { background: 'field', midground: 'support', foreground: `${shotId} hero` },
    },
    microBeats: [{
      beatId: 'b1', startMs, endMs, primaryFocus: `${shotId} hero`,
      visibleState: 'The result resolves and holds.', change: 'relationship',
      development: 'The hero visibly changes into the result before settling.',
    }],
    materialNeeds: [], requiredCapabilities: commonCapabilities,
    capabilityReasons: commonCapabilities.map((capabilityId) => ({
      capabilityId, contentReason: `${shotId} needs ${capabilityId} to express its own visible result.`,
    })),
    readableHold: { startMs: endMs - 300, endMs, items: [`${shotId} result`] },
    neighborHandoff: { incoming: 'Enter on a clean state.', outgoing: 'Cut from the held result.' },
  };
}

test('role charter projections stay generated, compact, and directly injectable', async () => {
  assert.deepEqual(await syncRoleFiles({ check: true }), { status: 'current', files: 11 });
  assert.equal(generatedRoleFiles().size, 11);
  for (const role of ['director', 'lead', 'builder']) {
    const injection = roleInjection(role);
    assert.equal(injection.executionAnchor.length <= 8, true);
    assert.equal(injection.recoveryFields.includes('assignmentLocator'), true);
    assert.match(injection.rolePrompt, /Source-authoring anchor/u);
    assert.match(injection.rolePrompt, /Compression recovery fields/u);
  }
  const directorAgents = await readFile(path.join(skillRoot, 'stages/broll-director/AGENTS.md'), 'utf8');
  const directorClaude = await readFile(path.join(skillRoot, 'stages/broll-director/CLAUDE.md'), 'utf8');
  assert.equal(directorAgents, directorClaude);
  for (const stage of ['broll-master-build', 'broll-remotion-build']) {
    const stageRoot = path.join(skillRoot, 'stages', stage);
    const inheritance = await readFile(path.join(stageRoot, 'AGENTS.md'), 'utf8');
    assert.equal(inheritance, await readFile(path.join(stageRoot, 'CLAUDE.md'), 'utf8'));
    assert.match(inheritance, /assignment packet's exact `rolePrompt`/u);
    assert.doesNotMatch(inheritance, /# Lead animation charter|# Builder animation charter/u);
    for (const role of ['lead', 'builder']) {
      assert.equal(
        await readFile(path.join(stageRoot, 'role-prompts', `${role}.md`), 'utf8'),
        roleInjection(role).rolePrompt,
      );
    }
  }
  for (const stage of ['broll-master-build', 'broll-remotion-build']) {
    const metadata = await readFile(path.join(skillRoot, 'stages', stage, 'agents/openai.yaml'), 'utf8');
    assert.doesNotMatch(metadata, /Recipe v2/u);
    assert.match(metadata, /complete original SRT\/design/u);
    assert.match(metadata, /Chapter|chapter/u);
  }
});

test('Director and Builders do not require generic craft rereads or self-authored proof systems', async () => {
  const files = [
    'stages/broll-director/SKILL.md',
    'stages/broll-master-build/SKILL.md',
    'stages/broll-remotion-build/SKILL.md',
  ];
  for (const relative of files) {
    const contents = await readFile(path.join(skillRoot, relative), 'utf8');
    assert.doesNotMatch(contents, /Read `(?:animation-craft|visual-craft|motion-layout-lint)\.md`/u, relative);
    assert.doesNotMatch(contents, /(?:deliver|write|create|generate) (?:a |the )?(?:compact )?(?:receipt|manifest|media contract|proof)/iu, relative);
  }
  for (const relative of files.slice(1)) {
    const contents = await readFile(path.join(skillRoot, relative), 'utf8');
    assert.match(contents, /run only the (?:assignment's )?exact standard command/iu);
    assert.match(contents, /Do not create (?:`src\/inspection\.tsx`, )?(?:inspection source|inspection Compositions)[\s\S]*proof/u);
    assert.doesNotMatch(contents, /erduoInspectionCompositions|data-erduo-(?:trace|role|focus|layer|visual|motions)/u);
  }
});

test('Director exact contract covers every authorable field, fixed literal, and capability without schema reads', async () => {
  const directorSkill = await readFile(path.join(skillRoot, 'stages/broll-director/SKILL.md'), 'utf8');
  const exactContract = directorSkill.split('## Exact JSON contract')[1]?.split('## Deliver')[0] ?? '';
  assert.notEqual(exactContract, '');
  const schemaNames = [
    'narrative-envelope.schema.json',
    'visual-system.schema.json',
    'shot-recipe.schema.json',
    'motion-map.schema.json',
    'representative-scenes.schema.json',
  ];
  for (const schemaName of schemaNames) {
    const schema = JSON.parse(await readFile(path.join(skillRoot, 'references/runtime', schemaName), 'utf8'));
    const tokens = schemaContractTokens(schema);
    for (const field of tokens.fields) {
      assert.match(exactContract, new RegExp(`\\b${field}\\b`, 'u'), `${schemaName} field ${field}`);
    }
    for (const literal of tokens.literals) {
      assert.equal(exactContract.includes(literal), true, `${schemaName} literal ${literal}`);
    }
  }
  const matrix = JSON.parse(await readFile(path.join(skillRoot, 'references/runtime/capability-matrix.json'), 'utf8'));
  for (const capability of matrix.capabilities) {
    assert.equal(exactContract.includes(capability.id), true, capability.id);
  }
  assert.match(exactContract, /Do not write `identity`[\s\S]*Parent-owned[\s\S]*--finalize/u);
});

test('role injection restores chapter creative ownership and removes production proof contracts', async () => {
  for (const role of ['director', 'lead', 'builder']) {
    const injection = roleInjection(role);
    assert.equal(injection.positiveCraftAnchor.length, 12);
    for (const principle of [
      'Staging', 'Anticipation', 'Pose to Pose', 'Follow Through and Overlap',
      'Slow In and Slow Out', 'Arcs', 'Secondary Action', 'Timing',
      'Exaggeration', 'Spatial Coherence', 'Appeal', 'Squash and Stretch',
    ]) assert.match(injection.rolePrompt, new RegExp(principle, 'u'), `${role}: ${principle}`);
  }

  const director = roleInjection('director').rolePrompt;
  assert.match(director, /complete original SRT and original design/u);
  assert.match(director, /Freeze only truth/u);
  assert.match(director, /creativeProposal/u);
  assert.match(director, /never write or decide authoring\.solo/u);

  for (const role of ['lead', 'builder']) {
    const prompt = roleInjection(role).rolePrompt;
    assert.match(prompt, /complete original SRT/u);
    assert.match(prompt, /original design/u);
    assert.match(prompt, /accepted or revised/u);
    assert.doesNotMatch(prompt, /erduoInspectionCompositions|data-erduo-(?:trace|role|focus|layer|visual|motions)/u);
    assert.match(prompt, /Do not create inspection source, DOM markers, trace metadata/u);
  }

  const builder = roleInjection('builder').rolePrompt;
  assert.match(builder, /complete creative loop for one contiguous chapter, normally five to eight shots/u);
  assert.match(builder, /Never change truth/u);
  assert.match(builder, /native, provided, search, generate, or mixed/u);
  assert.match(builder, /open every six-frame sheet and the chapter preview/u);
});

test('Recipe v3 fails without key states, beat focus, lifecycle destinations, or exact capability reasons', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'erduo-role-recipe-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = path.join(root, 'S01.json');
  const valid = recipe('S01', 0, 'full-bleed-material');
  await writeFile(file, `${JSON.stringify(valid)}\n`);
  assert.deepEqual(await validateRecipeDirectory(root), { status: 'valid', recipes: 1 });

  for (const [name, mutate, expected] of [
    ['key states', (value) => { delete value.keyStates; }, /keyStates: required property is missing/u],
    ['beat focus', (value) => { delete value.microBeats[0].primaryFocus; }, /primaryFocus: required property is missing/u],
    ['lifecycle', (value) => { value.elementLifecycles = []; }, /must contain at least 1 item/u],
    ['capability reasons', (value) => { value.capabilityReasons.pop(); }, /must explain every required capability exactly once/u],
  ]) {
    const invalid = structuredClone(valid);
    mutate(invalid);
    await writeFile(file, `${JSON.stringify(invalid)}\n`);
    await assert.rejects(validateRecipeDirectory(root), expected, name);
  }
});

test('motion map covers every Recipe and representative selection must be genuinely diverse', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'erduo-motion-map-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const recipesDirectory = path.join(root, 'recipes');
  await mkdir(recipesDirectory);
  const compositions = ['full-bleed-material', 'data-diagram-evidence', 'camera-depth-environment'];
  for (const [index, composition] of compositions.entries()) {
    const shotId = `S0${index + 1}`;
    await writeFile(path.join(recipesDirectory, `${shotId}.json`), `${JSON.stringify(recipe(shotId, index * 1000, composition))}\n`);
  }
  const motionMapFile = path.join(root, 'motion-map.json');
  const representativeScenesFile = path.join(root, 'representative-scenes.json');
  const motionMap = {
    schemaVersion: '1.0.0',
    shots: [
      { shotId: 'S01', contentRelation: 'process', primaryAction: 'Parts assemble.', compositionFamily: compositions[0], entryFamily: 'edge build', rhythm: 'progressive', settleMs: 300 },
      { shotId: 'S02', contentRelation: 'compare', primaryAction: 'Evidence separates.', compositionFamily: compositions[1], entryFamily: 'split reveal', rhythm: 'impact', settleMs: 300 },
      { shotId: 'S03', contentRelation: 'spatial', primaryAction: 'Camera reveals depth.', compositionFamily: compositions[2], entryFamily: 'depth approach', rhythm: 'calm', settleMs: 300 },
    ],
    identity: '',
  };
  motionMap.identity = identity(motionMap);
  await writeFile(motionMapFile, `${JSON.stringify(motionMap)}\n`);
  const representatives = {
    schemaVersion: '1.0.0',
    scenes: ['S01', 'S02', 'S03'].map((shotId, index) => ({
      shotId, coverage: ['opening', 'information-dense', 'late'][index],
      reason: `${shotId} exercises a distinct relationship.`, concerns: ['motion'],
    })),
    identity: 'a'.repeat(64),
  };
  await writeFile(representativeScenesFile, `${JSON.stringify(representatives)}\n`);
  assert.deepEqual(await validateMotionMap({ motionMapFile, recipesDirectory, representativeScenesFile }), {
    status: 'valid', shots: 3, identity: motionMap.identity,
  });

  const repeated = structuredClone(motionMap);
  repeated.shots[1].contentRelation = repeated.shots[0].contentRelation;
  repeated.identity = identity(repeated);
  await writeFile(motionMapFile, `${JSON.stringify(repeated)}\n`);
  await assert.rejects(
    validateMotionMap({ motionMapFile, recipesDirectory, representativeScenesFile }),
    /three distinct contentRelation values/u,
  );
});
