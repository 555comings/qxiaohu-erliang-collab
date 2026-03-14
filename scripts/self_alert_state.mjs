import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createEmptyState } from './self_alert_evaluator.mjs';

async function atomicJsonWrite(filePath, state) {
  const tempPath = `${filePath}.tmp`;
  const content = `${JSON.stringify(state, null, 2)}\n`;

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(tempPath, content, 'utf8');
  await rename(tempPath, filePath);
}

export async function loadState(filePath, now = new Date()) {
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return createEmptyState(now);
    }

    throw error;
  }
}

export async function saveState(filePath, state) {
  await atomicJsonWrite(filePath, state);
}
