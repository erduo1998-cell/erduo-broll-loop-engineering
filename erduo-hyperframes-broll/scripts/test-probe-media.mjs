import test from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import {
  MediaProbeError,
  decimalSecondsToMicros,
  normalizeProbePayload,
  parseFrameRate,
  parseProbeArgs,
  probeMedia,
  runProbeCli,
} from './probe-media.mjs';

const video = (overrides = {}) => ({
  index: 0,
  codec_type: 'video',
  codec_name: 'h264',
  width: 1920,
  height: 1080,
  pix_fmt: 'yuv420p',
  avg_frame_rate: '30000/1001',
  r_frame_rate: '30000/1001',
  disposition: { default: 1 },
  ...overrides,
});

const audio = (overrides = {}) => ({
  index: 1,
  codec_type: 'audio',
  codec_name: 'aac',
  sample_rate: '48000',
  channels: 2,
  channel_layout: 'stereo',
  disposition: { default: 1 },
  ...overrides,
});

function payload(streams = [video(), audio()], format = {}) {
  return { streams, format: { duration: '1.234567', format_name: 'mov,mp4,mov', ...format } };
}

function regularFs(size = 12345, overrides = {}) {
  return {
    lstat: async () => ({ isFile: () => true, isSymbolicLink: () => false, size }),
    ...overrides,
  };
}

function error(code, { killed = false } = {}) {
  return Object.assign(new Error(code), { code, killed });
}

function capture() {
  let value = '';
  return {
    stream: new Writable({ write(chunk, encoding, callback) { value += chunk.toString(); callback(); } }),
    value: () => value,
  };
}

function runnerFor(probePayload, { calls = [], failProbe, failDecode } = {}) {
  return async (file, args, options) => {
    calls.push({ file, args, options });
    if (file.startsWith('ffprobe')) {
      if (failProbe) throw failProbe;
      return { stdout: typeof probePayload === 'string' ? probePayload : JSON.stringify(probePayload), stderr: '' };
    }
    if (failDecode) throw failDecode;
    return { stdout: '', stderr: '' };
  };
}

test('normalizes audiovisual metadata without copying arbitrary tags', () => {
  const result = normalizeProbePayload(payload(), 12345);
  assert.equal(result.kind, 'audiovisual');
  assert.equal(result.duration_us, 1234567);
  assert.equal(result.duration_ms, 1235);
  assert.deepEqual(result.format_names, ['mov', 'mp4']);
  assert.deepEqual(result.video.primary.frame_rate, { numerator: 30000, denominator: 1001, value: 29.97003 });
  assert.equal(result.audio.primary.sample_rate, 48000);
  assert.equal(JSON.stringify(result).includes('tags'), false);
});

test('supports video-only, audio-only, and still image with null duration', () => {
  const videoOnly = normalizeProbePayload(payload([video()], { duration: '2.0' }), 1);
  const audioOnly = normalizeProbePayload(payload([audio()], { duration: '3.0' }), 1);
  const still = normalizeProbePayload(payload([video({ avg_frame_rate: '25/1', r_frame_rate: '25/1' })], { duration: 'N/A' }), 1);
  assert.equal(videoOnly.kind, 'video');
  assert.equal(videoOnly.audio.count, 0);
  assert.equal(audioOnly.kind, 'audio');
  assert.equal(audioOnly.video.count, 0);
  assert.equal(still.duration_us, null);
  assert.equal(still.duration_ms, null);
});

test('format duration wins and stream duration falls back to greatest valid value', () => {
  const streams = [video({ duration: '2.5' }), audio({ duration: '3.25' })];
  assert.equal(normalizeProbePayload(payload(streams, { duration: '4.0' }), 1).duration_us, 4_000_000);
  assert.equal(normalizeProbePayload(payload(streams, { duration: 'N/A' }), 1).duration_us, 3_250_000);
});

