import path from 'node:path';
import process from 'node:process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.dirname(__dirname);

async function collectSummaryFiles(inputPaths) {
  const files = [];
  for (const input of inputPaths) {
    const resolved = path.resolve(input);
    const entries = await readdir(resolved, { withFileTypes: true }).catch(() => null);
    if (!entries) {
      files.push(resolved);
      continue;
    }

    for (const entry of entries) {
      if (entry.isFile() && entry.name === 'summary.json') {
        files.push(path.join(resolved, entry.name));
      }
    }
  }
  return files;
}

function parseArgs(argv) {
  const inputs = [];
  let outDir = path.join(REPO_ROOT, 'benchmarks', 'combined-report');

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--out') {
      outDir = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }
    inputs.push(token);
  }

  if (inputs.length === 0) {
    throw new Error('Usage: node scripts/bench_report.mjs <summary-or-dir> [more...] [--out <dir>]');
  }

  return { inputs, outDir };
}

function renderMarkdown(combined) {
  const lines = ['# Benchmark Aggregate Report', ''];
  for (const item of combined.results) {
    lines.push(`## ${item.source}`);
    lines.push(`- Bench: ${item.summary.bench}`);
    lines.push(`- Generated: ${item.summary.generatedAt}`);
    lines.push(`- Tag: ${item.summary.args?.tag || 'unknown'}`);
    lines.push('');
    for (const [scenario, summary] of Object.entries(item.summary.scenarioSummaries || {})) {
      const p95 = summary.metrics?.durationMs?.p95;
      lines.push(`- ${scenario}: success=${summary.okRuns}/${summary.runs}; p95=${p95 == null ? 'n/a' : `${p95.toFixed(1)} ms`}`);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

async function main(argv = process.argv.slice(2)) {
  const { inputs, outDir } = parseArgs(argv);
  const summaryFiles = await collectSummaryFiles(inputs);
  const results = [];

  for (const filePath of summaryFiles) {
    const raw = await readFile(filePath, 'utf8');
    results.push({
      source: filePath,
      summary: JSON.parse(raw)
    });
  }

  await mkdir(outDir, { recursive: true });
  const combined = {
    generatedAt: new Date().toISOString(),
    results
  };
  await writeFile(path.join(outDir, 'combined-summary.json'), `${JSON.stringify(combined, null, 2)}\n`, 'utf8');
  await writeFile(path.join(outDir, 'combined-report.md'), renderMarkdown(combined), 'utf8');
  process.stdout.write(`${JSON.stringify({ outDir, files: summaryFiles.length }, null, 2)}\n`);
}

if (path.resolve(process.argv[1] || '') === __filename) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export { main };
