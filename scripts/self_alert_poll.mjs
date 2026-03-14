import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { detectToolCandidates, detectUserCandidates } from './self_alert_detectors.mjs';
import { loadState, saveState } from './self_alert_state.mjs';
import { writeEvaluationResult } from './self_alert_writer.mjs';
import { evaluateCandidate } from './self_alert_evaluator.mjs';

function ensureCursorState(state) {
  if (!state.meta || typeof state.meta !== 'object') {
    state.meta = { cursors: {} };
  }

  if (!state.meta.cursors || typeof state.meta.cursors !== 'object') {
    state.meta.cursors = {};
  }
}

async function readNewJsonLines(filePath, cursor) {
  try {
    const raw = await readFile(filePath, 'utf8');
    const startOffset = Number(cursor || 0) > raw.length ? 0 : Number(cursor || 0);
    const nextCursor = raw.length;
    const slice = raw.slice(startOffset);
    const lines = slice
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    return {
      events: lines.map((line) => JSON.parse(line)),
      nextCursor
    };
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return { events: [], nextCursor: cursor || 0 };
    }

    throw error;
  }
}

async function processEvents(events, detector, state, workspaceRoot) {
  const processed = [];

  for (const event of events) {
    const candidates = detector(event);
    for (const candidate of candidates) {
      const result = evaluateCandidate(candidate, state);
      state = result.state;
      const writeResult = await writeEvaluationResult(result, workspaceRoot);
      processed.push({ ...result, writeResult });
    }
  }

  return { state, processed };
}

export async function pollAlertSources(options = {}) {
  const workspaceRoot = options.workspaceRoot || process.cwd();
  const statePath = options.statePath || path.join(workspaceRoot, 'memory', 'self_alert_state.json');
  const inputsRoot = options.inputsRoot || path.join(workspaceRoot, 'runtime', 'self_alert_inputs');
  const userInputPath = options.userInputPath || path.join(inputsRoot, 'user.ndjson');
  const toolInputPath = options.toolInputPath || path.join(inputsRoot, 'tool.ndjson');

  await mkdir(inputsRoot, { recursive: true });

  let state = await loadState(statePath);
  ensureCursorState(state);

  const userCursor = Number(state.meta.cursors.user || 0);
  const toolCursor = Number(state.meta.cursors.tool || 0);

  const userBatch = await readNewJsonLines(userInputPath, userCursor);
  const toolBatch = await readNewJsonLines(toolInputPath, toolCursor);

  const processedUser = await processEvents(userBatch.events, detectUserCandidates, state, workspaceRoot);
  state = processedUser.state;

  const processedTool = await processEvents(toolBatch.events, detectToolCandidates, state, workspaceRoot);
  state = processedTool.state;

  ensureCursorState(state);
  state.meta.cursors.user = userBatch.nextCursor;
  state.meta.cursors.tool = toolBatch.nextCursor;
  state.updatedAt = new Date().toISOString();

  await saveState(statePath, state);

  return {
    inputsRoot,
    statePath,
    userInputPath,
    toolInputPath,
    consumed: {
      user: userBatch.events.length,
      tool: toolBatch.events.length
    },
    produced: processedUser.processed.length + processedTool.processed.length,
    wrote: [...processedUser.processed, ...processedTool.processed].filter((entry) => entry.writeResult?.wrote).length,
    results: [...processedUser.processed, ...processedTool.processed],
    state
  };
}
