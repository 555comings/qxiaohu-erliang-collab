import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  LEVELS,
  ROUTES,
  buildDedupKey,
  createEmptyState,
  evaluateCandidate
} from './self_alert_evaluator.mjs';
import { detectToolCandidates, detectUserCandidates } from './self_alert_detectors.mjs';
import { collectHealthCandidates } from './self_alert_health.mjs';
import { pollAlertSources } from './self_alert_poll.mjs';
import { loadState } from './self_alert_state.mjs';
import { writeEvaluationResult } from './self_alert_writer.mjs';

test('buildDedupKey uses signal, topic, signature, and day bucket', () => {
  const key = buildDedupKey({
    signalType: 'exec_error',
    topicScope: 'memory-index',
    errorSignature: 'EBUSY',
    dayBucket: '2026-03-14'
  });

  assert.equal(key, 'exec_error::memory-index::EBUSY::2026-03-14');
});

test('detectUserCandidates captures remember requests', () => {
  const candidates = detectUserCandidates({ text: '猫爸说，记一下这个规则。', topicScope: 'chat' });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].signalType, 'remember_request');
});

test('detectUserCandidates prefers specific correction over generic remember request', () => {
  const candidates = detectUserCandidates({ text: '记一下：以后转发给二两时不要代码块。', topicScope: 'chat' });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].signalType, 'preference_correction');
});

test('detectUserCandidates ignores casual phrase 其实还好', () => {
  const candidates = detectUserCandidates({ text: '其实还好，不用记。', topicScope: 'chat' });
  assert.equal(candidates.length, 0);
});

test('detectUserCandidates ignores casual phrase 你不对劲', () => {
  const candidates = detectUserCandidates({ text: '你不对劲啊小虎。', topicScope: 'chat' });
  assert.equal(candidates.length, 0);
});

test('detectToolCandidates captures high risk git and exec error', () => {
  const candidates = detectToolCandidates({
    toolName: 'exec',
    topicScope: 'git-fix',
    command: 'git reset --hard HEAD~1',
    exitCode: 128,
    stderr: 'fatal: unsafe repository'
  });

  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].signalType, 'high_risk_git');
  assert.equal(candidates[1].signalType, 'exec_error');
});

test('first exec error only counts', () => {
  const result = evaluateCandidate(
    {
      signalType: 'exec_error',
      topicScope: 'memory-index',
      errorSignature: 'EBUSY-main-sqlite-rename'
    },
    createEmptyState(new Date('2026-03-14T09:00:00Z')),
    {},
    new Date('2026-03-14T09:00:00Z')
  );

  assert.equal(result.level, LEVELS.COUNT);
  assert.equal(result.route, ROUTES.NONE);
  assert.equal(result.shouldWrite, false);
  assert.equal(result.stateRecord.count, 1);
});

test('second repeated exec error records to errors', () => {
  const first = evaluateCandidate(
    {
      signalType: 'exec_error',
      topicScope: 'memory-index',
      errorSignature: 'EBUSY-main-sqlite-rename'
    },
    createEmptyState(new Date('2026-03-14T09:00:00Z')),
    {},
    new Date('2026-03-14T09:00:00Z')
  );

  const second = evaluateCandidate(
    {
      signalType: 'exec_error',
      topicScope: 'memory-index',
      errorSignature: 'EBUSY-main-sqlite-rename'
    },
    first.state,
    {},
    new Date('2026-03-14T09:05:00Z')
  );

  assert.equal(second.level, LEVELS.RECORD);
  assert.equal(second.route, ROUTES.ERRORS);
  assert.equal(second.shouldWrite, true);
  assert.equal(second.stateRecord.status, 'recorded');
});

test('repeated recorded event inside window is deduped', () => {
  const first = evaluateCandidate(
    {
      signalType: 'remember_request',
      topicScope: 'collab-rule',
      errorSignature: 'none'
    },
    createEmptyState(new Date('2026-03-14T09:00:00Z')),
    {},
    new Date('2026-03-14T09:00:00Z')
  );

  const second = evaluateCandidate(
    {
      signalType: 'remember_request',
      topicScope: 'collab-rule',
      errorSignature: 'none'
    },
    first.state,
    {},
    new Date('2026-03-14T09:03:00Z')
  );

  assert.equal(second.level, LEVELS.RECORD);
  assert.equal(second.shouldWrite, false);
  assert.equal(second.deduped, true);
});

test('memory health escalates immediately', () => {
  const result = evaluateCandidate(
    {
      signalType: 'memory_health',
      topicScope: 'provider-status',
      errorSignature: 'provider-none'
    },
    createEmptyState(new Date('2026-03-14T09:00:00Z')),
    {},
    new Date('2026-03-14T09:00:00Z')
  );

  assert.equal(result.level, LEVELS.ESCALATE);
  assert.equal(result.route, ROUTES.ERRORS);
  assert.equal(result.shouldWrite, true);
});

