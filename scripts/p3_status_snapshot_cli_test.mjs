import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const REPO_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const NODE_COMMAND = process.env.NODE_BINARY || process.execPath;
const FIXTURE_FILES = [
  'scripts/p3_status_snapshot_cli.mjs',
  'scripts/startup_recovery_check.mjs',
  'scripts/skills_recall_preview.mjs',
  'scripts/skills_recall_preview_test.mjs',
  'scripts/mcp_entry_preview.mjs',
  'scripts/mcp_entry_preview_test.mjs',
  'plans/p3-1-startup-recovery-transition-to-skills-recall-v1.md',
  'plans/p3-2-skills-recall-v1.md',
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
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'p3-status-cli-'));

  for (const relativePath of FIXTURE_FILES) {
    const sourcePath = path.join(REPO_ROOT, relativePath);
    const targetPath = path.join(tempRoot, relativePath);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await copyFile(sourcePath, targetPath);
  }

  return tempRoot;
}

test('p3 status snapshot cli reports artifact-only summary', async () => {
  const run = await runNode(['scripts/p3_status_snapshot_cli.mjs', 'status']);
  const parsed = JSON.parse(run.stdout);

  assert.equal(parsed.mode, 'artifact-only');
  assert.equal(parsed.summary.overall, 'single-machine-mainline');
  assert.equal(parsed.summary.current_call, 'P3.1 passed, P3.2 usable, P3.3 implemented.');
  assert.equal(parsed.artifact_status.p31.status, 'passed');
  assert.equal(parsed.artifact_status.p32.status, 'usable');
  assert.equal(parsed.artifact_status.p33.status, 'implemented');
  assert.equal(parsed.artifact_status.snapshot_note, 'notes/p3-status-snapshot-2026-03-19.md');
  assert.equal(parsed.artifact_status.p31.startup_state_summary.open_items, 0);
  assert.equal(parsed.artifact_status.p31.startup_state_summary.error, null);
  assert.ok(Array.isArray(parsed.artifact_status.p32.required_artifacts));
  assert.ok(parsed.artifact_status.p32.required_artifacts.length >= 5);
  assert.ok(parsed.artifact_status.p33.required_artifacts.every((entry) => entry.exists === true));
});

test('p3 status snapshot cli reports live steady-state summary', async () => {
  const run = await runNode(['scripts/p3_status_snapshot_cli.mjs', 'status', '--validate-live']);
  const parsed = JSON.parse(run.stdout);

  assert.equal(parsed.mode, 'artifact-and-live');
  assert.equal(parsed.summary.overall, 'single-machine-mainline');
  assert.equal(parsed.summary.current_call, 'P3.1 passed, P3.2 usable, P3.3 implemented and currently frozen at the zero-server boundary on this machine.');
  assert.equal(parsed.live_validation.checks.p31.status, 'healthy');
  assert.equal(parsed.live_validation.checks.p32.status, 'usable');
  assert.equal(parsed.live_validation.checks.p33.status, 'frozen-zero-server-boundary');
  assert.equal(parsed.live_validation.checks.p33.outcome_reason, 'no-configured-servers');
});

test('missing required P3.1 artifact downgrades P3.1 to needs-review', async () => {
  const tempRoot = await copyFixtureRepo();

  try {
    await rm(path.join(tempRoot, 'notes', 'p3-1-startup-recovery-final-e2e-pass-2026-03-18.md'));
    const run = await runNode(['scripts/p3_status_snapshot_cli.mjs', 'status'], tempRoot);
    const parsed = JSON.parse(run.stdout);

    assert.equal(parsed.artifact_status.p31.status, 'needs-review');
    assert.equal(parsed.summary.overall, 'single-machine-mainline-needs-review');
    assert.equal(parsed.summary.current_call, 'P3.1 needs review, P3.2 usable, P3.3 implemented.');
    assert.equal(parsed.artifact_status.p31.required_artifacts.some((entry) => entry.exists === false), true);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('missing P3.2 helper downgrades summary instead of leaving P3.2 usable', async () => {
  const tempRoot = await copyFixtureRepo();

  try {
    await rm(path.join(tempRoot, 'scripts', 'skills_recall_preview.mjs'));
    const run = await runNode(['scripts/p3_status_snapshot_cli.mjs', 'status'], tempRoot);
    const parsed = JSON.parse(run.stdout);

    assert.equal(parsed.artifact_status.p32.status, 'partial');
    assert.equal(parsed.summary.overall, 'single-machine-mainline-needs-review');
    assert.equal(parsed.summary.current_call, 'P3.1 passed, P3.2 partial, P3.3 implemented.');
    assert.match(parsed.summary.current_call, /P3\.2 partial/);
    assert.doesNotMatch(parsed.summary.current_call, /P3\.2 usable/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('missing startup state file degrades artifact-only mode instead of crashing', async () => {
  const tempRoot = await copyFixtureRepo();

  try {
    await rm(path.join(tempRoot, 'notes', 'startup-recovery-state.json'));
    const run = await runNode(['scripts/p3_status_snapshot_cli.mjs', 'status'], tempRoot);
    const parsed = JSON.parse(run.stdout);

    assert.equal(parsed.artifact_status.p31.status, 'needs-review');
    assert.equal(parsed.summary.overall, 'single-machine-mainline-needs-review');
    assert.equal(parsed.artifact_status.p31.startup_state_summary.total_items, null);
    assert.match(parsed.artifact_status.p31.startup_state_summary.error, /ENOENT/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('corrupt startup state file degrades artifact-only mode instead of crashing', async () => {
  const tempRoot = await copyFixtureRepo();

  try {
    await writeFile(path.join(tempRoot, 'notes', 'startup-recovery-state.json'), '{not-json}\n', 'utf8');
    const run = await runNode(['scripts/p3_status_snapshot_cli.mjs', 'status'], tempRoot);
    const parsed = JSON.parse(run.stdout);

    assert.equal(parsed.artifact_status.p31.status, 'needs-review');
    assert.equal(parsed.summary.overall, 'single-machine-mainline-needs-review');
    assert.equal(parsed.artifact_status.p31.startup_state_summary.done_items, null);
    assert.match(parsed.artifact_status.p31.startup_state_summary.error, /JSON/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
