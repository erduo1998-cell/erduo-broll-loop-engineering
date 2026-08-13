#!/usr/bin/env node

import { lstat, realpath } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ActionRequiredError,
  HYPERFRAMES_VERSION,
  HYPERFRAMES_SKILLS_COMMIT,
  HYPERFRAMES_SKILL_NAMES,
  INSTALL_SKILL_NAMES,
  RELEASE_VERSION,
  SKILL_NAMES,
  applicationDataDir,
  atomicWriteJson,
  environmentReadinessFile,
  hostSkillRoots,
  hyperframesCliPath,
  installManifestIdentity,
  normalizeOfficialDoctor,
  normalizeSkillsCheck,
  officialSkillBundleRoot,
  parseJsonPayload,
  pathExists,
  publicError,
  readJsonIfPresent,
  redactText,
  runFile,
  sanitizedChildEnv,
  stableHostId,
} from './lib.mjs';
import { pexelsStatus } from './config.mjs';

async function installedSkillFacts({ homeDir, repoRoot }) {
  const facts = [];
  for (const { host, root } of hostSkillRoots({ homeDir })) {
    for (const name of SKILL_NAMES) {
      const target = path.join(root, name);
      const expected = name === 'erduo-broll-loop-engineering'
        ? path.join(repoRoot, 'erduo-broll-loop-engineering')
        : path.join(repoRoot, 'erduo-broll-loop-engineering', 'stages', name);
      let status = 'missing';
      try {
        const stat = await lstat(target);
        status = stat.isSymbolicLink() && await realpath(target) === await realpath(expected)
          ? 'ok'
          : 'different-target';
      } catch {
        status = 'missing';
      }
      facts.push({ host, skill: name, status });
    }
  }
  return facts;
}

export async function collectDoctor({
  env = process.env,
  homeDir = os.homedir(),
  platform = process.platform,
  arch = process.arch,
  appDir = applicationDataDir({ env, homeDir, platform }),
  repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  runner = runFile,
  nodeVersion = process.versions.node,
  fetchImpl = globalThis.fetch,
  pexelsEndpoint,
  includePexels = false,
} = {}) {
  const nodeMajor = Number(nodeVersion.split('.')[0]);
  const childEnv = sanitizedChildEnv(env);
  const cli = hyperframesCliPath(appDir);
  const runtimeAvailable = await pathExists(cli);
  let skills = { status: 'action-required', reason: 'runtime-missing' };
  let official = null;

  if (runtimeAvailable) {
    const pinnedSkillSource = officialSkillBundleRoot(appDir);
    const skillResult = await runner(process.execPath, [
      cli,
      'skills',
      'check',
      '--dir',
      path.join(pinnedSkillSource, 'skills'),
      '--source',
      pinnedSkillSource,
      '--json',
    ], {
      env: childEnv,
      timeout: 120_000,
    });
    try {
      const payload = parseJsonPayload(skillResult.stdout, 'hyperframes_skills_check');
      skills = normalizeSkillsCheck(payload, skillResult.code);
    } catch (error) {
      skills = { status: 'action-required', reason: error.code };
    }

    const doctorResult = await runner(process.execPath, [cli, 'doctor', '--json'], {
      env: childEnv,
      timeout: 120_000,
    });
    try {
      official = normalizeOfficialDoctor(
        parseJsonPayload(doctorResult.stdout, 'hyperframes_doctor'),
      );
    } catch (error) {
      official = { payload_valid: false, reason: error.code };
    }
  }

  const customSkills = await installedSkillFacts({ homeDir, repoRoot });
  const installManifest = await readJsonIfPresent(path.join(appDir, 'install-manifest.json'));
  const pexels = includePexels ? await pexelsStatus({
    env, homeDir, platform, validate: true, fetchImpl, endpoint: pexelsEndpoint,
  }) : { checked: false, reason: 'material-stage-only' };
  const skillLinksReady = customSkills.every((fact) => fact.status === 'ok');
  const ready = platform === 'darwin'
    && nodeMajor >= 22
    && runtimeAvailable
    && skills.status === 'ok'
    && official?.selected_local_render_ready === true
    && skillLinksReady;

  return {
    schema_version: 1,
    product_version: RELEASE_VERSION,
    status: ready ? 'ready' : 'action-required',
    authority: 'environment-facts-only-no-creative-or-quality-approval',
    platform,
    arch,
    support: platform === 'darwin' ? 'macos-supported' : 'unverified',
    node: {
      version: nodeVersion,
      status: nodeMajor >= 22 ? 'ok' : 'action-required',
    },
    hyperframes: {
      expected_version: HYPERFRAMES_VERSION,
      official_skills_commit: HYPERFRAMES_SKILLS_COMMIT,
      runtime: runtimeAvailable ? 'present' : 'action-required',
      skills,
      official_doctor: official,
    },
    custom_skills: {
      expected_count: SKILL_NAMES.length * 2,
      ready_count: customSkills.filter((fact) => fact.status === 'ok').length,
      status: skillLinksReady ? 'ok' : 'action-required',
      facts: customSkills,
    },
    install_manifest_identity: installManifestIdentity(installManifest),
    pexels,
  };
}