test('expected failure is ignored', () => {
  const result = evaluateCandidate(
    {
      signalType: 'exec_error',
      topicScope: 'sandbox-probe',
      errorSignature: 'known-sandbox-limit',
      knownSandboxLimit: true
    },
    createEmptyState(new Date('2026-03-14T09:00:00Z')),
    {},
    new Date('2026-03-14T09:00:00Z')
  );

  assert.equal(result.level, LEVELS.IGNORE);
  assert.equal(result.route, ROUTES.NONE);
  assert.equal(result.shouldWrite, false);
});

test('writeEvaluationResult writes daily-memory-v2 compatible self alert records', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'self-alert-'));

  try {
    const result = evaluateCandidate(
      {
        signalType: 'remember_request',
        topicScope: 'relay-style',
        errorSignature: 'remember-request',
        evidence: 'apiKey=sk-user-1234567890abcdef remember this',
        summary: 'User explicitly asked to remember something.'
      },
      createEmptyState(new Date('2026-03-14T09:00:00Z')),
      {},
      new Date('2026-03-14T09:00:00Z')
    );

    const writeResult = await writeEvaluationResult(result, tempRoot);
    const content = await readFile(writeResult.path, 'utf8');

    assert.equal(writeResult.wrote, true);
    assert.match(content, /# 2026-03-14/);
    assert.match(content, /## Entries/);
    assert.match(content, /## \[self-alert\] 2026-03-14 /);
    assert.match(content, /- Trigger: remember-request/);
    assert.match(content, /- Status: verified/);
    assert.match(content, /apiKey=\*\*\*/);
    assert.doesNotMatch(content, /sk-user-1234567890abcdef/);
    assert.match(content, /## End State/);
    assert.ok(content.indexOf('## [self-alert]') < content.indexOf('## End State'));
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('writeEvaluationResult inserts self alert records before later daily sections', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'self-alert-existing-'));
  const dailyPath = path.join(tempRoot, 'memory', '2026-03-14.md');

  try {
    await mkdir(path.dirname(dailyPath), { recursive: true });
    await writeFile(dailyPath, [
      '# 2026-03-14',
      '',
      '## Meta',
      '- Timezone: Asia/Shanghai',
      '- Owner: Q小虎',
      '- Format: daily-memory-v2',
      '',
      '## Focus',
      '- Active: existing focus',
      '- Open Loops: none',
      '',
      '## Entries',
      '## [memory] 2026-03-14 08:00',
      '- Trigger: progress',
      '- Scope: existing',
      '- Status: verified',
      '- Entry: Existing entry.',
      '- Evidence: existing evidence',
      '- Next: none',
      '',
      '## Legacy Notes',
      '- legacy',
      '',
      '## End State',
      '- Promote: none',
      '- Carry Forward: none',
      ''
    ].join('\n'), 'utf8');

    const result = evaluateCandidate(
      {
        signalType: 'remember_request',
        topicScope: 'relay-style',
        errorSignature: 'remember-request',
        evidence: 'remember this too',
        summary: 'User explicitly asked to remember something else.'
      },
      createEmptyState(new Date('2026-03-14T09:00:00Z')),
      {},
      new Date('2026-03-14T09:00:00Z')
    );

    await writeEvaluationResult(result, tempRoot);
    const content = await readFile(dailyPath, 'utf8');
    const selfAlertIndex = content.indexOf('## [self-alert] 2026-03-14 ');

    assert.ok(selfAlertIndex > content.indexOf('## [memory] 2026-03-14 08:00'));
    assert.ok(selfAlertIndex < content.indexOf('## Legacy Notes'));
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('collectHealthCandidates flags unreadable state without overwriting it', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'self-alert-health-state-'));
  const statePath = path.join(tempRoot, 'memory', 'self_alert_state.json');

  try {
    await mkdir(path.dirname(statePath), { recursive: true });
    await writeFile(statePath, '{not valid json', 'utf8');

    const health = await collectHealthCandidates({
      statePath,
      workspaceRoot: tempRoot,
      inputsRoot: path.join(tempRoot, 'runtime', 'self_alert_inputs')
    });

    assert.equal(health.ok, false);
    assert.equal(health.persistState, false);
    assert.equal(health.candidates.length, 1);
    assert.equal(health.candidates[0].signalType, 'memory_health');
    assert.match(health.candidates[0].evidence, /statePath=/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('collectHealthCandidates flags malformed NDJSON input lines', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'self-alert-health-ndjson-'));
  const inputsRoot = path.join(tempRoot, 'runtime', 'self_alert_inputs');
  const statePath = path.join(tempRoot, 'memory', 'self_alert_state.json');

  try {
    await mkdir(inputsRoot, { recursive: true });
    await mkdir(path.dirname(statePath), { recursive: true });
    await writeFile(path.join(inputsRoot, 'user.ndjson'), '{"text":"ok"}\nnot-json\n', 'utf8');
    await writeFile(statePath, JSON.stringify(createEmptyState(new Date('2026-03-15T00:00:00Z'))), 'utf8');

    const health = await collectHealthCandidates({
      statePath,
      workspaceRoot: tempRoot,
      inputsRoot
    });

    assert.equal(health.ok, false);
    assert.equal(health.persistState, true);
    assert.equal(health.candidates.length, 1);
    assert.match(health.candidates[0].summary, /NDJSON input has an unreadable line/);
    assert.match(health.candidates[0].evidence, /line=2/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('loadState accepts UTF-8 BOM JSON files', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'self-alert-bom-'));
  const statePath = path.join(tempRoot, 'self_alert_state.json');

  try {
    const bomJson = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from('{"version":1,"updatedAt":"2026-03-15T01:55:00+08:00","records":[],"meta":{"cursors":{}}}', 'utf8')
    ]);
    await writeFile(statePath, bomJson);

    const state = await loadState(statePath);
    assert.equal(state.version, 1);
    assert.deepEqual(state.records, []);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('pollAlertSources consumes only new NDJSON events', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'self-alert-poll-'));
  const runtimeRoot = path.join(tempRoot, 'runtime', 'self_alert_inputs');
  const userPath = path.join(runtimeRoot, 'user.ndjson');
  const toolPath = path.join(runtimeRoot, 'tool.ndjson');

  try {
    await rm(runtimeRoot, { recursive: true, force: true });
    await mkdir(runtimeRoot, { recursive: true });
    await writeFile(userPath, '{"text":"记一下这个规则","topicScope":"chat"}\n', 'utf8');
    await writeFile(toolPath, '{"toolName":"exec","topicScope":"git-fix","command":"git reset --hard HEAD~1","exitCode":128,"stderr":"fatal: unsafe repository"}\n', 'utf8');

    const first = await pollAlertSources({
      workspaceRoot: tempRoot,
      statePath: path.join(tempRoot, 'memory', 'self_alert_state.json'),
      inputsRoot: runtimeRoot
    });

    const second = await pollAlertSources({
      workspaceRoot: tempRoot,
      statePath: path.join(tempRoot, 'memory', 'self_alert_state.json'),
      inputsRoot: runtimeRoot
    });

    assert.equal(first.consumed.user, 1);
    assert.equal(first.consumed.tool, 1);
    assert.equal(second.consumed.user, 0);
    assert.equal(second.consumed.tool, 0);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('pollAlertSources treats cursors as line counts instead of byte offsets', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'self-alert-poll-lines-'));
  const runtimeRoot = path.join(tempRoot, 'runtime', 'self_alert_inputs');
  const statePath = path.join(tempRoot, 'memory', 'self_alert_state.json');
  const userPath = path.join(runtimeRoot, 'user.ndjson');
  const toolPath = path.join(runtimeRoot, 'tool.ndjson');

  try {
    await mkdir(path.join(tempRoot, 'memory'), { recursive: true });
    await mkdir(runtimeRoot, { recursive: true });
    await writeFile(
      userPath,
      '{"text":"第一条普通消息","topicScope":"chat"}\n{"text":"记一下第二条规则","topicScope":"chat"}\n',
      'utf8'
    );
    await writeFile(toolPath, '', 'utf8');
    await writeFile(
      statePath,
      JSON.stringify({
        version: 1,
        updatedAt: '2026-03-15T00:00:00.000Z',
        records: [],
        meta: { cursors: { user: 1, tool: 0 } }
      }, null, 2),
      'utf8'
    );

    const result = await pollAlertSources({
      workspaceRoot: tempRoot,
      statePath,
      inputsRoot: runtimeRoot
    });

    assert.equal(result.consumed.user, 1);
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].candidate.evidence, '记一下第二条规则');
    assert.equal(result.state.meta.cursors.user, 2);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('pollAlertSources resets cursor when input file is truncated', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'self-alert-poll-truncate-'));
  const runtimeRoot = path.join(tempRoot, 'runtime', 'self_alert_inputs');
  const userPath = path.join(runtimeRoot, 'user.ndjson');
  const toolPath = path.join(runtimeRoot, 'tool.ndjson');

  try {
    await mkdir(runtimeRoot, { recursive: true });
    await writeFile(userPath, '{"text":"记一下这是一个更长的规则描述","topicScope":"chat"}\n', 'utf8');
    await writeFile(toolPath, '', 'utf8');

    const first = await pollAlertSources({
      workspaceRoot: tempRoot,
      statePath: path.join(tempRoot, 'memory', 'self_alert_state.json'),
      inputsRoot: runtimeRoot
    });

    await writeFile(userPath, '{"text":"记一下短规则","topicScope":"chat"}\n', 'utf8');

    const second = await pollAlertSources({
      workspaceRoot: tempRoot,
      statePath: path.join(tempRoot, 'memory', 'self_alert_state.json'),
      inputsRoot: runtimeRoot
    });

    assert.equal(first.consumed.user, 1);
    assert.equal(second.consumed.user, 1);
    assert.equal(second.results[0].candidate.evidence, '记一下短规则');
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
