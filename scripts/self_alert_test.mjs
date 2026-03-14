import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
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

test('writeEvaluationResult writes redacted markdown to daily file', async () => {
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
    assert.match(content, /## \[self-alert\] 2026-03-14 /);
    assert.match(content, /apiKey=\*\*\*/);
    assert.doesNotMatch(content, /sk-user-1234567890abcdef/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
