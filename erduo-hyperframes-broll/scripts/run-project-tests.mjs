#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { access, readdir, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const ACTIVE_V3_TEST_FILES = Object.freeze([
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
]);

export const RETIRED_INSPECTION_TEST_FILES = Object.freeze([
  'scripts/test-match-template.mjs',
  'scripts/test-project-status.mjs',
  'scripts/test-template-candidate.mjs',
  'scripts/test-template-library-validator.mjs',
  'scripts/test-template-validator.mjs',
  'scripts/test-transition-template.mjs',
  'erduo-hyperframes-broll/scripts/test-asset-integrity-gate.mjs',
  'erduo-hyperframes-broll/scripts/test-audit-license-notices.mjs',
  'erduo-hyperframes-broll/scripts/test-build-faceless-master.mjs',
  'erduo-hyperframes-broll/scripts/test-build-fullscreen-composition.mjs',
  'erduo-hyperframes-broll/scripts/test-build-hard-alpha-composition.mjs',
  'erduo-hyperframes-broll/scripts/test-build-hyperframes-timeline.mjs',
  'erduo-hyperframes-broll/scripts/test-build-light-pass-composition.mjs',
  'erduo-hyperframes-broll/scripts/test-build-m10-composition.mjs',
  'erduo-hyperframes-broll/scripts/test-build-shot-render-plan.mjs',
  'erduo-hyperframes-broll/scripts/test-build-talking-head-master.mjs',
  'erduo-hyperframes-broll/scripts/test-cache.mjs',
  'erduo-hyperframes-broll/scripts/test-check-coverage.mjs',
  'erduo-hyperframes-broll/scripts/test-check-m10-content-quality.mjs',
  'erduo-hyperframes-broll/scripts/test-compare-e2e-contract.mjs',
  'erduo-hyperframes-broll/scripts/test-config.mjs',
  'erduo-hyperframes-broll/scripts/test-delivery-media-gate.mjs',
  'erduo-hyperframes-broll/scripts/test-doctor.mjs',
  'erduo-hyperframes-broll/scripts/test-extract-director-enhancer-evidence.mjs',
  'erduo-hyperframes-broll/scripts/test-failed-visual-regression.mjs',
  'erduo-hyperframes-broll/scripts/test-frame-visibility-gate.mjs',
  'erduo-hyperframes-broll/scripts/test-image-generation.mjs',
  'erduo-hyperframes-broll/scripts/test-index-user-assets.mjs',
  'erduo-hyperframes-broll/scripts/test-input-integration.mjs',
  'erduo-hyperframes-broll/scripts/test-input-layer.mjs',
  'erduo-hyperframes-broll/scripts/test-input-time-gate.mjs',
  'erduo-hyperframes-broll/scripts/test-measure-style-pixel-facts.mjs',
  'erduo-hyperframes-broll/scripts/test-native-fallback.mjs',
  'erduo-hyperframes-broll/scripts/test-parse-srt.mjs',
  'erduo-hyperframes-broll/scripts/test-pexels-search.mjs',
  'erduo-hyperframes-broll/scripts/test-plan-m10-asset-routes.mjs',
  'erduo-hyperframes-broll/scripts/test-prepare-font-assets.mjs',
  'erduo-hyperframes-broll/scripts/test-probe-media.mjs',
  'erduo-hyperframes-broll/scripts/test-retry-resume.mjs',
  'erduo-hyperframes-broll/scripts/test-review-receipt.mjs',
  'erduo-hyperframes-broll/scripts/test-roi-material-contribution.mjs',
  'erduo-hyperframes-broll/scripts/test-route-user-assets.mjs',
  'erduo-hyperframes-broll/scripts/test-run-e2e-fixture.mjs',
  'erduo-hyperframes-broll/scripts/test-select-design.mjs',
  'erduo-hyperframes-broll/scripts/test-shot-design-gate.mjs',
  'erduo-hyperframes-broll/scripts/test-template-visual-grammar-constraints.mjs',
  'erduo-hyperframes-broll/scripts/test-validate-anti-template-signatures.mjs',
  'erduo-hyperframes-broll/scripts/test-validate-assets-v2-chain.mjs',
  'erduo-hyperframes-broll/scripts/test-validate-authoring-topology.mjs',
  'erduo-hyperframes-broll/scripts/test-validate-context-budget.mjs',
  'erduo-hyperframes-broll/scripts/test-validate-design-slice.mjs',
  'erduo-hyperframes-broll/scripts/test-validate-director-brief.mjs',
  'erduo-hyperframes-broll/scripts/test-validate-director-method.mjs',
  'erduo-hyperframes-broll/scripts/test-validate-director-v2-chain.mjs',
  'erduo-hyperframes-broll/scripts/test-validate-display-font-selection.mjs',
  'erduo-hyperframes-broll/scripts/test-validate-flat-shot-kit-set.mjs',
  'erduo-hyperframes-broll/scripts/test-validate-flat-shot-kit.mjs',
  'erduo-hyperframes-broll/scripts/test-validate-m10-visual-contract.mjs',
  'erduo-hyperframes-broll/scripts/test-validate-main-review-packets.mjs',
  'erduo-hyperframes-broll/scripts/test-validate-master-bindings.mjs',
  'erduo-hyperframes-broll/scripts/test-validate-master-build-v2-chain.mjs',
  'erduo-hyperframes-broll/scripts/test-validate-neutral-scaffold.mjs',
  'erduo-hyperframes-broll/scripts/test-validate-reference-library.mjs',
  'erduo-hyperframes-broll/scripts/test-validate-render-source.mjs',
  'erduo-hyperframes-broll/scripts/test-validate-shot-plan.mjs',
  'erduo-hyperframes-broll/scripts/test-validate-style-conformance-review.mjs',
  'erduo-hyperframes-broll/scripts/test-validate-visual-authoring-chain.mjs',
  'erduo-hyperframes-broll/scripts/test-validate-visual-evidence.mjs',
  'erduo-hyperframes-broll/scripts/test-validate-visual-grammar-program.mjs',
  'erduo-hyperframes-broll/scripts/test-validate-whole-film-rules.mjs',
  'erduo-hyperframes-broll/scripts/test-visual-preflight-pixels.mjs',
]);

