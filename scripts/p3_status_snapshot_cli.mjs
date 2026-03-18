import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

function stripBom(value) {
  return String(value || '').replace(/^\uFEFF/, '');
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function loadJson(filePath) {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(stripBom(raw));
}

async function safeLoadJson(filePath) {
  try {
    return {
      ok: true,
      data: await loadJson(filePath),
      error: null
    };
  } catch (error) {
    return {
      ok: false,
      data: null,
      error: error.message || String(error)
    };
  }
}

function usage() {
  console.error([
    'Usage:',
    '  node scripts/p3_status_snapshot_cli.mjs status [--owner <owner>] [--validate-live]'
  ].join('\n'));
}

function parseArgs(args) {
  const options = {};
  const booleanFlags = new Set(['--validate-live']);
  const valueFlags = new Set(['--owner']);

  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (booleanFlags.has(key)) {
      options[key] = true;
      continue;
    }

    if (!valueFlags.has(key)) {
      throw new Error(`Unknown option: ${key}`);
    }

    const value = args[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Missing value for option: ${key}`);
    }

    options[key] = value;
    index += 1;
  }

  return options;
}

function normalizeSlashes(value) {
  return String(value || '').replace(/\\/g, '/');
}

function summarizeExists(pathsToCheck, existing) {
  return pathsToCheck.map((entry) => ({
    path: normalizeSlashes(entry),
    exists: existing.has(entry)
  }));
}

function buildRunResult(result) {
  return {
    ok: result.status === 0,
    code: result.status,
    stdout: result.stdout,
    stderr: result.stderr
  };
}

function runNode(repoRoot, args) {
  const run = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  return buildRunResult(run);
}

function everyExists(pathsToCheck, existing) {
  return pathsToCheck.every((entry) => existing.has(entry));
}

function buildStartupStateSummary(startupStateResult) {
  if (!startupStateResult.ok) {
    return {
      total_items: null,
      open_items: null,
      done_items: null,
      updated_at: null,
      error: startupStateResult.error
    };
  }

  const items = Array.isArray(startupStateResult.data?.items) ? startupStateResult.data.items : [];
  const openItems = items.filter((item) => item.promise_status === 'pending' && item.state !== 'done');

  return {
    total_items: items.length,
    open_items: openItems.length,
    done_items: items.filter((item) => item.state === 'done').length,
    updated_at: startupStateResult.data?.updatedAt || null,
    error: null
  };
}

function getP31ArtifactStatus(requiredArtifactsOk, startupStateSummary) {
  if (!requiredArtifactsOk) {
    return 'needs-review';
  }

  if (startupStateSummary.error || startupStateSummary.open_items !== 0) {
    return 'needs-review';
  }

  return 'passed';
}

function getLayerPhrase(layerName, status) {
  const phrases = {
    passed: `${layerName} passed`,
    usable: `${layerName} usable`,
    implemented: `${layerName} implemented`,
    partial: `${layerName} partial`,
    healthy: `${layerName} healthy`,
    'needs-review': `${layerName} needs review`,
    'needs-attention': `${layerName} needs attention`,
    'frozen-zero-server-boundary': `${layerName} implemented and currently frozen at the zero-server boundary on this machine`,
    'schema-inspected': `${layerName} implemented and currently at schema-inspected on this machine`,
    empty: `${layerName} empty`
  };

  return phrases[status] || `${layerName} ${status}`;
}

function buildOverallStatus(artifactStatus, liveChecks) {
  const steadyArtifacts = artifactStatus.p31.status === 'passed'
    && artifactStatus.p32.status === 'usable'
    && artifactStatus.p33.status === 'implemented';
  const steadyLive = !liveChecks || (
    liveChecks.p31.status === 'healthy'
    && liveChecks.p32.status === 'usable'
    && liveChecks.p33.status === 'frozen-zero-server-boundary'
  );

  return steadyArtifacts && steadyLive
    ? 'single-machine-mainline'
    : 'single-machine-mainline-needs-review';
}

function buildCurrentCall(artifactStatus, liveChecks) {
  const p31Status = liveChecks?.p31?.status === 'healthy'
    ? 'passed'
    : liveChecks?.p31?.status === 'needs-attention'
      ? 'needs-attention'
      : artifactStatus.p31.status;
  const p32Status = liveChecks?.p32?.status === 'usable'
    ? 'usable'
    : liveChecks?.p32?.status === 'empty'
      ? 'empty'
      : artifactStatus.p32.status;
  const p33Status = liveChecks?.p33?.status || artifactStatus.p33.status;

  return [
    getLayerPhrase('P3.1', p31Status),
    getLayerPhrase('P3.2', p32Status),
    getLayerPhrase('P3.3', p33Status)
  ].join(', ') + '.';
}

async function withTempStateCopy(sourcePath, action) {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'p3-status-cli-'));
  const tempStatePath = path.join(tempRoot, 'startup-recovery-state.json');

  try {
    const raw = await readFile(sourcePath, 'utf8');
    await writeFile(tempStatePath, raw, 'utf8');
    return await action(tempStatePath);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

function buildDoctorFallback(startupStateSummary) {
  return {
    check: {
      status: 'needs-attention',
      doctor_ok: false,
      open_count: startupStateSummary.open_items,
      next_action: 'repair-startup-state'
    },
    raw: {
      stderr: startupStateSummary.error || 'startup recovery state unavailable',
      summary: null
    }
  };
}

async function collectArtifactStatus(repoRoot) {
  const p31Paths = [
    path.join(repoRoot, 'plans', 'p3-1-startup-recovery-transition-to-skills-recall-v1.md'),
    path.join(repoRoot, 'notes', 'p3-1-startup-recovery-final-e2e-pass-2026-03-18.md'),
    path.join(repoRoot, 'notes', 'startup-recovery-state.json'),
    path.join(repoRoot, 'scripts', 'startup_recovery_check.mjs')
  ];
  const p32Paths = [
    path.join(repoRoot, 'plans', 'p3-2-skills-recall-v1.md'),
    path.join(repoRoot, 'notes', 'p3-2-skills-recall-preview-validate-review-dogfood-v1.md'),
    path.join(repoRoot, 'notes', 'p3-2-skills-recall-operator-flow-v1.md'),
    path.join(repoRoot, 'scripts', 'skills_recall_preview.mjs'),
    path.join(repoRoot, 'scripts', 'skills_recall_preview_test.mjs')
  ];
  const p33Paths = [
    path.join(repoRoot, 'plans', 'p3-3-mcp-first-packet-entry-v1.md'),
    path.join(repoRoot, 'notes', 'p3-3-mcp-entry-preview-dogfood-v1.md'),
    path.join(repoRoot, 'notes', 'p3-3-mcp-zero-server-boundary-v1.md'),
    path.join(repoRoot, 'scripts', 'mcp_entry_preview.mjs'),
    path.join(repoRoot, 'scripts', 'mcp_entry_preview_test.mjs')
  ];
  const statusSnapshotPath = path.join(repoRoot, 'notes', 'p3-status-snapshot-2026-03-19.md');
  const startupStatePath = path.join(repoRoot, 'notes', 'startup-recovery-state.json');

  const allPaths = [...p31Paths, ...p32Paths, ...p33Paths, statusSnapshotPath];
  const existing = new Set();

  for (const filePath of allPaths) {
    if (await pathExists(filePath)) {
      existing.add(filePath);
    }
  }

  const startupStateResult = await safeLoadJson(startupStatePath);
  const startupStateSummary = buildStartupStateSummary(startupStateResult);

  return {
    startup_state_path: startupStatePath,
    snapshot_note: normalizeSlashes(path.relative(repoRoot, statusSnapshotPath) || '.'),
    p31: {
      status: getP31ArtifactStatus(everyExists(p31Paths, existing), startupStateSummary),
      required_artifacts: summarizeExists(p31Paths, existing),
      startup_state_summary: startupStateSummary
    },
    p32: {
      status: everyExists(p32Paths, existing) ? 'usable' : 'partial',
      required_artifacts: summarizeExists(p32Paths, existing)
    },
    p33: {
      status: everyExists(p33Paths, existing) ? 'implemented' : 'partial',
      required_artifacts: summarizeExists(p33Paths, existing)
    }
  };
}

function parseJsonOutput(runResult, label) {
  if (!runResult.ok) {
    throw new Error(`${label} failed: ${runResult.stderr || runResult.stdout}`);
  }

  return JSON.parse(stripBom(runResult.stdout));
}

function summarizeP33Check(mcpPacket) {
  const mcpOutcome = mcpPacket?.outcome || {};
  let p33Status = 'needs-review';
  if (mcpOutcome.reason === 'no-configured-servers') {
    p33Status = 'frozen-zero-server-boundary';
  } else if (mcpOutcome.status === 'schema-inspected') {
    p33Status = 'schema-inspected';
  }

  return {
    status: p33Status,
    outcome_status: mcpOutcome.status || null,
    outcome_reason: mcpOutcome.reason || null,
    server_count: mcpPacket.observed_signal?.server_count ?? null,
    preflight_command: mcpPacket.preflight_command?.command || null
  };
}

async function buildDoctorCheck(repoRoot, owner, artifactStatus) {
  if (artifactStatus.p31.startup_state_summary.error) {
    return buildDoctorFallback(artifactStatus.p31.startup_state_summary);
  }

  return withTempStateCopy(artifactStatus.startup_state_path, async (tempStatePath) => {
    const relativeTempPath = normalizeSlashes(path.relative(repoRoot, tempStatePath));
    const doctorRun = runNode(repoRoot, ['scripts/startup_recovery_check.mjs', 'doctor', owner, relativeTempPath]);
    const doctorReport = parseJsonOutput(doctorRun, 'startup_recovery_check doctor');
    return {
      check: {
        status: doctorReport.ok === true ? 'healthy' : 'needs-attention',
        doctor_ok: doctorReport.ok === true,
        open_count: doctorReport.summary?.openCount ?? null,
        next_action: doctorReport.nextAction?.kind || null
      },
      raw: {
        stderr: doctorRun.stderr,
        summary: doctorReport.summary || null
      }
    };
  });
}

async function commandStatus(repoRoot, options) {
  const owner = options['--owner'] || 'qxiaohu';
  const artifactStatus = await collectArtifactStatus(repoRoot);
  const report = {
    owner,
    checked_at: new Date().toISOString(),
    mode: options['--validate-live'] ? 'artifact-and-live' : 'artifact-only',
    summary: {
      overall: buildOverallStatus(artifactStatus, null),
      current_call: buildCurrentCall(artifactStatus, null)
    },
    artifact_status: {
      snapshot_note: artifactStatus.snapshot_note,
      p31: artifactStatus.p31,
      p32: artifactStatus.p32,
      p33: artifactStatus.p33
    }
  };

  if (options['--validate-live']) {
    const doctor = await buildDoctorCheck(repoRoot, owner, artifactStatus);
    const skillsRun = runNode(repoRoot, [
      'scripts/skills_recall_preview.mjs',
      'preview',
      '--owner',
      owner,
      '--task-title',
      'Freeze the current MCP zero-server boundary',
      '--task-path',
      'plans/p3-3-mcp-first-packet-entry-v1.md',
      '--validate'
    ]);
    const mcpRun = runNode(repoRoot, [
      'scripts/mcp_entry_preview.mjs',
      'preview',
      '--task-title',
      'Freeze the current MCP zero-server boundary',
      '--task-path',
      'plans/p3-3-mcp-first-packet-entry-v1.md',
      '--validate'
    ]);

    const skillsPacket = parseJsonOutput(skillsRun, 'skills_recall_preview preview');
    const mcpPacket = parseJsonOutput(mcpRun, 'mcp_entry_preview preview');
    const liveChecks = {
      p31: doctor.check,
      p32: {
        status: Array.isArray(skillsPacket.recall_candidates) && skillsPacket.recall_candidates.length > 0 ? 'usable' : 'empty',
        trigger: skillsPacket.trigger || null,
        candidate_count: Array.isArray(skillsPacket.recall_candidates) ? skillsPacket.recall_candidates.length : 0,
        first_candidate: skillsPacket.recall_candidates?.[0]?.source_path || null
      },
      p33: summarizeP33Check(mcpPacket)
    };

    report.summary.overall = buildOverallStatus(artifactStatus, liveChecks);
    report.summary.current_call = buildCurrentCall(artifactStatus, liveChecks);
    report.live_validation = {
      checks: liveChecks,
      raw: {
        doctor: doctor.raw,
        skills_preview: {
          stderr: skillsRun.stderr,
          trigger: skillsPacket.trigger || null
        },
        mcp_preview: {
          stderr: mcpRun.stderr,
          outcome: mcpPacket.outcome || null
        }
      }
    };
  }

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const options = parseArgs(rest);
  const repoRoot = process.cwd();

  if (command === 'status') {
    await commandStatus(repoRoot, options);
    return;
  }

  usage();
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
