import path from 'node:path';
import { mkdir, appendFile, writeFile } from 'node:fs/promises';

import { summarizeRuns } from './stats.mjs';
import { getSystemInfo } from './system_info.mjs';

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function timestampId(now = new Date()) {
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

function sanitizeSegment(value, fallback = 'default') {
  return String(value || fallback)
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || fallback;
}

export function parseCommonArgs(argv, defaults = {}) {
  const args = {
    scenario: defaults.scenario || 'smoke',
    mode: defaults.mode || 'warm',
    runs: defaults.runs || 5,
    warmup: defaults.warmup || 1,
    seed: defaults.seed || 42,
    workspace: defaults.workspace || null,
    out: defaults.out || null,
    tag: defaults.tag || process.env.COMPUTERNAME || process.env.HOSTNAME || 'local',
    commit: defaults.commit || process.env.GIT_COMMIT || 'unknown'
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      continue;
    }

    const key = token.slice(2);
    const value = argv[index + 1];
    if (value == null || value.startsWith('--')) {
      args[key] = true;
      continue;
    }

    args[key] = value;
    index += 1;
  }

  args.runs = parseNumber(args.runs, defaults.runs || 5);
  args.warmup = parseNumber(args.warmup, defaults.warmup || 1);
  args.seed = parseNumber(args.seed, defaults.seed || 42);
  return args;
}

export function resolveModes(mode) {
  if (mode === 'both') {
    return ['warm', 'cold'];
  }

  if (mode === 'warm' || mode === 'cold') {
    return [mode];
  }

  throw new Error(`Unsupported mode: ${mode}`);
}

export async function createOutputDir({ repoRoot, benchName, outRoot, tag }) {
  const root = path.resolve(outRoot || path.join(repoRoot, 'benchmarks'));
  const outputDir = path.join(root, `${timestampId()}-${sanitizeSegment(benchName)}-${sanitizeSegment(tag)}`);
  await mkdir(outputDir, { recursive: true });
  return outputDir;
}

export async function appendJsonLine(filePath, record) {
  await appendFile(filePath, `${JSON.stringify(record)}\n`, 'utf8');
}

export function buildRunRecord(meta) {
  return {
    bench: meta.bench,
    scenario: meta.scenario,
    mode: meta.mode,
    run: meta.run,
    seed: meta.seed,
    commit: meta.commit,
    tag: meta.tag,
    startTs: meta.startTs,
    durationMs: meta.durationMs,
    cpuUserMicros: meta.cpuUserMicros,
    cpuSystemMicros: meta.cpuSystemMicros,
    rssBytes: meta.rssBytes,
    heapUsedBytes: meta.heapUsedBytes,
    ok: meta.ok,
    error: meta.error || null,
    assertions: meta.assertions || {},
    details: meta.details || {}
  };
}

export function summarizeScenarioMap(runMap) {
  const summary = {};
  for (const [key, runs] of Object.entries(runMap)) {
    summary[key] = summarizeRuns(runs);
  }
  return summary;
}

export async function writeArtifacts({ outputDir, config, summary, report }) {
  await writeFile(path.join(outputDir, 'benchmark-config.json'), `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  await writeFile(path.join(outputDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  if (report) {
    await writeFile(path.join(outputDir, 'report.md'), report, 'utf8');
  }
}

export function buildBaseConfig({ benchName, args, scenarios, modes }) {
  return {
    bench: benchName,
    generatedAt: new Date().toISOString(),
    system: getSystemInfo(),
    args,
    scenarios,
    modes
  };
}
