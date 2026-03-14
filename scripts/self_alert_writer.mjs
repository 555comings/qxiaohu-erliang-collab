import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { ROUTES } from './self_alert_evaluator.mjs';

function formatLocalTimestamp(input) {
  const date = input instanceof Date ? input : new Date(input);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function dayFileName(input) {
  const date = input instanceof Date ? input : new Date(input);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}.md`;
}

export function redactSensitiveText(value) {
  return String(value || '')
    .replace(/sk-[A-Za-z0-9_-]{10,}/g, 'sk-***')
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, '$1***')
    .replace(/((?:api[_-]?key|token|secret|cookie|password)\s*[:=]\s*)([^\s,;]+)/gi, '$1***')
    .replace(/([A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD)[A-Z0-9_]*\s*=\s*)([^\s]+)/g, '$1***');
}

export function resolveRoutePath(route, workspaceRoot, timestamp = new Date()) {
  switch (route) {
    case ROUTES.DAILY:
      return path.join(workspaceRoot, 'memory', dayFileName(timestamp));
    case ROUTES.ERRORS:
      return path.join(workspaceRoot, '.learnings', 'ERRORS.md');
    case ROUTES.LEARNINGS:
      return path.join(workspaceRoot, '.learnings', 'LEARNINGS.md');
    case ROUTES.MEMORY:
      return path.join(workspaceRoot, 'MEMORY.md');
    case ROUTES.EMERGENCY:
      return path.join(workspaceRoot, 'memory', 'emergency.md');
    default:
      return null;
  }
}

function resolveDailyTrigger(candidate) {
  if (candidate.signalType === 'remember_request') {
    return 'remember-request';
  }

  if (candidate.signalType === 'task_state_change') {
    return candidate.metadata?.taskState || 'progress';
  }

  if (candidate.signalType === 'exec_error' ||
      candidate.signalType === 'write_failure' ||
      candidate.signalType === 'memory_health' ||
      candidate.signalType === 'systemic_failure') {
    return 'blocked';
  }

  return 'lesson';
}

function resolveDailyStatus(result) {
  return result.level === 'COUNT' ? 'draft' : 'verified';
}

function buildDailyRecord(result) {
  const timestamp = formatLocalTimestamp(result.candidate.timestamp || result.state.updatedAt || new Date());
  const candidate = result.candidate;
  const summary = candidate.summary || 'Self alert recorded an event worth keeping in daily memory.';
  const evidence = redactSensitiveText(candidate.evidence || 'n/a');
  const lines = [
    `## [self-alert] ${timestamp}`,
    `- Trigger: ${resolveDailyTrigger(candidate)}`,
    `- Scope: ${candidate.topicScope}`,
    `- Status: ${resolveDailyStatus(result)}`,
    `- Entry: Self alert recorded a ${candidate.signalType} event. ${summary}`,
    `- Evidence: signal=${candidate.signalType}; level=${result.level}; reason=${result.reason}; raw=${evidence}`,
    '- Next: Review for promotion only if the same pattern becomes stable across time; otherwise keep it at the daily layer.'
  ];

  return `${lines.join(os.EOL)}${os.EOL}${os.EOL}`;
}

function buildMarkdownRecord(result) {
  const timestamp = formatLocalTimestamp(result.candidate.timestamp || result.state.updatedAt || new Date());
  const candidate = result.candidate;
  const promoteTarget = result.route === ROUTES.MEMORY ? 'MEMORY.md' : 'none';
  const lines = [
    `## [self-alert] ${timestamp}`,
    `- Level: ${result.level}`,
    `- Type: ${candidate.signalType}`,
    `- Trigger: ${candidate.summary || candidate.signalType}`,
    `- Evidence: ${redactSensitiveText(candidate.evidence || 'n/a')}`,
    `- Scope: ${candidate.topicScope}`,
    `- What Happened: ${candidate.summary || 'Signal detected and evaluated.'}`,
    `- Why It Matters: ${result.reason}`,
    `- What to Do Differently: review and route this event according to the alert policy`,
    `- Promote To: ${promoteTarget}`
  ];

  return `${lines.join(os.EOL)}${os.EOL}${os.EOL}`;
}

function buildDailySkeleton(filePath) {
  const dateText = path.basename(filePath, path.extname(filePath));
  return [
    `# ${dateText}`,
    '',
    '## Meta',
    '- Timezone: Asia/Shanghai',
    '- Owner: self-alert',
    '- Format: daily-memory-v2',
    '',
    '## Focus',
    '- Active: self-alert generated records',
    '- Open Loops: none',
    '',
    '## Entries',
    '',
    '## End State',
    '- Promote: none',
    '- Carry Forward: none',
    ''
  ].join(os.EOL);
}

function insertDailyRecord(existing, recordText) {
  const lines = existing.split(/\r?\n/);
  const entriesIndex = lines.findIndex((line) => line.trim() === '## Entries');

  if (entriesIndex === -1) {
    return `${existing}${existing.endsWith(os.EOL) ? '' : os.EOL}${recordText}`;
  }

  let insertIndex = lines.length;
  for (let index = entriesIndex + 1; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (/^##\s+\[/.test(trimmed)) {
      continue;
    }

    if (/^##\s+/.test(trimmed)) {
      insertIndex = index;
      break;
    }
  }

  const before = lines.slice(0, insertIndex).join(os.EOL);
  const after = lines.slice(insertIndex).join(os.EOL);
  const needsSeparator = before && !before.endsWith(os.EOL + os.EOL) ? os.EOL : '';
  return `${before}${needsSeparator}${recordText}${after}`;
}

async function atomicWrite(filePath, content) {
  const tempPath = `${filePath}.tmp`;
  await writeFile(tempPath, content, 'utf8');
  await rename(tempPath, filePath);
}

export async function appendMarkdownRecord(filePath, recordText, options = {}) {
  await mkdir(path.dirname(filePath), { recursive: true });

  let existing = '';
  try {
    existing = await readFile(filePath, 'utf8');
  } catch (error) {
    if (!error || error.code !== 'ENOENT') {
      throw error;
    }
  }

  let content = '';
  if (options.dailyV2) {
    const base = existing || buildDailySkeleton(filePath);
    content = insertDailyRecord(base, recordText);
  } else {
    const prefix = existing && !existing.endsWith(os.EOL + os.EOL) ? `${os.EOL}` : '';
    content = `${existing}${prefix}${recordText}`;
  }

  await atomicWrite(filePath, content);
}

export async function writeEvaluationResult(result, workspaceRoot) {
  if (!result.shouldWrite || result.route === ROUTES.NONE) {
    return { wrote: false, route: result.route, path: null };
  }

  const filePath = resolveRoutePath(result.route, workspaceRoot, result.candidate.timestamp || new Date());
  const isDailyRoute = result.route === ROUTES.DAILY;
  const recordText = isDailyRoute ? buildDailyRecord(result) : buildMarkdownRecord(result);
  await appendMarkdownRecord(filePath, recordText, { dailyV2: isDailyRoute });
  return { wrote: true, route: result.route, path: filePath };
}
