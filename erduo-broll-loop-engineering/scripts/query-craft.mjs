#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCraftCatalog } from './craft-catalog.mjs';

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultCatalog = path.join(skillRoot, 'references', 'craft', 'catalog.json');

function compactEntry(entry) {
  return { id: entry.id, category: entry.category, intent: entry.intent, compositionFamily: entry.compositionFamily };
}

export function queryCraft(catalog, options) {
  validateCraftCatalog(catalog);
  if (options.summary) {
    return {
      schemaVersion: catalog.schemaVersion,
      entries: catalog.entries.length,
      categories: catalog.categories.map((category) => ({
        category,
        entries: catalog.entries.filter((entry) => entry.category === category).length,
      })),
    };
  }
  let candidates = catalog.entries;
  if (options.category) {
    if (!catalog.categories.includes(options.category)) throw new Error(`unknown category ${options.category}`);
    candidates = candidates.filter((entry) => entry.category === options.category);
  }
  if (options.search) {
    const tokens = options.search.toLocaleLowerCase().trim().split(/\s+/u).filter(Boolean);
    if (!tokens.length) throw new Error('--search requires non-whitespace text');
    candidates = candidates.filter((entry) => {
      const text = Object.values(entry).flat().join(' ').toLocaleLowerCase();
      return tokens.every((token) => text.includes(token));
    });
  }
  if (options.entry) {
    const selected = catalog.entries.find((entry) => entry.id === options.entry);
    if (!selected) throw new Error(`unknown craft entry ${options.entry}`);
    return selected;
  }
  return { count: candidates.length, results: candidates.map(compactEntry) };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--summary') {
      if (options.summary) throw new Error('duplicate --summary');
      options.summary = true;
      continue;
    }
    if (!['--category', '--search', '--entry', '--catalog'].includes(arg)) throw new Error(`unknown argument ${arg}`);
    if (options[arg.slice(2)] !== undefined) throw new Error(`duplicate ${arg}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`);
    options[arg.slice(2)] = value;
    index += 1;
  }
  const actions = [options.summary, options.category, options.search, options.entry].filter(Boolean).length;
  if (actions !== 1) throw new Error('choose exactly one of --summary, --category, --search, or --entry');
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const catalog = JSON.parse(await readFile(path.resolve(options.catalog ?? defaultCatalog), 'utf8'));
  process.stdout.write(`${JSON.stringify(queryCraft(catalog, options), null, options.entry ? 2 : 0)}\n`);
}

if (process.argv[1] && realpathSync(path.resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) {
  main().catch((error) => { process.stderr.write(`query-craft: ${error.message}\n`); process.exitCode = 1; });
}
