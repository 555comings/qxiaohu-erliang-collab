import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { percentile, summarizeRuns } from './bench/lib/stats.mjs';

const REPO_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const NODE_COMMAND = process.env.NODE_BINARY || 'node';

function runNode(args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(NODE_COMMAND, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `Process failed with exit code ${code}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

test('percentile interpolates sorted values', () => {
  assert.equal(percentile([10, 20, 30, 40], 0.5), 25);
  assert.equal(percentile([10, 20, 30, 40], 0.95), 38.5);
});

test('summarizeRuns aggregates metrics and assertions', () => {
  const summary = summarizeRuns([
    {
      ok: true,
      durationMs: 100,
      cpuUserMicros: 10,
      cpuSystemMicros: 5,
      rssBytes: 1000,
      heapUsedBytes: 400,
      assertions: { consumed: { user: 1, tool: 2 } }
    },
    {
      ok: false,
      durationMs: 200,
      cpuUserMicros: 20,
      cpuSystemMicros: 10,
      rssBytes: 1200,
      heapUsedBytes: 500,
      assertions: { consumed: { user: 3, tool: 4 } }
    }
  ]);

  assert.equal(summary.runs, 2);
  assert.equal(summary.okRuns, 1);
  assert.equal(summary.errorCount, 1);
  assert.equal(summary.metrics.durationMs.p95, 195);
  assert.equal(summary.assertions['consumed.user'].sum, 4);
  assert.equal(summary.assertions['consumed.tool'].sum, 6);
});

test('self_alert_bench smoke run writes summary artifacts', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'self-alert-bench-test-'));
  const outDir = path.join(tempRoot, 'out');
  const workspaceDir = path.join(tempRoot, 'workspaces');

  try {
    const run = await runNode([
      'scripts/self_alert_bench.mjs',
      '--scenario', 'tick-idle',
      '--mode', 'warm',
      '--runs', '1',
      '--warmup', '0',
      '--out', outDir,
      '--workspace', workspaceDir,
      '--tag', 'test-host',
      '--commit', 'test-commit'
    ], REPO_ROOT);

    const parsed = JSON.parse(run.stdout);
    const summary = JSON.parse(await readFile(path.join(parsed.outputDir, 'summary.json'), 'utf8'));
    const report = await readFile(path.join(parsed.outputDir, 'report.md'), 'utf8');

    assert.equal(summary.bench, 'self-alert');
    assert.equal(summary.scenarioSummaries['tick-idle@warm'].okRuns, 1);
    assert.match(report, /tick-idle/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('bench_report combines summary outputs', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'bench-report-test-'));
  const inputDir = path.join(tempRoot, 'input');
  const outputDir = path.join(tempRoot, 'combined');

  try {
    const first = await runNode([
      'scripts/self_alert_bench.mjs',
      '--scenario', 'tick-idle',
      '--mode', 'warm',
      '--runs', '1',
      '--warmup', '0',
      '--out', inputDir,
      '--workspace', path.join(tempRoot, 'workspaces'),
      '--tag', 'report-test',
      '--commit', 'test-commit'
    ], REPO_ROOT);

    const parsed = JSON.parse(first.stdout);
    await runNode([
      'scripts/bench_report.mjs',
      parsed.outputDir,
      '--out',
      outputDir
    ], REPO_ROOT);

    const combined = JSON.parse(await readFile(path.join(outputDir, 'combined-summary.json'), 'utf8'));
    const report = await readFile(path.join(outputDir, 'combined-report.md'), 'utf8');

    assert.equal(combined.results.length, 1);
    assert.match(report, /Benchmark Aggregate Report/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
