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

function createEmptyState() {
  return {
    version: 'p3.1-v1',
    updatedAt: '2026-03-17T00:00:00.000Z',
    thresholds: {
      intentNoStartMinutes: 15,
      startedNoFollowupMinutes: 20,
      inProgressNoEvidenceMinutes: 45,
      silenceAfterEtaMinutes: 1
    },
    items: []
  };
}

test('create + add-evidence advances promise from intent to in_progress', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'startup-recovery-create-'));
  const statePath = path.join(tempRoot, 'state.json');
  const itemPath = path.join(tempRoot, 'item.json');
  const evidence1Path = path.join(tempRoot, 'evidence-1.json');
  const evidence2Path = path.join(tempRoot, 'evidence-2.json');

  try {
    await writeFile(statePath, `${JSON.stringify(createEmptyState(), null, 2)}\n`, 'utf8');
    await writeFile(itemPath, `${JSON.stringify({
      id: 'p3-wire',
      title: 'Wire startup recovery into heartbeat',
      owner: 'qxiaohu',
      source_kind: 'agent_commitment',
      provenance: {
        speaker: 'qxiaohu',
        direction: 'outbound',
        channel: 'feishu',
        message_at: '2026-03-17T00:00:00.000Z',
        summary: 'I will wire P3.1 into the actual heartbeat flow.'
      }
    }, null, 2)}\n`, 'utf8');

    await runNode(['scripts/startup_recovery_check.mjs', 'create', itemPath, statePath]);

    await writeFile(evidence1Path, `${JSON.stringify({
      type: 'artifact_touched',
      recorded_at: '2026-03-17T00:05:00.000Z',
      summary: 'Created the first draft file.',
      path: 'plans/p3-1-startup-recovery-confirmation-v1.md'
    }, null, 2)}\n`, 'utf8');
    await runNode(['scripts/startup_recovery_check.mjs', 'add-evidence', 'p3-wire', evidence1Path, statePath]);

    await writeFile(evidence2Path, `${JSON.stringify({
      type: 'command_result',
      recorded_at: '2026-03-17T00:07:00.000Z',
      summary: 'Validated the new state file.',
      result: 'ok'
    }, null, 2)}\n`, 'utf8');
    await runNode(['scripts/startup_recovery_check.mjs', 'add-evidence', 'p3-wire', evidence2Path, statePath]);

    const written = JSON.parse(await readFile(statePath, 'utf8'));
    assert.equal(written.items[0].state, 'in_progress');
    assert.equal(written.items[0].evidence.length, 2);
    assert.equal(written.items[0].last_evidence_at, '2026-03-17T00:07:00.000Z');
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('capture-live creates a started promise with first evidence in one command', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'startup-recovery-capture-live-'));
  const statePath = path.join(tempRoot, 'state.json');

  try {
    await writeFile(statePath, `${JSON.stringify(createEmptyState(), null, 2)}\n`, 'utf8');

    const run = await runNode([
      'scripts/startup_recovery_check.mjs',
      'capture-live',
      'qxiaohu',
      'Land live capture helper',
      'Committed to land a one-command live capture path.',
      'Started implementing the live capture helper.',
      '--state-path',
      statePath,
      '--recorded-at',
      '2099-03-17T01:00:00.000Z',
      '--message-at',
      '2099-03-17T00:55:00.000Z',
      '--eta-minutes',
      '20',
      '--notes',
      'Using the one-command capture flow for new work.',
      '--path',
      'scripts/startup_recovery_check.mjs',
      '--command',
      'node scripts/startup_recovery_check.mjs capture-live ...',
      '--expected-artifacts',
      'scripts/startup_recovery_check.mjs,plans/p3-1-startup-recovery-confirmation-v1.md'
    ]);

    const parsed = JSON.parse(run.stdout);
    const written = JSON.parse(await readFile(statePath, 'utf8'));

    assert.equal(parsed.ok, true);
    assert.equal(parsed.created.id, 'qxiaohu-land-live-capture-helper-20990317T010000Z');
    assert.equal(parsed.evidence.result, 'capture_live');
    assert.equal(written.items[0].state, 'started');
    assert.equal(written.items[0].expected_update_by, '2099-03-17T01:20:00.000Z');
    assert.equal(written.items[0].created_at, '2099-03-17T00:55:00.000Z');
    assert.equal(written.items[0].last_evidence_at, '2099-03-17T01:00:00.000Z');
    assert.equal(written.items[0].provenance.direction, 'outbound');
    assert.equal(written.items[0].provenance.channel, 'feishu');
    assert.deepEqual(written.items[0].expected_artifacts, [
      'scripts/startup_recovery_check.mjs',
      'plans/p3-1-startup-recovery-confirmation-v1.md'
    ]);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('resume records manual resume evidence and refreshes eta from relative minutes', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'startup-recovery-resume-'));
  const statePath = path.join(tempRoot, 'state.json');

  const state = createEmptyState();
  state.items = [
    {
      id: 'resume-me',
      title: 'Resume a stalled promise after restart',
      owner: 'qxiaohu',
      source_kind: 'agent_commitment',
      provenance: {
        speaker: 'qxiaohu',
        direction: 'outbound',
        channel: 'feishu',
        message_at: '2026-03-17T00:00:00.000Z'
      },
      created_at: '2026-03-17T00:00:00.000Z',
      state: 'started',
      state_changed_at: '2026-03-17T00:05:00.000Z',
      promise_status: 'pending',
      expected_update_by: '2026-03-17T00:15:00.000Z',
      stall_status: 'stalled',
      stall_reason: 'expected_update_missed',
      notes: 'Old ETA expired.',
      evidence: [
        {
          type: 'session_started',
          recorded_at: '2026-03-17T00:05:00.000Z',
          summary: 'Started the task.'
        }
      ]
    }
  ];

  try {
    await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');

    const run = await runNode([
      'scripts/startup_recovery_check.mjs',
      'resume',
      'resume-me',
      'Resumed execution after the stalled check.',
      '--state-path',
      statePath,
      '--eta-minutes',
      '25',
      '--notes',
      'New ETA synced after restart.',
      '--recorded-at',
      '2099-03-17T00:20:00.000Z',
      '--path',
      'notes/startup-recovery-state.json',
      '--command',
      'node scripts/startup_recovery_check.mjs resume ...'
    ]);

    const parsed = JSON.parse(run.stdout);
    const written = JSON.parse(await readFile(statePath, 'utf8'));

    assert.equal(parsed.ok, true);
    assert.equal(parsed.evidence.type, 'manual_check');
    assert.equal(parsed.evidence.result, 'resume');
    assert.equal(written.items[0].state, 'in_progress');
    assert.equal(written.items[0].expected_update_by, '2099-03-17T00:45:00.000Z');
    assert.equal(written.items[0].notes, 'New ETA synced after restart.');
    assert.equal(written.items[0].last_evidence_at, '2099-03-17T00:20:00.000Z');
    assert.equal(written.items[0].evidence.length, 2);
    assert.equal(written.items[0].stall_status, 'none');
    assert.equal(written.items[0].evidence[1].path, 'notes/startup-recovery-state.json');
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('resume-hottest resumes the hottest open item for one owner', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'startup-recovery-resume-hottest-'));
  const statePath = path.join(tempRoot, 'state.json');

  const state = createEmptyState();
  state.items = [
    {
      id: 'resume-this-one',
      title: 'Most urgent stalled promise',
      owner: 'qxiaohu',
      source_kind: 'agent_commitment',
      provenance: {
        speaker: 'qxiaohu',
        direction: 'outbound',
        channel: 'feishu',
        message_at: '2026-03-17T00:00:00.000Z'
      },
      created_at: '2026-03-17T00:00:00.000Z',
      state: 'in_progress',
      state_changed_at: '2026-03-17T00:10:00.000Z',
      promise_status: 'pending',
      stall_status: 'none',
      notes: 'Needs restart recovery.',
      evidence: [
        {
          type: 'artifact_touched',
          recorded_at: '2026-03-17T00:10:00.000Z',
          summary: 'Touched the live work artifact.',
          path: 'plans/p3-1-startup-recovery-confirmation-v1.md'
        }
      ]
    },
    {
      id: 'other-owner-item',
      title: 'Stalled item for another owner',
      owner: 'erliang',
      source_kind: 'agent_commitment',
      provenance: {
        speaker: 'erliang',
        direction: 'outbound',
        channel: 'feishu',
        message_at: '2026-03-17T00:00:00.000Z'
      },
      created_at: '2026-03-17T00:00:00.000Z',
      state: 'in_progress',
      state_changed_at: '2026-03-17T00:10:00.000Z',
      promise_status: 'pending',
      stall_status: 'none',
      notes: '',
      evidence: [
        {
          type: 'artifact_touched',
          recorded_at: '2026-03-17T00:10:00.000Z',
          summary: 'Another owner touched a different artifact.',
          path: 'notes/other-state.json'
        }
      ]
    },
    {
      id: 'quiet-qxiaohu-item',
      title: 'Less urgent fresh work',
      owner: 'qxiaohu',
      source_kind: 'agent_commitment',
      provenance: {
        speaker: 'qxiaohu',
        direction: 'outbound',
        channel: 'feishu',
        message_at: '2099-03-17T00:45:00.000Z'
      },
      created_at: '2099-03-17T00:45:00.000Z',
      state: 'started',
      state_changed_at: '2099-03-17T00:50:00.000Z',
      promise_status: 'pending',
      stall_status: 'none',
      notes: '',
      evidence: [
        {
          type: 'session_started',
          recorded_at: '2099-03-17T00:50:00.000Z',
          summary: 'Started newer work.'
        }
      ]
    }
  ];

  try {
    await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');

    const run = await runNode([
      'scripts/startup_recovery_check.mjs',
      'resume-hottest',
      'qxiaohu',
      'Resumed the hottest stalled work after restart.',
      '--state-path',
      statePath,
      '--eta-minutes',
      '30',
      '--recorded-at',
      '2099-03-17T01:00:00.000Z',
      '--notes',
      'Back in active execution.'
    ]);

    const parsed = JSON.parse(run.stdout);
    const written = JSON.parse(await readFile(statePath, 'utf8'));

    assert.equal(parsed.ok, true);
    assert.equal(parsed.selected.id, 'resume-this-one');
    assert.equal(parsed.considered.length, 2);
    assert.equal(written.items[0].expected_update_by, '2099-03-17T01:30:00.000Z');
    assert.equal(written.items[0].last_evidence_at, '2099-03-17T01:00:00.000Z');
    assert.equal(written.items[0].stall_status, 'none');
    assert.equal(written.items[0].notes, 'Back in active execution.');
    assert.equal(written.items[0].evidence.length, 2);
    assert.equal(written.items[2].evidence.length, 1);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('heartbeat-check marks stale intent and stale in-progress items', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'startup-recovery-heartbeat-'));
  const statePath = path.join(tempRoot, 'state.json');

  const state = createEmptyState();
  state.items = [
    {
      id: 'intent-old',
      title: 'Old promise without start evidence',
      owner: 'qxiaohu',
      source_kind: 'agent_commitment',
      provenance: {
        speaker: 'qxiaohu',
        direction: 'outbound',
        channel: 'feishu',
        message_at: '2026-03-16T00:00:00.000Z'
      },
      created_at: '2026-03-16T00:00:00.000Z',
      state: 'intent',
      state_changed_at: '2026-03-16T00:00:00.000Z',
      promise_status: 'pending',
      stall_status: 'none',
      notes: '',
      evidence: []
    },
    {
      id: 'progress-stale',
      title: 'Work went silent after it started',
      owner: 'qxiaohu',
      source_kind: 'agent_commitment',
      provenance: {
        speaker: 'qxiaohu',
        direction: 'outbound',
        channel: 'feishu',
        message_at: '2026-03-16T00:00:00.000Z'
      },
      created_at: '2026-03-16T00:00:00.000Z',
      state: 'in_progress',
      state_changed_at: '2026-03-16T00:10:00.000Z',
      promise_status: 'pending',
      stall_status: 'none',
      notes: '',
      evidence: [
        {
          type: 'artifact_touched',
          recorded_at: '2026-03-16T00:10:00.000Z',
          summary: 'Touched the target artifact.',
          path: 'plans/p3-1-startup-recovery-confirmation-v1.md'
        }
      ]
    }
  ];

  try {
    await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    const run = await runNode(['scripts/startup_recovery_check.mjs', 'heartbeat-check', 'qxiaohu', statePath]);
    const parsed = JSON.parse(run.stdout);
    const written = JSON.parse(await readFile(statePath, 'utf8'));

    assert.equal(parsed.shouldAlert, true);
    assert.equal(parsed.watchCount, 1);
    assert.equal(parsed.stalledCount, 1);
    assert.equal(written.items[0].stall_status, 'watch');
    assert.equal(written.items[0].stall_reason, 'intent_without_start');
    assert.equal(written.items[1].stall_status, 'stalled');
    assert.equal(written.items[1].stall_reason, 'in_progress_silence');
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('doctor flags open items that need a fresh ETA or follow-up evidence', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'startup-recovery-doctor-alert-'));
  const statePath = path.join(tempRoot, 'state.json');

  const state = createEmptyState();
  state.items = [
    {
      id: 'doctor-me',
      title: 'Track the bounded startup recovery pass',
      owner: 'qxiaohu',
      source_kind: 'agent_commitment',
      provenance: {
        speaker: 'qxiaohu',
        direction: 'outbound',
        channel: 'feishu',
        message_at: '2026-03-17T00:00:00.000Z'
      },
      created_at: '2026-03-17T00:00:00.000Z',
      state: 'in_progress',
      state_changed_at: '2026-03-17T00:10:00.000Z',
      promise_status: 'pending',
      stall_status: 'none',
      notes: 'Forgot to refresh the ETA and second evidence.',
      evidence: [
        {
          type: 'artifact_touched',
          recorded_at: '2026-03-17T00:10:00.000Z',
          summary: 'Touched the startup recovery plan.',
          path: 'plans/p3-1-startup-recovery-confirmation-v1.md'
        }
      ]
    }
  ];

  try {
    await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    const run = await runNode(['scripts/startup_recovery_check.mjs', 'doctor', 'qxiaohu', statePath]);
    const parsed = JSON.parse(run.stdout);

    assert.equal(parsed.ok, false);
    assert.equal(parsed.errorCount, 1);
    assert.equal(parsed.warningCount, 1);
    assert.equal(parsed.nextAction.kind, 'resume-hottest');
    assert.match(parsed.nextAction.command, /resume-hottest/);
    assert.deepEqual(parsed.issues.map((issue) => issue.code).sort(), [
      'in_progress_requires_followup_evidence',
      'missing_expected_update_by'
    ]);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('doctor marks stalled but structurally valid work as needing recovery', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'startup-recovery-doctor-stalled-'));
  const statePath = path.join(tempRoot, 'state.json');

  const state = createEmptyState();
  state.items = [
    {
      id: 'stalled-work',
      title: 'Resume the hottest tracked promise after the ETA slips',
      owner: 'qxiaohu',
      source_kind: 'agent_commitment',
      provenance: {
        speaker: 'qxiaohu',
        direction: 'outbound',
        channel: 'feishu',
        message_at: '2026-03-17T00:00:00.000Z'
      },
      created_at: '2026-03-17T00:00:00.000Z',
      state: 'in_progress',
      state_changed_at: '2026-03-17T00:10:00.000Z',
      promise_status: 'pending',
      expected_update_by: '2026-03-17T00:20:00.000Z',
      stall_status: 'none',
      notes: 'Structurally fine, but the ETA is already old.',
      evidence: [
        {
          type: 'session_started',
          recorded_at: '2026-03-17T00:05:00.000Z',
          summary: 'Started the bounded pass.'
        },
        {
          type: 'command_result',
          recorded_at: '2026-03-17T00:15:00.000Z',
          summary: 'Validated the last bounded edit.',
          result: 'ok'
        }
      ]
    }
  ];

  try {
    await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    const run = await runNode(['scripts/startup_recovery_check.mjs', 'doctor', 'qxiaohu', statePath]);
    const parsed = JSON.parse(run.stdout);

    assert.equal(parsed.ok, false);
    assert.equal(parsed.issueCount, 0);
    assert.equal(parsed.alertCount, 1);
    assert.equal(parsed.summary.shouldAlert, true);
    assert.equal(parsed.nextAction.kind, 'resume-hottest');
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('doctor stays clean and points back to heartbeat when tracked work is healthy', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'startup-recovery-doctor-clean-'));
  const statePath = path.join(tempRoot, 'state.json');

  const state = createEmptyState();
  state.items = [
    {
      id: 'healthy-work',
      title: 'Keep the shared startup recovery flow healthy',
      owner: 'qxiaohu',
      source_kind: 'agent_commitment',
      provenance: {
        speaker: 'qxiaohu',
        direction: 'outbound',
        channel: 'feishu',
        message_at: '2099-03-17T00:00:00.000Z'
      },
      created_at: '2099-03-17T00:00:00.000Z',
      state: 'in_progress',
      state_changed_at: '2099-03-17T00:10:00.000Z',
      promise_status: 'pending',
      expected_update_by: '2099-03-17T00:40:00.000Z',
      stall_status: 'none',
      notes: 'Actively progressing.',
      evidence: [
        {
          type: 'session_started',
          recorded_at: '2099-03-17T00:05:00.000Z',
          summary: 'Started the bounded pass.'
        },
        {
          type: 'command_result',
          recorded_at: '2099-03-17T00:15:00.000Z',
          summary: 'Validated the latest edit.',
          command: 'node --test scripts/startup_recovery_check_test.mjs',
          result: 'ok'
        }
      ]
    }
  ];

  try {
    await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    const run = await runNode(['scripts/startup_recovery_check.mjs', 'doctor', 'qxiaohu', statePath]);
    const parsed = JSON.parse(run.stdout);

    assert.equal(parsed.ok, true);
    assert.equal(parsed.issueCount, 0);
    assert.equal(parsed.nextAction.kind, 'monitor');
    assert.match(parsed.nextAction.command, /heartbeat-check/);
    assert.equal(parsed.completionPath.kind, 'resolve-hottest');
    assert.match(parsed.completionPath.command, /resolve-hottest/);
    assert.equal(parsed.summary.openCount, 1);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('doctor --apply-resume refreshes the hottest stalled work in one command', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'startup-recovery-doctor-apply-'));
  const statePath = path.join(tempRoot, 'state.json');

  const state = createEmptyState();
  state.items = [
    {
      id: 'recover-me',
      title: 'Recover the default startup path after a restart',
      owner: 'qxiaohu',
      source_kind: 'agent_commitment',
      provenance: {
        speaker: 'qxiaohu',
        direction: 'outbound',
        channel: 'feishu',
        message_at: '2026-03-17T00:00:00.000Z'
      },
      created_at: '2026-03-17T00:00:00.000Z',
      state: 'in_progress',
      state_changed_at: '2026-03-17T00:10:00.000Z',
      promise_status: 'pending',
      expected_update_by: '2026-03-17T00:20:00.000Z',
      stall_status: 'none',
      notes: 'ETA already slipped.',
      evidence: [
        {
          type: 'session_started',
          recorded_at: '2026-03-17T00:05:00.000Z',
          summary: 'Started the bounded pass.'
        },
        {
          type: 'command_result',
          recorded_at: '2026-03-17T00:15:00.000Z',
          summary: 'Validated the last bounded edit.',
          result: 'ok'
        }
      ]
    }
  ];

  try {
    await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    const run = await runNode([
      'scripts/startup_recovery_check.mjs',
      'doctor',
      'qxiaohu',
      statePath,
      '--apply-resume',
      '--summary',
      'Resumed execution from the doctor default path.',
      '--recorded-at',
      '2099-03-17T00:30:00.000Z',
      '--eta-minutes',
      '25',
      '--notes',
      'Fresh ETA captured during startup recovery.',
      '--path',
      'scripts/startup_recovery_check.mjs',
      '--command',
      'node --test scripts/startup_recovery_check_test.mjs'
    ]);

    const parsed = JSON.parse(run.stdout);
    const written = JSON.parse(await readFile(statePath, 'utf8'));

    assert.equal(parsed.preflight.nextAction.kind, 'resume-hottest');
    assert.equal(parsed.applied.kind, 'resume-hottest');
    assert.equal(parsed.applied.selected.id, 'recover-me');
    assert.equal(parsed.applied.evidence.result, 'resume');
    assert.equal(parsed.final.ok, true);
    assert.equal(parsed.final.summary.shouldAlert, false);
    assert.equal(written.items[0].state, 'in_progress');
    assert.equal(written.items[0].stall_status, 'none');
    assert.equal(written.items[0].expected_update_by, '2099-03-17T00:55:00.000Z');
    assert.equal(written.items[0].notes, 'Fresh ETA captured during startup recovery.');
    assert.equal(written.items[0].evidence.length, 3);
    assert.equal(written.items[0].last_evidence_at, '2099-03-17T00:30:00.000Z');
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('doctor --apply-resume stays no-op when tracked work is already healthy', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'startup-recovery-doctor-apply-clean-'));
  const statePath = path.join(tempRoot, 'state.json');

  const state = createEmptyState();
  state.items = [
    {
      id: 'already-healthy',
      title: 'Keep the default startup path healthy',
      owner: 'qxiaohu',
      source_kind: 'agent_commitment',
      provenance: {
        speaker: 'qxiaohu',
        direction: 'outbound',
        channel: 'feishu',
        message_at: '2099-03-17T00:00:00.000Z'
      },
      created_at: '2099-03-17T00:00:00.000Z',
      state: 'in_progress',
      state_changed_at: '2099-03-17T00:10:00.000Z',
      promise_status: 'pending',
      expected_update_by: '2099-03-17T00:40:00.000Z',
      stall_status: 'none',
      notes: 'Already healthy.',
      evidence: [
        {
          type: 'session_started',
          recorded_at: '2099-03-17T00:05:00.000Z',
          summary: 'Started the bounded pass.'
        },
        {
          type: 'command_result',
          recorded_at: '2099-03-17T00:15:00.000Z',
          summary: 'Validated the latest edit.',
          result: 'ok'
        }
      ]
    }
  ];

  try {
    await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    const run = await runNode([
      'scripts/startup_recovery_check.mjs',
      'doctor',
      'qxiaohu',
      statePath,
      '--apply-resume',
      '--recorded-at',
      '2099-03-17T00:30:00.000Z'
    ]);

    const parsed = JSON.parse(run.stdout);
    const written = JSON.parse(await readFile(statePath, 'utf8'));

    assert.equal(parsed.preflight.ok, true);
    assert.equal(parsed.applied, null);
    assert.equal(parsed.applyBlockedReason, null);
    assert.equal(parsed.final.ok, true);
    assert.equal(written.items[0].evidence.length, 2);
    assert.equal(written.items[0].expected_update_by, '2099-03-17T00:40:00.000Z');
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('resolve supports inline close evidence with expected artifact verification', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'startup-recovery-resolve-inline-'));
  const statePath = path.join(tempRoot, 'state.json');
  const artifactPath = path.join(tempRoot, 'deliverable.txt');

  const state = createEmptyState();
  state.items = [
    {
      id: 'finish-inline',
      title: 'Close the bounded startup recovery pass',
      owner: 'qxiaohu',
      source_kind: 'agent_commitment',
      provenance: {
        speaker: 'qxiaohu',
        direction: 'outbound',
        channel: 'feishu',
        message_at: '2026-03-17T00:00:00.000Z'
      },
      created_at: '2026-03-17T00:00:00.000Z',
      state: 'in_progress',
      state_changed_at: '2026-03-17T00:10:00.000Z',
      promise_status: 'pending',
      expected_artifacts: [artifactPath],
      stall_status: 'none',
      notes: '',
      evidence: [
        {
          type: 'artifact_touched',
          recorded_at: '2026-03-17T00:10:00.000Z',
          summary: 'Drafted the bounded pass.',
          path: artifactPath
        }
      ]
    }
  ];

  try {
    await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    await writeFile(artifactPath, 'done\n', 'utf8');

    const run = await runNode([
      'scripts/startup_recovery_check.mjs',
      'resolve',
      'finish-inline',
      'fulfilled',
      '--state-path',
      statePath,
      '--summary',
      'Verified the bounded deliverable and closed it.',
      '--notes',
      'Closed with the inline resolve path.',
      '--recorded-at',
      '2026-03-17T00:20:00.000Z',
      '--path',
      'scripts/startup_recovery_check.mjs',
      '--command',
      'node --test scripts/startup_recovery_check_test.mjs',
      '--result',
      'ok',
      '--verify-expected-artifacts'
    ]);

    const parsed = JSON.parse(run.stdout);
    const written = JSON.parse(await readFile(statePath, 'utf8'));
    assert.equal(parsed.ok, true);
    assert.equal(parsed.verifiedArtifacts.length, 1);
    assert.equal(parsed.verifiedArtifacts[0].path, artifactPath);
    assert.equal(written.items[0].state, 'done');
    assert.equal(written.items[0].promise_status, 'fulfilled');
    assert.equal(written.items[0].notes, 'Closed with the inline resolve path.');
    assert.equal(written.items[0].evidence.length, 2);
    assert.equal(written.items[0].evidence[1].type, 'artifact_verified');
    assert.equal(written.items[0].evidence[1].result, 'ok');
    assert.equal(written.items[0].last_evidence_at, '2026-03-17T00:20:00.000Z');
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('resolve-hottest closes the hottest open promise for one owner', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'startup-recovery-resolve-hottest-'));
  const statePath = path.join(tempRoot, 'state.json');
  const hottestArtifactPath = path.join(tempRoot, 'hottest-deliverable.txt');

  const state = createEmptyState();
  state.items = [
    {
      id: 'close-this-one',
      title: 'Close the hottest tracked promise without looking up the id',
      owner: 'qxiaohu',
      source_kind: 'agent_commitment',
      provenance: {
        speaker: 'qxiaohu',
        direction: 'outbound',
        channel: 'feishu',
        message_at: '2026-03-17T00:00:00.000Z'
      },
      created_at: '2026-03-17T00:00:00.000Z',
      state: 'in_progress',
      state_changed_at: '2026-03-17T00:10:00.000Z',
      promise_status: 'pending',
      expected_artifacts: [hottestArtifactPath],
      stall_status: 'none',
      notes: 'Ready to close after verification.',
      evidence: [
        {
          type: 'session_started',
          recorded_at: '2026-03-17T00:05:00.000Z',
          summary: 'Started the bounded pass.'
        },
        {
          type: 'command_result',
          recorded_at: '2026-03-17T00:15:00.000Z',
          summary: 'Validated the last bounded edit.',
          result: 'ok'
        }
      ]
    },
    {
      id: 'leave-this-open',
      title: 'Keep a quieter open promise untouched',
      owner: 'qxiaohu',
      source_kind: 'agent_commitment',
      provenance: {
        speaker: 'qxiaohu',
        direction: 'outbound',
        channel: 'feishu',
        message_at: '2099-03-17T00:45:00.000Z'
      },
      created_at: '2099-03-17T00:45:00.000Z',
      state: 'started',
      state_changed_at: '2099-03-17T00:50:00.000Z',
      promise_status: 'pending',
      stall_status: 'none',
      notes: '',
      evidence: [
        {
          type: 'session_started',
          recorded_at: '2099-03-17T00:50:00.000Z',
          summary: 'Started newer work.'
        }
      ]
    }
  ];

  try {
    await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    await writeFile(hottestArtifactPath, 'done\n', 'utf8');

    const run = await runNode([
      'scripts/startup_recovery_check.mjs',
      'resolve-hottest',
      'qxiaohu',
      'fulfilled',
      '--state-path',
      statePath,
      '--summary',
      'Verified the hottest bounded deliverable and closed it.',
      '--notes',
      'Closed via resolve-hottest.',
      '--recorded-at',
      '2026-03-17T00:20:00.000Z',
      '--path',
      'scripts/startup_recovery_check.mjs',
      '--command',
      'node --test scripts/startup_recovery_check_test.mjs',
      '--verify-expected-artifacts'
    ]);

    const parsed = JSON.parse(run.stdout);
    const written = JSON.parse(await readFile(statePath, 'utf8'));

    assert.equal(parsed.ok, true);
    assert.equal(parsed.selected.id, 'close-this-one');
    assert.equal(parsed.considered.length, 2);
    assert.equal(parsed.verifiedArtifacts.length, 1);
    assert.equal(written.items[0].state, 'done');
    assert.equal(written.items[0].promise_status, 'fulfilled');
    assert.equal(written.items[0].notes, 'Closed via resolve-hottest.');
    assert.equal(written.items[0].last_evidence_at, '2026-03-17T00:20:00.000Z');
    assert.equal(written.items[1].promise_status, 'pending');
    assert.equal(written.items[1].state, 'started');
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('resolve closes pending promise as done', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'startup-recovery-resolve-'));
  const statePath = path.join(tempRoot, 'state.json');
  const payloadPath = path.join(tempRoot, 'resolve.json');

  const state = createEmptyState();
  state.items = [
    {
      id: 'finish-me',
      title: 'Ship the startup recovery spec',
      owner: 'qxiaohu',
      source_kind: 'agent_commitment',
      provenance: {
        speaker: 'qxiaohu',
        direction: 'outbound',
        channel: 'feishu',
        message_at: '2026-03-17T00:00:00.000Z'
      },
      created_at: '2026-03-17T00:00:00.000Z',
      state: 'in_progress',
      state_changed_at: '2026-03-17T00:10:00.000Z',
      promise_status: 'pending',
      stall_status: 'none',
      notes: '',
      evidence: [
        {
          type: 'artifact_touched',
          recorded_at: '2026-03-17T00:10:00.000Z',
          summary: 'Drafted the spec.',
          path: 'plans/p3-1-startup-recovery-confirmation-v1.md'
        }
      ]
    }
  ];

  try {
    await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    await writeFile(payloadPath, `${JSON.stringify({
      notes: 'Reviewed and closed.',
      evidence: {
        type: 'artifact_verified',
        recorded_at: '2026-03-17T00:20:00.000Z',
        summary: 'Verified artifact path and commit.',
        result: 'ok'
      }
    }, null, 2)}\n`, 'utf8');

    await runNode(['scripts/startup_recovery_check.mjs', 'resolve', 'finish-me', 'fulfilled', statePath, payloadPath]);

    const written = JSON.parse(await readFile(statePath, 'utf8'));
    assert.equal(written.items[0].state, 'done');
    assert.equal(written.items[0].promise_status, 'fulfilled');
    assert.equal(written.items[0].stall_status, 'none');
    assert.equal(written.items[0].evidence.length, 2);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
