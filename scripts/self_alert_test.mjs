import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LEVELS,
  ROUTES,
  buildDedupKey,
  createEmptyState,
  evaluateCandidate
} from './self_alert_evaluator.mjs';

test('buildDedupKey uses signal, topic, signature, and day bucket', () => {
  const key = buildDedupKey({
    signalType: 'exec_error',
    topicScope: 'memory-index',
    errorSignature: 'EBUSY',
    dayBucket: '2026-03-14'
  });

  assert.equal(key, 'exec_error::memory-index::EBUSY::2026-03-14');
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
