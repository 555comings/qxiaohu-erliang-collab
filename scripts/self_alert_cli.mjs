import path from 'node:path';
import process from 'node:process';
import { readFile } from 'node:fs/promises';

import { evaluateCandidate } from './self_alert_evaluator.mjs';
import { loadState, saveState } from './self_alert_state.mjs';
import { detectToolCandidates, detectUserCandidates } from './self_alert_detectors.mjs';
import { pollAlertSources } from './self_alert_poll.mjs';
import { runHealthCheck, runSelfAlertTick, processCandidates } from './self_alert_cycle.mjs';

function stripBom(value) {
  return String(value || '').replace(/^\uFEFF/, '');
}

async function readJson(jsonPath) {
  if (!jsonPath || jsonPath === '-') {
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    return JSON.parse(stripBom(Buffer.concat(chunks).toString('utf8')));
  }

  const raw = await readFile(jsonPath, 'utf8');
  return JSON.parse(stripBom(raw));
}

function usage() {
  console.error([
    'Usage:',
    '  node scripts/self_alert_cli.mjs evaluate <candidate.json|-> [statePath]',
    '  node scripts/self_alert_cli.mjs detect-user <event.json|->',
    '  node scripts/self_alert_cli.mjs detect-tool <event.json|->',
    '  node scripts/self_alert_cli.mjs process-user <event.json|-> [statePath] [workspaceRoot]',
    '  node scripts/self_alert_cli.mjs process-tool <event.json|-> [statePath] [workspaceRoot]',
    '  node scripts/self_alert_cli.mjs poll [statePath] [workspaceRoot] [inputsRoot]',
    '  node scripts/self_alert_cli.mjs health-check [statePath] [workspaceRoot] [inputsRoot]',
    '  node scripts/self_alert_cli.mjs tick [statePath] [workspaceRoot] [inputsRoot]'
  ].join('\n'));
}

async function main() {
  const [, , command, inputPath, statePathArg, workspaceRootArg] = process.argv;

  if (!command) {
    usage();
    process.exitCode = 1;
    return;
  }

  if (command === 'evaluate') {
    const statePath = statePathArg || path.join(process.cwd(), 'memory', 'self_alert_state.json');
    const candidate = await readJson(inputPath);
    const state = await loadState(statePath);
    const result = evaluateCandidate(candidate, state);
    await saveState(statePath, result.state);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (command === 'detect-user') {
    const event = await readJson(inputPath);
    process.stdout.write(`${JSON.stringify(detectUserCandidates(event), null, 2)}\n`);
    return;
  }

  if (command === 'detect-tool') {
    const event = await readJson(inputPath);
    process.stdout.write(`${JSON.stringify(detectToolCandidates(event), null, 2)}\n`);
    return;
  }

  if (command === 'process-user' || command === 'process-tool') {
    const event = await readJson(inputPath);
    const statePath = statePathArg || path.join(process.cwd(), 'memory', 'self_alert_state.json');
    const workspaceRoot = workspaceRootArg || process.cwd();
    const candidates = command === 'process-user'
      ? detectUserCandidates(event)
      : detectToolCandidates(event);
    const output = await processCandidates(candidates, statePath, workspaceRoot);
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    return;
  }

  if (command === 'poll') {
    const output = await pollAlertSources({
      statePath: inputPath || path.join(process.cwd(), 'memory', 'self_alert_state.json'),
      workspaceRoot: statePathArg || process.cwd(),
      inputsRoot: workspaceRootArg || path.join(process.cwd(), 'runtime', 'self_alert_inputs')
    });
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    return;
  }

  if (command === 'health-check') {
    const output = await runHealthCheck({
      statePath: inputPath || path.join(process.cwd(), 'memory', 'self_alert_state.json'),
      workspaceRoot: statePathArg || process.cwd(),
      inputsRoot: workspaceRootArg || path.join(process.cwd(), 'runtime', 'self_alert_inputs')
    });
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    return;
  }

  if (command === 'tick') {
    const output = await runSelfAlertTick({
      statePath: inputPath || path.join(process.cwd(), 'memory', 'self_alert_state.json'),
      workspaceRoot: statePathArg || process.cwd(),
      inputsRoot: workspaceRootArg || path.join(process.cwd(), 'runtime', 'self_alert_inputs')
    });
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    return;
  }

  usage();
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
