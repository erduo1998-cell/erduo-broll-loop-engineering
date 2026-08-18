import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  roleInjection,
  syncRoleFiles,
} from '../erduo-broll-loop-engineering/scripts/generate-role-files.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skillRoot = path.join(repoRoot, 'erduo-broll-loop-engineering');
const readSkill = (relative) => readFile(path.join(skillRoot, relative), 'utf8');
const v4PlannerFlags = [
  '--recipes', '--selection', '--narrative-envelope', '--visual-system',
  '--representative-scenes', '--motion-map', '--original-srt',
  '--original-design', '--hyperframes-executable', '--production-profile', '--production-root',
];
const privatePathPattern = new RegExp([
  ['/','Users','/'].join(''),
  ['/','home','/'].join(''),
  '[A-Z]:\\\\',
].join('|'), 'u');

test('generated role prompts anchor positive craft and chapter creative ownership without proof work', async () => {
  assert.deepEqual(await syncRoleFiles({ check: true }), { status: 'current', files: 11 });

  for (const role of ['director', 'lead', 'builder']) {
    const injection = roleInjection(role);
    assert.equal(injection.positiveCraftAnchor.length, 12, role);
    assert.equal(injection.executionAnchor.length <= 8, true, role);
    for (const principle of [
      'Staging', 'Anticipation', 'Pose to Pose', 'Follow Through and Overlap',
      'Slow In and Slow Out', 'Arcs', 'Secondary Action', 'Timing',
      'Exaggeration', 'Spatial Coherence', 'Appeal', 'Squash and Stretch',
    ]) assert.match(injection.rolePrompt, new RegExp(principle, 'u'), `${role}: ${principle}`);
    assert.doesNotMatch(injection.rolePrompt, /erduoInspectionCompositions|data-erduo-(?:trace|role|focus|layer|visual|motions)/u, role);
  }

  const director = roleInjection('director').rolePrompt;
  assert.match(director, /complete original SRT and original design/u);
  assert.match(director, /Freeze only truth/u);
  assert.match(director, /creativeProposal/u);
  assert.match(director, /never write or decide authoring\.solo/u);

  const lead = roleInjection('lead').rolePrompt;
  for (const token of [
    'native graphic/type', 'real-or-generated material fusion',
    'information-dense interface/process/data', 'signature motion',
    'capability index', 'accepted or revised',
  ]) assert.equal(lead.includes(token), true, token);

  const builder = roleInjection('builder').rolePrompt;
  assert.match(builder, /complete creative loop for one contiguous chapter, normally five to eight shots/u);
  assert.match(builder, /Never change truth/u);
  assert.match(builder, /native, provided, search, generate, or mixed/u);
  assert.match(builder, /open every six-frame sheet and the chapter preview/u);
});

