import path from 'node:path';
import process from 'node:process';
import { readFile } from 'node:fs/promises';

import { evaluateCandidate } from './self_alert_evaluator.mjs';
import { loadState, saveState } from './self_alert_state.mjs';

async function readCandidate(candidatePath) {
  if (!candidatePath || candidatePath === '-') {
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }

  const raw = await readFile(candidatePath, 'utf8');
  return JSON.parse(raw);
}

async function main() {
  const [, , command, candidatePath, statePathArg] = process.argv;

  if (command !== 'evaluate') {
    console.error('Usage: node scripts/self_alert_cli.mjs evaluate <candidate.json|-> [statePath]');
    process.exitCode = 1;
    return;
  }

  const statePath = statePathArg || path.join(process.cwd(), 'memory', 'self_alert_state.json');
  const candidate = await readCandidate(candidatePath);
  const state = await loadState(statePath);
  const result = evaluateCandidate(candidate, state);

  await saveState(statePath, result.state);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
