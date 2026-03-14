import { deepStrictEqual } from 'node:assert/strict';

export const LEVELS = {
  IGNORE: 'IGNORE',
  COUNT: 'COUNT',
  RECORD: 'RECORD',
  ESCALATE: 'ESCALATE'
};

export const STATUSES = {
  COUNTING: 'counting',
  RECORDED: 'recorded',
  ESCALATED: 'escalated',
  PROMOTED: 'promoted'
};

export const ROUTES = {
  NONE: 'none',
  DAILY: 'daily',
  ERRORS: 'errors',
  LEARNINGS: 'learnings',
  MEMORY: 'memory',
  EMERGENCY: 'emergency'
};

export const DEFAULT_CONFIG = {
  dedupMinutes: {
    remember_request: 10,
    user_correction: 10,
    preference_correction: 10,
    exec_error: 30,
    write_failure: 30,
    default: 10
  },
  recordThresholds: {
    exec_error: 2,
    write_failure: 1,
    high_risk_git: 1,
    memory_health: 1,
    default: 2
  },
  retentionHours: 24,
  immediateRecordSignals: [
    'remember_request',
    'user_correction',
    'preference_correction',
    'task_state_change'
  ],
  immediateEscalationSignals: [
    'privacy_risk',
    'high_risk_git',
    'memory_health',
    'write_failure',
    'systemic_failure',
    'user_flagged'
  ]
};

function cloneConfig(config = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...config,
    dedupMinutes: {
      ...DEFAULT_CONFIG.dedupMinutes,
      ...(config.dedupMinutes || {})
    },
    recordThresholds: {
      ...DEFAULT_CONFIG.recordThresholds,
      ...(config.recordThresholds || {})
    },
    immediateRecordSignals: [
      ...(config.immediateRecordSignals || DEFAULT_CONFIG.immediateRecordSignals)
    ],
    immediateEscalationSignals: [
      ...(config.immediateEscalationSignals || DEFAULT_CONFIG.immediateEscalationSignals)
    ]
  };
}

export function createEmptyState(now = new Date()) {
  return {
    version: 1,
    updatedAt: now.toISOString(),
    records: [],
    meta: {
      cursors: {}
    }
  };
}

