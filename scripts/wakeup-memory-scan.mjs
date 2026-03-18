#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { access, readFile } from 'node:fs/promises';

const DEFAULT_READ_ORDER = [
  'memory/shared-startup-context.md',
  'memory/shared-collab-rules.json',
  'memory/shared-active-state.json',
  'notes/memory-continuity-handoff.md',
  'notes/memory-continuity-state.json',
  'notes/p1-skills-recall-input.md',
  'notes/p2-mcp-activation-input.md'
];

function usage() {
  console.error([
    'Usage:',
    '  node scripts/wakeup-memory-scan.mjs recover [--repo-root <path>] [--brief]'
  ].join('\n'));
}

function parseArgs(argv) {
  const options = {
    command: 'recover',
    repoRoot: process.cwd(),
    brief: false
  };

  let index = 0;
  if (argv[0] && !argv[0].startsWith('--')) {
    options.command = argv[0];
    index = 1;
  }

  while (index < argv.length) {
    const token = argv[index];
    if (token === '--brief') {
      options.brief = true;
      index += 1;
      continue;
    }

    if (token === '--repo-root') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('Missing value for --repo-root');
      }
      options.repoRoot = path.resolve(value);
      index += 2;
      continue;
    }

    throw new Error(`Unknown option: ${token}`);
  }

  return options;
}

function stripBom(value) {
  return String(value || '').replace(/^\uFEFF/, '');
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function loadText(filePath) {
  return stripBom(await readFile(filePath, 'utf8'));
}

async function loadJson(filePath) {
  return JSON.parse(await loadText(filePath));
}

function normalizePath(value) {
  return String(value || '').replace(/\\/g, '/');
}

function firstMeaningfulLine(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith('#')) || null;
}

function extractLastHandoffChange(text) {
  const matches = [...String(text || '').matchAll(/^- Change:\s*(.+)$/gm)];
  return matches.length > 0 ? matches[matches.length - 1][1].trim() : null;
}

function summarizeActiveFocus(items) {
  return Array.isArray(items)
    ? items.map((item) => item.summary || item.id || 'unknown-focus')
    : [];
}

function summarizeOpenLoops(items) {
  return Array.isArray(items)
    ? items.map((item) => ({
        id: item.id || null,
        summary: item.summary || null,
        nextAction: item.nextAction || null,
        owner: item.owner || null
      }))
    : [];
}

function buildRecoveryConfirmation(summary) {
  const focus = summary.activeFocus[0] || 'no-active-focus';
  const loop = summary.openLoops[0]?.nextAction || summary.openLoops[0]?.summary || 'no-open-loop';
  return [
    `Recovered current slice: ${summary.currentSlice || 'unknown-slice'}.`,
    `Primary focus: ${focus}`,
    `Next action: ${loop}`,
    `Default startup command: ${summary.defaultRecoveryCommand}`
  ].join(' ');
}

function buildBriefOutput(summary) {
  return [
    'RECOVERED',
    summary.currentSlice || 'unknown-slice',
    `focus=${summary.activeFocus.length}`,
    `loops=${summary.openLoops.length}`,
    `next=${summary.nextOwner || 'unknown'}`,
    `do=${summary.doNow[0] || 'none'}`
  ].join(' | ');
}

async function loadSharedStartup(repoRoot) {
  const loaded = {};
  const missingPaths = [];

  for (const relativePath of DEFAULT_READ_ORDER) {
    const fullPath = path.join(repoRoot, ...relativePath.split('/'));
    if (!(await pathExists(fullPath))) {
      missingPaths.push(relativePath);
      continue;
    }

    loaded[relativePath] = relativePath.endsWith('.json')
      ? await loadJson(fullPath)
      : await loadText(fullPath);
  }

  return { loaded, missingPaths };
}

async function commandRecover(options) {
  const { loaded, missingPaths } = await loadSharedStartup(options.repoRoot);
  const result = {
    ok: missingPaths.length === 0,
    mode: 'shared-startup-recovery',
    repoRoot: normalizePath(options.repoRoot),
    readOrder: DEFAULT_READ_ORDER,
    missingPaths
  };

  if (missingPaths.length > 0) {
    result.nextAction = 'Report the missing shared startup path and stop guessing.';
    return result;
  }

  const collabRules = loaded['memory/shared-collab-rules.json'];
  const activeState = loaded['memory/shared-active-state.json'];
  const continuityState = loaded['notes/memory-continuity-state.json'];
  const handoffText = loaded['notes/memory-continuity-handoff.md'];

  const summary = {
    currentSlice: continuityState.currentSlice?.name || null,
    currentSliceStatus: continuityState.currentSlice?.status || null,
    nextOwner: continuityState.nextOwnerKey || null,
    supportOwner: continuityState.supportOwnerKey || null,
    activeFocus: summarizeActiveFocus(activeState.activeFocus),
    openLoops: summarizeOpenLoops(activeState.openLoops),
    doNow: Array.isArray(activeState.doNow) ? activeState.doNow : [],
    doNotDo: Array.isArray(activeState.doNotDo) ? activeState.doNotDo : [],
    startupReadFirst: Array.isArray(collabRules.startup?.readFirst) ? collabRules.startup.readFirst : [],
    defaultRecoveryCommand: collabRules.startup?.defaultRecoveryCommand || 'node scripts/wakeup-memory-scan.mjs recover --brief',
    latestHandoffChange: extractLastHandoffChange(handoffText),
    skillsRecallInput: firstMeaningfulLine(loaded['notes/p1-skills-recall-input.md']),
    mcpActivationInput: firstMeaningfulLine(loaded['notes/p2-mcp-activation-input.md'])
  };

  result.summary = summary;
  result.recoveryConfirmation = buildRecoveryConfirmation(summary);
  return result;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.command === '--help' || options.command === '-h') {
    usage();
    return;
  }

  if (options.command !== 'recover') {
    throw new Error(`Unsupported command: ${options.command}`);
  }

  const result = await commandRecover(options);
  if (options.brief) {
    if (!result.ok) {
      process.stdout.write(`STOP | missing=${result.missingPaths.join(', ')}\n`);
    } else {
      process.stdout.write(`${buildBriefOutput(result.summary)}\n`);
    }
    process.exitCode = result.ok ? 0 : 2;
    return;
  }

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.ok ? 0 : 2;
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
