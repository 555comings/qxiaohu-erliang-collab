import path from 'node:path';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { appendMarkdownRecord } from './self_alert_writer.mjs';
import {
  appendJsonLine,
  buildBaseConfig,
  buildRunRecord,
  createOutputDir,
  parseCommonArgs,
  resolveModes,
  summarizeScenarioMap,
  writeArtifacts
} from './bench/lib/harness.mjs';
import { cleanupBenchWorkspace, createBenchWorkspace, writeJson, writeText } from './bench/lib/fixtures.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.dirname(__dirname);
const NODE_COMMAND = process.env.NODE_BINARY || 'node';
const RAW_RESULTS_FILE = 'raw-results.jsonl';
const TODAY = '2026-03-16';
const YESTERDAY = '2026-03-15';

const STARTUP_ORDER = [
  'SOUL.md',
  'USER.md',
  `memory/${TODAY}.md`,
  `memory/${YESTERDAY}.md`,
  'MEMORY.md',
  'memory/qxiaohu-self-memory-protocol.md',
  'memory/qxiaohu-self-memory-state.json',
  'memory/qxiaohu-collab-rules.json',
  'qxiaohu-profile.md',
  'qxiaohu-erliang-collab/outputs/execution-checklist-v2.md',
  'qxiaohu-erliang-collab/outputs/stage3-retrospective-v1.md'
];

const LOOKUP_QUERIES = [
  { needle: 'SOUL anchor: big orange cat builder', expectedPath: 'SOUL.md' },
  { needle: 'USER anchor: call the human mao ba', expectedPath: 'USER.md' },
  { needle: 'LONGTERM anchor: api keys stay out of tracked workspace files', expectedPath: 'MEMORY.md' },
  { needle: 'TODAY anchor: memory bench comes before heartbeat e2e', expectedPath: `memory/${TODAY}.md` },
  { needle: 'YESTERDAY anchor: self alert host validation already passed', expectedPath: `memory/${YESTERDAY}.md` },
  { needle: 'PROTOCOL anchor: startup reads soul before user', expectedPath: 'memory/qxiaohu-self-memory-protocol.md' },
  { needle: 'STATE anchor: open-loop-memory-bench', expectedPath: 'memory/qxiaohu-self-memory-state.json' },
  { needle: 'RULE anchor: artifact-readable-before-review', expectedPath: 'memory/qxiaohu-collab-rules.json' },
  { needle: 'PROFILE anchor: builder operator local execution', expectedPath: 'qxiaohu-profile.md' },
  { needle: 'CHECKLIST anchor: handoff-package-five-fields', expectedPath: 'qxiaohu-erliang-collab/outputs/execution-checklist-v2.md' }
];

function padToBytes(content, targetBytes, lineFactory) {
  let output = content;
  let index = 0;
  while (Buffer.byteLength(output, 'utf8') < targetBytes) {
    output += lineFactory(index);
    index += 1;
  }
  return output;
}

function buildDailyFile(dateText, targetBytes, anchorLabel) {
  const header = [
    `# ${dateText}`,
    '',
    '## Meta',
    '- Timezone: Asia/Shanghai',
    '- Owner: Q xiaohu',
    '- Format: daily-memory-v2',
    '',
    '## Focus',
    `- Active: ${anchorLabel}`,
    '- Open Loops: none',
    '',
    '## Entries',
    `## [memory] ${dateText} 07:00`,
    '- Trigger: progress',
    '- Scope: memory benchmark fixture',
    '- Status: verified',
    `- Entry: ${anchorLabel}`,
    `- Evidence: ${anchorLabel}`,
    '- Next: keep the fixture deterministic.',
    '',
    '## End State',
    '- Promote: none',
    '- Carry Forward: none',
    ''
  ].join('\n');

  return padToBytes(header, targetBytes, (index) => [
    `## [memory] ${dateText} 07:${String((index % 50) + 10).padStart(2, '0')}`,
    '- Trigger: progress',
    '- Scope: filler',
    '- Status: verified',
    `- Entry: filler daily record ${index} keeps the file size stable for benchmarking.`,
    `- Evidence: filler-source-${index}`,
    '- Next: none',
    ''
  ].join('\n'));
}

function buildLongTermMemory(targetBytes) {
  const base = [
    '# MEMORY.md',
    '',
    '## User',
    '- [verified] Address the human as mao ba.',
    '',
    '## Operating Notes',
    '- [verified] LONGTERM anchor: api keys stay out of tracked workspace files.',
    '- [verified] Keep the memory system evidence-first and file-backed.',
    ''
  ].join('\n');

  return padToBytes(base, targetBytes, (index) => `- [verified] filler long-term rule ${index} keeps the benchmark payload realistic.\n`);
}