test('decimal seconds round only beyond microseconds and reject invalid/unsafe values', () => {
  assert.equal(decimalSecondsToMicros('1'), 1_000_000);
  assert.equal(decimalSecondsToMicros('0.1234564'), 123456);
  assert.equal(decimalSecondsToMicros('0.1234565'), 123457);
  assert.equal(decimalSecondsToMicros('N/A'), null);
  assert.equal(decimalSecondsToMicros('999999999999999999'), null);
});

test('frame rate keeps exact rational and falls back from zero avg rate', () => {
  assert.deepEqual(parseFrameRate('30000/1001'), { numerator: 30000, denominator: 1001, value: 29.97003 });
  const result = normalizeProbePayload(payload([video({ avg_frame_rate: '0/0', r_frame_rate: '24/1' })]), 1);
  assert.deepEqual(result.video.primary.frame_rate, { numerator: 24, denominator: 1, value: 24 });
  assert.equal(parseFrameRate('abc'), null);
  assert.equal(parseFrameRate('1/0'), null);
});

test('side-data rotation has priority and swaps display dimensions', () => {
  const result = normalizeProbePayload(payload([video({
    width: 1080,
    height: 1920,
    side_data_list: [{ rotation: -90 }],
    tags: { rotate: '180', title: 'private' },
  })]), 1);
  assert.equal(result.video.primary.rotation_degrees, 270);
  assert.equal(result.video.primary.display_width, 1920);
  assert.equal(result.video.primary.display_height, 1080);
  assert.equal(JSON.stringify(result).includes('private'), false);
});

test('selects disposition-default streams while counting every stream', () => {
  const streams = [
    video({ index: 0, codec_name: 'first', disposition: { default: 0 } }),
    video({ index: 2, codec_name: 'default-video', disposition: { default: 1 } }),
    audio({ index: 1, codec_name: 'first-audio', disposition: { default: 0 } }),
    audio({ index: 3, codec_name: 'default-audio', disposition: { default: 1 } }),
  ];
  const result = normalizeProbePayload(payload(streams), 1);
  assert.equal(result.video.count, 2);
  assert.equal(result.video.primary.codec, 'default-video');
  assert.equal(result.audio.count, 2);
  assert.equal(result.audio.primary.codec, 'default-audio');
});

test('rejects no media streams and invalid primary video/audio metadata', () => {
  const cases = [
    [payload([{ index: 0, codec_type: 'subtitle' }]), 'no_media_stream'],
    [payload([video({ width: 0 })]), 'invalid_video_dimensions'],
    [payload([video({ avg_frame_rate: 'bad', r_frame_rate: '0/0' })]), 'invalid_frame_rate'],
    [payload([video({ avg_frame_rate: '999999999999999999/1', r_frame_rate: '0/0' })]), 'invalid_frame_rate'],
    [payload([audio({ sample_rate: 'bad' })]), 'invalid_audio_metadata'],
    [payload([audio({ channels: 0 })]), 'invalid_audio_metadata'],
  ];
  for (const [value, code] of cases) {
    assert.throws(() => normalizeProbePayload(value, 1), (err) => err instanceof MediaProbeError && err.code === code);
  }
});

test('probe uses Windows executable names and keeps a spaced path as one argument', async () => {
  const calls = [];
  const input = 'C:\\Media Files\\talking head.mp4';
  const result = await probeMedia(input, {
    platform: 'win32',
    fsImpl: regularFs(),
    execFileAsync: runnerFor(payload(), { calls }),
    resolvePath: (value) => value,
  });
  assert.equal(result.decode.ok, true);
  assert.equal(calls[0].file, 'ffprobe.exe');
  assert.equal(calls[1].file, 'ffmpeg.exe');
  assert.equal(calls[0].args.at(-1), input);
  assert.equal(calls[0].args.filter((arg) => arg === input).length, 1);
  assert.equal(calls[1].args[4], input);
  assert.equal(calls[0].options.timeout, 30000);
  assert.equal(calls[1].options.timeout, 120000);
});

