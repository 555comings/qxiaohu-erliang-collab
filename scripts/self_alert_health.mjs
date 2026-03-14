import path from 'node:path';
import { readFile } from 'node:fs/promises';

import { assertStateShape, createEmptyState } from './self_alert_evaluator.mjs';
import { loadState } from './self_alert_state.mjs';

function slugify(value, fallback = 'health-check') {
  const normalized = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || fallback;
}

function stripBom(value) {
  return String(value || '').replace(/^\uFEFF/, '');
}

function normalizeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildHealthCandidate({ topicScope, summary, evidence, errorSignature, metadata = {}, now = new Date() }) {
  return {
    signalType: 'memory_health',
    topicScope,
    errorSignature,
    summary,
    evidence,
    metadata,
    timestamp: now.toISOString()
  };
}

function validateNumericMap(name, value, now, candidates) {
  if (value == null) {
    return;
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    candidates.push(buildHealthCandidate({
      topicScope: 'self-alert-health',
      summary: `State ${name} metadata is malformed.`,
      evidence: `${name} is not an object`,
      errorSignature: slugify(`${name}-not-object`, name),
      now
    }));
    return;
  }

  for (const [key, rawValue] of Object.entries(value)) {
    const parsed = normalizeNumber(rawValue);
    if (parsed == null || parsed < 0) {
      candidates.push(buildHealthCandidate({
        topicScope: 'self-alert-health',
        summary: `State ${name}.${key} is invalid.`,
        evidence: `${name}.${key}=${rawValue}`,
        errorSignature: slugify(`${name}-${key}-invalid`, `${name}-${key}`),
        metadata: { field: `${name}.${key}` },
        now
      }));
    }
  }
}

async function inspectNdjsonFile(filePath, now, candidates) {
  try {
    const raw = stripBom(await readFile(filePath, 'utf8'));
    const lines = raw.split(/\r?\n/);

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index].trim();
      if (!line) {
        continue;
      }

      try {
        JSON.parse(line);
      } catch (error) {
        candidates.push(buildHealthCandidate({
          topicScope: 'self-alert-health',
          summary: `NDJSON input has an unreadable line in ${path.basename(filePath)}.`,
          evidence: `file=${filePath}; line=${index + 1}; error=${error.message}; raw=${line}`,
          errorSignature: slugify(`${path.basename(filePath)}-line-${index + 1}-json`, 'ndjson-parse'),
          metadata: { filePath, lineNumber: index + 1 },
          now
        }));
      }
    }
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return;
    }

    candidates.push(buildHealthCandidate({
      topicScope: 'self-alert-health',
      summary: `Unable to read ${path.basename(filePath)} during health check.`,
      evidence: `file=${filePath}; error=${error.message}`,
      errorSignature: slugify(`${path.basename(filePath)}-read-failure`, 'input-read-failure'),
      metadata: { filePath },
      now
    }));
  }
}

export async function collectHealthCandidates({
  statePath,
  workspaceRoot,
  inputsRoot,
  now = new Date()
}) {
  const timestamp = now instanceof Date ? now : new Date(now);
  const candidates = [];
  let state = createEmptyState(timestamp);
  let persistState = true;

  try {
    state = await loadState(statePath, timestamp);
    assertStateShape(state);

    if (!Number.isFinite(Date.parse(state.updatedAt || ''))) {
      candidates.push(buildHealthCandidate({
        topicScope: 'self-alert-health',
        summary: 'State updatedAt is invalid.',
        evidence: `statePath=${statePath}; updatedAt=${state.updatedAt}`,
        errorSignature: 'state-updated-at-invalid',
        now: timestamp
      }));
    }

    validateNumericMap('cursors', state.meta?.cursors, timestamp, candidates);
    validateNumericMap('inputSizes', state.meta?.inputSizes, timestamp, candidates);
  } catch (error) {
    persistState = false;
    state = createEmptyState(timestamp);
    candidates.push(buildHealthCandidate({
      topicScope: 'self-alert-health',
      summary: 'State file could not be loaded or validated.',
      evidence: `statePath=${statePath}; error=${error.message}`,
      errorSignature: slugify(`state-load-${error.message}`, 'state-load-failure'),
      metadata: { statePath },
      now: timestamp
    }));
  }

  const resolvedInputsRoot = inputsRoot || path.join(workspaceRoot, 'runtime', 'self_alert_inputs');
  await inspectNdjsonFile(path.join(resolvedInputsRoot, 'user.ndjson'), timestamp, candidates);
  await inspectNdjsonFile(path.join(resolvedInputsRoot, 'tool.ndjson'), timestamp, candidates);

  return {
    ok: candidates.length === 0,
    candidates,
    state,
    persistState
  };
}