test('Parent, orchestration, and stage Skills expose the reset contract', async () => {
  const parent = await readSkill('SKILL.md');
  const orchestration = await readSkill('references/stage-orchestration.md');
  const director = await readSkill('stages/broll-director/SKILL.md');
  const assets = await readSkill('stages/broll-assets/SKILL.md');
  const hyperframes = await readSkill('stages/broll-master-build/SKILL.md');
  const remotion = await readSkill('stages/broll-remotion-build/SKILL.md');

  for (const [name, text] of [['parent', parent], ['orchestration', orchestration]]) {
    assert.match(text, /complete original SRT/u, name);
    assert.match(text, /original design/u, name);
    assert.match(text, /5–8/u, name);
    assert.match(text, /five-shot creative canary|five-shot canary|5 镜头/u, name);
    assert.match(text, /HyperFrames/u, name);
    assert.match(text, /Remotion/u, name);
    assert.match(text, /experimental/u, name);
    assert.match(text, /accepted\|revised|accepted.*revised/us, name);
  }
  assert.match(parent, /production default: `hyperframes`/u);
  assert.match(parent, /Remotion: explicit opt-in or canary only/u);
  assert.match(parent, /`auto`: experimental and explicit only/u);
  assert.match(parent, /Full production is blocked until/u);

  assert.match(director, /schemaVersion:"4\.0\.0"/u);
  assert.match(director, /truth:\{chapterId,srtWindowMs/u);
  assert.match(director, /creativeProposal:\{metaphor,objects/u);
  assert.match(director, /`craftIntent` \(choose 2–4\)/u);
  assert.match(director, /Never write `authoring\.solo`/u);

  assert.match(assets, /Shared freeze is not a creative veto/u);
  assert.match(assets, /native \| provided \| search \| generate \| mixed/u);
  assert.match(assets, /user prohibited it, the capability is unavailable, or authorization\/\s*cost policy forbids it/u);

  for (const [name, text] of [['hyperframes', hyperframes], ['remotion', remotion]]) {
    assert.match(text, /complete original SRT and original design/u, name);
    assert.match(text, /`truth` is immutable/u, name);
    assert.match(text, /`creativeProposal` is revisable/u, name);
    assert.match(text, /normally 5–8 shots/u, name);
    assert.match(text, /Open every shot's six-frame sheet and the\s+chapter preview/u, name);
    assert.match(text, /accepted.*revised/us, name);
    assert.doesNotMatch(text, /erduoInspectionCompositions|data-erduo-(?:trace|role|focus|layer|visual|motions)/u, name);
  }
  assert.match(remotion, /Do not create `src\/inspection\.tsx`/u);
});

test('documented Recipe v4 Planner commands include every direct creative input', async () => {
  const documents = await Promise.all([
    'references/stage-orchestration.md',
    'references/runtime/runtime-selection.md',
  ].map(async (relative) => [relative, await readSkill(relative)]));

  for (const [name, text] of documents) {
    const command = text.match(/(node (?:<skill-root>\/)?scripts\/plan-runtime\.mjs[\s\S]*?)\n```/u)?.[1];
    assert.equal(typeof command, 'string', `${name}: v4 Planner command`);
    for (const flag of v4PlannerFlags) {
      assert.match(command, new RegExp(`(?:^|\\s)${flag}(?:\\s|$)`, 'u'), `${name}: ${flag}`);
    }
  }
});

test('public v1.0.1 docs disclose the approved canary scope and previous visual failure', async () => {
  const readmes = await Promise.all([
    'README.md', 'README.en.md', 'README.ja.md', 'README.ko.md', 'README.zh-TW.md',
  ].map(async (file) => [file, await readFile(path.join(repoRoot, file), 'utf8')]));

  for (const [name, text] of readmes) {
    for (const token of ['Chapter Builder', '5–8', 'truth', 'creativeProposal', 'HyperFrames', 'Remotion', 'auto', 'accepted', 'revised']) {
      assert.equal(text.includes(token), true, `${name}: ${token}`);
    }
    assert.match(text, /five-shot|5-shot|5 镜头|5 ショット|5개 shot|5 鏡/u, `${name}: canary count`);
    assert.match(text, /v1\.0\.1/u, name);
    assert.match(text, /179\.866/u, name);
    assert.match(text, /visual|視覚|시각|視覺/u, name);
    assert.doesNotMatch(text, privatePathPattern, name);
  }

  const changelog = await readFile(path.join(repoRoot, 'CHANGELOG.md'), 'utf8');
  const support = await readFile(path.join(repoRoot, 'SUPPORT-MATRIX.md'), 'utf8');
  const checklist = await readFile(path.join(repoRoot, 'RELEASE-CHECKLIST.md'), 'utf8');
  assert.match(changelog, /5 镜头 creative canary/u);
  assert.match(changelog, /停止剩余 14 镜、不生成全片预览/u);
  assert.match(support, /HyperFrames runtime \| v1\.0\.1 production default \/ canary approved/u);
  assert.match(support, /Remotion runtime \| explicit opt-in \/ canary \/ technical witness only/u);
  assert.match(support, /Canary gate \| technical passed; user approved release/u);
  assert.match(checklist, /5 镜头 technical canary 已完成/u);
  assert.match(checklist, /full-production gate 继续拒绝启动/u);
  assert.match(checklist, /5 镜头 canary 用户逐镜选择与最终完整动态 preview/u);
  assert.match(checklist, /完整原始 SRT\/design 及 identities/u);
  assert.doesNotMatch(checklist, /Runtime Plan v3|；v3 不再|visual-lock skip|approve\|revise\|skip|升级高密度 trace|Builder 输入只包含自己的 authoring unit|只有三场景 visual lock 与最终 composition preview/u);
  assert.doesNotMatch(`${changelog}\n${support}\n${checklist}`, privatePathPattern);
});
