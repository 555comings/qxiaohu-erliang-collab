import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

function usage() {
  console.error([
    'Usage:',
    '  node scripts/p3_default_entry.mjs enter [--owner <owner>] [--artifact-only] [--brief]'
  ].join('\n'));
}

function parseArgs(args) {
  const options = {
    owner: 'qxiaohu',
    artifactOnly: false,
    brief: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--artifact-only') {
      options.artifactOnly = true;
      continue;
    }

    if (token === '--brief') {
      options.brief = true;
      continue;
    }

    if (token === '--owner') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('Missing value for --owner');
      }
      options.owner = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${token}`);
  }

  return options;
}

function runStatusCli(repoRoot, owner, artifactOnly) {
  const args = ['scripts/p3_status_snapshot_cli.mjs', 'status', '--owner', owner];
  if (!artifactOnly) {
    args.push('--validate-live');
  }

  const run = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  if (run.status !== 0) {
    throw new Error(run.stderr || run.stdout || `status CLI failed with exit code ${run.status}`);
  }

  return {
    command: `node ${args.join(' ')}`,
    report: JSON.parse(run.stdout)
  };
}

function evaluateReadiness(report, artifactOnly) {
  const stopReasons = [];
  const artifact = report.artifact_status || {};
  const p31 = artifact.p31 || {};
  const p32 = artifact.p32 || {};
  const p33 = artifact.p33 || {};
  const live = report.live_validation?.checks || null;

  if (report.summary?.overall !== 'single-machine-mainline') {
    stopReasons.push('top-line status drifted away from single-machine-mainline');
  }
  if (p31.status !== 'passed') {
    stopReasons.push('P3.1 is not passed');
  }
  if (p32.status !== 'usable') {
    stopReasons.push('P3.2 is not usable');
  }
  if (p33.status !== 'implemented') {
    stopReasons.push('P3.3 is not implemented');
  }

  if (!artifactOnly) {
    if (live?.p31?.status !== 'healthy') {
      stopReasons.push('P3.1 is not healthy in live validation');
    }
    if (live?.p32?.status !== 'usable') {
      stopReasons.push('P3.2 is not usable in live validation');
    }
    if (live?.p33?.status !== 'frozen-zero-server-boundary') {
      stopReasons.push('P3.3 is no longer at the zero-server boundary');
    }
    if (live?.p33?.outcome_reason !== 'no-configured-servers') {
      stopReasons.push('P3.3 outcome reason drifted from no-configured-servers');
    }
  }

  const ready = stopReasons.length === 0;
  return {
    readiness: ready ? 'ready' : 'stop',
    stopReasons,
    nextAction: ready
      ? 'Use the current single-machine mainline as-is and keep MCP at the inspect-first zero-server boundary.'
      : 'Stop and inspect the status report plus the finish-line/default-entry notes before continuing.'
  };
}

function buildOutput(command, report, artifactOnly) {
  const evaluation = evaluateReadiness(report, artifactOnly);
  return {
    mode: 'p3-default-entry',
    command_run: command,
    readiness: evaluation.readiness,
    current_call: report.summary?.current_call || null,
    first_reads: [
      'notes/p3-default-entry-v1.md',
      'notes/p3-single-machine-finish-line-v1.md',
      'notes/p3-status-snapshot-2026-03-19.md'
    ],
    stop_reasons: evaluation.stopReasons,
    next_action: evaluation.nextAction,
    report_excerpt: {
      overall: report.summary?.overall || null,
      artifact_p31: report.artifact_status?.p31?.status || null,
      artifact_p32: report.artifact_status?.p32?.status || null,
      artifact_p33: report.artifact_status?.p33?.status || null,
      live_p31: report.live_validation?.checks?.p31?.status || null,
      live_p32: report.live_validation?.checks?.p32?.status || null,
      live_p33: report.live_validation?.checks?.p33?.status || null,
      live_p33_reason: report.live_validation?.checks?.p33?.outcome_reason || null
    }
  };
}

function buildBriefOutput(output) {
  const parts = [
    output.readiness === 'ready' ? 'READY' : 'STOP',
    output.report_excerpt.overall || 'unknown-overall',
    output.current_call || 'no-current-call'
  ];

  if (output.readiness === 'ready') {
    parts.push(output.next_action);
  } else if (output.stop_reasons.length > 0) {
    parts.push(`reasons=${output.stop_reasons.join('; ')}`);
  }

  return parts.join(' | ');
}

function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === '--help' || command === '-h') {
    usage();
    process.exit(command ? 0 : 1);
  }

  if (command !== 'enter') {
    throw new Error(`Unsupported command: ${command}`);
  }

  const options = parseArgs(rest);
  const repoRoot = process.cwd();
  const { command: commandRun, report } = runStatusCli(repoRoot, options.owner, options.artifactOnly);
  const output = buildOutput(commandRun, report, options.artifactOnly);
  if (options.brief) {
    process.stdout.write(`${buildBriefOutput(output)}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
