import path from 'node:path';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { spawn } from 'node:child_process';
import { appendFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { runSelfAlertTick } from './self_alert_cycle.mjs';
import { summarizeNumbers } from './bench/lib/stats.mjs';
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
import { cleanupBenchWorkspace, createBenchWorkspace, writeText } from './bench/lib/fixtures.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.dirname(__dirname);
const NODE_COMMAND = process.env.NODE_BINARY || 'node';
const RAW_RESULTS_FILE = 'raw-results.jsonl';
const BASE_TIME_MS = Date.parse('2026-03-16T08:00:00.000Z');

function createUserInjection(id, availableAtMs) {
  const token = `HB-EVENT-${id}`;
  return {
    kind: 'user',
    availableAtMs,
    token,
    record: {
      text: `记一下 heartbeat e2e ${token}`,
      topicScope: `heartbeat-bench-${id}`
    }
  };
}

function createMalformedInjection(availableAtMs) {
  return {
    kind: 'malformed',
    availableAtMs,
    file: 'user',
    raw: 'not-json'
  };
}

function zeroSummary() {
  return { count: 0, min: 0, max: 0, mean: 0, p50: 0, p95: 0, p99: 0, sum: 0 };
}

function withZeroSummary(summary) {
  return summary || zeroSummary();
}

async function appendInjectionRecord(filePath, injection) {
  if (injection.kind === 'user') {
    await appendFile(filePath, `${JSON.stringify(injection.record)}\n`, 'utf8');
    return;
  }

  await appendFile(filePath, `${injection.raw}\n`, 'utf8');
}

function buildHeartbeatScenario({
  name,
  cycles,
  intervalMs,
  injections,
  thresholdMetric,
  thresholdMs,
  validate,
  expected
}) {
  return {
    command: 'heartbeat-e2e',
    cycles,
    intervalMs,
    injections,
    thresholdMetric,
    thresholdMs,
    async prepare(baseDir) {
      const fixture = await createBenchWorkspace(baseDir, 'heartbeat-bench');
      fixture.userInputPath = path.join(fixture.inputsRoot, 'user.ndjson');
      fixture.toolInputPath = path.join(fixture.inputsRoot, 'tool.ndjson');
      await writeText(fixture.userInputPath, '');
      await writeText(fixture.toolInputPath, '');
      return {
        ...fixture,
        expected: structuredClone(expected)
      };
    },
    run: (fixture) => runHeartbeatSchedule(fixture, { cycles, intervalMs, injections }),
    extract(output) {
      return {
        cycles: output.cycles,
        eventsInjected: output.eventsInjected,
        eventsDetected: output.eventsDetected,
        missedEvents: output.missedEvents,
        wroteCycles: output.wroteCycles,
        skippedPolls: output.skippedPolls,
        healthIssueCycles: output.healthIssueCycles,
        falseHealthy: output.falseHealthy,
        idleHeartbeatCostMsP95: output.idleHeartbeatCost.p95,
        eventToDetectMsP95: output.eventToDetect.p95,
        eventToWriteMsP95: output.eventToWrite.p95,
        healthAlertLatencyMsP95: output.healthAlertLatency.p95
      };
    },
    validate
  };
}

function getScenarioDefinitions() {
  return {
    'heartbeat-idle': buildHeartbeatScenario({
      name: 'heartbeat-idle',
      cycles: 5,
      intervalMs: 1000,
      injections: [],
      thresholdMetric: 'idleHeartbeatCostMsP95',
      thresholdMs: 1000,
      expected: {
        eventsInjected: 0,
        eventsDetected: 0,
        missedEvents: 0,
        skippedPolls: 0,
        falseHealthy: 0
      },
      validate(output, expected) {
        if (output.eventsInjected !== expected.eventsInjected ||
            output.eventsDetected !== expected.eventsDetected ||
            output.missedEvents !== expected.missedEvents ||
            output.skippedPolls !== expected.skippedPolls ||
            output.falseHealthy !== expected.falseHealthy ||
            output.wroteCycles !== 0) {
          throw new Error(`Unexpected heartbeat-idle result: ${JSON.stringify(output)}`);
        }
      }
    }),
    'heartbeat-single-event': buildHeartbeatScenario({
      name: 'heartbeat-single-event',
      cycles: 5,
      intervalMs: 1000,
      injections: [createUserInjection(1, 1500)],
      thresholdMetric: 'eventToWriteMsP95',
      thresholdMs: 1500,
      expected: {
        eventsInjected: 1,
        eventsDetected: 1,
        missedEvents: 0,
        falseHealthy: 0
      },
      validate(output, expected) {
        if (output.eventsInjected !== expected.eventsInjected ||
            output.eventsDetected !== expected.eventsDetected ||
            output.missedEvents !== expected.missedEvents ||
            output.falseHealthy !== expected.falseHealthy ||
            output.skippedPolls !== 0) {
          throw new Error(`Unexpected heartbeat-single-event result: ${JSON.stringify(output)}`);
        }
      }
    }),
    'heartbeat-burst': buildHeartbeatScenario({
      name: 'heartbeat-burst',
      cycles: 7,
      intervalMs: 1000,
      injections: [
        createUserInjection(1, 250),
        createUserInjection(2, 700),
        createUserInjection(3, 1100),
        createUserInjection(4, 1750),
        createUserInjection(5, 2600),
        createUserInjection(6, 4100)
      ],
      thresholdMetric: 'eventToWriteMsP95',
      thresholdMs: 2000,
      expected: {
        eventsInjected: 6,
        eventsDetected: 6,
        missedEvents: 0,
        falseHealthy: 0
      },
      validate(output, expected) {
        if (output.eventsInjected !== expected.eventsInjected ||
            output.eventsDetected !== expected.eventsDetected ||
            output.missedEvents !== expected.missedEvents ||
            output.falseHealthy !== expected.falseHealthy ||
            output.skippedPolls !== 0) {
          throw new Error(`Unexpected heartbeat-burst result: ${JSON.stringify(output)}`);
        }
      }
    }),
    'heartbeat-health-failure': buildHeartbeatScenario({
      name: 'heartbeat-health-failure',
      cycles: 4,
      intervalMs: 1000,
      injections: [createMalformedInjection(250)],
      thresholdMetric: 'healthAlertLatencyMsP95',
      thresholdMs: 1500,
      expected: {
        skippedPollsMin: 1,
        healthIssueCyclesMin: 1,
        falseHealthy: 0
      },
      validate(output, expected) {
        if (output.skippedPolls < expected.skippedPollsMin ||
            output.healthIssueCycles < expected.healthIssueCyclesMin ||
            output.falseHealthy !== expected.falseHealthy) {
          throw new Error(`Unexpected heartbeat-health-failure result: ${JSON.stringify(output)}`);
        }
      }
    })
  };
}

function createSmokeScenarios() {
  return [
    'heartbeat-idle',
    'heartbeat-single-event',
    'heartbeat-burst',
    'heartbeat-health-failure'
  ];
}

async function runHeartbeatSchedule(fixture, schedule) {
  const injections = schedule.injections.map((injection) => ({
    ...structuredClone(injection),
    appended: false,
    detected: false
  }));
  const cycleDurations = [];
  const detectLatencies = [];
  const writeLatencies = [];
  const healthAlertLatencies = [];
  let wroteCycles = 0;
  let skippedPolls = 0;
  let healthIssueCycles = 0;
  let falseHealthy = 0;
  let eventsInjected = 0;
  let eventsDetected = 0;

  for (let cycle = 0; cycle < schedule.cycles; cycle += 1) {
    const currentMs = cycle * schedule.intervalMs;

    for (const injection of injections) {
      if (injection.appended || injection.availableAtMs > currentMs) {
        continue;
      }

      const targetPath = injection.file === 'tool' ? fixture.toolInputPath : fixture.userInputPath;
      await appendInjectionRecord(targetPath, injection);
      injection.appended = true;
      if (injection.kind === 'user') {
        eventsInjected += 1;
      }
    }

    const started = performance.now();
    const tick = await runSelfAlertTick({
      workspaceRoot: fixture.workspaceRoot,
      statePath: fixture.statePath,
      inputsRoot: fixture.inputsRoot,
      now: new Date(BASE_TIME_MS + currentMs)
    });
    const durationMs = performance.now() - started;
    cycleDurations.push(durationMs);

    if (tick.summary.wrote > 0) {
      wroteCycles += 1;
    }

    if (tick.skippedPoll) {
      skippedPolls += 1;
    }

    if (tick.summary.healthIssues > 0) {
      healthIssueCycles += 1;
    }

    const pollResults = tick.poll?.results || [];
    for (const injection of injections) {
      if (injection.kind !== 'user' || !injection.appended || injection.detected) {
        continue;
      }

      const matched = pollResults.some((entry) => entry.candidate?.evidence?.includes(injection.token));
      if (!matched) {
        continue;
      }

      injection.detected = true;
      eventsDetected += 1;
      const eventToDetectMs = Math.max(0, currentMs - injection.availableAtMs);
      detectLatencies.push(eventToDetectMs);
      writeLatencies.push(eventToDetectMs + durationMs);
    }

    for (const injection of injections) {
      if (injection.kind !== 'malformed' || !injection.appended || injection.detected) {
        continue;
      }

      if (tick.summary.healthIssues > 0) {
        injection.detected = true;
        healthAlertLatencies.push(Math.max(0, currentMs - injection.availableAtMs) + durationMs);
      } else {
        falseHealthy += 1;
      }
    }
  }

  const missedEvents = injections.filter((injection) => injection.kind === 'user' && !injection.detected).length;

  return {
    cycles: schedule.cycles,
    eventsInjected,
    eventsDetected,
    missedEvents,
    wroteCycles,
    skippedPolls,
    healthIssueCycles,
    falseHealthy,
    idleHeartbeatCost: withZeroSummary(summarizeNumbers(cycleDurations)),
    eventToDetect: withZeroSummary(summarizeNumbers(detectLatencies)),
    eventToWrite: withZeroSummary(summarizeNumbers(writeLatencies)),
    healthAlertLatency: withZeroSummary(summarizeNumbers(healthAlertLatencies))
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

function formatMetricLabel(summary, definition) {
  const metricSummary = summary.assertions?.[definition.thresholdMetric];
  const value = metricSummary?.p95;
  return value == null ? 'n/a' : `${value.toFixed(1)} ms`;
}

function formatScenarioLine(name, mode, summary, definition) {
  const metricLabel = formatMetricLabel(summary, definition);
  const thresholdLabel = `${definition.thresholdMs} ms`;
  const metricSummary = summary.assertions?.[definition.thresholdMetric];
  const metricP95 = metricSummary?.p95;
  const thresholdPass = metricP95 != null && metricP95 <= definition.thresholdMs;
  const status = summary.successRate === 1 && thresholdPass ? 'PASS' : 'WARN';
  return `- ${status} ${name} [${mode}] success=${summary.okRuns}/${summary.runs}; ${definition.thresholdMetric}=${metricLabel}; target=${thresholdLabel}`;
}

function buildReport({ outputDir, config, scenarioSummaries, definitions }) {
  const lines = [
    '# Heartbeat End-to-End Benchmark Report',
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

  lines.push(
    '',
    '## Notes',
    '',
    '- The benchmark simulates heartbeat cycles over a virtual schedule while measuring real tick cost.',
    '- `eventToDetectMsP95` measures scheduler delay until the next eligible heartbeat cycle.',
    '- `eventToWriteMsP95` adds real tick runtime to the scheduler delay for a closer end-to-end feel.',
    '- Health-failure mode verifies that malformed input raises a health issue and skips polling rather than failing silently.',
    ''
  );
  return `${lines.join('\n')}\n`;
}

async function runColdWorker(scenarioName, fixture) {
  return new Promise((resolve, reject) => {
    const args = [
      path.join(REPO_ROOT, 'scripts', 'e2e_heartbeat_bench.mjs'),
      '--worker-scenario', scenarioName,
      '--worker-workspace', fixture.workspaceRoot,
      '--worker-state', fixture.statePath,
      '--worker-inputs', fixture.inputsRoot
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
  const started = performance.now();
  const output = mode === 'cold'
    ? await runColdWorker(scenarioName, fixture)
    : await definition.run(fixture);
  const durationMs = performance.now() - started;
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
  const statePath = getArgValue(argv, '--worker-state');
  const inputsRoot = getArgValue(argv, '--worker-inputs');
  const definitions = getScenarioDefinitions();
  const definition = definitions[scenarioName];
  if (!definition) {
    throw new Error(`Unknown worker scenario: ${scenarioName}`);
  }

  const output = await definition.run({
    workspaceRoot,
    statePath,
    inputsRoot,
    userInputPath: path.join(inputsRoot, 'user.ndjson'),
    toolInputPath: path.join(inputsRoot, 'tool.ndjson')
  });
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
  const outputDir = await createOutputDir({ repoRoot: REPO_ROOT, benchName: 'heartbeat-e2e', outRoot: args.out, tag: args.tag });
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
            bench: 'heartbeat-e2e',
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
            bench: 'heartbeat-e2e',
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
    benchName: 'heartbeat-e2e',
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