test('rejects missing, symlink, directory, empty, and unreadable inputs safely', async () => {
  const cases = [
    [{ lstat: async () => { throw error('ENOENT'); } }, 'input_not_found'],
    [{ lstat: async () => ({ isFile: () => true, isSymbolicLink: () => true, size: 1 }) }, 'input_unsafe'],
    [{ lstat: async () => ({ isFile: () => false, isSymbolicLink: () => false, size: 1 }) }, 'input_unsafe'],
    [regularFs(0), 'input_empty'],
    [{ lstat: async () => { throw error('EACCES'); } }, 'input_unreadable'],
  ];
  for (const [fsImpl, code] of cases) {
    await assert.rejects(
      probeMedia('/private/media.mp4', { fsImpl, execFileAsync: runnerFor(payload()) }),
      (err) => err.code === code && !err.message.includes('/private'),
    );
  }
});

test('distinguishes missing, timeout, non-zero, and malformed ffprobe', async () => {
  const failures = [
    [runnerFor(payload(), { failProbe: error('ENOENT') }), 'ffprobe_not_found'],
    [runnerFor(payload(), { failProbe: error('ETIMEDOUT', { killed: true }) }), 'probe_timeout'],
    [runnerFor(payload(), { failProbe: error(1) }), 'probe_failed'],
    [runnerFor('not-json'), 'invalid_probe_json'],
  ];
  for (const [runner, code] of failures) {
    await assert.rejects(probeMedia('/private/video.mp4', { fsImpl: regularFs(), execFileAsync: runner }), (err) => err.code === code);
  }
});

test('distinguishes missing, timeout, and non-zero ffmpeg decode', async () => {
  const failures = [
    [error('ENOENT'), 'ffmpeg_not_found'],
    [error('ETIMEDOUT', { killed: true }), 'decode_timeout'],
    [error(1), 'decode_failed'],
  ];
  for (const [failure, code] of failures) {
    await assert.rejects(
      probeMedia('/private/video.mp4', { fsImpl: regularFs(), execFileAsync: runnerFor(payload(), { failDecode: failure }) }),
      (err) => err.code === code && err.stage === 'decode',
    );
  }
});

test('argument parser and CLI have stable safe outputs and exit codes', async () => {
  assert.deepEqual(parseProbeArgs(['--help']), { help: true });
  assert.deepEqual(parseProbeArgs(['clip.mp4', '--pretty']), { input: 'clip.mp4', pretty: true });
  for (const args of [[], ['a.mp4', 'b.mp4'], ['a.mp4', '--json'], ['a.mp4', '--pretty', '--pretty']]) {
    assert.equal(parseProbeArgs(args).error, true);
  }

  const stdout = capture();
  const stderr = capture();
  assert.equal(await runProbeCli(['/private/talking head.mp4', '--pretty'], {
    stdout: stdout.stream,
    stderr: stderr.stream,
    probeOptions: { fsImpl: regularFs(), execFileAsync: runnerFor(payload()) },
  }), 0);
  assert.equal(JSON.parse(stdout.value()).kind, 'audiovisual');
  assert.equal(stdout.value().includes('/private'), false);

  const inputErr = capture();
  assert.equal(await runProbeCli(['/private/missing.mp4'], {
    stderr: inputErr.stream,
    probeOptions: { fsImpl: { lstat: async () => { throw error('ENOENT', { killed: false }); } } },
  }), 2);
  assert.equal(inputErr.value().includes('/private'), false);
  assert.equal(JSON.parse(inputErr.value()).error.stage, 'input');

  const probeErr = capture();
  assert.equal(await runProbeCli(['/private/bad.mp4'], {
    stderr: probeErr.stream,
    probeOptions: { fsImpl: regularFs(), execFileAsync: runnerFor(payload(), { failDecode: error(1) }) },
  }), 3);
  assert.equal(JSON.parse(probeErr.value()).error.stage, 'decode');

  const usageErr = capture();
  assert.equal(await runProbeCli([], { stderr: usageErr.stream }), 64);
});
