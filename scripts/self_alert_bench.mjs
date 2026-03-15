import path from 'node:path';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { detectToolCandidates, detectUserCandidates } from './self_alert_detectors.mjs';
import { runHealthCheck, runSelfAlertTick, processCandidates } from './self_alert_cycle.mjs';
import { pollAlertSources } from './self_alert_poll.mjs';
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
import {
  cleanupBenchWorkspace,
  createBenchWorkspace,
  writeJson,
  writeNdjson,
  writeText
} from './bench/lib/fixtures.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.dirname(__dirname);
const CLI_PATH = path.join(REPO_ROOT, 'scripts', 'self_alert_cli.mjs');
const RAW_RESULTS_FILE = 'raw-results.jsonl';
const NODE_COMMAND = process.env.NODE_BINARY || 'node';

function createUserEvent(index) {
  return {
    text: `记一下性能规则 ${index}`,
    topicScope: `bench-user-${index}`
  };
}

function createToolEvent(index) {
  return {
    toolName: 'exec',
    topicScope: `bench-tool-${index}`,
    command: `git reset --hard HEAD~${(index % 5) + 1}`,
    exitCode: 128,
    stderr: `fatal: benchmark-${index}`
  };
}

function createSmokeScenarios() {
  return ['tick-idle', 'tick-small', 'poll-large', 'health-bad-input'];
}

function getScenarioDefinitions() {
  return {
    'process-user-single': {
      command: 'process-user',
      thresholds: { durationP95Ms: 1500 },
      async prepare(baseDir) {
        const fixture = await createBenchWorkspace(baseDir, 'self-alert-process-user');
        const inputPath = path.join(fixture.workspaceRoot, 'event.json');
        await writeJson(inputPath, createUserEvent(1));
        return {
          ...fixture,
          inputPath,
          expected: { count: 1, wrote: 1, routes: ['daily'] }
        };
      },
      extract(output) {
        return {
          count: output.count,
          wrote: output.wrote,
          routeCount: output.routes.length
        };
      },
      validate(output, expected) {
        if (output.count !== expected.count || output.wrote !== expected.wrote) {
          throw new Error(`Unexpected process-user result: count=${output.count} wrote=${output.wrote}`);
        }
      }
    },
    'process-tool-single': {
      command: 'process-tool',
      thresholds: { durationP95Ms: 1500 },
      async prepare(baseDir) {
        const fixture = await createBenchWorkspace(baseDir, 'self-alert-process-tool');
        const inputPath = path.join(fixture.workspaceRoot, 'event.json');
        await writeJson(inputPath, createToolEvent(1));
        return {
          ...fixture,
          inputPath,
          expected: { count: 2, wrote: 1, routes: ['errors'] }
        };
      },
      extract(output) {
        return {
          count: output.count,
          wrote: output.wrote,
          routeCount: output.routes.length
        };
      },
      validate(output, expected) {
        if (output.count !== expected.count || output.wrote !== expected.wrote) {
          throw new Error(`Unexpected process-tool result: count=${output.count} wrote=${output.wrote}`);
        }
      }
    },
    'poll-idle': buildPollScenario('poll', 0, 0, { durationP95Ms: 500 }),
    'poll-small': buildPollScenario('poll', 10, 10, { durationP95Ms: 5000 }),
    'poll-medium': buildPollScenario('poll', 100, 100, { durationP95Ms: 15000 }),
    'poll-large': buildPollScenario('poll', 250, 250, { durationP95Ms: 30000 }),
    'tick-idle': buildPollScenario('tick', 0, 0, { durationP95Ms: 500 }),
    'tick-small': buildPollScenario('tick', 10, 10, { durationP95Ms: 5000 }),
    'tick-medium': buildPollScenario('tick', 100, 100, { durationP95Ms: 15000 }),
    'tick-large': buildPollScenario('tick', 250, 250, { durationP95Ms: 30000 }),
    'health-good': {
      command: 'health-check',
      thresholds: { durationP95Ms: 1000 },
      async prepare(baseDir) {
        const fixture = await createBenchWorkspace(baseDir, 'self-alert-health-good');
        await writeText(path.join(fixture.inputsRoot, 'user.ndjson'), '');
        await writeText(path.join(fixture.inputsRoot, 'tool.ndjson'), '');
        return { ...fixture, expected: { count: 0, wrote: 0 } };
      },
      extract(output) {
        return {
          count: output.count,
          wrote: output.wrote,
          ok: output.ok === false ? 0 : 1
        };
      },
      validate(output, expected) {
        if (output.count !== expected.count || output.wrote !== expected.wrote || output.ok === false) {
          throw new Error(`Unexpected health-good result: count=${output.count} wrote=${output.wrote} ok=${output.ok}`);
        }
      }
    },
    'health-bad-state': {
      command: 'health-check',
      thresholds: { durationP95Ms: 1000 },
      async prepare(baseDir) {
        const fixture = await createBenchWorkspace(baseDir, 'self-alert-health-bad-state');
        await writeText(fixture.statePath, '{not valid json');
        return { ...fixture, expected: { count: 1, wrote: 1 } };
      },
      extract(output) {
        return {
          count: output.count,
          wrote: output.wrote,
          ok: output.ok === false ? 0 : 1
        };
      },
      validate(output, expected) {
        if (output.count !== expected.count || output.wrote !== expected.wrote || output.ok !== false) {
          throw new Error(`Unexpected health-bad-state result: count=${output.count} wrote=${output.wrote} ok=${output.ok}`);
        }
      }
    },
    'health-bad-input': {
      command: 'health-check',
      thresholds: { durationP95Ms: 1000 },
      async prepare(baseDir) {
        const fixture = await createBenchWorkspace(baseDir, 'self-alert-health-bad-input');
        await writeText(path.join(fixture.inputsRoot, 'user.ndjson'), 'not-json\n');
        await writeText(path.join(fixture.inputsRoot, 'tool.ndjson'), '');
        return { ...fixture, expected: { count: 1, wrote: 1 } };
      },
      extract(output) {
        return {
          count: output.count,
          wrote: output.wrote,
          ok: output.ok === false ? 0 : 1
        };
      },
      validate(output, expected) {
        if (output.count !== expected.count || output.wrote !== expected.wrote || output.ok !== false) {
          throw new Error(`Unexpected health-bad-input result: count=${output.count} wrote=${output.wrote} ok=${output.ok}`);
        }
      }
    }
  };
}