export function buildDayBucket(now = new Date()) {
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function normalizeCandidate(candidate, now = new Date()) {
  if (!candidate || typeof candidate !== 'object') {
    throw new TypeError('candidate must be an object');
  }

  if (!candidate.signalType) {
    throw new Error('candidate.signalType is required');
  }

  const topicScope = candidate.topicScope || 'general';
  const errorSignature = candidate.errorSignature || 'none';
  const timestamp = candidate.timestamp || now.toISOString();

  return {
    signalType: candidate.signalType,
    topicScope,
    errorSignature,
    timestamp,
    dayBucket: candidate.dayBucket || buildDayBucket(new Date(timestamp)),
    routeHint: candidate.routeHint || null,
    summary: candidate.summary || '',
    evidence: candidate.evidence || '',
    expected: Boolean(candidate.expected),
    userInterrupted: Boolean(candidate.userInterrupted),
    manualCancel: Boolean(candidate.manualCancel),
    knownSandboxLimit: Boolean(candidate.knownSandboxLimit),
    forceEscalate: Boolean(candidate.forceEscalate),
    forceIgnore: Boolean(candidate.forceIgnore),
    metadata: candidate.metadata || {}
  };
}

export function buildDedupKey(candidate) {
  return [
    candidate.signalType,
    candidate.topicScope,
    candidate.errorSignature || 'none',
    candidate.dayBucket
  ].join('::');
}

function stateRecordMatches(record, candidate) {
  return record.signal_type === candidate.signalType &&
    record.topic_scope === candidate.topicScope &&
    record.error_signature === (candidate.errorSignature || 'none') &&
    record.day_bucket === candidate.dayBucket;
}

function getDedupWindowMinutes(candidate, config) {
  return config.dedupMinutes[candidate.signalType] || config.dedupMinutes.default;
}

function getRecordThreshold(candidate, config) {
  return config.recordThresholds[candidate.signalType] || config.recordThresholds.default;
}

function isImmediateRecord(candidate, config) {
  return config.immediateRecordSignals.includes(candidate.signalType);
}

function isImmediateEscalation(candidate, config) {
  return candidate.forceEscalate || config.immediateEscalationSignals.includes(candidate.signalType);
}

function isIgnoreCandidate(candidate) {
  return candidate.forceIgnore ||
    candidate.expected ||
    candidate.userInterrupted ||
    candidate.manualCancel ||
    candidate.knownSandboxLimit;
}

function resolveRoute(candidate, level) {
  if (candidate.routeHint) {
    return candidate.routeHint;
  }

  if (level === LEVELS.IGNORE || level === LEVELS.COUNT) {
    return ROUTES.NONE;
  }

  if (level === LEVELS.ESCALATE) {
    if (candidate.signalType === 'write_failure') {
      return ROUTES.EMERGENCY;
    }

    if (candidate.signalType === 'privacy_risk' ||
        candidate.signalType === 'high_risk_git' ||
        candidate.signalType === 'memory_health' ||
        candidate.signalType === 'systemic_failure') {
      return ROUTES.ERRORS;
    }
  }

  if (candidate.signalType === 'exec_error') {
    return ROUTES.ERRORS;
  }

  if (candidate.signalType === 'operating_lesson') {
    return ROUTES.LEARNINGS;
  }

  return ROUTES.DAILY;
}

function createStateRecord(candidate, now) {
  return {
    signal_type: candidate.signalType,
    topic_scope: candidate.topicScope,
    error_signature: candidate.errorSignature || 'none',
    day_bucket: candidate.dayBucket,
    last_time: now.toISOString(),
    count: 0,
    status: STATUSES.COUNTING
  };
}

function pruneExpiredRecords(state, now, config) {
  const cutoffMs = now.getTime() - (config.retentionHours * 60 * 60 * 1000);
  state.records = state.records.filter((record) => {
    const lastTime = Date.parse(record.last_time);
    return Number.isFinite(lastTime) && lastTime >= cutoffMs;
  });
}

function updateRecord(record, now) {
  record.count += 1;
  record.last_time = now.toISOString();
}

export function evaluateCandidate(candidateInput, stateInput, configInput = {}, nowInput = new Date()) {
  const now = nowInput instanceof Date ? nowInput : new Date(nowInput);
  const config = cloneConfig(configInput);
  const state = structuredClone(stateInput || createEmptyState(now));
  const candidate = normalizeCandidate(candidateInput, now);

  if (!Array.isArray(state.records)) {
    state.records = [];
  }

  if (!state.meta || typeof state.meta !== 'object') {
    state.meta = { cursors: {} };
  }

  if (!state.meta.cursors || typeof state.meta.cursors !== 'object') {
    state.meta.cursors = {};
  }

  pruneExpiredRecords(state, now, config);

  let record = state.records.find((entry) => stateRecordMatches(entry, candidate));
  if (!record) {
    record = createStateRecord(candidate, now);
    state.records.push(record);
  }

  const dedupWindowMs = getDedupWindowMinutes(candidate, config) * 60 * 1000;
  const lastTimeMs = Date.parse(record.last_time);
  const withinWindow = Number.isFinite(lastTimeMs) && (now.getTime() - lastTimeMs) <= dedupWindowMs;

  const previousStatus = record.status;
  const previousCount = record.count;
  updateRecord(record, now);

  let level = LEVELS.COUNT;
  let route = ROUTES.NONE;
  let shouldWrite = false;
  let reason = 'counted';
  let deduped = false;

  if (isImmediateEscalation(candidate, config)) {
    level = LEVELS.ESCALATE;
    route = resolveRoute(candidate, level);
    shouldWrite = !(previousStatus === STATUSES.ESCALATED && withinWindow);
    record.status = STATUSES.ESCALATED;
    reason = shouldWrite ? 'immediate-escalation' : 'deduped-escalation';
    deduped = !shouldWrite;
  } else if (isIgnoreCandidate(candidate)) {
    level = LEVELS.IGNORE;
    route = ROUTES.NONE;
    shouldWrite = false;
    record.status = previousStatus || STATUSES.COUNTING;
    record.count = previousCount;
    reason = 'ignored';
  } else if (isImmediateRecord(candidate, config)) {
    level = LEVELS.RECORD;
    route = resolveRoute(candidate, level);
    shouldWrite = !(previousStatus === STATUSES.RECORDED && withinWindow);
    record.status = STATUSES.RECORDED;
    reason = shouldWrite ? 'immediate-record' : 'deduped-record';
    deduped = !shouldWrite;
  } else {
    const threshold = getRecordThreshold(candidate, config);
    if (record.count >= threshold) {
      level = LEVELS.RECORD;
      route = resolveRoute(candidate, level);
      shouldWrite = !(previousStatus === STATUSES.RECORDED && withinWindow);
      record.status = STATUSES.RECORDED;
      reason = shouldWrite ? 'threshold-record' : 'deduped-record';
      deduped = !shouldWrite;
    }
  }

  state.updatedAt = now.toISOString();

  return {
    candidate,
    key: buildDedupKey(candidate),
    level,
    route,
    shouldWrite,
    deduped,
    reason,
    state,
    stateRecord: structuredClone(record)
  };
}

export function assertStateShape(state) {
  if (!state || typeof state !== 'object') {
    throw new Error('state must be an object');
  }

  if (!Array.isArray(state.records)) {
    throw new Error('state.records must be an array');
  }

  if (state.meta != null && typeof state.meta !== 'object') {
    throw new Error('state.meta must be an object when present');
  }

  for (const record of state.records) {
    deepStrictEqual(
      ['signal_type', 'topic_scope', 'error_signature', 'day_bucket', 'last_time', 'count', 'status'].every((key) => key in record),
      true
    );
  }
}
