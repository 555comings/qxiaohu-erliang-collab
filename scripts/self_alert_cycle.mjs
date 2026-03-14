import path from 'node:path';

import { ROUTES, evaluateCandidate } from './self_alert_evaluator.mjs';
import { collectHealthCandidates } from './self_alert_health.mjs';
import { loadState, saveState } from './self_alert_state.mjs';
import { pollAlertSources } from './self_alert_poll.mjs';
import { writeEvaluationResult } from './self_alert_writer.mjs';

export async function processCandidates(candidates, statePath, workspaceRoot, options = {}) {
  let state = options.initialState || await loadState(statePath);
  const results = [];

  for (const candidate of candidates) {
    const result = evaluateCandidate(candidate, state);
    state = result.state;
    const writeResult = await writeEvaluationResult(result, workspaceRoot);
    results.push({ ...result, writeResult });
  }

  if (options.persistState !== false) {
    await saveState(statePath, state);
  }

  return {
    count: results.length,
    wrote: results.filter((entry) => entry.writeResult?.wrote).length,
    routes: results.map((entry) => entry.route).filter((route) => route !== ROUTES.NONE),
    results,
    state,
    persistedState: options.persistState !== false
  };
}

export async function runHealthCheck(options = {}) {
  const workspaceRoot = options.workspaceRoot || process.cwd();
  const statePath = options.statePath || path.join(workspaceRoot, 'memory', 'self_alert_state.json');
  const inputsRoot = options.inputsRoot || path.join(workspaceRoot, 'runtime', 'self_alert_inputs');
  const health = await collectHealthCandidates({ statePath, workspaceRoot, inputsRoot, now: options.now });
  const processed = await processCandidates(health.candidates, statePath, workspaceRoot, {
    initialState: health.state,
    persistState: health.persistState
  });

  return {
    workspaceRoot,
    statePath,
    inputsRoot,
    ...health,
    ...processed
  };
}

export async function runSelfAlertTick(options = {}) {
  const workspaceRoot = options.workspaceRoot || process.cwd();
  const statePath = options.statePath || path.join(workspaceRoot, 'memory', 'self_alert_state.json');
  const inputsRoot = options.inputsRoot || path.join(workspaceRoot, 'runtime', 'self_alert_inputs');
  const health = await runHealthCheck({ workspaceRoot, statePath, inputsRoot, now: options.now });
  const hasHealthIssues = health.count > 0 || health.ok === false;

  if (hasHealthIssues) {
    return {
      workspaceRoot,
      statePath,
      inputsRoot,
      health,
      poll: null,
      skippedPoll: true,
      summary: {
        healthIssues: health.count,
        consumed: { user: 0, tool: 0 },
        wrote: health.wrote,
        routes: [...new Set(health.routes)]
      }
    };
  }

  const poll = await pollAlertSources({ workspaceRoot, statePath, inputsRoot });
  const pollRoutes = poll.results
    .map((entry) => entry.route)
    .filter((route) => route && route !== ROUTES.NONE);

  return {
    workspaceRoot,
    statePath,
    inputsRoot,
    health,
    poll,
    skippedPoll: false,
    summary: {
      healthIssues: health.count,
      consumed: poll.consumed,
      wrote: health.wrote + poll.wrote,
      routes: [...new Set([...health.routes, ...pollRoutes])]
    }
  };
}