function buildPollScenario(command, userCount, toolCount, thresholds) {
  return {
    command,
    thresholds,
    async prepare(baseDir) {
      const fixture = await createBenchWorkspace(baseDir, `self-alert-${command}`);
      await writeNdjson(path.join(fixture.inputsRoot, 'user.ndjson'), Array.from({ length: userCount }, (_, index) => createUserEvent(index + 1)));
      await writeNdjson(path.join(fixture.inputsRoot, 'tool.ndjson'), Array.from({ length: toolCount }, (_, index) => createToolEvent(index + 1)));
      return {
        ...fixture,
        expected: {
          consumedUser: userCount,
          consumedTool: toolCount,
          wrote: userCount + toolCount,
          healthIssues: 0
        }
      };
    },
    extract(output) {
      if (command === 'poll') {
        return {
          consumedUser: output.consumed.user,
          consumedTool: output.consumed.tool,
          wrote: output.wrote,
          produced: output.produced
        };
      }

      return {
        consumedUser: output.summary.consumed.user,
        consumedTool: output.summary.consumed.tool,
        wrote: output.summary.wrote,
        healthIssues: output.summary.healthIssues,
        skippedPoll: output.skippedPoll ? 1 : 0
      };
    },
    validate(output, expected) {
      const consumedUser = command === 'poll' ? output.consumed.user : output.summary.consumed.user;
      const consumedTool = command === 'poll' ? output.consumed.tool : output.summary.consumed.tool;
      const wrote = command === 'poll' ? output.wrote : output.summary.wrote;
      const healthIssues = command === 'poll' ? 0 : output.summary.healthIssues;

      if (consumedUser !== expected.consumedUser || consumedTool !== expected.consumedTool || wrote !== expected.wrote) {
        throw new Error(
          `Unexpected ${command} result: consumedUser=${consumedUser} consumedTool=${consumedTool} wrote=${wrote}`
        );
      }

      if (healthIssues !== expected.healthIssues) {
        throw new Error(`Unexpected ${command} health issues: ${healthIssues}`);
      }
    }
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
    '# Self Alert Benchmark Report',
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

  lines.push('', '## Notes', '', '- Cold mode measures full process startup plus CLI invocation.', '- Warm mode imports the module and calls the underlying function in-process.', '');
  return `${lines.join('\n')}\n`;
}

async function runColdCommand(command, fixture) {
  const args = [CLI_PATH, command];
  if (command === 'process-user' || command === 'process-tool') {
    args.push(fixture.inputPath, fixture.statePath, fixture.workspaceRoot);
  } else {
    args.push(fixture.statePath, fixture.workspaceRoot, fixture.inputsRoot);
  }

  return new Promise((resolve, reject) => {
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
        reject(new Error(`Failed to parse JSON output: ${error.message}`));
      }
    });
  });
}

async function runWarmCommand(command, fixture) {
  if (command === 'process-user') {
    return processCandidates(detectUserCandidates(createUserEvent(1)), fixture.statePath, fixture.workspaceRoot);
  }

  if (command === 'process-tool') {
    return processCandidates(detectToolCandidates(createToolEvent(1)), fixture.statePath, fixture.workspaceRoot);
  }

  if (command === 'poll') {
    return pollAlertSources({
      workspaceRoot: fixture.workspaceRoot,
      statePath: fixture.statePath,
      inputsRoot: fixture.inputsRoot
    });
  }

  if (command === 'health-check') {
    return runHealthCheck({
      workspaceRoot: fixture.workspaceRoot,
      statePath: fixture.statePath,
      inputsRoot: fixture.inputsRoot
    });
  }

  if (command === 'tick') {
    return runSelfAlertTick({
      workspaceRoot: fixture.workspaceRoot,
      statePath: fixture.statePath,
      inputsRoot: fixture.inputsRoot
    });
  }

  throw new Error(`Unsupported warm command: ${command}`);
}

async function runScenario(definition, mode, fixture) {
  if (typeof global.gc === 'function') {
    global.gc();
  }

  const startCpu = process.cpuUsage();
  const start = performance.now();
  const output = mode === 'cold'
    ? await runColdCommand(definition.command, fixture)
    : await runWarmCommand(definition.command, fixture);
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

async function main(argv = process.argv.slice(2)) {
  const definitions = getScenarioDefinitions();
  const args = parseCommonArgs(argv, { scenario: 'smoke', mode: 'warm', runs: 5, warmup: 1, seed: 42 });
  const scenarioNames = resolveScenarioNames(args, definitions);
  ensureScenarioNames(scenarioNames, definitions);
  const modes = resolveModes(args.mode);
  const outputDir = await createOutputDir({ repoRoot: REPO_ROOT, benchName: 'self-alert', outRoot: args.out, tag: args.tag });
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
          const outcome = await runScenario(definition, mode, fixture);
          const record = buildRunRecord({
            bench: 'self-alert',
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
            bench: 'self-alert',
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
    benchName: 'self-alert',
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
