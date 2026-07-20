#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { TextDecoder } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const MAX_INPUT_BYTES = 20 * 1024 * 1024;
const EXIT_PARSE = 2;
const EXIT_READ = 3;
const EXIT_USAGE = 64;
const EXIT_INTERNAL = 70;

export class SrtError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'SrtError';
    this.code = code;
    if (details.cue !== undefined) this.cue = details.cue;
    if (details.line !== undefined) this.line = details.line;
  }
}

function parseInteger(value, code, message, details) {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new SrtError(code, message, details);
  return number;
}

export function parseTimestamp(value, details = {}) {
  const match = /^(\d{2,}):([0-5]\d):([0-5]\d)(?:,|\.)(\d{3})$/u.exec(value);
  if (!match) {
    throw new SrtError('invalid_timestamp', 'Timestamp must use HH:MM:SS,mmm or HH:MM:SS.mmm.', details);
  }
  const hours = parseInteger(match[1], 'unsafe_time', 'Timestamp exceeds the safe integer range.', details);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const milliseconds = Number(match[4]);
  const total = ((hours * 60 + minutes) * 60 + seconds) * 1000 + milliseconds;
  if (!Number.isSafeInteger(total)) {
    throw new SrtError('unsafe_time', 'Timestamp exceeds the safe integer range.', details);
  }
  return total;
}

function decodeUtf8(input) {
  if (typeof input === 'string') return input;
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new SrtError('invalid_encoding', 'SRT input must be valid UTF-8.');
  }
}

function normalizeContent(input) {
  let text = decodeUtf8(input);
  if (text.startsWith('\uFEFF')) text = text.slice(1);
  text = text.replace(/\r\n?/gu, '\n');
  if (text.includes('\0')) throw new SrtError('invalid_encoding', 'SRT input contains a NUL character.');
  return text;
}

function errorDetails(ordinal, line) {
  return { cue: ordinal, line };
}

export function parseSrt(input) {
  const inputBytes = typeof input === 'string' ? Buffer.byteLength(input, 'utf8') : Buffer.byteLength(input);
  if (inputBytes > MAX_INPUT_BYTES) throw new SrtError('input_too_large', 'SRT input is too large.');
  const normalized = normalizeContent(input);
  if (!normalized.trim()) throw new SrtError('empty_srt', 'SRT input contains no cues.');

  const lines = normalized.split('\n');
  const blocks = [];
  let cursor = 0;
  while (cursor < lines.length) {
    while (cursor < lines.length && lines[cursor].trim() === '') cursor += 1;
    if (cursor >= lines.length) break;
    const startLine = cursor + 1;
    const block = [];
    while (cursor < lines.length && lines[cursor].trim() !== '') {
      block.push(lines[cursor]);
      cursor += 1;
    }
    blocks.push({ lines: block, startLine });
  }
  if (blocks.length === 0) throw new SrtError('empty_srt', 'SRT input contains no cues.');

  const cues = [];
  let idMode;
  let previousId = null;
  let previousStart = null;
  let previousEnd = null;

  for (let index = 0; index < blocks.length; index += 1) {
    const ordinal = index + 1;
    const block = blocks[index];
    let offset = 0;
    let id = null;
    const hasId = /^\d+$/u.test(block.lines[0]);
    if (idMode === undefined) idMode = hasId;
    if (hasId !== idMode) {
      throw new SrtError('mixed_cue_ids', 'Either every cue must use a numeric ID or none may use one.', errorDetails(ordinal, block.startLine));
    }
    if (hasId) {
      id = parseInteger(block.lines[0], 'unsafe_cue_id', 'Cue ID exceeds the safe integer range.', errorDetails(ordinal, block.startLine));
      if (id <= 0) throw new SrtError('invalid_cue_id', 'Cue ID must be a positive integer.', errorDetails(ordinal, block.startLine));
      if (previousId !== null && id <= previousId) {
        throw new SrtError('cue_id_order', 'Cue IDs must be unique and strictly increasing.', errorDetails(ordinal, block.startLine));
      }
      previousId = id;
      offset = 1;
    }

    const timeLineNumber = block.startLine + offset;
    const timeLine = block.lines[offset];
    if (timeLine === undefined) {
      throw new SrtError('missing_timestamp', 'Cue is missing its timestamp line.', errorDetails(ordinal, timeLineNumber));
    }
    const timeMatch = /^(\d{2,}:[0-5]\d:[0-5]\d(?:,|\.)\d{3})\s+-->\s+(\d{2,}:[0-5]\d:[0-5]\d(?:,|\.)\d{3})$/u.exec(timeLine);
    if (!timeMatch) {
      throw new SrtError('invalid_time_line', 'Cue timestamp line is malformed or contains trailing settings.', errorDetails(ordinal, timeLineNumber));
    }
    const startMs = parseTimestamp(timeMatch[1], errorDetails(ordinal, timeLineNumber));
    const endMs = parseTimestamp(timeMatch[2], errorDetails(ordinal, timeLineNumber));
    if (endMs <= startMs) {
      throw new SrtError('invalid_window', 'Cue end time must be greater than its start time.', errorDetails(ordinal, timeLineNumber));
    }
    if (previousStart !== null && startMs < previousStart) {
      throw new SrtError('time_regression', 'Cue start times must be monotonic.', errorDetails(ordinal, timeLineNumber));
    }
    if (previousEnd !== null && startMs < previousEnd) {
      throw new SrtError('cue_overlap', 'Cue windows must not overlap.', errorDetails(ordinal, timeLineNumber));
    }

    const textLines = block.lines.slice(offset + 1);
    if (textLines.length === 0 || textLines.every((line) => line.trim() === '')) {
      throw new SrtError('empty_cue_text', 'Cue text must not be empty.', errorDetails(ordinal, timeLineNumber + 1));
    }

    cues.push({
      ordinal,
      id,
      start_ms: startMs,
      end_ms: endMs,
      duration_ms: endMs - startMs,
      text: textLines.join('\n'),
      lines: textLines,
    });
    previousStart = startMs;
    previousEnd = endMs;
  }

  const canonical = normalized.replace(/\n+$/u, '');
  const startMs = cues[0].start_ms;
  const endMs = cues.at(-1).end_ms;
  return {
    schema_version: 1,
    cue_count: cues.length,
    content_sha256: createHash('sha256').update(canonical, 'utf8').digest('hex'),
    timeline: {
      start_ms: startMs,
      end_ms: endMs,
      duration_ms: endMs - startMs,
      cue_duration_ms: cues.reduce((sum, cue) => sum + cue.duration_ms, 0),
    },
    cues,
  };
}

