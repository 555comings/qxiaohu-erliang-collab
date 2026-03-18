import path from 'node:path';
import process from 'node:process';
import { access, readFile, writeFile } from 'node:fs/promises';

const DEFAULT_THRESHOLDS = {
  intentNoStartMinutes: 15,
  startedNoFollowupMinutes: 20,
  inProgressNoEvidenceMinutes: 45,
  silenceAfterEtaMinutes: 1
};

function stripBom(value) {
  return String(value || '').replace(/^\uFEFF/, '');
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function nowIso(now = new Date()) {
  return now.toISOString();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createEmptyState(now = new Date()) {
  return {
    version: 'p3.1-v1',
    updatedAt: nowIso(now),
    thresholds: clone(DEFAULT_THRESHOLDS),
    items: []
  };
}

async function loadJson(filePath) {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(stripBom(raw));
}

async function loadState(statePath) {
  if (!(await pathExists(statePath))) {
    return createEmptyState();
  }

  const parsed = await loadJson(statePath);
  return {
    version: parsed.version || 'p3.1-v1',
    updatedAt: parsed.updatedAt || nowIso(),
    thresholds: {
      ...DEFAULT_THRESHOLDS,
      ...(parsed.thresholds || {})
    },
    items: Array.isArray(parsed.items) ? parsed.items : []
  };
}

async function writeState(statePath, state) {
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function usage() {
  console.error([
    'Usage:',
    '  node scripts/startup_recovery_check.mjs status [statePath]',
    '  node scripts/startup_recovery_check.mjs heartbeat-check <actorKey> [statePath]',
    '  node scripts/startup_recovery_check.mjs doctor <owner> [statePath] [--apply-resume] [--summary <text>] [--expected-update-by <iso> | --eta-minutes <minutes>] [--notes <text>] [--recorded-at <iso>] [--path <artifactPath>] [--command <cmd>]',
    '  node scripts/startup_recovery_check.mjs create <item.json|-> [statePath]',
    '  node scripts/startup_recovery_check.mjs add-evidence <id> <evidence.json|-> [statePath]',
    '  node scripts/startup_recovery_check.mjs capture-live <owner> <title> <provenanceSummary> <executionSummary> [--state-path <path>] [--id <id>] [--source-kind <kind>] [--speaker <speaker>] [--direction <direction>] [--channel <channel>] [--message-at <iso>] [--recorded-at <iso>] [--expected-update-by <iso> | --eta-minutes <minutes>] [--notes <text>] [--path <artifactPath>] [--command <cmd>] [--expected-artifacts <csv>]',
    '  node scripts/startup_recovery_check.mjs resume <id> <summary> [--state-path <path>] [--expected-update-by <iso> | --eta-minutes <minutes>] [--notes <text>] [--recorded-at <iso>] [--path <artifactPath>] [--command <cmd>]',
    '  node scripts/startup_recovery_check.mjs resume-hottest <owner> <summary> [--state-path <path>] [--expected-update-by <iso> | --eta-minutes <minutes>] [--notes <text>] [--recorded-at <iso>] [--path <artifactPath>] [--command <cmd>]',
    '  node scripts/startup_recovery_check.mjs resolve-hottest <owner> <fulfilled|cancelled|superseded> [--state-path <path>] [--notes <text>] [--summary <text>] [--recorded-at <iso>] [--path <artifactPath>] [--command <cmd>] [--result <result>] [--verify-expected-artifacts]',
    '  node scripts/startup_recovery_check.mjs resolve <id> <fulfilled|cancelled|superseded> [statePath] [payload.json|-]',
    '  node scripts/startup_recovery_check.mjs resolve <id> <fulfilled|cancelled|superseded> [--state-path <path>] [--notes <text>] [--summary <text>] [--recorded-at <iso>] [--path <artifactPath>] [--command <cmd>] [--result <result>] [--verify-expected-artifacts]'
  ].join('\n'));
}

async function readJsonInput(jsonPath) {
  if (!jsonPath || jsonPath === '-') {
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    return JSON.parse(stripBom(Buffer.concat(chunks).toString('utf8')));
  }

  return loadJson(jsonPath);
}

function parseTimestamp(value) {
  const ms = Date.parse(value || '');
  return Number.isFinite(ms) ? ms : null;
}

function summarizeEvidence(evidence) {
  return {
    type: evidence.type,
    recorded_at: evidence.recorded_at,
    summary: evidence.summary,
    path: evidence.path || null,
    command: evidence.command || null,
    result: evidence.result || null
  };
}

function getLastEvidenceAt(item) {
  const timestamps = [item.last_evidence_at]
    .concat(Array.isArray(item.evidence) ? item.evidence.map((entry) => entry.recorded_at) : [])
    .map(parseTimestamp)
    .filter((value) => value !== null);

  if (timestamps.length === 0) {
    return null;
  }

  return new Date(Math.max(...timestamps)).toISOString();
}

function computeStallStatus(item, thresholds, now = new Date()) {
  if (item.promise_status && item.promise_status !== 'pending') {
    return { stall_status: 'none', stall_reason: null };
  }

  const nowMs = now.getTime();
  const etaMs = parseTimestamp(item.expected_update_by);
  if (etaMs !== null) {
    const graceMs = Number(thresholds.silenceAfterEtaMinutes || 0) * 60 * 1000;
    if (nowMs > etaMs + graceMs) {
      return {
        stall_status: 'stalled',
        stall_reason: 'expected_update_missed'
      };
    }
  }

  if (item.state === 'done') {
    return { stall_status: 'none', stall_reason: null };
  }

  const createdMs = parseTimestamp(item.created_at) || nowMs;
  const stateChangedMs = parseTimestamp(item.state_changed_at) || createdMs;
  const lastEvidenceMs = parseTimestamp(getLastEvidenceAt(item));

  if (item.state === 'intent') {
    if (nowMs - createdMs > Number(thresholds.intentNoStartMinutes || 0) * 60 * 1000) {
      return { stall_status: 'watch', stall_reason: 'intent_without_start' };
    }
    return { stall_status: 'none', stall_reason: null };
  }

  if (item.state === 'started') {
    const startedFrom = lastEvidenceMs || stateChangedMs;
    if (nowMs - startedFrom > Number(thresholds.startedNoFollowupMinutes || 0) * 60 * 1000) {
      return { stall_status: 'watch', stall_reason: 'started_without_followup' };
    }
    return { stall_status: 'none', stall_reason: null };
  }

  if (item.state === 'in_progress') {
    if (lastEvidenceMs === null) {
      return { stall_status: 'stalled', stall_reason: 'in_progress_without_evidence' };
    }

    if (nowMs - lastEvidenceMs > Number(thresholds.inProgressNoEvidenceMinutes || 0) * 60 * 1000) {
      return { stall_status: 'stalled', stall_reason: 'in_progress_silence' };
    }

    return { stall_status: 'none', stall_reason: null };
  }

  return { stall_status: 'none', stall_reason: null };
}

function normalizeItem(input, now = new Date()) {
  return {
    id: String(input.id || '').trim(),
    title: String(input.title || '').trim(),
    owner: String(input.owner || '').trim(),
    source_kind: String(input.source_kind || '').trim(),
    provenance: {
      speaker: String(input.provenance?.speaker || '').trim(),
      direction: String(input.provenance?.direction || '').trim(),
      channel: String(input.provenance?.channel || '').trim(),
      message_id: input.provenance?.message_id || undefined,
      message_at: input.provenance?.message_at || nowIso(now),
      summary: input.provenance?.summary || undefined
    },
    created_at: input.created_at || nowIso(now),
    state: input.state || 'intent',
    state_changed_at: input.state_changed_at || input.created_at || nowIso(now),
    promise_status: input.promise_status || 'pending',
    expected_update_by: input.expected_update_by || undefined,
    expected_artifacts: Array.isArray(input.expected_artifacts) ? input.expected_artifacts : [],
    last_evidence_at: input.last_evidence_at || undefined,
    stall_status: input.stall_status || 'none',
    stall_reason: input.stall_reason || undefined,
    notes: input.notes || '',
    evidence: Array.isArray(input.evidence) ? input.evidence.map(summarizeEvidence) : []
  };
}

function ensureRequiredItemFields(item) {
  const required = [
    ['id', item.id],
    ['title', item.title],
    ['owner', item.owner],
    ['source_kind', item.source_kind],
    ['provenance.speaker', item.provenance?.speaker],
    ['provenance.direction', item.provenance?.direction],
    ['provenance.channel', item.provenance?.channel],
    ['provenance.message_at', item.provenance?.message_at]
  ];

  const missing = required.filter(([, value]) => !String(value || '').trim()).map(([key]) => key);
  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(', ')}`);
  }
}

function updateDerivedFields(item, thresholds, now = new Date()) {
  const next = { ...item };
  next.last_evidence_at = getLastEvidenceAt(next) || undefined;
  const stall = computeStallStatus(next, thresholds, now);
  next.stall_status = stall.stall_status;
  next.stall_reason = stall.stall_reason || undefined;
  return next;
}

function summarizeItem(item) {
  return {
    id: item.id,
    title: item.title,
    owner: item.owner,
    state: item.state,
    promise_status: item.promise_status,
    stall_status: item.stall_status,
    stall_reason: item.stall_reason || null,
    last_evidence_at: item.last_evidence_at || null,
    expected_update_by: item.expected_update_by || null,
    notes: item.notes || ''
  };
}

function buildSummary(state, actorKey, now = new Date()) {
  const items = state.items.map((item) => updateDerivedFields(item, state.thresholds, now));
  const openItems = items.filter((item) => item.promise_status === 'pending' && item.state !== 'done');
  const stalledItems = openItems.filter((item) => item.stall_status === 'stalled');
  const watchItems = openItems.filter((item) => item.stall_status === 'watch');
  const shouldAlert = stalledItems.length > 0 || watchItems.length > 0;
  const severity = stalledItems.length > 0 ? 'stalled' : watchItems.length > 0 ? 'watch' : 'quiet';
  const hottest = stalledItems[0] || watchItems[0] || openItems[0] || null;

  return {
    actorKey,
    checkedAt: nowIso(now),
    shouldAlert,
    severity,
    openCount: openItems.length,
    stalledCount: stalledItems.length,
    watchCount: watchItems.length,
    items: openItems.map(summarizeItem),
    hottest: hottest ? summarizeItem(hottest) : null,
    summary: [
      `open=${openItems.length}`,
      `watch=${watchItems.length}`,
      `stalled=${stalledItems.length}`,
      hottest ? `top=${hottest.id}:${hottest.state}/${hottest.stall_status}` : null
    ].filter(Boolean).join('; ')
  };
}

function findItemIndex(state, id) {
  return state.items.findIndex((item) => item.id === id);
}

function applyEvidenceToItem(current, evidence, payload = {}) {
  if (current.state === 'done') {
    throw new Error(`Cannot add evidence to done item: ${current.id}`);
  }

  const next = {
    ...current,
    evidence: [...(current.evidence || []), evidence],
    notes: payload.notes || current.notes || ''
  };

  if (current.state === 'intent') {
    next.state = 'started';
    next.state_changed_at = evidence.recorded_at;
  } else if (current.state === 'started') {
    next.state = 'in_progress';
    next.state_changed_at = evidence.recorded_at;
  }

  if (payload.expected_update_by) {
    next.expected_update_by = payload.expected_update_by;
  }

  return next;
}

function parseNamedArgs(args, allowedFlags) {
  const options = {};

  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (!allowedFlags.has(key)) {
      throw new Error(`Unknown option: ${key}`);
    }

    const value = args[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Missing value for option: ${key}`);
    }

    options[key] = value;
    index += 1;
  }

  return options;
}

