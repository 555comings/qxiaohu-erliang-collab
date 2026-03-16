import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const REPO_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const NODE_COMMAND = process.env.NODE_BINARY || process.execPath;

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

test('heartbeat-check marks lastSeen and reports ack state', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'coordination-cli-test-'));
  const statePath = path.join(tempRoot, 'state.json');
  const handoffPath = path.join(tempRoot, 'handoff.md');

  const state = {
    version: 2,
    project: 'control-center-phase0',
    revision: 3,
    status: 'planned',
    updatedAt: '2026-03-16T00:00:00.000Z',
    lastUpdatedBy: 'erliang',
    ackRequired: true,
    slaMinutes: 180,
    nextOwnerKey: 'qxiaohu',
    nextOwnerLabel: 'Q xiaohu',
    actors: {
      qxiaohu: { label: 'Q xiaohu' },
      erliang: { label: 'Erliang' }
    },
    lastSeenBy: {},
    lastAckBy: {
      qxiaohu: { revision: 2, at: '2026-03-16T00:00:00.000Z' }
    }
  };

  try {
    await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    await writeFile(handoffPath, '# Handoff\n\n## [handoff] 2026-03-16 10:00\n- Change: benchmark adapter planned\n', 'utf8');

    const run = await runNode([
      'scripts/control_center_phase0_coordination_cli.mjs',
      'heartbeat-check',
      'qxiaohu',
      statePath,
      handoffPath
    ]);

    const parsed = JSON.parse(run.stdout);
    const written = JSON.parse(await readFile(statePath, 'utf8'));

    assert.equal(parsed.needsAck, true);
    assert.equal(parsed.isNextOwner, true);
    assert.equal(parsed.latestHandoff, 'benchmark adapter planned');
    assert.equal(written.lastSeenBy.qxiaohu.revision, 3);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('ack records current revision for the actor', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'coordination-cli-ack-test-'));
  const statePath = path.join(tempRoot, 'state.json');

  const state = {
    version: 2,
    project: 'control-center-phase0',
    revision: 5,
    status: 'in_progress',
    updatedAt: '2026-03-16T00:00:00.000Z',
    lastUpdatedBy: 'qxiaohu',
    ackRequired: true,
    slaMinutes: 180,
    nextOwnerKey: 'erliang',
    nextOwnerLabel: 'Erliang',
    actors: {
      qxiaohu: { label: 'Q xiaohu' },
      erliang: { label: 'Erliang' }
    },
    lastSeenBy: {},
    lastAckBy: {}
  };

  try {
    await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');

    const run = await runNode([
      'scripts/control_center_phase0_coordination_cli.mjs',
      'ack',
      'erliang',
      statePath
    ]);

    const parsed = JSON.parse(run.stdout);
    const written = JSON.parse(await readFile(statePath, 'utf8'));

    assert.equal(parsed.ack.revision, 5);
    assert.equal(written.lastAckBy.erliang.revision, 5);
    assert.equal(written.lastSeenBy.erliang.revision, 5);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
