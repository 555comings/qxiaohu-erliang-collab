import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const REPO_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const NODE_COMMAND = process.env.NODE_BINARY || process.execPath;

function runNodeResult(args, cwd = REPO_ROOT, input = null) {
  return new Promise((resolve, reject) => {
    const child = spawn(NODE_COMMAND, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe']
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
    child.stdin.end(input === null ? undefined : input);
  });
}

async function runNode(args, cwd = REPO_ROOT, input = null) {
  const result = await runNodeResult(args, cwd, input);
  if (result.code !== 0) {
    throw new Error(result.stderr || `Process failed with exit code ${result.code}`);
  }
  return result;
}

function createEmptyState() {
  return {
    version: 'p3.1-v1',
    updatedAt: '2026-03-18T00:00:00.000Z',
    thresholds: {
      intentNoStartMinutes: 15,
      startedNoFollowupMinutes: 20,
      inProgressNoEvidenceMinutes: 45,
      silenceAfterEtaMinutes: 1
    },
    items: []
  };
}

test('preview --validate emits a schema-clean packet for explicit task context', async () => {
  const run = await runNode([
    'scripts/skills_recall_preview.mjs',
    'preview',
    '--owner',
    'qxiaohu',
    '--task-title',
    'Implement the first skills recall helper',
    '--task-path',
    'plans/p3-2-skills-recall-v1.md',
    '--user-request',
    'Create a small CLI helper, validate it, and include a work log with exact files changed.',
    '--validate'
  ]);

  const parsed = JSON.parse(run.stdout);
  assert.equal(parsed.trigger, 'artifact-path-match');
  assert.equal(parsed.active_item.owner, 'qxiaohu');
  assert.equal(parsed.active_item.artifact_hint, 'plans/p3-2-skills-recall-v1.md');
  assert.equal(parsed.recall_candidates[0].source_path, 'plans/p3-2-skills-recall-v1.md');
  assert.equal(parsed.recall_candidates[0].priority_index, 0);
  assert.equal('preview' in parsed.recall_candidates[0], false);
  assert.ok(parsed.recall_candidates.some((entry) => entry.source_path === 'outputs/execution-checklist-v2.md'));
  assert.equal(parsed.boundary.does_not_update_promise_state, true);
  assert.equal(parsed.boundary.does_not_start_external_actions, true);
  assert.match(run.stderr, /skills-recall-packet-ok/);
});

test('preview can write a utf8 packet file while still validating inline', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'skills-recall-preview-write-'));
  const packetPath = path.join(tempRoot, 'packet.json');

  try {
    const run = await runNode([
      'scripts/skills_recall_preview.mjs',
      'preview',
      '--owner',
      'qxiaohu',
      '--task-title',
      'Implement the first skills recall helper',
      '--task-path',
      'plans/p3-2-skills-recall-v1.md',
      '--user-request',
      'Create a small CLI helper, validate it, and include a work log with exact files changed.',
      '--validate',
      '--write-packet',
      packetPath
    ]);

    const stdoutPacket = JSON.parse(run.stdout);
    const diskPacket = JSON.parse(await readFile(packetPath, 'utf8'));
    assert.deepEqual(diskPacket, stdoutPacket);
    assert.match(run.stderr, /skills-recall-packet-ok/);
    assert.match(run.stderr, /skills-recall-packet-written/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('preview picks the hottest open startup item before inline task context', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'skills-recall-preview-state-'));
  const statePath = path.join(tempRoot, 'state.json');
  const state = createEmptyState();
  state.items = [
    {
      id: 'older-open-item',
      title: 'Less urgent older work',
      owner: 'qxiaohu',
      source_kind: 'agent_commitment',
      provenance: {
        speaker: 'qxiaohu',
        direction: 'outbound',
        channel: 'feishu',
        message_at: '2026-03-18T00:00:00.000Z'
      },
      created_at: '2026-03-18T00:00:00.000Z',
      state: 'started',
      state_changed_at: '2026-03-18T00:05:00.000Z',
      promise_status: 'pending',
      expected_artifacts: ['notes/p3-2-skills-recall-kickoff-handoff-v1.md'],
      stall_status: 'watch',
      notes: 'Waiting on a resume.',
      evidence: []
    },
    {
      id: 'hottest-open-item',
      title: 'Get the Shanghai weather forecast for the next handoff',
      owner: 'qxiaohu',
      source_kind: 'agent_commitment',
      provenance: {
        speaker: 'qxiaohu',
        direction: 'outbound',
        channel: 'feishu',
        message_at: '2026-03-18T00:10:00.000Z'
      },
      created_at: '2026-03-18T00:10:00.000Z',
      state: 'in_progress',
      state_changed_at: '2026-03-18T00:15:00.000Z',
      promise_status: 'pending',
      expected_artifacts: ['plans/p3-2-skills-recall-v1.md'],
      last_evidence_at: '2026-03-18T00:20:00.000Z',
      stall_status: 'stalled',
      notes: 'Need the weather forecast before sending the update.',
      evidence: [
        {
          type: 'manual_check',
          recorded_at: '2026-03-18T00:20:00.000Z',
          summary: 'Resumed the live packet work.',
          path: 'plans/p3-2-skills-recall-v1.md',
          command: 'node scripts/skills_recall_preview.mjs preview --owner qxiaohu',
          result: 'resume'
        }
      ]
    }
  ];

  try {
    await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');

    const run = await runNode([
      'scripts/skills_recall_preview.mjs',
      'preview',
      '--owner',
      'qxiaohu',
      '--state-path',
      statePath,
      '--user-request',
      'Get the current weather forecast before the handoff.',
      '--validate'
    ]);

    const parsed = JSON.parse(run.stdout);
    assert.equal(parsed.trigger, 'active-item-resume');
    assert.equal(parsed.active_item.id, 'hottest-open-item');
    assert.deepEqual(parsed.active_item.expected_artifacts, ['plans/p3-2-skills-recall-v1.md']);
    assert.deepEqual(parsed.active_item.evidence_paths, ['plans/p3-2-skills-recall-v1.md']);
    assert.deepEqual(parsed.active_item.evidence_commands, ['node scripts/skills_recall_preview.mjs preview --owner qxiaohu']);
    assert.equal(parsed.recall_candidates[0].source_path, 'plans/p3-2-skills-recall-v1.md');
    assert.ok(parsed.recall_candidates.some((entry) => /\/weather\/SKILL\.md$/i.test(entry.source_path)));
    assert.equal(parsed.boundary.startup_recovery_status, 'already decided by P3.1');
    assert.match(run.stderr, /packet-anchor-ok/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('preview surfaces the retrospective runbook when rework discipline is the risk', async () => {
  const run = await runNode([
    'scripts/skills_recall_preview.mjs',
    'preview',
    '--owner',
    'qxiaohu',
    '--task-title',
    'Tighten rework handling for the next reviewer pass',
    '--task-path',
    'notes/p3-2-skills-recall-kickoff-handoff-v1.md',
    '--user-request',
    'Enter rework, sync an ETA, and make sure the artifact is readable before review.',
    '--validate'
  ]);

  const parsed = JSON.parse(run.stdout);
  assert.equal(parsed.recall_candidates[0].source_path, 'notes/p3-2-skills-recall-kickoff-handoff-v1.md');
  assert.ok(parsed.recall_candidates.some((entry) => entry.source_path === 'outputs/stage3-retrospective-v1.md'));
  assert.equal(parsed.recall_candidates.find((entry) => entry.source_path === 'outputs/stage3-retrospective-v1.md').required_before_action, true);
});

test('validate rejects packets that drift outside the packet schema', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'skills-recall-validate-'));
  const packetPath = path.join(tempRoot, 'packet.json');
  const packet = {
    trigger: 'artifact-path-match',
    active_item: {
      id: 'packet-with-extra-preview-field',
      title: 'Packet with schema drift',
      state: 'task-context',
      owner: 'qxiaohu',
      artifact_hint: 'plans/p3-2-skills-recall-v1.md'
    },
    recall_candidates: [
      {
        source_path: 'plans/p3-2-skills-recall-v1.md',
        source_kind: 'active-item-evidence',
        why_recalled: 'The task already points at this plan and it is the right first anchor.',
        required_before_action: true,
        matched_from: ['artifact_hint'],
        preview: 'extra output that should not be present'
      }
    ],
    boundary: {
      startup_recovery_status: 'task context supplied directly; no startup state change performed',
      does_not_update_promise_state: true,
      does_not_override_hottest_item: true,
      does_not_start_external_actions: true
    }
  };

  try {
    await writeFile(packetPath, `${JSON.stringify(packet, null, 2)}\n`, 'utf8');

    const run = await runNodeResult([
      'scripts/skills_recall_preview.mjs',
      'validate',
      '--packet-path',
      packetPath,
      '--state-path',
      path.join(tempRoot, 'missing-state.json')
    ]);

    assert.equal(run.code, 1);
    const report = JSON.parse(run.stdout);
    assert.equal(report.ok, false);
    assert.ok(report.errors.some((entry) => entry.includes('unexpected recall_candidates[0].preview')));
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('validate accepts a generated packet from disk', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'skills-recall-packet-file-'));
  const packetPath = path.join(tempRoot, 'packet.json');

  try {
    const preview = await runNode([
      'scripts/skills_recall_preview.mjs',
      'preview',
      '--owner',
      'qxiaohu',
      '--task-title',
      'Implement the first skills recall helper',
      '--task-path',
      'plans/p3-2-skills-recall-v1.md',
      '--user-request',
      'Create a small CLI helper, validate it, and include a work log with exact files changed.'
    ]);

    await writeFile(packetPath, preview.stdout, 'utf8');

    const run = await runNode([
      'scripts/skills_recall_preview.mjs',
      'validate',
      '--owner',
      'qxiaohu',
      '--packet-path',
      packetPath
    ]);

    const report = JSON.parse(run.stdout);
    assert.equal(report.ok, true);
    assert.ok(report.checks.includes('packet-schema-shape-ok'));
    assert.ok(report.checks.includes('packet-source-paths-ok'));
    assert.ok(report.checks.includes('packet-scope-clean'));
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('review produces a pass verdict and ordered read summary for a generated packet', async () => {
  const preview = await runNode([
    'scripts/skills_recall_preview.mjs',
    'preview',
    '--owner',
    'qxiaohu',
    '--task-title',
    'Review the Skills Recall operator flow note',
    '--task-path',
    'notes/p3-2-skills-recall-operator-flow-v1.md',
    '--user-request',
    'Validate the operator flow note, review whether the packet stays bounded, and prepare a handoff-ready verdict with exact checks.'
  ]);

  const run = await runNode([
    'scripts/skills_recall_preview.mjs',
    'review',
    '--owner',
    'qxiaohu',
    '--state-path',
    path.join(os.tmpdir(), 'skills-recall-review-no-state.json')
  ], REPO_ROOT, preview.stdout);

  const report = JSON.parse(run.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.verdict, 'pass');
  assert.equal(report.review_summary.first_read_source, 'notes/p3-2-skills-recall-operator-flow-v1.md');
  assert.deepEqual(report.review_summary.review_order, [
    'notes/p3-2-skills-recall-operator-flow-v1.md',
    'outputs/execution-checklist-v2.md'
  ]);
  assert.ok(report.checks.includes('review-first-read-clear'));
  assert.ok(report.checks.includes('review-required-source-coverage-ok'));
  assert.ok(report.checks.includes('review-order-clean'));
});

test('review rejects packets whose priority order drifts from packet order', async () => {
  const packet = {
    trigger: 'artifact-path-match',
    active_item: {
      id: 'priority-drift-packet',
      title: 'Packet with bad ordering',
      state: 'task-context',
      owner: 'qxiaohu',
      artifact_hint: 'plans/p3-2-skills-recall-v1.md'
    },
    recall_candidates: [
      {
        source_path: 'plans/p3-2-skills-recall-v1.md',
        source_kind: 'active-item-evidence',
        why_recalled: 'The task already points at this plan, so it stays the first readable anchor.',
        required_before_action: true,
        matched_from: ['artifact_hint'],
        priority_index: 1
      },
      {
        source_path: 'outputs/execution-checklist-v2.md',
        source_kind: 'collab-runbook',
        why_recalled: 'The request asks for a handoff-ready verdict, so the execution checklist still matters.',
        required_before_action: true,
        matched_from: ['user_request'],
        priority_index: 0
      }
    ],
    boundary: {
      startup_recovery_status: 'task context supplied directly; no startup state change performed',
      does_not_update_promise_state: true,
      does_not_override_hottest_item: true,
      does_not_start_external_actions: true
    }
  };

  const run = await runNodeResult([
    'scripts/skills_recall_preview.mjs',
    'review',
    '--owner',
    'qxiaohu',
    '--state-path',
    path.join(os.tmpdir(), 'skills-recall-review-no-state.json')
  ], REPO_ROOT, JSON.stringify(packet));

  assert.equal(run.code, 1);
  const report = JSON.parse(run.stdout);
  assert.equal(report.ok, false);
  assert.equal(report.verdict, 'fail');
  assert.ok(report.errors.some((entry) => entry.includes('priority_index values')));
});
