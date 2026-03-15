export function percentile(values, fraction) {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }

  const sorted = [...values]
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);

  if (sorted.length === 0) {
    return null;
  }

  if (fraction <= 0) {
    return sorted[0];
  }

  if (fraction >= 1) {
    return sorted[sorted.length - 1];
  }

  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) {
    return sorted[lower];
  }

  const weight = index - lower;
  return sorted[lower] + ((sorted[upper] - sorted[lower]) * weight);
}

export function summarizeNumbers(values) {
  const numeric = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));

  if (numeric.length === 0) {
    return null;
  }

  const sum = numeric.reduce((total, value) => total + value, 0);
  return {
    count: numeric.length,
    min: Math.min(...numeric),
    max: Math.max(...numeric),
    mean: sum / numeric.length,
    p50: percentile(numeric, 0.5),
    p95: percentile(numeric, 0.95),
    p99: percentile(numeric, 0.99),
    sum
  };
}

export function flattenNumericObject(input, prefix = '', target = {}) {
  if (!input || typeof input !== 'object') {
    return target;
  }

  for (const [key, value] of Object.entries(input)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'number' && Number.isFinite(value)) {
      target[path] = value;
      continue;
    }

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      flattenNumericObject(value, path, target);
    }
  }

  return target;
}

export function summarizeRuns(runs) {
  const measured = Array.isArray(runs) ? runs : [];
  const okRuns = measured.filter((run) => run && run.ok);
  const metrics = {
    durationMs: summarizeNumbers(measured.map((run) => run.durationMs)),
    cpuUserMicros: summarizeNumbers(measured.map((run) => run.cpuUserMicros)),
    cpuSystemMicros: summarizeNumbers(measured.map((run) => run.cpuSystemMicros)),
    rssBytes: summarizeNumbers(measured.map((run) => run.rssBytes)),
    heapUsedBytes: summarizeNumbers(measured.map((run) => run.heapUsedBytes))
  };

  const assertionBuckets = {};
  for (const run of measured) {
    const flattened = flattenNumericObject(run.assertions || {});
    for (const [key, value] of Object.entries(flattened)) {
      if (!assertionBuckets[key]) {
        assertionBuckets[key] = [];
      }
      assertionBuckets[key].push(value);
    }
  }

  const assertions = Object.fromEntries(
    Object.entries(assertionBuckets).map(([key, values]) => [key, summarizeNumbers(values)])
  );

  return {
    runs: measured.length,
    okRuns: okRuns.length,
    errorCount: measured.length - okRuns.length,
    successRate: measured.length === 0 ? null : okRuns.length / measured.length,
    metrics,
    assertions
  };
}