export class ProjectTestError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ProjectTestError';
    this.code = code;
  }
}

const fail = (code, message) => { throw new ProjectTestError(code, message); };

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function discoveredTestFiles(root, directory) {
  return (await readdir(directory))
    .filter((name) => /^test-.*\.mjs$/u.test(name))
    .sort()
    .map((name) => path.relative(root, path.join(directory, name)).split(path.sep).join('/'));
}

function validateInventoryEntries(entries, label) {
  if (!Array.isArray(entries) || entries.length === 0
    || entries.some((entry) => typeof entry !== 'string' || !/^(?:scripts|erduo-hyperframes-broll\/scripts)\/test-.*\.mjs$/u.test(entry))) {
    fail('test_inventory_invalid', `${label} test inventory is invalid.`);
  }
  if (new Set(entries).size !== entries.length) {
    fail('test_inventory_invalid', `${label} test inventory contains duplicates.`);
  }
}

async function resolveTestInventory({
  root,
  projectScripts,
  skillScripts,
  activeInventory,
  retiredInventory,
}) {
  validateInventoryEntries(activeInventory, 'Active v3');
  validateInventoryEntries(retiredInventory, 'Retired inspection');
  const activeSet = new Set(activeInventory);
  const retiredSet = new Set(retiredInventory);
  const overlap = activeInventory.filter((entry) => retiredSet.has(entry));
  if (overlap.length) {
    fail('retired_test_reactivated', `Retired inspection test is active: ${overlap[0]}.`);
  }
  const discovered = [
    ...await discoveredTestFiles(root, projectScripts),
    ...await discoveredTestFiles(root, skillScripts),
  ];
  const unclassified = discovered.filter((entry) => !activeSet.has(entry) && !retiredSet.has(entry));
  if (unclassified.length) {
    fail('test_inventory_unclassified', `Test file is not classified: ${unclassified[0]}.`);
  }
  for (const entry of [...activeInventory, ...retiredInventory]) {
    if (!discovered.includes(entry)) {
      fail(
        activeSet.has(entry) ? 'active_test_missing' : 'retired_test_missing',
        `Classified test file is missing: ${entry}.`,
      );
    }
  }
  return {
    active: activeInventory.map((entry) => path.join(root, ...entry.split('/'))),
    retired: [...retiredInventory],
  };
}