export function readinessFromDoctor(report, { hostname = os.hostname() } = {}) {
  return {
    schema_version: 1,
    product_version: report.product_version,
    created_at: new Date().toISOString(),
    host_id: stableHostId({ hostname, platform: report.platform, arch: report.arch }),
    platform: report.platform,
    arch: report.arch,
    node_major: Number(String(report.node.version).split('.')[0]),
    install: {
      expected_skill_links: INSTALL_SKILL_NAMES.length * 2,
      ready_skill_links: report.custom_skills.ready_count
        + (report.hyperframes.skills.status === 'ok' ? HYPERFRAMES_SKILL_NAMES.length * 2 : 0),
      manifest_identity: report.install_manifest_identity,
    },
    hyperframes: {
      expected_version: report.hyperframes.expected_version,
      official_skills_commit: report.hyperframes.official_skills_commit,
      ready: report.hyperframes.runtime === 'present'
        && report.hyperframes.skills.status === 'ok'
        && report.hyperframes.official_doctor?.selected_local_render_ready === true,
    },
    ready_backends: report.hyperframes.official_doctor?.selected_local_render_ready === true
      ? ['hyperframes'] : [],
    status: report.status,
  };
}

function humanReport(report, homeDir) {
  const lines = [
    `erduo-broll-loop-engineering doctor: ${report.status}`,
    `platform=${report.platform}/${report.arch} support=${report.support}`,
    `node=${report.node.version} status=${report.node.status}`,
    `hyperframes=${report.hyperframes.expected_version} runtime=${report.hyperframes.runtime}`,
    `official-skills=${report.hyperframes.skills.status}`,
    `official-doctor=${report.hyperframes.official_doctor?.selected_local_render_ready === true ? 'selected-local-render-ready' : 'action-required'}`,
    `custom-skills=${report.custom_skills.ready_count}/${report.custom_skills.expected_count}`,
    'pexels=not-checked-material-stage-only',
    'authority=environment facts only; no creative, aesthetic, or quality approval',
  ];
  return `${redactText(lines.join('\n'), { homeDir })}\n`;
}

async function main(argv) {
  if (argv.some((arg) => !['--json', '--refresh-cache'].includes(arg))) {
    throw new ActionRequiredError('usage', 'Usage: doctor.mjs [--json] [--refresh-cache]');
  }
  const report = await collectDoctor();
  if (argv.includes('--refresh-cache') && report.status === 'ready') {
    const appDir = applicationDataDir();
    await atomicWriteJson(environmentReadinessFile(appDir), readinessFromDoctor(report), {
      trustedRoot: appDir,
    });
  }
  process.stdout.write(argv.includes('--json')
    ? `${JSON.stringify(report)}\n`
    : humanReport(report, os.homedir()));
  if (report.status !== 'ready') process.exitCode = 2;
}

const isMain = process.argv[1]
  && realpathSync(path.resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${JSON.stringify(publicError(error))}\n`);
    process.exitCode = error?.code === 'usage' ? 64 : 2;
  }
}
