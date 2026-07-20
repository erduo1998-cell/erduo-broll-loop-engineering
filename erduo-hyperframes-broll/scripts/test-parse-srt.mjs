import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';
import {
  SrtError,
  parseSrt,
  parseSrtArgs,
  parseTimestamp,
  readBoundedInput,
  runSrtCli,
} from './parse-srt.mjs';

const basic = `1
00:00:00,000 --> 00:00:01,250
Hello

2
00:00:01,250 --> 00:00:03,000
World
第二行
`;

function capture() {
  let value = '';
  return {
    stream: new Writable({ write(chunk, encoding, callback) { value += chunk.toString(); callback(); } }),
    value: () => value,
  };
}

function expectCode(source, code) {
  assert.throws(
    () => parseSrt(source),
    (error) => error instanceof SrtError && error.code === code && !error.message.includes('private subtitle'),
  );
}

test('parses BOM, CRLF, Unicode multiline text, and integer milliseconds', () => {
  const parsed = parseSrt(Buffer.from(`\uFEFF${basic.replaceAll('\n', '\r\n')}`));
  assert.equal(parsed.schema_version, 1);
  assert.equal(parsed.cue_count, 2);
  assert.deepEqual(parsed.timeline, {
    start_ms: 0,
    end_ms: 3000,
    duration_ms: 3000,
    cue_duration_ms: 3000,
  });
  assert.deepEqual(parsed.cues[1], {
    ordinal: 2,
    id: 2,
    start_ms: 1250,
    end_ms: 3000,
    duration_ms: 1750,
    text: 'World\n第二行',
    lines: ['World', '第二行'],
  });
});

test('LF, CRLF, CR, and BOM equivalents share one content hash', () => {
  const hashes = [
    basic,
    basic.replaceAll('\n', '\r\n'),
    basic.replaceAll('\n', '\r'),
    `\uFEFF${basic}`,
    `${basic}\n\n`,
  ].map((value) => parseSrt(value).content_sha256);
  assert.equal(new Set(hashes).size, 1);
});

test('accepts dot milliseconds and cues without IDs', () => {
  const parsed = parseSrt(`00:00:00.010 --> 00:00:01.020
One

00:00:02.000 --> 00:00:03.000
Two`);
  assert.equal(parsed.cues[0].id, null);
  assert.equal(parsed.cues[0].start_ms, 10);
  assert.equal(parsed.cues[0].end_ms, 1020);
  assert.equal(parsed.timeline.duration_ms, 2990);
  assert.equal(parsed.timeline.cue_duration_ms, 2010);
});

test('allows increasing ID gaps, exact boundaries, time gaps, and multi-digit hours', () => {
  const parsed = parseSrt(`10
100:00:00,000 --> 100:00:01,000
A

20
100:00:01,000 --> 100:00:02,000
B

30
100:00:03,000 --> 100:00:04,000
C`);
  assert.deepEqual(parsed.cues.map((cue) => cue.id), [10, 20, 30]);
  assert.equal(parsed.cues[0].start_ms, 360000000);
  assert.equal(parsed.timeline.duration_ms, 4000);
  assert.equal(parsed.timeline.cue_duration_ms, 3000);
});

test('timestamp parser enforces exact fields and safe integer range', () => {
  assert.equal(parseTimestamp('00:00:00,000'), 0);
  assert.equal(parseTimestamp('12:34:56.789'), 45296789);
  for (const value of ['0:00:00,000', '00:60:00,000', '00:00:60,000', '00:00:00,00', '-1:00:00,000']) {
    assert.throws(() => parseTimestamp(value), (error) => error.code === 'invalid_timestamp');
  }
  assert.throws(
    () => parseTimestamp('999999999999999999999:00:00,000'),
    (error) => error.code === 'unsafe_time',
  );
});

test('rejects empty input and cue text', () => {
  expectCode('', 'empty_srt');
  expectCode('\uFEFF\r\n\r\n', 'empty_srt');
  expectCode('1\n00:00:00,000 --> 00:00:01,000\n', 'empty_cue_text');
});

test('rejects mixed, zero, duplicate, and regressing cue IDs', () => {
  expectCode(`1
00:00:00,000 --> 00:00:01,000
A

00:00:01,000 --> 00:00:02,000
B`, 'mixed_cue_ids');
  expectCode(`0
00:00:00,000 --> 00:00:01,000
A`, 'invalid_cue_id');
  expectCode(`1
00:00:00,000 --> 00:00:01,000
A

1
00:00:01,000 --> 00:00:02,000
B`, 'cue_id_order');
  expectCode(`2
00:00:00,000 --> 00:00:01,000
A

1
00:00:01,000 --> 00:00:02,000
B`, 'cue_id_order');
});

