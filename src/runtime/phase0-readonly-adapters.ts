import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { READONLY_MODE } from "../config";
import type { OpenClawInsightStatus } from "./openclaw-cli-insights";

export interface Phase0BenchmarkSuiteSummary {
  bench: string;
  label: string;
  status: OpenClawInsightStatus;
  latestGeneratedAt?: string;
  latestHost?: string;
  latestTag?: string;
  latestCommit?: string;
  latestPath?: string;
  latestRoot?: string;
  observedHosts: number;
  runCount: number;
  scenarioCount: number;
  failingScenarioCount: number;
  keyMetricLabel: string;
  keyMetricValue: string;
}

export interface Phase0BenchmarkSummary {
  generatedAt: string;
  status: OpenClawInsightStatus;
  rootPath?: string;
  rootExists: boolean;
  suiteCount: number;
  completeSuiteCount: number;
  expectedSuiteCount: number;
  suites: Phase0BenchmarkSuiteSummary[];
}

export interface Phase0WiringItem {
  key: string;
  label: string;
  status: OpenClawInsightStatus;
  detail: string;
  value: string;
}

export interface Phase0WiringSummary {
  generatedAt: string;
  status: OpenClawInsightStatus;
  items: Phase0WiringItem[];
}

interface BenchmarkSummaryFile {
  bench?: string;
  generatedAt?: string;
  system?: {
    hostname?: string;
    node?: string;
  };
  args?: {
    tag?: string;
    commit?: string;
  };
  scenarios?: string[];
  scenarioSummaries?: Record<string, { okRuns?: number; runs?: number; errorCount?: number; metrics?: Record<string, { p95?: number }> }>;
}

const EXPECTED_BENCHMARKS = ["self-alert", "memory", "heartbeat-e2e"] as const;
const BENCHMARK_LABELS: Record<string, string> = {
  "self-alert": "Self Alert",
  memory: "Memory",
  "heartbeat-e2e": "Heartbeat E2E",
};
const BENCHMARK_METRIC_HINTS: Record<string, { key: string; label: string }> = {
  "self-alert": { key: "tick-large@cold", label: "tick-large cold p95" },
  memory: { key: "daily-append-100@cold", label: "daily-append-100 cold p95" },
  "heartbeat-e2e": { key: "heartbeat-burst@cold", label: "heartbeat-burst cold p95" },
};
const CACHE_TTL_MS = 15_000;

let benchmarkCache: { workspaceRoot: string; expiresAt: number; value: Phase0BenchmarkSummary } | undefined;
let benchmarkInFlight: Promise<Phase0BenchmarkSummary> | undefined;
let wiringCache: { workspaceRoot: string; expiresAt: number; value: Phase0WiringSummary } | undefined;
let wiringInFlight: Promise<Phase0WiringSummary> | undefined;

export async function loadCachedPhase0BenchmarkSummary(workspaceRoot: string): Promise<Phase0BenchmarkSummary> {
  const normalized = resolve(workspaceRoot);
  const now = Date.now();
  if (benchmarkCache && benchmarkCache.workspaceRoot === normalized && benchmarkCache.expiresAt > now) {
    return benchmarkCache.value;
  }
  if (benchmarkInFlight) return benchmarkInFlight;
  benchmarkInFlight = buildPhase0BenchmarkSummary(normalized)
    .then((value) => {
      benchmarkCache = { workspaceRoot: normalized, expiresAt: Date.now() + CACHE_TTL_MS, value };
      return value;
    })
    .finally(() => {
      benchmarkInFlight = undefined;
    });
  return benchmarkInFlight;
}

export async function loadCachedPhase0WiringSummary(workspaceRoot: string): Promise<Phase0WiringSummary> {
  const normalized = resolve(workspaceRoot);
  const now = Date.now();
  if (wiringCache && wiringCache.workspaceRoot === normalized && wiringCache.expiresAt > now) {
    return wiringCache.value;
  }
  if (wiringInFlight) return wiringInFlight;
  wiringInFlight = buildPhase0WiringSummary(normalized)
    .then((value) => {
      wiringCache = { workspaceRoot: normalized, expiresAt: Date.now() + CACHE_TTL_MS, value };
      return value;
    })
    .finally(() => {
      wiringInFlight = undefined;
    });
  return wiringInFlight;
}