async function findOfficialQuickValidator() {
  const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  const script = path.join(codexHome, 'skills', '.system', 'skill-creator', 'scripts', 'quick_validate.py');
  if (!(await exists(script))) return null;
  const python = process.env.PYTHON || 'python3';
  try {
    await execFileAsync(python, ['-c', 'import yaml'], { timeout: 15_000 });
  } catch {
    return null;
  }
  return { script, python };
}

async function runStep(step) {
  process.stdout.write(`\n[project-test] ${step.id}\n`);
  try {
    const result = await execFileAsync(step.command, step.args, {
      cwd: step.cwd,
      env: process.env,
      timeout: step.timeout ?? 5 * 60_000,
      maxBuffer: step.maxBuffer ?? 32 * 1024 * 1024,
    });
    let nodeTestSummary = null;
    if (step.summarizeNodeTests) {
      nodeTestSummary = parseNodeTestSummary(result.stdout);
      process.stdout.write(
        `[project-test] node-summary tests=${nodeTestSummary.tests} pass=${nodeTestSummary.pass} fail=${nodeTestSummary.fail}\n`,
      );
    } else if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    return {
      id: step.id,
      status: 'passed',
      ...(nodeTestSummary ? { node_test_summary: nodeTestSummary } : {}),
    };
  } catch (error) {
    if (error.stdout) process.stdout.write(String(error.stdout));
    if (error.stderr) process.stderr.write(String(error.stderr));
    fail('test_step_failed', `${step.id} failed with exit ${error.code ?? 'error'}.`);
  }
}

export function parseNodeTestSummary(output) {
  const text = typeof output === 'string' ? output : '';
  const valueFor = (label) => {
    const match = text.match(new RegExp(`^ℹ ${label} (\\d+)$`, 'mu'));
    return match ? Number(match[1]) : null;
  };
  const summary = {
    tests: valueFor('tests'),
    pass: valueFor('pass'),
    fail: valueFor('fail'),
  };
  if (!Number.isSafeInteger(summary.tests)
    || !Number.isSafeInteger(summary.pass)
    || !Number.isSafeInteger(summary.fail)
    || summary.pass + summary.fail !== summary.tests) {
    fail('node_test_summary_invalid', 'Node test summary is missing or inconsistent.');
  }
  return summary;
}

