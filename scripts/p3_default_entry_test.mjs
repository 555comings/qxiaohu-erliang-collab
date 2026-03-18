import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const REPO_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const NODE_COMMAND = process.env.NODE_BINARY || process.execPath;
const FIXTURE_FILES = [
  'scripts/p3_default_entry.mjs',
  'scripts/p3_status_snapshot_cli.mjs',
  'scripts/startup_recovery_check.mjs',
  'scripts/skills_recall_preview.mjs',
  'scripts/mcp_entry_preview.mjs',
  'scripts/mcp_entry_preview_test.mjs',
  'plans/p3-1-startup-recovery-transition-to-skills-recall-v1.md',
  'plans/p3-2-skills-recall-v1.md',
  'plans/p3-2-skills-recall-packet-schema-v1.json',
  'plans/p3-3-mcp-first-packet-entry-v1.md',
  'notes/p3-1-startup-recovery-final-e2e-pass-2026-03-18.md',
  'notes/p3-2-skills-recall-preview-validate-review-dogfood-v1.md',
  'notes/p3-2-skills-recall-operator-flow-v1.md',
  'notes/p3-3-mcp-entry-preview-dogfood-v1.md',
  'notes/p3-3-mcp-zero-server-boundary-v1.md',
  'notes/p3-status-snapshot-2026-03-19.md',
  'notes/startup-recovery-state.json'
];

function runNode(args, cwd = REPO_ROOT) {
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
      if (code !== 0) {
        reject(new Error(stderr || `Process failed with exit code ${code}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function copyFixtureRepo() {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'p3-default-entry-'));

  for (const relativePath of FIXTURE_FILES) {
    const sourcePath = path.join(REPO_ROOT, relativePath);
    const targetPath = path.join(tempRoot, relativePath);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await copyFile(sourcePath, targetPath);
  }

  return tempRoot;
}

test('default entry reports ready on the current single-machine mainline', async () => {
  const run = await runNode(['scripts/p3_default_entry.mjs', 'enter']);
  const parsed = JSON.parse(run.stdout);

  assert.equal(parsed.mode, 'p3-default-entry');
  assert.equal(parsed.readiness, 'ready');
  assert.equal(parsed.report_excerpt.overall, 'single-machine-mainline');
  assert.equal(parsed.report_excerpt.live_p31, 'healthy');
  assert.equal(parsed.report_excerpt.live_p33, 'frozen-zero-server-boundary');
  assert.equal(parsed.report_excerpt.live_p33_reason, 'no-configured-servers');
  assert.deepEqual(parsed.stop_reasons, []);
  assert.ok(Array.isArray(parsed.first_reads));
  assert.ok(parsed.first_reads.includes('notes/p3-default-entry-v1.md'));
});

test('default entry stops when artifact drift is detected in artifact-only mode', async () => {
  const tempRoot = await copyFixtureRepo();

  try {
    await rm(path.join(tempRoot, 'scripts', 'skills_recall_preview.mjs'));
    const run = await runNode(['scripts/p3_default_entry.mjs', 'enter', '--artifact-only'], tempRoot);
    const parsed = JSON.parse(run.stdout);

    assert.equal(parsed.readiness, 'stop');
    assert.equal(parsed.report_excerpt.artifact_p32, 'partial');
    assert.ok(parsed.stop_reasons.includes('top-line status drifted away from single-machine-mainline'));
    assert.ok(parsed.stop_reasons.includes('P3.2 is not usable'));
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('default entry brief mode prints a human-readable ready line', async () => {
  const run = await runNode(['scripts/p3_default_entry.mjs', 'enter', '--brief']);
  const output = run.stdout.trim();

  assert.match(output, /^READY \| single-machine-mainline \| P3\.1 passed/);
  assert.match(output, /P3\.3 implemented and currently frozen at the zero-server boundary on this machine\./);
  assert.match(output, /keep MCP at the inspect-first zero-server boundary\.$/);
});

test('status validate-live does not mutate the tracked startup recovery state file', async () => {
  const statePath = path.join(REPO_ROOT, 'notes', 'startup-recovery-state.json');
  const before = await readFile(statePath, 'utf8');

  await runNode(['scripts/p3_status_snapshot_cli.mjs', 'status', '--validate-live']);

  const after = await readFile(statePath, 'utf8');
  assert.equal(after, before);
});