async function buildPhase0BenchmarkSummary(workspaceRoot: string): Promise<Phase0BenchmarkSummary> {
  const now = new Date().toISOString();
  const benchmarkRoot = await findFirstExistingDirectory([
    join(workspaceRoot, "qxiaohu-erliang-collab", "benchmarks"),
    join(workspaceRoot, "benchmarks"),
  ]);
  if (!benchmarkRoot) {
    return {
      generatedAt: now,
      status: "warn",
      rootExists: false,
      suiteCount: 0,
      completeSuiteCount: 0,
      expectedSuiteCount: EXPECTED_BENCHMARKS.length,
      suites: EXPECTED_BENCHMARKS.map((bench) => emptySuiteSummary(bench, "blocked")),
    };
  }

  const directories = await listSubdirectories(benchmarkRoot);
  const records: Array<{ filePath: string; rootPath: string; summary: BenchmarkSummaryFile }> = [];
  for (const directory of directories) {
    const summaryPath = join(benchmarkRoot, directory, "summary.json");
    const parsed = await safeReadJson(summaryPath);
    if (!parsed || typeof parsed !== "object") continue;
    records.push({ filePath: summaryPath, rootPath: join(benchmarkRoot, directory), summary: parsed as BenchmarkSummaryFile });
  }

  const groups = new Map<string, Array<{ filePath: string; rootPath: string; summary: BenchmarkSummaryFile }>>();
  for (const record of records) {
    const bench = normalizeBench(record.summary.bench);
    if (!bench) continue;
    const bucket = groups.get(bench) ?? [];
    bucket.push(record);
    groups.set(bench, bucket);
  }

  const suites = EXPECTED_BENCHMARKS.map((bench) => summarizeBenchmarkSuite(bench, groups.get(bench) ?? []));
  const overallStatus = foldStatuses(suites.map((suite) => suite.status));
  return {
    generatedAt: now,
    status: overallStatus,
    rootPath: benchmarkRoot,
    rootExists: true,
    suiteCount: suites.length,
    completeSuiteCount: suites.filter((suite) => suite.status === "ok").length,
    expectedSuiteCount: EXPECTED_BENCHMARKS.length,
    suites,
  };
}

async function buildPhase0WiringSummary(workspaceRoot: string): Promise<Phase0WiringSummary> {
  const benchmark = await loadCachedPhase0BenchmarkSummary(workspaceRoot);
  const statePath = join(workspaceRoot, "qxiaohu-erliang-collab", "notes", "control-center-phase0-state.json");
  const handoffPath = join(workspaceRoot, "qxiaohu-erliang-collab", "notes", "control-center-phase0-handoff.md");
  const protocolPath = join(workspaceRoot, "qxiaohu-erliang-collab", "notes", "control-center-phase0-coordination-protocol.md");
  const stateJson = await safeReadJson(statePath);
  const handoffExists = await pathExists(handoffPath);
  const protocolExists = await pathExists(protocolPath);
  const latestBenchmarkRun = benchmark.suites
    .map((suite) => suite.latestGeneratedAt)
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0];

  const items: Phase0WiringItem[] = [
    {
      key: "readonly-mode",
      label: "Readonly mode",
      status: READONLY_MODE ? "ok" : "warn",
      detail: READONLY_MODE ? "Mutations stay disabled for the phase-0 slice." : "Readonly mode is off; phase-0 assumptions are no longer enforced.",
      value: READONLY_MODE ? "enabled" : "disabled",
    },
    {
      key: "benchmark-root",
      label: "Benchmark evidence",
      status: benchmark.status,
      detail: benchmark.rootExists
        ? `${benchmark.completeSuiteCount}/${benchmark.expectedSuiteCount} expected benchmark suites are currently healthy.`
        : "No benchmark root is visible from the configured workspace.",
      value: benchmark.rootExists ? relativeLabel(workspaceRoot, benchmark.rootPath) : "missing",
    },
    {
      key: "coordination-state",
      label: "Coordination state",
      status: stateJson ? "ok" : "blocked",
      detail: stateJson
        ? `revision ${stringValue((stateJson as Record<string, unknown>).revision) ?? "?"} · next ${stringValue((stateJson as Record<string, unknown>).nextOwnerLabel) ?? stringValue((stateJson as Record<string, unknown>).nextOwnerKey) ?? "?"}`
        : "Shared coordination state is missing.",
      value: stateJson ? relativeLabel(workspaceRoot, statePath) : "missing",
    },
    {
      key: "coordination-handoff",
      label: "Handoff log",
      status: handoffExists ? "ok" : "warn",
      detail: handoffExists ? "Shared handoff log is available for incremental updates." : "Shared handoff log is missing.",
      value: handoffExists ? relativeLabel(workspaceRoot, handoffPath) : "missing",
    },
    {
      key: "coordination-protocol",
      label: "Coordination protocol",
      status: protocolExists ? "ok" : "warn",
      detail: protocolExists ? "Shared polling and ack rules are documented." : "Coordination protocol file is missing.",
      value: protocolExists ? relativeLabel(workspaceRoot, protocolPath) : "missing",
    },
    {
      key: "latest-evidence",
      label: "Latest benchmark evidence",
      status: latestBenchmarkRun ? "ok" : "info",
      detail: latestBenchmarkRun ? `Most recent benchmark artifact was generated ${latestBenchmarkRun}.` : "No benchmark artifact timestamp is available yet.",
      value: latestBenchmarkRun ?? "not available",
    },
  ];

  return {
    generatedAt: new Date().toISOString(),
    status: foldStatuses(items.map((item) => item.status)),
    items,
  };
}