export async function buildProjectTestPlan({
  projectRoot,
  includeOfficialValidator = true,
  activeTestInventory = ACTIVE_V3_TEST_FILES,
  retiredTestInventory = RETIRED_INSPECTION_TEST_FILES,
} = {}) {
  const root = await realpath(path.resolve(projectRoot));
  const skillRoot = path.join(root, 'erduo-hyperframes-broll');
  const projectScripts = path.join(root, 'scripts');
  const skillScripts = path.join(skillRoot, 'scripts');
  for (const required of [
    path.join(root, 'AGENTS.md'),
    path.join(root, 'PROGRESS.md'),
    path.join(root, 'handoff', 'CURRENT.md'),
    path.join(skillRoot, 'SKILL.md'),
  ]) {
    if (!(await exists(required))) fail('project_layout_invalid', 'Project root is missing a required takeover file.');
  }
  const inventory = await resolveTestInventory({
    root,
    projectScripts,
    skillScripts,
    activeInventory: activeTestInventory,
    retiredInventory: retiredTestInventory,
  });
  const tests = inventory.active;
  const steps = [
    {
      id: 'project-status',
      command: process.execPath,
      args: [path.join(projectScripts, 'project-status.mjs')],
      cwd: root,
    },
    {
      id: `node-tests-${tests.length}-files`,
      command: process.execPath,
      args: ['--test', ...tests],
      cwd: root,
      timeout: 10 * 60_000,
      maxBuffer: 64 * 1024 * 1024,
      summarizeNodeTests: true,
    },
    {
      id: 'portable-skill-layout',
      command: process.execPath,
      args: [path.join(skillScripts, 'validate-skill-layout.mjs'), skillRoot],
      cwd: root,
    },
    {
      id: 'public-package-audit',
      command: process.execPath,
      args: [path.join(skillScripts, 'audit-public-package.mjs'), skillRoot],
      cwd: root,
    },
    {
      id: 'license-audit',
      command: process.execPath,
      args: [path.join(skillScripts, 'audit-license-notices.mjs'), skillRoot],
      cwd: root,
    },
    {
      id: 'git-diff-check',
      command: 'git',
      args: ['diff', '--check'],
      cwd: root,
    },
  ];
  const quickValidator = includeOfficialValidator ? await findOfficialQuickValidator() : null;
  if (quickValidator) {
    for (const name of [
      'erduo-hyperframes-broll',
      'broll-director',
      'broll-assets',
      'broll-master-build',
      'broll-master-integrate',
      'broll-render',
      'broll-shot-export',
    ]) {
      steps.push({
        id: `official-skill-validation-${name}`,
        command: quickValidator.python,
        args: [
          quickValidator.script,
          name === 'erduo-hyperframes-broll' ? skillRoot : path.join(skillRoot, 'stages', name),
        ],
        cwd: root,
      });
    }
  }
  return {
    projectRoot: root,
    skillRoot,
    testFileCount: tests.length,
    retiredTestFileCount: inventory.retired.length,
    retiredTestFiles: inventory.retired,
    officialValidatorFound: Boolean(quickValidator),
    steps,
  };
}

export async function runProjectTests(options = {}) {
  const plan = await buildProjectTestPlan(options);
  const results = [];
  for (const step of plan.steps) results.push(await runStep(step));
  return {
    status: 'passed',
    test_file_count: plan.testFileCount,
    retired_test_file_count: plan.retiredTestFileCount,
    retired_test_files: plan.retiredTestFiles,
    node_test_summary: results.find((result) => result.node_test_summary)?.node_test_summary ?? null,
    step_count: results.length,
    official_validator: plan.officialValidatorFound ? 'executed' : 'not-found-local-validator-used',
    steps: results,
  };
}

function usage() {
  return 'Usage: node scripts/run-project-tests.mjs [--project-root <path>] [--skip-official-validator]\n';
}

function parseArgs(argv) {
  const options = {
    projectRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..'),
    includeOfficialValidator: true,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help') return { help: true };
    if (arg === '--skip-official-validator') {
      options.includeOfficialValidator = false;
      continue;
    }
    if (arg === '--project-root' && argv[index + 1]) {
      options.projectRoot = argv[index + 1];
      index += 1;
      continue;
    }
    fail('usage', usage().trim());
  }
  return options;
}

const isMain = (() => {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(path.resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();
if (isMain) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      process.stdout.write(usage());
    } else {
      process.stdout.write(`${JSON.stringify(await runProjectTests(options))}\n`);
    }
  } catch (error) {
    const known = error instanceof ProjectTestError;
    process.stderr.write(`${JSON.stringify({
      status: 'failed',
      code: known ? error.code : 'project_test_failed',
      message: known ? error.message : 'Project test suite failed.',
    })}\n`);
    process.exitCode = known && error.code === 'usage' ? 64 : 2;
  }
}
