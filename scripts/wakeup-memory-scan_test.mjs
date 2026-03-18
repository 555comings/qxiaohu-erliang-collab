import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const REPO_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const NODE_COMMAND = process.env.NODE_BINARY || process.execPath;

function runNodeResult(args, cwd = REPO_ROOT) {
  return new Promise((resolve, reject) => {
    const child = spawn(NODE_COMMAND, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

async function seedRepo(root, { omit = [] } = {}) {
  const files = {
    'memory/shared-startup-context.md': '# Shared Startup Context\n\nRead shared files first.\n',
    'memory/shared-collab-rules.json': JSON.stringify({
      startup: {
        readFirst: [
          'memory/shared-startup-context.md',
          'notes/memory-continuity-handoff.md',
          'notes/memory-continuity-state.json'
        ],
        defaultRecoveryCommand: 'node scripts/wakeup-memory-scan.mjs recover --brief'
      }
    }, null, 2) + '\n',
    'memory/shared-active-state.json': JSON.stringify({
      activeFocus: [
        {
          id: 'shared-startup-chain',
          summary: 'Make startup read shared files first.'
        }
      ],
      openLoops: [
        {
          id: 'shared-active-state-hook',
          summary: 'Require a short recovery confirmation.',
          nextAction: 'Run the wakeup recovery command and report the active focus.'
        }
      ],
      doNow: ['Read shared startup files first.'],
      doNotDo: ['Do not guess missing paths.']
    }, null, 2) + '\n',
    'notes/memory-continuity-handoff.md': '# Memory Continuity Handoff\n\n## Entries\n## [handoff] 2026-03-19 05:00\n- Who: Q xiaohu\n- Change: Added the shared startup recovery command.\n- Artifacts: `scripts/wakeup-memory-scan.mjs`\n- Next Owner: Erliang\n',
    'notes/memory-continuity-state.json': JSON.stringify({
      currentSlice: {
        name: 'shared-startup-hook',
        status: 'implemented'
      },
      nextOwnerKey: 'erliang',
      supportOwnerKey: 'qxiaohu'
    }, null, 2) + '\n',
    'notes/p1-skills-recall-input.md': '# P1\n\nSkills recall input ready.\n',
    'notes/p2-mcp-activation-input.md': '# P2\n\nMCP activation input ready.\n'
  };

  for (const [relativePath, content] of Object.entries(files)) {
    if (omit.includes(relativePath)) {
      continue;
    }
    const fullPath = path.join(root, ...relativePath.split('/'));
    await import('node:fs/promises').then(({ mkdir }) => mkdir(path.dirname(fullPath), { recursive: true }));
    await writeFile(fullPath, content, 'utf8');
  }
}

test('recover returns shared startup summary when all files exist', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'wakeup-memory-scan-success-'));
  try {
    await seedRepo(tempRoot);
    const run = await runNodeResult([
      'scripts/wakeup-memory-scan.mjs',
      'recover',
      '--repo-root',
      tempRoot
    ]);

    assert.equal(run.code, 0);
    const parsed = JSON.parse(run.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.summary.currentSlice, 'shared-startup-hook');
    assert.equal(parsed.summary.nextOwner, 'erliang');
    assert.deepEqual(parsed.summary.activeFocus, ['Make startup read shared files first.']);
    assert.equal(parsed.summary.openLoops[0].nextAction, 'Run the wakeup recovery command and report the active focus.');
    assert.match(parsed.recoveryConfirmation, /Default startup command/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('recover stops and reports missing shared startup paths', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'wakeup-memory-scan-missing-'));
  try {
    await seedRepo(tempRoot, { omit: ['notes/memory-continuity-state.json'] });
    const run = await runNodeResult([
      'scripts/wakeup-memory-scan.mjs',
      'recover',
      '--repo-root',
      tempRoot
    ]);

    assert.equal(run.code, 2);
    const parsed = JSON.parse(run.stdout);
    assert.equal(parsed.ok, false);
    assert.deepEqual(parsed.missingPaths, ['notes/memory-continuity-state.json']);
    assert.match(parsed.nextAction, /stop guessing/i);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('recover --brief prints a single shared startup summary line', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'wakeup-memory-scan-brief-'));
  try {
    await seedRepo(tempRoot);
    const run = await runNodeResult([
      'scripts/wakeup-memory-scan.mjs',
      'recover',
      '--repo-root',
      tempRoot,
      '--brief'
    ]);

    assert.equal(run.code, 0);
    assert.match(run.stdout.trim(), /^RECOVERED \| shared-startup-hook \| focus=1 \| loops=1 \| next=erliang \| do=Read shared startup files first\.$/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