function summarizeBenchmarkSuite(
  bench: string,
  records: Array<{ filePath: string; rootPath: string; summary: BenchmarkSummaryFile }>,
): Phase0BenchmarkSuiteSummary {
  if (records.length === 0) {
    return emptySuiteSummary(bench, "warn");
  }

  const latest = [...records].sort((left, right) => Date.parse(right.summary.generatedAt ?? "") - Date.parse(left.summary.generatedAt ?? ""))[0];
  const failingScenarioCount = countFailingScenarios(latest.summary);
  const status: OpenClawInsightStatus = failingScenarioCount > 0 ? "warn" : "ok";
  const observedHosts = new Set(records.map((record) => normalizeString(record.summary.system?.hostname)).filter(Boolean)).size;
  const metricHint = BENCHMARK_METRIC_HINTS[bench] ?? { key: "", label: "p95" };
  const metricValue = pickMetricValue(latest.summary, metricHint.key);
  return {
    bench,
    label: BENCHMARK_LABELS[bench] ?? bench,
    status,
    latestGeneratedAt: latest.summary.generatedAt,
    latestHost: normalizeString(latest.summary.system?.hostname),
    latestTag: normalizeString(latest.summary.args?.tag),
    latestCommit: normalizeString(latest.summary.args?.commit),
    latestPath: latest.filePath,
    latestRoot: latest.rootPath,
    observedHosts,
    runCount: records.length,
    scenarioCount: latest.summary.scenarios?.length ?? Object.keys(latest.summary.scenarioSummaries ?? {}).length,
    failingScenarioCount,
    keyMetricLabel: metricHint.label,
    keyMetricValue: metricValue,
  };
}

function emptySuiteSummary(bench: string, status: OpenClawInsightStatus): Phase0BenchmarkSuiteSummary {
  return {
    bench,
    label: BENCHMARK_LABELS[bench] ?? bench,
    status,
    observedHosts: 0,
    runCount: 0,
    scenarioCount: 0,
    failingScenarioCount: 0,
    keyMetricLabel: BENCHMARK_METRIC_HINTS[bench]?.label ?? "p95",
    keyMetricValue: "-",
  };
}

function countFailingScenarios(summary: BenchmarkSummaryFile): number {
  const scenarioSummaries = summary.scenarioSummaries ?? {};
  let failing = 0;
  for (const item of Object.values(scenarioSummaries)) {
    const runs = numericValue(item.runs) ?? 0;
    const okRuns = numericValue(item.okRuns) ?? 0;
    const errorCount = numericValue(item.errorCount) ?? 0;
    if (errorCount > 0 || okRuns < runs) failing += 1;
  }
  return failing;
}

function pickMetricValue(summary: BenchmarkSummaryFile, scenarioKey: string): string {
  const scenario = summary.scenarioSummaries?.[scenarioKey];
  const duration = numericValue(scenario?.metrics?.durationMs?.p95);
  if (Number.isFinite(duration)) return `${duration!.toFixed(1)} ms`;
  return "-";
}

function normalizeBench(input: string | undefined): string | undefined {
  const value = normalizeString(input);
  return value ? value : undefined;
}

async function listSubdirectories(rootPath: string): Promise<string[]> {
  try {
    const entries = await readdir(rootPath, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
}

async function findFirstExistingDirectory(candidates: string[]): Promise<string | undefined> {
  for (const candidate of candidates.map((value) => resolve(value))) {
    try {
      if ((await stat(candidate)).isDirectory()) return candidate;
    } catch {
      // Ignore missing candidates.
    }
  }
  return undefined;
}

async function safeReadJson(filePath: string): Promise<unknown | undefined> {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(stripBom(raw));
  } catch {
    return undefined;
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function stripBom(value: string): string {
  return value.replace(/^\uFEFF/, "");
}

function foldStatuses(statuses: OpenClawInsightStatus[]): OpenClawInsightStatus {
  if (statuses.includes("blocked")) return "blocked";
  if (statuses.includes("warn")) return "warn";
  if (statuses.includes("info")) return "info";
  if (statuses.includes("unknown")) return "unknown";
  return "ok";
}

function numericValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeString(value: string | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function relativeLabel(workspaceRoot: string, filePath: string | undefined): string {
  if (!filePath) return "-";
  const normalizedRoot = resolve(workspaceRoot);
  const normalizedPath = resolve(filePath);
  if (normalizedPath.startsWith(normalizedRoot)) {
    return normalizedPath.slice(normalizedRoot.length + 1).replace(/\\/g, "/");
  }
  return normalizedPath;
}