export async function readBoundedInput(stream, maxBytes = MAX_INPUT_BYTES) {
  const chunks = [];
  let size = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) throw new SrtError('input_too_large', 'SRT input is too large.');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

export function parseSrtArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) return { help: true };
  const prettyCount = argv.filter((value) => value === '--pretty').length;
  const unknownFlags = argv.filter((value) => value.startsWith('-') && value !== '-' && value !== '--pretty');
  const positionals = argv.filter((value) => value === '-' || !value.startsWith('-'));
  if (unknownFlags.length || prettyCount > 1 || positionals.length !== 1 || argv.length !== positionals.length + prettyCount) {
    return { error: true };
  }
  return { input: positionals[0], pretty: prettyCount === 1 };
}

function safeErrorPayload(error) {
  return {
    ok: false,
    error: {
      code: error.code,
      message: error.message,
      ...(error.cue !== undefined ? { cue: error.cue } : {}),
      ...(error.line !== undefined ? { line: error.line } : {}),
    },
  };
}

export async function runSrtCli(argv, adapters = {}) {
  const stdout = adapters.stdout ?? process.stdout;
  const stderr = adapters.stderr ?? process.stderr;
  const stdin = adapters.stdin ?? process.stdin;
  const readFile = adapters.readFile ?? fs.readFile;
  const args = parseSrtArgs(argv);
  if (args.help) {
    stdout.write('Usage: node scripts/parse-srt.mjs <file.srt|-> [--pretty]\n');
    return 0;
  }
  if (args.error) {
    stderr.write('parse-srt: invalid arguments (use --help)\n');
    return EXIT_USAGE;
  }

  let input;
  try {
    input = args.input === '-' ? await readBoundedInput(stdin) : await readFile(args.input);
  } catch (error) {
    if (error instanceof SrtError) {
      stderr.write(`${JSON.stringify(safeErrorPayload(error))}\n`);
      return EXIT_PARSE;
    }
    stderr.write(`${JSON.stringify({ ok: false, error: { code: 'read_failed', message: 'Unable to read SRT input.' } })}\n`);
    return EXIT_READ;
  }

  try {
    const result = parseSrt(input);
    stdout.write(`${JSON.stringify(result, null, args.pretty ? 2 : 0)}\n`);
    return 0;
  } catch (error) {
    if (error instanceof SrtError) {
      stderr.write(`${JSON.stringify(safeErrorPayload(error))}\n`);
      return EXIT_PARSE;
    }
    stderr.write(`${JSON.stringify({ ok: false, error: { code: 'internal_error', message: 'Unexpected SRT parsing failure.' } })}\n`);
    return EXIT_INTERNAL;
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  process.exit(await runSrtCli(process.argv.slice(2)));
}
