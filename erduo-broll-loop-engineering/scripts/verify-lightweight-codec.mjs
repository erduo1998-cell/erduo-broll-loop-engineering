#!/usr/bin/env node

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { createProductionProfile } from './create-production-profile.mjs';
import { mezzanineVideoArgs } from './frozen-media-policy.mjs';
import { runFrozenMediaCommand } from './validate-frozen-blocks.mjs';

function failure(label, result) {
  const detail = result.stderr?.trim() || result.stdout?.trim() || `exit ${result.code}`;
  return new Error(`${label} failed: ${detail.slice(-2_000)}`);
}

async function runChecked(runner, command) {
  const result = await runner(command);
  if (result.code !== 0) throw failure(path.basename(command.executable), result);
  return result;
}

async function probe(file, { ffprobe, runner, cwd }) {
  const result = await runChecked(runner, {
    executable: ffprobe,
    args: ['-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', file],
    cwd,
  });
  return JSON.parse(result.stdout);
}

function videoFacts(probeValue) {
  const video = probeValue.streams.find((stream) => stream.codec_type === 'video');
  return {
    container: probeValue.format.format_name,
    codec: video.codec_name,
    width: video.width,
    height: video.height,
    fps: video.avg_frame_rate,
    pixelFormat: video.pix_fmt,
    frameCount: Number(video.nb_read_frames ?? video.nb_frames),
    durationMs: Math.round(Number(probeValue.format.duration) * 1000),
  };
}

export async function verifyLightweightCodec({
  ffmpeg = 'ffmpeg',
  ffprobe = 'ffprobe',
  runner = runFrozenMediaCommand,
  comparePresets = true,
} = {}) {
  const workRoot = await mkdtemp(path.join(os.tmpdir(), 'erduo-broll-codec-'));
  const profile = createProductionProfile({ width: 640, height: 360, fps: '30' });
  const units = [path.join(workRoot, 'unit-1.mp4'), path.join(workRoot, 'unit-2.mp4')];
  const concatFile = path.join(workRoot, 'concat.txt');
  const copied = path.join(workRoot, 'stream-copy.mp4');
  const assembled = path.join(workRoot, 'assembled.mp4');
  const lossless = path.join(workRoot, 'lossless.mkv');
  try {
    for (const [index, unit] of units.entries()) {
      await runChecked(runner, {
        executable: ffmpeg,
        args: [
          '-v', 'error', '-nostdin', '-f', 'lavfi', '-i',
          `testsrc2=size=640x360:rate=30:duration=1,drawbox=x=${40 + index * 80}:y=90:w=120:h=120:color=${index ? 'blue' : 'red'}:t=fill`,
          ...mezzanineVideoArgs(profile), unit,
        ],
        cwd: workRoot,
      });
    }
    await writeFile(concatFile, "file 'unit-1.mp4'\nfile 'unit-2.mp4'\n", { flag: 'wx' });
    const losslessProfile = createProductionProfile({
      width: 640, height: 360, fps: '30', mezzanineFormat: 'ffv1-mkv',
      mezzanineReason: 'codec-fixture-lossless-control',
    });
    await runChecked(runner, {
      executable: ffmpeg,
      args: [
        '-v', 'error', '-nostdin', '-f', 'lavfi', '-i',
        'testsrc2=size=640x360:rate=30:duration=1',
        ...mezzanineVideoArgs(losslessProfile), lossless,
      ],
      cwd: workRoot,
    });
    await runChecked(runner, {
      executable: ffmpeg,
      args: ['-v', 'error', '-nostdin', '-f', 'concat', '-safe', '0', '-i', concatFile, '-c', 'copy', copied],
      cwd: workRoot,
    });
    await runChecked(runner, {
      executable: ffmpeg,
      args: [
        '-v', 'error', '-nostdin', '-f', 'concat', '-safe', '0', '-i', concatFile,
        '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '16',
        '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_trc', 'bt709',
        '-color_primaries', 'bt709', '-color_range', 'tv', '-movflags', '+faststart', assembled,
      ],
      cwd: workRoot,
    });
    for (const file of [...units, copied, assembled, lossless]) {
      await runChecked(runner, {
        executable: ffmpeg,
        args: ['-v', 'error', '-nostdin', '-xerror', '-i', file, '-map', '0', '-f', 'null', '-'],
        cwd: workRoot,
      });
    }
    const [unitProbe, copiedProbe, assembledProbe, losslessProbe] = await Promise.all([
      probe(units[0], { ffprobe, runner, cwd: workRoot }),
      probe(copied, { ffprobe, runner, cwd: workRoot }),
      probe(assembled, { ffprobe, runner, cwd: workRoot }),
      probe(lossless, { ffprobe, runner, cwd: workRoot }),
    ]);
    let presetComparison = null;
    if (comparePresets) {
      const runs = [];
      for (const preset of ['medium', 'slow']) {
        const output = path.join(workRoot, `preset-${preset}.mp4`);
        const started = performance.now();
        await runChecked(runner, {
          executable: ffmpeg,
          args: [
            '-v', 'error', '-nostdin', '-f', 'lavfi', '-i',
            'testsrc2=size=2880x2160:rate=30:duration=0.5',
            '-an', '-c:v', 'libx264', '-preset', preset, '-crf', '12',
            '-g', '60', '-keyint_min', '60', '-sc_threshold', '0',
            '-pix_fmt', 'yuv420p', output,
          ],
          cwd: workRoot,
        });
        runs.push({ preset, elapsedMs: Math.round(performance.now() - started), bytes: (await readFile(output)).length });
      }
      presetComparison = { raster: '2880x2160', frames: 15, crf: 12, runs };
    }
    const result = {
      status: 'passed',
      policy: {
        container: profile.mezzanine.container,
        codec: profile.mezzanine.codec,
        encoder: profile.mezzanine.encoder,
        preset: profile.mezzanine.preset,
        crf: profile.mezzanine.crf,
        gopFrames: profile.mezzanine.gopFrames,
        pixelFormat: profile.mezzanine.pixelFormat,
        concatStrategy: 'final-single-reencode',
      },
      unit: videoFacts(unitProbe),
      streamCopy: videoFacts(copiedProbe),
      finalSingleReencode: videoFacts(assembledProbe),
      losslessControl: videoFacts(losslessProbe),
      presetComparison,
      fixtureBytes: {
        units: (await Promise.all(units.map((file) => readFile(file)))).reduce((sum, body) => sum + body.length, 0),
        losslessControl: (await readFile(lossless)).length,
        streamCopy: (await readFile(copied)).length,
        finalSingleReencode: (await readFile(assembled)).length,
      },
    };
    if (result.unit.codec !== 'h264' || result.unit.pixelFormat !== 'yuv420p'
      || result.losslessControl.codec !== 'ffv1'
      || result.streamCopy.frameCount !== 60 || result.finalSingleReencode.frameCount !== 60
      || Math.abs(result.finalSingleReencode.durationMs - 2_000) > 34) {
      throw new Error(`codec fixture facts differ from the v1 contract: ${JSON.stringify(result)}`);
    }
    return result;
  } finally {
    await rm(workRoot, { recursive: true, force: true });
  }
}

async function main() {
  process.stdout.write(`${JSON.stringify(await verifyLightweightCodec(), null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
