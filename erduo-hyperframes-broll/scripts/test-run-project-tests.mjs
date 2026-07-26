import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  ACTIVE_V3_TEST_FILES,
  buildProjectTestPlan,
  parseNodeTestSummary,
  ProjectTestError,
  RETIRED_INSPECTION_TEST_FILES,
} from './run-project-tests.mjs';

const execFileAsync = promisify(execFile);

test('builds a cwd-independent project plan around the invoking Node runtime', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'project-test-plan-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'handoff'), { recursive: true });
  await mkdir(path.join(root, 'scripts'), { recursive: true });
  await mkdir(path.join(root, 'erduo-hyperframes-broll', 'scripts'), { recursive: true });
  await writeFile(path.join(root, 'AGENTS.md'), '# rules\n');
  await writeFile(path.join(root, 'PROGRESS.md'), '# progress\n');
  await writeFile(path.join(root, 'handoff', 'CURRENT.md'), '# current\n');
  await writeFile(path.join(root, 'erduo-hyperframes-broll', 'SKILL.md'), '---\nname: erduo-hyperframes-broll\ndescription: test\n---\n');
  for (const name of ['broll-director', 'broll-assets', 'broll-master-build', 'broll-master-integrate', 'broll-render', 'broll-shot-export']) {
    await mkdir(path.join(root, 'erduo-hyperframes-broll', 'stages', name), { recursive: true });
    await writeFile(path.join(root, 'erduo-hyperframes-broll', 'stages', name, 'SKILL.md'), `---\nname: ${name}\ndescription: test\n---\n`);
  }
  await writeFile(path.join(root, 'scripts', 'test-root.mjs'), '');
  await writeFile(path.join(root, 'erduo-hyperframes-broll', 'scripts', 'test-skill.mjs'), '');
  await writeFile(path.join(root, 'erduo-hyperframes-broll', 'scripts', 'test-retired.mjs'), '');
  const plan = await buildProjectTestPlan({
    projectRoot: root,
    includeOfficialValidator: false,
    activeTestInventory: ['scripts/test-root.mjs', 'erduo-hyperframes-broll/scripts/test-skill.mjs'],
    retiredTestInventory: ['erduo-hyperframes-broll/scripts/test-retired.mjs'],
  });
  assert.equal(plan.testFileCount, 2);
  assert.equal(plan.retiredTestFileCount, 1);
  assert.deepEqual(plan.retiredTestFiles, ['erduo-hyperframes-broll/scripts/test-retired.mjs']);
  assert.equal(plan.steps[0].command, process.execPath);
  assert.equal(plan.steps.find((step) => step.id.startsWith('node-tests-')).args[0], '--test');
  assert.equal(plan.officialValidatorFound, false);
});

async function inventoryFixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'project-test-inventory-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'handoff'), { recursive: true });
  await mkdir(path.join(root, 'scripts'), { recursive: true });
  await mkdir(path.join(root, 'erduo-hyperframes-broll', 'scripts'), { recursive: true });
  await writeFile(path.join(root, 'AGENTS.md'), '# rules\n');
  await writeFile(path.join(root, 'PROGRESS.md'), '# progress\n');
  await writeFile(path.join(root, 'handoff', 'CURRENT.md'), '# current\n');
  await writeFile(path.join(root, 'erduo-hyperframes-broll', 'SKILL.md'), '---\nname: erduo-hyperframes-broll\ndescription: test\n---\n');
  await writeFile(path.join(root, 'scripts', 'test-active.mjs'), '');
  await writeFile(path.join(root, 'erduo-hyperframes-broll', 'scripts', 'test-retired.mjs'), '');
  return root;
}

test('fails closed when an active test is missing or a new test is unclassified', async (t) => {
  const root = await inventoryFixture(t);
  await assert.rejects(
    () => buildProjectTestPlan({
      projectRoot: root,
      includeOfficialValidator: false,
      activeTestInventory: ['scripts/test-active.mjs', 'scripts/test-missing.mjs'],
      retiredTestInventory: ['erduo-hyperframes-broll/scripts/test-retired.mjs'],
    }),
    (error) => error instanceof ProjectTestError && error.code === 'active_test_missing',
  );
  await writeFile(path.join(root, 'scripts', 'test-new.mjs'), '');
  await assert.rejects(
    () => buildProjectTestPlan({
      projectRoot: root,
      includeOfficialValidator: false,
      activeTestInventory: ['scripts/test-active.mjs'],
      retiredTestInventory: ['erduo-hyperframes-broll/scripts/test-retired.mjs'],
    }),
    (error) => error instanceof ProjectTestError && error.code === 'test_inventory_unclassified',
  );
});

test('parses the exact Node subtest summary and rejects inconsistent totals', () => {
  assert.deepEqual(
    parseNodeTestSummary('ℹ tests 42\nℹ suites 0\nℹ pass 42\nℹ fail 0\n'),
    { tests: 42, pass: 42, fail: 0 },
  );
  assert.throws(
    () => parseNodeTestSummary('ℹ tests 42\nℹ pass 41\nℹ fail 0\n'),
    (error) => error instanceof ProjectTestError && error.code === 'node_test_summary_invalid',
  );
});