function parseResumeOptions(optionArgs) {
  return parseNamedArgs(optionArgs, new Set([
    '--state-path',
    '--expected-update-by',
    '--eta-minutes',
    '--notes',
    '--recorded-at',
    '--path',
    '--command'
  ]));
}

function parseCaptureOptions(optionArgs) {
  return parseNamedArgs(optionArgs, new Set([
    '--state-path',
    '--id',
    '--source-kind',
    '--speaker',
    '--direction',
    '--channel',
    '--message-at',
    '--recorded-at',
    '--expected-update-by',
    '--eta-minutes',
    '--notes',
    '--path',
    '--command',
    '--expected-artifacts'
  ]));
}

function parseResolveOptions(optionArgs) {
  const options = {};
  const valuedFlags = new Set([
    '--state-path',
    '--notes',
    '--summary',
    '--recorded-at',
    '--path',
    '--command',
    '--result'
  ]);
  const booleanFlags = new Set(['--verify-expected-artifacts']);

  for (let index = 0; index < optionArgs.length; index += 1) {
    const key = optionArgs[index];
    if (booleanFlags.has(key)) {
      options[key] = true;
      continue;
    }

    if (!valuedFlags.has(key)) {
      throw new Error(`Unknown option: ${key}`);
    }

    const value = optionArgs[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Missing value for option: ${key}`);
    }

    options[key] = value;
    index += 1;
  }

  return options;
}

function parseDoctorOptions(optionArgs) {
  const options = {};
  const valuedFlags = new Set([
    '--summary',
    '--expected-update-by',
    '--eta-minutes',
    '--notes',
    '--recorded-at',
    '--path',
    '--command'
  ]);
  const booleanFlags = new Set(['--apply-resume']);

  for (let index = 0; index < optionArgs.length; index += 1) {
    const key = optionArgs[index];
    if (booleanFlags.has(key)) {
      options[key] = true;
      continue;
    }

    if (!valuedFlags.has(key)) {
      throw new Error(`Unknown option: ${key}`);
    }

    const value = optionArgs[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Missing value for option: ${key}`);
    }

    options[key] = value;
    index += 1;
  }

  return options;
}