test('rejects unsafe cue IDs', () => {
  expectCode(`999999999999999999999
00:00:00,000 --> 00:00:01,000
A`, 'unsafe_cue_id');
});

test('rejects malformed arrows, fields, precision, and trailing settings', () => {
  for (const timeLine of [
    '00:00:00,000 -> 00:00:01,000',
    '00:00:00,00 --> 00:00:01,000',
    '00:61:00,000 --> 00:62:00,000',
    '00:00:00,000 --> 00:00:01,000 position:50%',
    'private subtitle',
  ]) {
    expectCode(`1\n${timeLine}\nText`, 'invalid_time_line');
  }
});

test('rejects zero, negative-order, overlapping, and regressing windows', () => {
  expectCode(`1
00:00:01,000 --> 00:00:01,000
A`, 'invalid_window');
  expectCode(`1
00:00:02,000 --> 00:00:01,000
A`, 'invalid_window');
  expectCode(`1
00:00:00,000 --> 00:00:02,000
A

2
00:00:01,000 --> 00:00:03,000
B`, 'cue_overlap');
  expectCode(`1
00:00:05,000 --> 00:00:06,000
A

2
00:00:04,000 --> 00:00:05,000
B`, 'time_regression');
});

test('rejects invalid UTF-8 and NUL without including content', () => {
  expectCode(Buffer.from([0xc3, 0x28]), 'invalid_encoding');
  expectCode('1\n00:00:00,000 --> 00:00:01,000\nprivate subtitle\0', 'invalid_encoding');
});

test('parse errors expose stable cue and line but no subtitle body', () => {
  try {
    parseSrt(`1
00:00:00,000 --> 00:00:01,000
Okay

2
broken private subtitle
Sensitive body`);
    assert.fail('expected parse error');
  } catch (error) {
    assert.equal(error.code, 'invalid_time_line');
    assert.equal(error.cue, 2);
    assert.equal(error.line, 6);
    assert.doesNotMatch(error.message, /private subtitle|Sensitive body/);
  }
});

test('bounded stdin returns bytes and rejects oversized input', async () => {
  assert.equal((await readBoundedInput(Readable.from(['abc', 'def']), 6)).toString(), 'abcdef');
  await assert.rejects(readBoundedInput(Readable.from(['abcdef']), 5), (error) => error.code === 'input_too_large');
});

test('argument parser accepts one file or stdin and rejects ambiguity', () => {
  assert.deepEqual(parseSrtArgs(['--help']), { help: true });
  assert.deepEqual(parseSrtArgs(['video.srt']), { input: 'video.srt', pretty: false });
  assert.deepEqual(parseSrtArgs(['-', '--pretty']), { input: '-', pretty: true });
  for (const argv of [[], ['a.srt', 'b.srt'], ['a.srt', '--json'], ['a.srt', '--pretty', '--pretty']]) {
    assert.equal(parseSrtArgs(argv).error, true);
  }
});

test('CLI success serializes without a path and has stable help/usage exits', async () => {
  const stdout = capture();
  const stderr = capture();
  const code = await runSrtCli(['/private/project/subtitles.srt', '--pretty'], {
    stdout: stdout.stream,
    stderr: stderr.stream,
    readFile: async () => Buffer.from(basic),
  });
  assert.equal(code, 0);
  assert.equal(JSON.parse(stdout.value()).cue_count, 2);
  assert.doesNotMatch(stdout.value(), /private\/project/);
  assert.equal(stderr.value(), '');

  const help = capture();
  assert.equal(await runSrtCli(['--help'], { stdout: help.stream }), 0);
  assert.match(help.value(), /Usage:/);
  const invalid = capture();
  assert.equal(await runSrtCli([], { stderr: invalid.stream }), 64);
});

test('CLI parse, stdin-size, and read failures are safe and stable', async () => {
  const parseErr = capture();
  assert.equal(await runSrtCli(['bad.srt'], {
    stderr: parseErr.stream,
    readFile: async () => Buffer.from('private subtitle'),
  }), 2);
  assert.equal(parseErr.value().includes('private subtitle'), false);
  assert.equal(JSON.parse(parseErr.value()).error.code, 'invalid_time_line');

  const stdinErr = capture();
  assert.equal(await runSrtCli(['-'], {
    stderr: stdinErr.stream,
    stdin: Readable.from([Buffer.alloc(20 * 1024 * 1024 + 1)]),
  }), 2);
  assert.equal(JSON.parse(stdinErr.value()).error.code, 'input_too_large');

  const readErr = capture();
  assert.equal(await runSrtCli(['/private/input.srt'], {
    stderr: readErr.stream,
    readFile: async () => { throw new Error('/private/input.srt cannot open'); },
  }), 3);
  assert.equal(readErr.value().includes('/private/input.srt'), false);
  assert.equal(JSON.parse(readErr.value()).error.code, 'read_failed');
});
