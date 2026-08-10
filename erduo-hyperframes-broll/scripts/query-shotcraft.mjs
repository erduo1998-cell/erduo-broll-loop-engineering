#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

function fail(message) {
  process.stderr.write(`query-shotcraft: ${message}\n`);
  process.exit(1);
}

function usage() {
  return [
    "Usage:",
    "  node scripts/query-shotcraft.mjs --stats",
    "  node scripts/query-shotcraft.mjs --list [--category <id>]",
    "  node scripts/query-shotcraft.mjs --search <query> [--category <id>]",
    "  node scripts/query-shotcraft.mjs --card <id> [--style <key>]",
  ].join("\n");
}

function parseArgs(argv) {
  const options = {};
  const switches = new Set(["stats", "list"]);
  const values = new Set(["search", "card", "category", "style"]);

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) {
      fail(`unexpected argument: ${argument}\n${usage()}`);
    }
    const name = argument.slice(2);
    if (switches.has(name)) {
      if (options[name] !== undefined) fail(`duplicate --${name}`);
      options[name] = true;
      continue;
    }
    if (!values.has(name)) {
      fail(`unknown option: --${name}\n${usage()}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      fail(`--${name} requires a value`);
    }
    if (options[name] !== undefined) fail(`duplicate --${name}`);
    options[name] = value;
    index += 1;
  }

  const actions = ["stats", "list", "search", "card"].filter(
    (name) => options[name] !== undefined,
  );
  if (options.style && !options.card) fail("--style requires --card");
  if (actions.length !== 1) fail(`choose exactly one action\n${usage()}`);
  if (options.category && !options.list && !options.search) {
    fail("--category is supported only with --list or --search");
  }
  return options;
}

function compact(text, limit = 120) {
  const normalized = String(text ?? "").replace(/\s+/g, " ").trim();
  return normalized.length <= limit
    ? normalized
    : `${normalized.slice(0, limit - 1)}…`;
}

function concise(card) {
  return {
    name: card.name,
    category: card.category,
    summary: compact(card.summary),
    styles: card.styles.map((style) => style.key),
  };
}

async function writeAndExit(text) {
  await new Promise((resolveWrite, rejectWrite) => {
    process.stdout.write(text, (error) => {
      if (error) rejectWrite(error);
      else resolveWrite();
    });
  });
  process.exit(0);
}

const options = parseArgs(process.argv.slice(2));
const skillRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const shotcraftRoot = resolve(skillRoot, "references", "shotcraft");
const catalogPath = resolve(shotcraftRoot, "catalog.json");
const remotionIndexPath = resolve(
  shotcraftRoot,
  "remotion-sources",
  "index.json",
);

let catalog;
let remotionIndex;
try {
  catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
  remotionIndex = JSON.parse(readFileSync(remotionIndexPath, "utf8"));
} catch (error) {
  fail(`cannot load Shotcraft catalog and Remotion source index: ${error.message}`);
}
if (
  remotionIndex.upstream?.commit !== catalog.upstream?.commit
  || remotionIndex.stats?.cards !== catalog.stats?.cards
) {
  fail("Remotion source index does not match the pinned Shotcraft catalog");
}
const remotionCards = new Map(
  remotionIndex.cards.map((entry) => [entry.name, entry]),
);
if (remotionCards.size !== catalog.stats.cards) {
  fail("Remotion source index does not close over every Shotcraft card");
}

const categories = new Set(catalog.stats.categories.map((item) => item.name));
if (options.category && !categories.has(options.category)) {
  fail(
    `unknown category ${JSON.stringify(options.category)}; expected one of: ${[
      ...categories,
    ].join(", ")}`,
  );
}

if (options.stats) {
  await writeAndExit(
    `${JSON.stringify({
      cards: catalog.stats.cards,
      styles: catalog.stats.styles,
      categories: catalog.stats.categories,
      upstream: catalog.upstream,
      remotionReferenceSources: remotionIndex.stats.sourceFiles,
    })}\n`,
  );
}

let candidates = options.category
  ? catalog.cards.filter((card) => card.category === options.category)
  : catalog.cards;

if (options.list) {
  await writeAndExit(
    `${JSON.stringify({ count: candidates.length, results: candidates.map(concise) })}\n`,
  );
}

if (options.search) {
  const tokens = options.search
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/u)
    .filter(Boolean);
  if (tokens.length === 0) fail("--search requires non-whitespace text");
  const matches = candidates.filter((card) => {
    const searchable = [
      card.name,
      card.summary,
      card.use,
      card.duration,
      card.energy,
      card.intention,
      card.category,
      ...(card.tags ?? []),
      ...card.styles.flatMap((style) => [
        style.key,
        style.label,
        style.description,
        style.use,
      ]),
    ]
      .filter((value) => typeof value === "string")
      .join("\n")
      .toLocaleLowerCase();
    return tokens.every((token) => searchable.includes(token));
  });
  const limit = 20;
  await writeAndExit(
    `${JSON.stringify({
      query: options.search,
      category: options.category ?? null,
      count: matches.length,
      shown: Math.min(matches.length, limit),
      truncated: matches.length > limit,
      results: matches.slice(0, limit).map(concise),
    })}\n`,
  );
}

const card = catalog.cards.find((candidate) => candidate.name === options.card);
if (!card) {
  const suggestions = catalog.cards
    .filter((candidate) => candidate.name.includes(options.card))
    .slice(0, 10)
    .map((candidate) => candidate.name);
  fail(
    `unknown card ${JSON.stringify(options.card)}${
      suggestions.length ? `; possible matches: ${suggestions.join(", ")}` : ""
    }`,
  );
}

const selectedStyles = options.style
  ? card.styles.filter((style) => style.key === options.style)
  : card.styles;
if (options.style && selectedStyles.length === 0) {
  fail(
    `style ${JSON.stringify(options.style)} does not belong to ${card.name}; expected one of: ${card.styles
      .map((style) => style.key)
      .join(", ")}`,
  );
}
const remotionCard = remotionCards.get(card.name);
if (!remotionCard || remotionCard.sources.length === 0) {
  fail(`Remotion source index has no reference source for ${card.name}`);
}

const cardPath = resolve(shotcraftRoot, ...card.localSource.split("/"));
if (!cardPath.startsWith(`${shotcraftRoot}${sep}`)) {
  fail(`catalog localSource escapes the shotcraft directory for ${card.name}`);
}

let markdown;
try {
  markdown = readFileSync(cardPath, "utf8");
} catch (error) {
  fail(`cannot read ${card.localSource}: ${error.message}`);
}

const styleLines = selectedStyles.flatMap((style) => [
  `### ${style.key}`,
  "",
  `- Label: ${style.label}`,
  `- Description: ${style.description}`,
  ...(style.use ? [`- Use: ${style.use}`] : []),
  "",
]);
const header = [
  "# Shotcraft catalog selection",
  "",
  `- Card: ${card.name}`,
  `- Category: ${card.category}`,
  `- Local source: ${card.localSource}`,
  `- Upstream source: ${card.source}`,
  `- Upstream URL: ${card.upstreamUrl}`,
  "",
  "## Pinned Remotion reference sources",
  "",
  ...remotionCard.sources.map(
    (source) => `- references/shotcraft/${source}`,
  ),
  "",
  "Read only these selected-card sources and their required local imports. Replace any media dependency with Assets-stage frozen material; a source listing is not a registered component or render witness.",
  "",
  "## Catalog styles",
  "",
  ...styleLines,
  "## Upstream card body",
  "",
].join("\n");

process.stdout.write(`${header}${markdown}${markdown.endsWith("\n") ? "" : "\n"}`);