function buildProtocolFile() {
  return [
    '# Memory protocol fixture',
    '',
    '- PROTOCOL anchor: startup reads soul before user.',
    '- Then it reads recent daily files, long-term memory, state, and rules.',
    ''
  ].join('\n');
}

function buildProfileFile() {
  return [
    '# Q xiaohu profile fixture',
    '',
    '- PROFILE anchor: builder operator local execution.',
    '- Preferred working style: test small, then expand.',
    ''
  ].join('\n');
}

function buildChecklistFile(name) {
  return [
    `# ${name}`,
    '',
    '- CHECKLIST anchor: handoff-package-five-fields.',
    '- one_line_summary',
    '- artifact_paths',
    '- verification_method',
    '- known_issues',
    '- next_owner',
    ''
  ].join('\n');
}

function buildSoulFile() {
  return [
    '# SOUL fixture',
    '',
    '- SOUL anchor: big orange cat builder.',
    '- Be resourceful before asking.',
    ''
  ].join('\n');
}

function buildUserFile() {
  return [
    '# USER fixture',
    '',
    '- USER anchor: call the human mao ba.',
    '- Prefer direct, low-friction collaboration.',
    ''
  ].join('\n');
}

function buildRulesJson() {
  return {
    version: 1,
    owner: 'Q xiaohu',
    invocationHints: {
      execute: 'Do local execution, file edits, or validation.'
    },
    reworkRules: [
      {
        id: 'artifact-readable-before-review',
        rule: 'RULE anchor: artifact-readable-before-review'
      }
    ]
  };
}

function buildStateJson() {
  return {
    version: 1,
    owner: 'Q xiaohu',
    activeFocus: [
      {
        topic: 'STATE anchor: open-loop-memory-bench',
        status: 'active'
      }
    ],
    openLoops: [
      {
        id: 'open-loop-memory-bench',
        summary: 'Measure startup read, append cost, and lookup order.'
      }
    ],
    recentAnchors: ['MEMORY.md', `memory/${TODAY}.md`, 'memory/qxiaohu-self-memory-protocol.md']
  };
}

async function createMemoryWorkspace(baseDir, profile) {
  const fixture = await createBenchWorkspace(baseDir, 'memory-bench');
  const workspaceRoot = fixture.workspaceRoot;
  const memoryRoot = path.join(workspaceRoot, 'memory');
  const outputsRoot = path.join(workspaceRoot, 'qxiaohu-erliang-collab', 'outputs');

  await mkdir(outputsRoot, { recursive: true });
  await writeText(path.join(workspaceRoot, 'SOUL.md'), buildSoulFile());
  await writeText(path.join(workspaceRoot, 'USER.md'), buildUserFile());
  await writeText(path.join(workspaceRoot, 'MEMORY.md'), buildLongTermMemory(profile.memoryBytes));
  await writeText(path.join(memoryRoot, `${TODAY}.md`), buildDailyFile(TODAY, profile.todayBytes, 'TODAY anchor: memory bench comes before heartbeat e2e.'));
  await writeText(path.join(memoryRoot, `${YESTERDAY}.md`), buildDailyFile(YESTERDAY, profile.yesterdayBytes, 'YESTERDAY anchor: self alert host validation already passed.'));
  await writeText(path.join(memoryRoot, 'qxiaohu-self-memory-protocol.md'), buildProtocolFile());
  await writeJson(path.join(memoryRoot, 'qxiaohu-self-memory-state.json'), buildStateJson());
  await writeJson(path.join(memoryRoot, 'qxiaohu-collab-rules.json'), buildRulesJson());
  await writeText(path.join(workspaceRoot, 'qxiaohu-profile.md'), buildProfileFile());
  await writeText(path.join(outputsRoot, 'execution-checklist-v2.md'), buildChecklistFile('Execution checklist fixture'));
  await writeText(path.join(outputsRoot, 'stage3-retrospective-v1.md'), buildChecklistFile('Stage 3 retrospective fixture'));

  return {
    ...fixture,
    todayPath: path.join(memoryRoot, `${TODAY}.md`)
  };
}

