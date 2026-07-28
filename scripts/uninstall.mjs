#!/usr/bin/env node

import {
  lstat,
  readlink,
  realpath,
  rename,
  unlink,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ActionRequiredError,
  RELEASE_VERSION,
  applicationDataDir,
  assertInstallManifestFilesystem,
  atomicWriteJson,
  publicError,
  readJsonIfPresent,
  validateInstallManifest,
} from './lib.mjs';

async function removeOwnedLink(record) {
  try {
    const stat = await lstat(record.target);
    if (!stat.isSymbolicLink()) return 'skipped-different-target';
    const raw = await readlink(record.target);
    if (path.resolve(path.dirname(record.target), raw) !== record.source) {
      return 'skipped-different-target';
    }
    await unlink(record.target);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  if (record.backup) {
    try {
      await lstat(record.target);
      return 'removed-backup-not-restored-target-occupied';
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    try {
      await lstat(record.backup);
      await rename(record.backup, record.target);
      return 'removed-and-restored-backup';
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  return 'removed';
}

async function preflightOwnedLink(record) {
  try {
    const stat = await lstat(record.target);
    if (!stat.isSymbolicLink()) return false;
    const raw = await readlink(record.target);
    return path.resolve(path.dirname(record.target), raw) === record.source;
  } catch (error) {
    if (error?.code === 'ENOENT') return true;
    throw error;
  }
}

export async function runUninstall({
  env = process.env,
  homeDir = os.homedir(),
  platform = process.platform,
  appDir = applicationDataDir({ env, homeDir, platform }),
  repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
} = {}) {
  const manifestFile = path.join(appDir, 'install-manifest.json');
  const manifest = await readJsonIfPresent(manifestFile);
  if (!manifest) {
    throw new ActionRequiredError(
      'install_manifest_missing',
      'No valid install manifest was found; nothing was removed.',
    );
  }
  const canonicalRepoRoot = await realpath(repoRoot);
  const validated = validateInstallManifest(manifest, {
    repoRoot: canonicalRepoRoot,
    appDir,
    homeDir,
  });
  await assertInstallManifestFilesystem(validated.records, { appDir, homeDir });
  const ownership = await Promise.all(validated.records.map(preflightOwnedLink));
  if (ownership.some((owned) => !owned)) {
    throw new ActionRequiredError(
      'uninstall_target_changed',
      'At least one managed Skill target changed; no uninstall changes were made.',
    );
  }
  const results = [];
  for (const record of validated.records) {
    results.push({
      host: record.host,
      name: record.name,
      action: await removeOwnedLink(record),
    });
  }
  const report = {
    status: 'uninstalled',
    removed: results.filter((entry) => entry.action.startsWith('removed')).length,
    skipped: results.filter((entry) => entry.action.startsWith('skipped')).length,
    restored: results.filter((entry) => entry.action.includes('restored')).length,
    config_preserved: true,
    hyperframes_runtime_preserved: true,
    results,
  };
  if (report.skipped !== 0) {
    throw new ActionRequiredError(
      'uninstall_incomplete',
      'Uninstall did not complete; the install manifest was preserved.',
    );
  }
  await atomicWriteJson(
    path.join(appDir, 'uninstall-receipt.json'),
    {
      schema_version: 1,
      product_version: RELEASE_VERSION,
      uninstalled_at: new Date().toISOString(),
      removed: report.removed,
      restored: report.restored,
      config_preserved: true,
      hyperframes_runtime_preserved: true,
    },
    { trustedRoot: appDir },
  );
  await unlink(manifestFile);
  return report;
}

async function main(argv) {
  if (argv.some((entry) => entry !== '--json')) {
    throw new ActionRequiredError('usage', 'Usage: uninstall.mjs [--json]');
  }
  const report = await runUninstall();
  process.stdout.write(argv.includes('--json')
    ? `${JSON.stringify(report)}\n`
    : `Uninstalled ${report.removed} owned Skill links; restored ${report.restored}; skipped ${report.skipped}. Private configuration and the shared HyperFrames runtime were preserved.\n`);
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${JSON.stringify(publicError(error))}\n`);
    process.exitCode = error?.code === 'usage' ? 64 : 2;
  }
}
