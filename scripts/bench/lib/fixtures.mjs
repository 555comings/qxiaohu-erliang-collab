import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';

import { createEmptyState } from '../../self_alert_evaluator.mjs';

export async function createBenchWorkspace(baseDir, prefix = 'bench') {
  const parent = path.resolve(baseDir || os.tmpdir());
  await mkdir(parent, { recursive: true });
  const workspaceRoot = await mkdtemp(path.join(parent, `${prefix}-`));
  const memoryRoot = path.join(workspaceRoot, 'memory');
  const inputsRoot = path.join(workspaceRoot, 'runtime', 'self_alert_inputs');
  const statePath = path.join(memoryRoot, 'self_alert_state.json');
  await mkdir(memoryRoot, { recursive: true });
  await mkdir(inputsRoot, { recursive: true });
  await writeJson(statePath, createEmptyState(new Date('2026-03-16T00:00:00Z')));
  return { workspaceRoot, memoryRoot, inputsRoot, statePath };
}

export async function cleanupBenchWorkspace(workspaceRoot) {
  if (!workspaceRoot) {
    return;
  }

  await rm(workspaceRoot, { recursive: true, force: true });
}

export async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function writeText(filePath, content) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf8');
}

export async function writeNdjson(filePath, records) {
  const content = records.map((record) => JSON.stringify(record)).join('\n');
  await writeText(filePath, content ? `${content}\n` : '');
}