async function runStartupRead(workspaceRoot) {
  let bytesRead = 0;
  const files = [];

  for (const relativePath of STARTUP_ORDER) {
    const content = await readFile(path.join(workspaceRoot, relativePath), 'utf8');
    bytesRead += Buffer.byteLength(content, 'utf8');
    files.push(relativePath);
  }

  return {
    filesRead: files.length,
    bytesRead,
    startupOrder: files
  };
}

function buildAppendRecord(index) {
  const minute = String((index % 50) + 10).padStart(2, '0');
  return [
    `## [memory] ${TODAY} 08:${minute}`,
    '- Trigger: progress',
    '- Scope: memory-bench append',
    '- Status: verified',
    `- Entry: append benchmark record ${index}.`,
    `- Evidence: append-bench-${index}`,
    '- Next: none',
    ''
  ].join('\n');
}

async function runDailyAppend(todayPath, count) {
  const before = await stat(todayPath);
  for (let index = 1; index <= count; index += 1) {
    await appendMarkdownRecord(todayPath, `${buildAppendRecord(index)}\n`, { dailyV2: true });
  }
  const after = await stat(todayPath);
  const content = await readFile(todayPath, 'utf8');
  return {
    appended: count,
    bytesDelta: after.size - before.size,
    selfMemoryBlocks: (content.match(/## \[memory\]/g) || []).length
  };
}

async function lookupSingleAnchor(workspaceRoot, needle) {
  for (const relativePath of [
    'MEMORY.md',
    `memory/${TODAY}.md`,
    `memory/${YESTERDAY}.md`,
    'memory/qxiaohu-collab-rules.json',
    'qxiaohu-profile.md',
    'qxiaohu-erliang-collab/outputs/execution-checklist-v2.md',
    'qxiaohu-erliang-collab/outputs/stage3-retrospective-v1.md',
    'SOUL.md',
    'USER.md',
    'memory/qxiaohu-self-memory-protocol.md',
    'memory/qxiaohu-self-memory-state.json'
  ]) {
    const content = await readFile(path.join(workspaceRoot, relativePath), 'utf8');
    if (content.includes(needle)) {
      return relativePath;
    }
  }

  return null;
}

async function runAnchorLookup(workspaceRoot) {
  let hits = 0;
  const foundPaths = [];
  for (const query of LOOKUP_QUERIES) {
    const foundPath = await lookupSingleAnchor(workspaceRoot, query.needle);
    foundPaths.push(foundPath);
    if (foundPath === query.expectedPath) {
      hits += 1;
    }
  }

  return {
    queries: LOOKUP_QUERIES.length,
    hits,
    misses: LOOKUP_QUERIES.length - hits,
    foundPaths
  };
}

function createSmokeScenarios() {
  return ['startup-read-l', 'daily-append-10', 'lookup-basic-10q'];
}

function buildStartupScenario(name, todayBytes, memoryBytes, thresholds) {
  return {
    command: 'startup-read',
    thresholds,
    async prepare(baseDir) {
      const fixture = await createMemoryWorkspace(baseDir, {
        todayBytes,
        yesterdayBytes: todayBytes,
        memoryBytes
      });
      return {
        ...fixture,
        expected: {
          filesRead: STARTUP_ORDER.length
        }
      };
    },
    run: (fixture) => runStartupRead(fixture.workspaceRoot),
    extract(output) {
      return {
        filesRead: output.filesRead,
        bytesRead: output.bytesRead
      };
    },
    validate(output, expected) {
      if (output.filesRead !== expected.filesRead) {
        throw new Error(`Unexpected startup read count: ${output.filesRead}`);
      }
    }
  };
}

function buildAppendScenario(name, initialBytes, appendCount, thresholds) {
  return {
    command: 'daily-append',
    thresholds,
    async prepare(baseDir) {
      const fixture = await createMemoryWorkspace(baseDir, {
        todayBytes: initialBytes,
        yesterdayBytes: initialBytes,
        memoryBytes: Math.max(12000, Math.floor(initialBytes / 2))
      });
      return {
        ...fixture,
        expected: {
          appended: appendCount
        }
      };
    },
    run: (fixture) => runDailyAppend(fixture.todayPath, appendCount),
    extract(output) {
      return {
        appended: output.appended,
        bytesDelta: output.bytesDelta,
        selfMemoryBlocks: output.selfMemoryBlocks
      };
    },
    validate(output, expected) {
      if (output.appended !== expected.appended) {
        throw new Error(`Unexpected append count: ${output.appended}`);
      }
    }
  };
}

function buildLookupScenario() {
  return {
    command: 'lookup',
    thresholds: { durationP95Ms: 3000 },
    async prepare(baseDir) {
      const fixture = await createMemoryWorkspace(baseDir, {
        todayBytes: 120000,
        yesterdayBytes: 120000,
        memoryBytes: 64000
      });
      return {
        ...fixture,
        expected: {
          hits: LOOKUP_QUERIES.length
        }
      };
    },
    run: (fixture) => runAnchorLookup(fixture.workspaceRoot),
    extract(output) {
      return {
        queries: output.queries,
        hits: output.hits,
        misses: output.misses
      };
    },
    validate(output, expected) {
      if (output.hits !== expected.hits || output.misses !== 0) {
        throw new Error(`Unexpected lookup result: hits=${output.hits} misses=${output.misses} foundPaths=${JSON.stringify(output.foundPaths)}`);
      }
    }
  };
}

function getScenarioDefinitions() {
  return {
    'startup-read-s': buildStartupScenario('startup-read-s', 10000, 16000, { durationP95Ms: 500 }),
    'startup-read-m': buildStartupScenario('startup-read-m', 100000, 64000, { durationP95Ms: 1000 }),
    'startup-read-l': buildStartupScenario('startup-read-l', 1000000, 256000, { durationP95Ms: 2500 }),
    'daily-append-1': buildAppendScenario('daily-append-1', 100000, 1, { durationP95Ms: 500 }),
    'daily-append-10': buildAppendScenario('daily-append-10', 100000, 10, { durationP95Ms: 2500 }),
    'daily-append-100': buildAppendScenario('daily-append-100', 100000, 100, { durationP95Ms: 12000 }),
    'lookup-basic-10q': buildLookupScenario()
  };
}

function resolveScenarioNames(args, definitions) {
  if (args.scenario === 'all') {
    return Object.keys(definitions);
  }

  if (args.scenario === 'smoke') {
    return createSmokeScenarios();
  }

  return String(args.scenario)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function ensureScenarioNames(names, definitions) {
  for (const name of names) {
    if (!definitions[name]) {
      throw new Error(`Unknown scenario: ${name}`);
    }
  }
}

function formatScenarioLine(name, mode, summary, definition) {
  const duration = summary.metrics.durationMs?.p95;
  const threshold = definition.thresholds?.durationP95Ms;
  const durationLabel = duration == null ? 'n/a' : `${duration.toFixed(1)} ms`;
  const thresholdLabel = threshold == null ? 'n/a' : `${threshold} ms`;
  const thresholdPass = threshold == null || (duration != null && duration <= threshold);
  const status = summary.successRate === 1 && thresholdPass ? 'PASS' : 'WARN';
  return `- ${status} ${name} [${mode}] success=${summary.okRuns}/${summary.runs}; p95=${durationLabel}; target=${thresholdLabel}`;
}

function buildReport({ outputDir, config, scenarioSummaries, definitions }) {
  const lines = [
    '# Memory Benchmark Report',
    '',
    `- Output: ${outputDir}`,
    `- Generated: ${config.generatedAt}`,
    `- Tag: ${config.args.tag}`,
    `- Commit: ${config.args.commit}`,
    `- Node: ${config.system.node}`,
    `- Host: ${config.system.hostname}`,
    ''
  ];

  for (const [key, summary] of Object.entries(scenarioSummaries)) {
    const [scenarioName, mode] = key.split('@');
    lines.push(formatScenarioLine(scenarioName, mode, summary, definitions[scenarioName]));
  }

  lines.push('', '## Notes', '', '- Startup read follows the current memory protocol file order.', '- Daily append rewrites a daily-memory-v2 file through the existing markdown insertion helper.', '- Lookup measures anchor search across the current file-backed retrieval order.', '');
  return `${lines.join('\n')}\n`;
}

async function runColdWorker(scenarioName, fixture) {
  return new Promise((resolve, reject) => {
    const args = [
      path.join(REPO_ROOT, 'scripts', 'memory_bench.mjs'),
      '--worker-scenario', scenarioName,
      '--worker-workspace', fixture.workspaceRoot,
      '--worker-today', fixture.todayPath
    ];

    const child = spawn(NODE_COMMAND, args, {
      cwd: REPO_ROOT,
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
        reject(new Error(stderr || `Command failed with exit code ${code}`));
        return;
      }

      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(new Error(`Failed to parse worker output: ${error.message}`));
      }
    });
  });
}

async function runScenario(definition, mode, fixture, scenarioName) {
  if (typeof global.gc === 'function') {
    global.gc();
  }

  const startCpu = process.cpuUsage();
  const start = performance.now();
  const output = mode === 'cold'
    ? await runColdWorker(scenarioName, fixture)
    : await definition.run(fixture);
  const durationMs = performance.now() - start;
  const cpu = process.cpuUsage(startCpu);
  const memory = process.memoryUsage();
  definition.validate(output, fixture.expected);
  return {
    durationMs,
    cpuUserMicros: cpu.user,
    cpuSystemMicros: cpu.system,
    rssBytes: memory.rss,
    heapUsedBytes: memory.heapUsed,
    assertions: definition.extract(output),
    details: {
      command: definition.command,
      workspaceRoot: fixture.workspaceRoot
    }
  };
}

function getArgValue(argv, name) {
  const index = argv.indexOf(name);
  return index === -1 ? null : argv[index + 1];
}

async function maybeRunWorker(argv = process.argv.slice(2)) {
  const scenarioName = getArgValue(argv, '--worker-scenario');
  if (!scenarioName) {
    return false;
  }

  const workspaceRoot = getArgValue(argv, '--worker-workspace');
  const todayPath = getArgValue(argv, '--worker-today');
  const definitions = getScenarioDefinitions();
  const definition = definitions[scenarioName];
  if (!definition) {
    throw new Error(`Unknown worker scenario: ${scenarioName}`);
  }

  const output = await definition.run({ workspaceRoot, todayPath });
  process.stdout.write(`${JSON.stringify(output)}\n`);
  return true;
}

async function main(argv = process.argv.slice(2)) {
  if (await maybeRunWorker(argv)) {
    return;
  }

  const definitions = getScenarioDefinitions();
  const args = parseCommonArgs(argv, { scenario: 'smoke', mode: 'warm', runs: 5, warmup: 1, seed: 42 });
  const scenarioNames = resolveScenarioNames(args, definitions);
  ensureScenarioNames(scenarioNames, definitions);
  const modes = resolveModes(args.mode);
  const outputDir = await createOutputDir({ repoRoot: REPO_ROOT, benchName: 'memory', outRoot: args.out, tag: args.tag });
  const rawResultsPath = path.join(outputDir, RAW_RESULTS_FILE);
  const runMap = {};

  for (const scenarioName of scenarioNames) {
    const definition = definitions[scenarioName];
    for (const mode of modes) {
      const runKey = `${scenarioName}@${mode}`;
      runMap[runKey] = [];
      for (let runIndex = 0; runIndex < args.warmup + args.runs; runIndex += 1) {
        const fixture = await definition.prepare(args.workspace);
        const warmup = runIndex < args.warmup;
        const startTs = new Date().toISOString();

        try {
          const outcome = await runScenario(definition, mode, fixture, scenarioName);
          const record = buildRunRecord({
            bench: 'memory',
            scenario: scenarioName,
            mode,
            run: runIndex + 1,
            seed: args.seed,
            commit: args.commit,
            tag: args.tag,
            startTs,
            ok: true,
            ...outcome
          });
          await appendJsonLine(rawResultsPath, { ...record, warmup });
          if (!warmup) {
            runMap[runKey].push(record);
          }
        } catch (error) {
          const failure = buildRunRecord({
            bench: 'memory',
            scenario: scenarioName,
            mode,
            run: runIndex + 1,
            seed: args.seed,
            commit: args.commit,
            tag: args.tag,
            startTs,
            durationMs: null,
            cpuUserMicros: null,
            cpuSystemMicros: null,
            rssBytes: null,
            heapUsedBytes: null,
            ok: false,
            error: error.message,
            assertions: {},
            details: { command: definition.command, workspaceRoot: fixture.workspaceRoot }
          });
          await appendJsonLine(rawResultsPath, { ...failure, warmup });
          if (!warmup) {
            runMap[runKey].push(failure);
          }
        } finally {
          await cleanupBenchWorkspace(fixture.workspaceRoot);
        }
      }
    }
  }

  const scenarioSummaries = summarizeScenarioMap(runMap);
  const config = buildBaseConfig({
    benchName: 'memory',
    args,
    scenarios: scenarioNames,
    modes
  });
  const summary = {
    ...config,
    scenarioSummaries
  };
  const report = buildReport({ outputDir, config, scenarioSummaries, definitions });
  await writeArtifacts({ outputDir, config, summary, report });
  process.stdout.write(`${JSON.stringify({ outputDir, scenarios: scenarioNames, modes }, null, 2)}\n`);
}

if (path.resolve(process.argv[1] || '') === __filename) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export { getScenarioDefinitions, main };