test('fails closed when a retired inspection test is reactivated', async (t) => {
  const root = await inventoryFixture(t);
  await assert.rejects(
    () => buildProjectTestPlan({
      projectRoot: root,
      includeOfficialValidator: false,
      activeTestInventory: ['scripts/test-active.mjs', 'erduo-hyperframes-broll/scripts/test-retired.mjs'],
      retiredTestInventory: ['erduo-hyperframes-broll/scripts/test-retired.mjs'],
    }),
    (error) => error instanceof ProjectTestError && error.code === 'retired_test_reactivated',
  );
});

test('the production inventory is explicit, disjoint and keeps P5 active', () => {
  const expectedActive = [
    'erduo-hyperframes-broll/scripts/test-create-portable-snapshot.mjs',
    'erduo-hyperframes-broll/scripts/test-script-only-v3-contract.mjs',
    'erduo-hyperframes-broll/scripts/test-script-only-v3-adversarial.mjs',
    'erduo-hyperframes-broll/scripts/test-script-only-v3-active-cutover.mjs',
    'erduo-hyperframes-broll/scripts/test-script-only-v3-director-assets-cutover.mjs',
    'erduo-hyperframes-broll/scripts/test-script-only-v3-block-gates.mjs',
    'erduo-hyperframes-broll/scripts/test-script-only-v3-integration-render.mjs',
    'erduo-hyperframes-broll/scripts/test-support-script-only-v3-runtime.mjs',
    'erduo-hyperframes-broll/scripts/test-support-script-only-v3-director-assets.mjs',
    'erduo-hyperframes-broll/scripts/test-support-script-only-v3-block-gates.mjs',
    'erduo-hyperframes-broll/scripts/test-support-script-only-v3-block-gates-terminal.mjs',
    'erduo-hyperframes-broll/scripts/test-state.mjs',
    'erduo-hyperframes-broll/scripts/test-stage-receipt.mjs',
    'erduo-hyperframes-broll/scripts/test-orchestrate-stages.mjs',
    'erduo-hyperframes-broll/scripts/test-artifact-manifest.mjs',
    'erduo-hyperframes-broll/scripts/test-delivery-report.mjs',
    'erduo-hyperframes-broll/scripts/test-validate-artifact-run.mjs',
    'erduo-hyperframes-broll/scripts/test-compile-frame-projection.mjs',
    'erduo-hyperframes-broll/scripts/test-validate-font-package.mjs',
    'erduo-hyperframes-broll/scripts/test-production-preflight-and-claude-dispatch.mjs',
    'scripts/test-reachsurge-private-dry-run.mjs',
    'erduo-hyperframes-broll/scripts/test-install-stage-skills.mjs',
    'erduo-hyperframes-broll/scripts/test-audit-public-package.mjs',
    'erduo-hyperframes-broll/scripts/test-validate-skill-layout.mjs',
    'erduo-hyperframes-broll/scripts/test-run-project-tests.mjs',
  ];
  assert.deepEqual(ACTIVE_V3_TEST_FILES, expectedActive);
  assert.equal(ACTIVE_V3_TEST_FILES.length, 25);
  assert.equal(RETIRED_INSPECTION_TEST_FILES.length, 71);
  assert.equal(new Set(ACTIVE_V3_TEST_FILES).size, ACTIVE_V3_TEST_FILES.length);
  assert.equal(new Set(RETIRED_INSPECTION_TEST_FILES).size, RETIRED_INSPECTION_TEST_FILES.length);
  assert.equal(
    ACTIVE_V3_TEST_FILES.some((entry) => RETIRED_INSPECTION_TEST_FILES.includes(entry)),
    false,
  );
  for (const retired of [
    'scripts/test-template-validator.mjs',
    'erduo-hyperframes-broll/scripts/test-build-m10-composition.mjs',
    'erduo-hyperframes-broll/scripts/test-validate-assets-v2-chain.mjs',
    'erduo-hyperframes-broll/scripts/test-validate-director-v2-chain.mjs',
    'erduo-hyperframes-broll/scripts/test-validate-master-bindings.mjs',
    'erduo-hyperframes-broll/scripts/test-validate-master-build-v2-chain.mjs',
  ]) {
    assert.equal(ACTIVE_V3_TEST_FILES.includes(retired), false);
    assert.equal(RETIRED_INSPECTION_TEST_FILES.includes(retired), true);
  }
});

test('rejects a directory that is not the takeover project root', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'project-test-invalid-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await assert.rejects(
    () => buildProjectTestPlan({ projectRoot: root, includeOfficialValidator: false }),
    (error) => error instanceof ProjectTestError && error.code === 'project_layout_invalid',
  );
});

test('project-test CLI remains executable through a symlinked path', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'project-test-cli-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const alias = path.join(root, 'project-test-cli.mjs');
  await symlink(fileURLToPath(new URL('./run-project-tests.mjs', import.meta.url)), alias);
  const { stdout } = await execFileAsync(process.execPath, [alias, '--help']);
  assert.match(stdout, /--project-root/u);
});