function splitListOption(value) {
  if (!value) {
    return [];
  }

  return String(value)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function slugifyIdPart(value) {
  return String(value || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function buildGeneratedItemId(owner, title, recordedAt) {
  const ownerPart = slugifyIdPart(owner) || 'owner';
  const titlePart = slugifyIdPart(title) || 'promise';
  const stamp = recordedAt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return `${ownerPart}-${titlePart}-${stamp}`;
}

function buildCaptureItem(owner, title, provenanceSummary, executionSummary, options, now = new Date()) {
  const recordedAt = options['--recorded-at'] || nowIso(now);
  const recordedAtMs = parseTimestamp(recordedAt);
  if (recordedAtMs === null) {
    throw new Error(`Invalid recorded timestamp: ${recordedAt}`);
  }

  const messageAt = options['--message-at'] || recordedAt;
  if (parseTimestamp(messageAt) === null) {
    throw new Error(`Invalid message timestamp: ${messageAt}`);
  }

  const effectiveOwner = String(owner || '').trim();
  const itemId = options['--id'] || buildGeneratedItemId(effectiveOwner, title, new Date(recordedAtMs));

  return normalizeItem({
    id: itemId,
    title,
    owner: effectiveOwner,
    source_kind: options['--source-kind'] || 'agent_commitment',
    provenance: {
      speaker: options['--speaker'] || effectiveOwner,
      direction: options['--direction'] || 'outbound',
      channel: options['--channel'] || 'feishu',
      message_at: messageAt,
      summary: provenanceSummary
    },
    created_at: messageAt,
    state: 'started',
    state_changed_at: recordedAt,
    promise_status: 'pending',
    expected_update_by: resolveExpectedUpdateBy(options, new Date(recordedAtMs)),
    expected_artifacts: splitListOption(options['--expected-artifacts']),
    notes: options['--notes'] || '',
    evidence: [
      {
        type: 'manual_check',
        recorded_at: recordedAt,
        summary: executionSummary,
        path: options['--path'] || null,
        command: options['--command'] || null,
        result: 'capture_live'
      }
    ]
  }, now);
}

function resolveExpectedUpdateBy(options, baseTime) {
  if (options['--expected-update-by'] && options['--eta-minutes']) {
    throw new Error('Use either --expected-update-by or --eta-minutes, not both.');
  }

  if (options['--expected-update-by']) {
    return options['--expected-update-by'];
  }

  if (!options['--eta-minutes']) {
    return undefined;
  }

  const etaMinutes = Number(options['--eta-minutes']);
  if (!Number.isFinite(etaMinutes) || etaMinutes <= 0) {
    throw new Error('--eta-minutes must be a positive number.');
  }

  return new Date(baseTime.getTime() + etaMinutes * 60 * 1000).toISOString();
}

function buildResumeOperation(summary, options, now = new Date()) {
  const recordedAt = options['--recorded-at'] || nowIso(now);
  const recordedAtMs = parseTimestamp(recordedAt);
  if (recordedAtMs === null) {
    throw new Error(`Invalid recorded timestamp: ${recordedAt}`);
  }

  return {
    evidence: summarizeEvidence({
      type: 'manual_check',
      recorded_at: recordedAt,
      summary,
      path: options['--path'] || null,
      command: options['--command'] || null,
      result: 'resume'
    }),
    notes: options['--notes'],
    expected_update_by: resolveExpectedUpdateBy(options, new Date(recordedAtMs))
  };
}

function buildArtifactCandidates(repoRoot, artifactPath) {
  const trimmed = String(artifactPath || '').trim();
  if (!trimmed) {
    return [];
  }

  if (path.isAbsolute(trimmed)) {
    return [path.normalize(trimmed)];
  }

  const normalized = trimmed.replace(/[\\/]+/g, path.sep);
  const repoName = path.basename(repoRoot);
  const repoPrefix = `${repoName}${path.sep}`;
  const candidates = [path.resolve(repoRoot, normalized)];

  if (normalized.toLowerCase().startsWith(repoPrefix.toLowerCase())) {
    candidates.push(path.resolve(repoRoot, normalized.slice(repoPrefix.length)));
  }

  return [...new Set(candidates.map((candidate) => path.normalize(candidate)))];
}

async function verifyExpectedArtifacts(repoRoot, expectedArtifacts) {
  const verified = [];
  const missing = [];

  for (const artifactPath of Array.isArray(expectedArtifacts) ? expectedArtifacts : []) {
    const candidates = buildArtifactCandidates(repoRoot, artifactPath);
    let matched = null;

    for (const candidate of candidates) {
      if (await pathExists(candidate)) {
        matched = candidate;
        break;
      }
    }

    if (!matched) {
      missing.push(artifactPath);
      continue;
    }

    verified.push({
      path: artifactPath,
      resolved_path: matched
    });
  }

  if (missing.length > 0) {
    throw new Error(`Expected artifacts not found: ${missing.join(', ')}`);
  }

  return verified;
}

function buildResolveOperation(resolution, options, verifiedArtifacts, now = new Date()) {
  const recordedAt = options['--recorded-at'] || nowIso(now);
  const recordedAtMs = parseTimestamp(recordedAt);
  if (recordedAtMs === null) {
    throw new Error(`Invalid recorded timestamp: ${recordedAt}`);
  }

  const summary = options['--summary']
    || (verifiedArtifacts.length > 0 ? `Verified ${verifiedArtifacts.length} expected artifact(s) and closed the promise.` : null);

  return {
    recordedAt,
    notes: options['--notes'],
    evidence: summary
      ? summarizeEvidence({
          type: 'artifact_verified',
          recorded_at: recordedAt,
          summary,
          path: options['--path'] || null,
          command: options['--command'] || null,
          result: options['--result'] || 'ok'
        })
      : null
  };
}

async function prepareResolveUpdate(current, resolution, options, payloadPath, repoRoot, now = new Date()) {
  let payload = {};
  let evidence = null;
  let verifiedArtifacts = [];

  if (options) {
    if (options['--verify-expected-artifacts']) {
      verifiedArtifacts = await verifyExpectedArtifacts(repoRoot, current.expected_artifacts);
    }

    const resolve = buildResolveOperation(resolution, options, verifiedArtifacts, now);
    payload = {
      notes: resolve.notes
    };
    evidence = resolve.evidence;
  } else {
    payload = payloadPath ? await readJsonInput(payloadPath) : {};
    evidence = payload.evidence
      ? summarizeEvidence({
          ...payload.evidence,
          recorded_at: payload.evidence.recorded_at || nowIso(now)
        })
      : null;
  }

  return {
    payload,
    evidence,
    verifiedArtifacts,
    resolvedAt: evidence?.recorded_at || nowIso(now)
  };
}

function getActivityTimestamp(item) {
  return parseTimestamp(item.last_evidence_at)
    || parseTimestamp(item.state_changed_at)
    || parseTimestamp(item.created_at)
    || 0;
}

function getStallPriority(item) {
  if (item.stall_status === 'stalled') {
    return 0;
  }

  if (item.stall_status === 'watch') {
    return 1;
  }

  return 2;
}

function selectHottestItem(state, owner, now = new Date()) {
  const candidates = state.items
    .map((item) => updateDerivedFields(item, state.thresholds, now))
    .filter((item) => item.owner === owner && item.promise_status === 'pending' && item.state !== 'done')
    .sort((left, right) => {
      const priorityDiff = getStallPriority(left) - getStallPriority(right);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      return getActivityTimestamp(right) - getActivityTimestamp(left);
    });

  if (candidates.length === 0) {
    throw new Error(`No open promise item found for owner: ${owner}`);
  }

  return {
    selected: candidates[0],
    considered: candidates.map(summarizeItem)
  };
}

function quoteCliArg(value) {
  return JSON.stringify(String(value));
}

function addIssue(issues, level, code, message, itemId, fixCommand) {
  issues.push({
    level,
    code,
    itemId: itemId || null,
    message,
    fixCommand: fixCommand || null
  });
}

function validateEnumValue(issues, value, allowedValues, code, label, itemId) {
  if (value === undefined || value === null || value === '') {
    return;
  }

  if (!allowedValues.includes(value)) {
    addIssue(issues, 'error', code, `${label} must be one of: ${allowedValues.join(', ')}`, itemId);
  }
}

function validateTimestampValue(issues, value, label, itemId) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = parseTimestamp(value);
  if (parsed === null) {
    addIssue(issues, 'error', 'invalid_timestamp', `${label} must be a valid ISO timestamp.`, itemId);
  }

  return parsed;
}

function buildResumeHottestCommand(owner, statePath) {
  return [
    'node scripts/startup_recovery_check.mjs resume-hottest',
    quoteCliArg(owner),
    quoteCliArg('Resumed execution after doctor check.'),
    '--state-path',
    quoteCliArg(statePath),
    '--eta-minutes',
    '30',
    '--notes',
    quoteCliArg('Back in active execution after doctor validation.')
  ].join(' ');
}

function buildHeartbeatCheckCommand(owner, statePath) {
  return [
    'node scripts/startup_recovery_check.mjs heartbeat-check',
    quoteCliArg(owner),
    quoteCliArg(statePath)
  ].join(' ');
}

function buildResolveHottestCommand(owner, resolution, statePath) {
  return [
    'node scripts/startup_recovery_check.mjs resolve-hottest',
    quoteCliArg(owner),
    quoteCliArg(resolution),
    '--state-path',
    quoteCliArg(statePath),
    '--summary',
    quoteCliArg('Verified the bounded deliverable and closed it.'),
    '--notes',
    quoteCliArg('Done and verified.'),
    '--verify-expected-artifacts'
  ].join(' ');
}

function buildCaptureLiveTemplate(owner, statePath) {
  return [
    'node scripts/startup_recovery_check.mjs capture-live',
    quoteCliArg(owner),
    quoteCliArg('<title>'),
    quoteCliArg('<provenanceSummary>'),
    quoteCliArg('<executionSummary>'),
    '--state-path',
    quoteCliArg(statePath),
    '--eta-minutes',
    '30',
    '--notes',
    quoteCliArg('<what_is_happening_now>')
  ].join(' ');
}

function canAutoApplyDoctorResume(report) {
  if (report.nextAction?.kind !== 'resume-hottest') {
    return false;
  }

  if (report.summary?.shouldAlert) {
    return true;
  }

  return report.issues.every((issue) => issue.fixCommand && issue.fixCommand === report.nextAction.command);
}

function buildDoctorResumeRequest(options = {}) {
  const resumeOptions = {};

  if (options['--recorded-at']) {
    resumeOptions['--recorded-at'] = options['--recorded-at'];
  }

  if (options['--expected-update-by']) {
    resumeOptions['--expected-update-by'] = options['--expected-update-by'];
  } else {
    resumeOptions['--eta-minutes'] = options['--eta-minutes'] || '30';
  }

  if (options['--notes']) {
    resumeOptions['--notes'] = options['--notes'];
  } else {
    resumeOptions['--notes'] = 'Back in active execution after doctor auto-resume.';
  }

  if (options['--path']) {
    resumeOptions['--path'] = options['--path'];
  }

  if (options['--command']) {
    resumeOptions['--command'] = options['--command'];
  }

  return {
    summary: options['--summary'] || 'Resumed execution via doctor --apply-resume.',
    resumeOptions
  };
}

function validateDoctorState(state, owner, statePath) {
  const issues = [];
  const seenIds = new Set();
  const allowedSourceKinds = ['user_request', 'agent_commitment', 'review_rework', 'handoff', 'system_followup'];
  const allowedDirections = ['inbound', 'outbound', 'relay', 'artifact'];
  const allowedStates = ['intent', 'started', 'in_progress', 'done'];
  const allowedPromiseStatuses = ['pending', 'fulfilled', 'cancelled', 'superseded'];
  const allowedStallStatuses = ['none', 'watch', 'stalled'];
  const allowedEvidenceTypes = ['session_started', 'artifact_touched', 'command_started', 'command_result', 'artifact_verified', 'manual_check'];
  const resumeCommand = buildResumeHottestCommand(owner, statePath);

  for (const item of state.items) {
    const itemId = item.id || '(missing-id)';
    const required = [
      ['id', item.id],
      ['title', item.title],
      ['owner', item.owner],
      ['source_kind', item.source_kind],
      ['created_at', item.created_at],
      ['state', item.state],
      ['promise_status', item.promise_status],
      ['stall_status', item.stall_status],
      ['provenance.speaker', item.provenance?.speaker],
      ['provenance.direction', item.provenance?.direction],
      ['provenance.channel', item.provenance?.channel],
      ['provenance.message_at', item.provenance?.message_at]
    ];

    const missing = required.filter(([, value]) => !String(value || '').trim()).map(([key]) => key);
    if (missing.length > 0) {
      addIssue(issues, 'error', 'missing_required_fields', `Missing required fields: ${missing.join(', ')}`, itemId);
      continue;
    }

    if (seenIds.has(item.id)) {
      addIssue(issues, 'error', 'duplicate_id', 'Promise item id must be unique.', itemId);
    }
    seenIds.add(item.id);

    validateEnumValue(issues, item.source_kind, allowedSourceKinds, 'invalid_source_kind', 'source_kind', itemId);
    validateEnumValue(issues, item.provenance?.direction, allowedDirections, 'invalid_direction', 'provenance.direction', itemId);
    validateEnumValue(issues, item.state, allowedStates, 'invalid_state', 'state', itemId);
    validateEnumValue(issues, item.promise_status, allowedPromiseStatuses, 'invalid_promise_status', 'promise_status', itemId);
    validateEnumValue(issues, item.stall_status, allowedStallStatuses, 'invalid_stall_status', 'stall_status', itemId);

    const createdAtMs = validateTimestampValue(issues, item.created_at, 'created_at', itemId);
    const stateChangedAtMs = validateTimestampValue(issues, item.state_changed_at, 'state_changed_at', itemId);
    const lastEvidenceAtMs = validateTimestampValue(issues, item.last_evidence_at, 'last_evidence_at', itemId);
    const expectedUpdateByMs = validateTimestampValue(issues, item.expected_update_by, 'expected_update_by', itemId);
    const messageAtMs = validateTimestampValue(issues, item.provenance?.message_at, 'provenance.message_at', itemId);

    if (Array.isArray(item.evidence)) {
      item.evidence.forEach((evidence, index) => {
        validateEnumValue(issues, evidence.type, allowedEvidenceTypes, 'invalid_evidence_type', `evidence[${index}].type`, itemId);
        validateTimestampValue(issues, evidence.recorded_at, `evidence[${index}].recorded_at`, itemId);
        if (!String(evidence.summary || '').trim()) {
          addIssue(issues, 'error', 'missing_evidence_summary', `evidence[${index}].summary is required.`, itemId);
        }
      });
    } else {
      addIssue(issues, 'error', 'invalid_evidence_array', 'evidence must be an array.', itemId);
      continue;
    }

    if (stateChangedAtMs !== null && createdAtMs !== null && stateChangedAtMs < createdAtMs) {
      addIssue(issues, 'error', 'state_before_create', 'state_changed_at cannot be earlier than created_at.', itemId);
    }

    if (messageAtMs !== null && createdAtMs !== null && messageAtMs > createdAtMs) {
      addIssue(issues, 'warn', 'created_before_message', 'created_at is earlier than provenance.message_at; confirm the promise timeline.', itemId);
    }

    if (expectedUpdateByMs !== null && createdAtMs !== null && expectedUpdateByMs < createdAtMs) {
      addIssue(issues, 'error', 'eta_before_create', 'expected_update_by cannot be earlier than created_at.', itemId);
    }

    const computedLastEvidenceAt = getLastEvidenceAt(item);
    if (item.last_evidence_at && computedLastEvidenceAt && item.last_evidence_at !== computedLastEvidenceAt) {
      addIssue(issues, 'warn', 'last_evidence_mismatch', `last_evidence_at should match ${computedLastEvidenceAt}.`, itemId);
    }

    if (item.state === 'started' && item.evidence.length < 1) {
      addIssue(issues, 'error', 'started_requires_evidence', 'started items need at least one evidence entry.', itemId, resumeCommand);
    }

    if (item.state === 'in_progress' && item.evidence.length < 2) {
      addIssue(issues, 'error', 'in_progress_requires_followup_evidence', 'in_progress items need at least two evidence entries.', itemId, resumeCommand);
    }

    if (item.state === 'done' && item.promise_status === 'pending') {
      addIssue(issues, 'error', 'done_requires_closed_promise', 'done items cannot keep promise_status=pending.', itemId);
    }

    if (item.state !== 'done' && item.promise_status !== 'pending') {
      addIssue(issues, 'error', 'closed_promise_requires_done_state', 'fulfilled/cancelled/superseded items must also be state=done.', itemId);
    }

    if (item.promise_status === 'pending' && item.state !== 'done' && !item.expected_update_by) {
      addIssue(issues, 'warn', 'missing_expected_update_by', 'Open items should carry expected_update_by so restart recovery has an ETA to check.', itemId, resumeCommand);
    }

    if (item.promise_status === 'pending' && item.state === 'done') {
      addIssue(issues, 'error', 'pending_done_conflict', 'done items must be resolved, not left pending.', itemId);
    }

    if (item.promise_status !== 'pending' && lastEvidenceAtMs === null) {
      addIssue(issues, 'warn', 'closed_without_close_evidence', 'Closed items should keep a closing evidence timestamp for verification.', itemId);
    }
  }

  const summary = buildSummary(state, owner, new Date());
  let nextAction = {
    kind: 'monitor',
    reason: 'State looks healthy; keep using the regular heartbeat check.',
    command: buildHeartbeatCheckCommand(owner, statePath)
  };

  if (summary.openCount === 0) {
    nextAction = {
      kind: 'capture-live-template',
      reason: 'No open promise is tracked right now; capture the next live commitment as soon as work starts.',
      command: buildCaptureLiveTemplate(owner, statePath)
    };
  } else if (issues.length > 0 || summary.shouldAlert) {
    nextAction = {
      kind: 'resume-hottest',
      reason: 'At least one open promise needs a fresh execution proof and ETA refresh.',
      command: resumeCommand
    };
  }

  const errorCount = issues.filter((issue) => issue.level === 'error').length;
  const warningCount = issues.length - errorCount;
  const completionPath = summary.openCount > 0
    ? {
        kind: 'resolve-hottest',
        reason: 'Once the bounded deliverable is verified, close the hottest open promise without looking up the item id by hand.',
        command: buildResolveHottestCommand(owner, 'fulfilled', statePath)
      }
    : null;

  return {
    ok: issues.length === 0 && !summary.shouldAlert,
    checkedAt: nowIso(),
    owner,
    summary,
    issueCount: issues.length,
    errorCount,
    warningCount,
    alertCount: summary.watchCount + summary.stalledCount,
    nextAction,
    completionPath,
    issues
  };
}

async function commandDoctor(owner, statePath, optionArgs = []) {
  const now = new Date();
  const options = parseDoctorOptions(optionArgs);
  const state = await loadState(statePath);
  state.items = state.items.map((item) => updateDerivedFields(item, state.thresholds, now));
  state.updatedAt = nowIso(now);
  await writeState(statePath, state);

  const preflight = validateDoctorState(state, owner, statePath);
  if (!options['--apply-resume']) {
    process.stdout.write(`${JSON.stringify(preflight, null, 2)}\n`);
    return;
  }

  let applied = null;
  let applyBlockedReason = null;

  if (canAutoApplyDoctorResume(preflight)) {
    const request = buildDoctorResumeRequest(options);
    const selection = selectHottestItem(state, owner, now);
    const index = findItemIndex(state, selection.selected.id);
    const resume = buildResumeOperation(request.summary, request.resumeOptions, now);
    const current = state.items[index];
    const next = applyEvidenceToItem(current, resume.evidence, {
      notes: resume.notes,
      expected_update_by: resume.expected_update_by
    });

    state.items[index] = updateDerivedFields(next, state.thresholds, now);
    state.updatedAt = nowIso(now);
    await writeState(statePath, state);
    applied = {
      kind: 'resume-hottest',
      selected: summarizeItem(selection.selected),
      considered: selection.considered,
      item: summarizeItem(state.items[index]),
      evidence: resume.evidence
    };
  } else if (preflight.nextAction?.kind === 'resume-hottest') {
    applyBlockedReason = 'Doctor found non-resumable structural errors; fix the state manually before using --apply-resume.';
  }

  const final = applied ? validateDoctorState(state, owner, statePath) : preflight;
  process.stdout.write(`${JSON.stringify({ preflight, applied, applyBlockedReason, final }, null, 2)}\n`);
}

async function commandStatus(statePath) {
  const now = new Date();
  const state = await loadState(statePath);
  state.items = state.items.map((item) => updateDerivedFields(item, state.thresholds, now));
  state.updatedAt = nowIso(now);
  await writeState(statePath, state);
  process.stdout.write(`${JSON.stringify(buildSummary(state, 'system', now), null, 2)}\n`);
}

async function commandHeartbeatCheck(actorKey, statePath) {
  const now = new Date();
  const state = await loadState(statePath);
  state.items = state.items.map((item) => updateDerivedFields(item, state.thresholds, now));
  state.updatedAt = nowIso(now);
  await writeState(statePath, state);
  process.stdout.write(`${JSON.stringify(buildSummary(state, actorKey, now), null, 2)}\n`);
}

async function commandCreate(inputPath, statePath) {
  const now = new Date();
  const state = await loadState(statePath);
  const item = normalizeItem(await readJsonInput(inputPath), now);
  ensureRequiredItemFields(item);

  if (findItemIndex(state, item.id) !== -1) {
    throw new Error(`Promise item already exists: ${item.id}`);
  }

  state.items.push(updateDerivedFields(item, state.thresholds, now));
  state.updatedAt = nowIso(now);
  await writeState(statePath, state);
  process.stdout.write(`${JSON.stringify({ ok: true, created: summarizeItem(item) }, null, 2)}\n`);
}

async function commandCaptureLive(owner, title, provenanceSummary, executionSummary, optionArgs, defaultState) {
  const now = new Date();
  const options = parseCaptureOptions(optionArgs);
  const statePath = options['--state-path'] || defaultState;
  const state = await loadState(statePath);
  const item = buildCaptureItem(owner, title, provenanceSummary, executionSummary, options, now);
  ensureRequiredItemFields(item);

  if (findItemIndex(state, item.id) !== -1) {
    throw new Error(`Promise item already exists: ${item.id}`);
  }

  state.items.push(updateDerivedFields(item, state.thresholds, now));
  state.updatedAt = nowIso(now);
  await writeState(statePath, state);
  process.stdout.write(`${JSON.stringify({
    ok: true,
    created: summarizeItem(state.items[state.items.length - 1]),
    evidence: item.evidence[0]
  }, null, 2)}\n`);
}

async function commandAddEvidence(id, inputPath, statePath) {
  const now = new Date();
  const state = await loadState(statePath);
  const index = findItemIndex(state, id);
  if (index === -1) {
    throw new Error(`Promise item not found: ${id}`);
  }

  const payload = await readJsonInput(inputPath);
  const evidence = summarizeEvidence({
    ...payload,
    recorded_at: payload.recorded_at || nowIso(now)
  });

  const current = state.items[index];
  const next = applyEvidenceToItem(current, evidence, payload);

  state.items[index] = updateDerivedFields(next, state.thresholds, now);
  state.updatedAt = nowIso(now);
  await writeState(statePath, state);
  process.stdout.write(`${JSON.stringify({ ok: true, item: summarizeItem(state.items[index]) }, null, 2)}\n`);
}

async function commandResume(id, summary, optionArgs, defaultState) {
  const now = new Date();
  const options = parseResumeOptions(optionArgs);
  const statePath = options['--state-path'] || defaultState;
  const state = await loadState(statePath);
  state.items = state.items.map((item) => updateDerivedFields(item, state.thresholds, now));
  const index = findItemIndex(state, id);
  if (index === -1) {
    throw new Error(`Promise item not found: ${id}`);
  }

  const resume = buildResumeOperation(summary, options, now);
  const current = state.items[index];
  const next = applyEvidenceToItem(current, resume.evidence, {
    notes: resume.notes,
    expected_update_by: resume.expected_update_by
  });

  state.items[index] = updateDerivedFields(next, state.thresholds, now);
  state.updatedAt = nowIso(now);
  await writeState(statePath, state);
  process.stdout.write(`${JSON.stringify({ ok: true, item: summarizeItem(state.items[index]), evidence: resume.evidence }, null, 2)}\n`);
}

async function commandResumeHottest(owner, summary, optionArgs, defaultState) {
  const now = new Date();
  const options = parseResumeOptions(optionArgs);
  const statePath = options['--state-path'] || defaultState;
  const state = await loadState(statePath);
  state.items = state.items.map((item) => updateDerivedFields(item, state.thresholds, now));
  const selection = selectHottestItem(state, owner, now);
  const index = findItemIndex(state, selection.selected.id);
  const resume = buildResumeOperation(summary, options, now);
  const current = state.items[index];
  const next = applyEvidenceToItem(current, resume.evidence, {
    notes: resume.notes,
    expected_update_by: resume.expected_update_by
  });

  state.items[index] = updateDerivedFields(next, state.thresholds, now);
  state.updatedAt = nowIso(now);
  await writeState(statePath, state);
  process.stdout.write(`${JSON.stringify({
    ok: true,
    selected: summarizeItem(selection.selected),
    considered: selection.considered,
    item: summarizeItem(state.items[index]),
    evidence: resume.evidence
  }, null, 2)}\n`);
}

function buildResolvedItem(current, resolution, payload, evidence, resolvedAt) {
  const next = {
    ...current,
    state: 'done',
    state_changed_at: resolvedAt,
    promise_status: resolution,
    stall_status: 'none',
    stall_reason: undefined,
    notes: payload.notes || current.notes || ''
  };

  if (evidence) {
    next.evidence = [...(current.evidence || []), evidence];
  }

  return next;
}

async function commandResolve(id, resolution, statePath, payloadPath, optionArgs, defaultState, repoRoot) {
  const now = new Date();
  const options = optionArgs.length > 0 ? parseResolveOptions(optionArgs) : null;
  const effectiveStatePath = options?.['--state-path'] || statePath || defaultState;
  const state = await loadState(effectiveStatePath);
  const index = findItemIndex(state, id);
  if (index === -1) {
    throw new Error(`Promise item not found: ${id}`);
  }

  const current = state.items[index];
  const { payload, evidence, verifiedArtifacts, resolvedAt } = await prepareResolveUpdate(current, resolution, options, payloadPath, repoRoot, now);
  const next = buildResolvedItem(current, resolution, payload, evidence, resolvedAt);

  state.items[index] = updateDerivedFields(next, state.thresholds, now);
  state.updatedAt = nowIso(now);
  await writeState(effectiveStatePath, state);
  process.stdout.write(`${JSON.stringify({
    ok: true,
    item: summarizeItem(state.items[index]),
    evidence,
    verifiedArtifacts
  }, null, 2)}\n`);
}

async function commandResolveHottest(owner, resolution, optionArgs, defaultState, repoRoot) {
  const now = new Date();
  const options = parseResolveOptions(optionArgs);
  const statePath = options['--state-path'] || defaultState;
  const state = await loadState(statePath);
  state.items = state.items.map((item) => updateDerivedFields(item, state.thresholds, now));
  const selection = selectHottestItem(state, owner, now);
  const index = findItemIndex(state, selection.selected.id);
  const current = state.items[index];
  const { payload, evidence, verifiedArtifacts, resolvedAt } = await prepareResolveUpdate(current, resolution, options, null, repoRoot, now);
  const next = buildResolvedItem(current, resolution, payload, evidence, resolvedAt);

  state.items[index] = updateDerivedFields(next, state.thresholds, now);
  state.updatedAt = nowIso(now);
  await writeState(statePath, state);
  process.stdout.write(`${JSON.stringify({
    ok: true,
    selected: summarizeItem(selection.selected),
    considered: selection.considered,
    item: summarizeItem(state.items[index]),
    evidence,
    verifiedArtifacts
  }, null, 2)}\n`);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const repoRoot = process.cwd();
  const defaultState = path.join(repoRoot, 'notes', 'startup-recovery-state.json');

  if (command === 'status') {
    await commandStatus(args[0] || defaultState);
    return;
  }

  if (command === 'heartbeat-check') {
    if (!args[0]) {
      usage();
      process.exitCode = 1;
      return;
    }

    await commandHeartbeatCheck(args[0], args[1] || defaultState);
    return;
  }

  if (command === 'doctor') {
    if (!args[0]) {
      usage();
      process.exitCode = 1;
      return;
    }

    const doctorStatePath = args[1] && !String(args[1]).startsWith('--') ? args[1] : defaultState;
    const doctorOptionStart = doctorStatePath === defaultState ? 1 : 2;
    await commandDoctor(args[0], doctorStatePath, args.slice(doctorOptionStart));
    return;
  }

  if (command === 'create') {
    if (!args[0]) {
      usage();
      process.exitCode = 1;
      return;
    }

    await commandCreate(args[0], args[1] || defaultState);
    return;
  }

  if (command === 'capture-live') {
    if (!args[0] || !args[1] || !args[2] || !args[3]) {
      usage();
      process.exitCode = 1;
      return;
    }

    await commandCaptureLive(args[0], args[1], args[2], args[3], args.slice(4), defaultState);
    return;
  }

  if (command === 'add-evidence') {
    if (!args[0] || !args[1]) {
      usage();
      process.exitCode = 1;
      return;
    }

    await commandAddEvidence(args[0], args[1], args[2] || defaultState);
    return;
  }

  if (command === 'resume') {
    if (!args[0] || !args[1]) {
      usage();
      process.exitCode = 1;
      return;
    }

    await commandResume(args[0], args[1], args.slice(2), defaultState);
    return;
  }

  if (command === 'resume-hottest') {
    if (!args[0] || !args[1]) {
      usage();
      process.exitCode = 1;
      return;
    }

    await commandResumeHottest(args[0], args[1], args.slice(2), defaultState);
    return;
  }

  if (command === 'resolve-hottest') {
    if (!args[0] || !args[1]) {
      usage();
      process.exitCode = 1;
      return;
    }

    await commandResolveHottest(args[0], args[1], args.slice(2), defaultState, repoRoot);
    return;
  }

  if (command === 'resolve') {
    if (!args[0] || !args[1]) {
      usage();
      process.exitCode = 1;
      return;
    }

    const optionStartIndex = args.findIndex((value, index) => index >= 2 && String(value).startsWith('--'));
    if (optionStartIndex !== -1) {
      await commandResolve(args[0], args[1], null, null, args.slice(optionStartIndex), defaultState, repoRoot);
      return;
    }

    await commandResolve(args[0], args[1], args[2] || defaultState, args[3], [], defaultState, repoRoot);
    return;
  }

  usage();
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
