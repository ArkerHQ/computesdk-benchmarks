/**
 * Export ComputeSDK benchmark results into the Arker website's raw-data-dir
 * format, so the same numbers the Arker benchmarks page renders can be
 * produced for any ComputeSDK provider.
 *
 * Arker's website loader reads a directory of per-cell files named:
 *
 *     <date>/<kind>__<workload>__<provider>.json     kind ∈ {cycle, sustained}
 *
 * each shaped `{ payload, result }`. It only ingests workloads "grep" and
 * "sqlite-disk", and providers arker | e2b | daytona | modal(-fs).
 *
 *   cycle result   → { trials: [ { phase_ms: { t0_fork_run,
 *                       t_warm_restore_run, t_cold_restore_run } } ] }
 *   sustained result → { test_meta: { duration_sec },
 *                        completions: [ { t_start_s, t_finish_s, wall_ms } ] }
 *
 * This exporter runs BOTH benchmarks and writes both per-cell files directly:
 *   - cycle    (cycle.ts)     — create→exec→pause(warm)→sleep→resume→exec
 *                               →pause(cold)→sleep→resume→exec, emitting the
 *                               three phase_ms the page reads.
 *   - sustained (sustained.ts) — a REAL closed loop of `--connections` (default
 *                               4, matching the page's "4 connections" subtitle)
 *                               concurrent workers doing fork→exec→fire-forget
 *                               delete continuously for `--sustained-duration`s,
 *                               emitting raw completions[{t_finish_s,wall_ms}].
 *
 * Usage:
 *   tsx src/export-arker.ts --provider arker --workload grep \
 *       --gap-warm 60 --gap-cold 120 --concurrency 50 \
 *       --connections 4 --sustained-duration 10 --out-dir ./arker-data
 */
import './env.js';
import fs from 'fs';
import path from 'path';
import { providers } from './sandbox/providers.js';
import { runCycleBenchmark } from './sandbox/cycle.js';
import { runSustainedBenchmark } from './sandbox/sustained.js';

// Workloads the Arker page ingests, with shell code matching Arker's harness.
const WORKLOAD_CODE: Record<string, string> = {
  grep: 'grep root /etc/passwd | wc -l',
  'sqlite-disk':
    "mkdir -p /var/tmp && python3 - <<'PY'\n" +
    'import sqlite3,os\n' +
    "db='/var/tmp/bench.db'\n" +
    "c=sqlite3.connect(db); c.execute('CREATE TABLE IF NOT EXISTS t(x)')\n" +
    'c.executemany("INSERT INTO t VALUES(?)", [(i,) for i in range(1000)])\n' +
    'c.commit(); print(c.execute("SELECT count(*) FROM t").fetchone()[0])\n' +
    'PY',
};

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && i + 1 < process.argv.length ? process.argv[i + 1] : def;
}

function writeCell(outDir: string, date: string, kind: string, workload: string, provider: string, payload: unknown, result: unknown) {
  const dir = path.join(outDir, date);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${kind}__${workload}__${provider}.json`);
  fs.writeFileSync(file, JSON.stringify({ payload, result }, null, 2));
  console.log(`wrote ${file}`);
}

async function main() {
  const providerName = arg('provider');
  const workload = arg('workload', 'grep')!;
  const gapWarm = Number(arg('gap-warm', '60'));
  const gapCold = Number(arg('gap-cold', '120'));
  const concurrency = Number(arg('concurrency', '50'));
  const durationSec = Number(arg('sustained-duration', '10'));
  // Sustained closed-loop worker count. Defaults to 4 to match the Arker
  // /benchmarks page subtitle ("4 connections").
  const connections = Number(arg('connections', '4'));
  const outDir = path.resolve(arg('out-dir', './arker-data')!);
  const date = arg('date', new Date().toISOString().slice(0, 10))!;

  if (!WORKLOAD_CODE[workload]) {
    console.error(`Unknown workload "${workload}". Supported: ${Object.keys(WORKLOAD_CODE).join(', ')}`);
    process.exit(1);
  }
  const toRun = providerName ? providers.filter((p) => p.name === providerName) : providers;
  if (toRun.length === 0) {
    console.error(`Unknown provider "${providerName}". Available: ${providers.map((p) => p.name).join(', ')}`);
    process.exit(1);
  }

  for (const cfg of toRun) {
    console.log(`\n=== cycle ${workload} / ${cfg.name} (k=${concurrency}, gaps ${gapWarm}s/${gapCold}s) ===`);
    const cycle = await runCycleBenchmark(cfg, {
      workload, workloadCode: WORKLOAD_CODE[workload],
      concurrency, gapWarmSec: gapWarm, gapColdSec: gapCold,
    });
    const payload = { test: 'cycle', provider: cfg.name, workload, config: { concurrency, gap_warm_sec: gapWarm, gap_cold_sec: gapCold } };
    writeCell(outDir, date, 'cycle', workload, cfg.name, payload, cycle);

    console.log(`\n=== sustained ${workload} / ${cfg.name} (connections=${connections}, ${durationSec}s closed-loop) ===`);
    const sustained = await runSustainedBenchmark(cfg, {
      workload, workloadCode: WORKLOAD_CODE[workload],
      concurrency: connections, durationSec,
    });
    const sPayload = { test: 'sustained', provider: cfg.name, workload, config: { concurrency: connections, duration_sec: durationSec, burst_gap_sec: 0 } };
    writeCell(outDir, date, 'sustained', workload, cfg.name, sPayload, sustained);
  }
  console.log('\nDone. Point Arker bundle-benchmarks at the --out-dir to render.');
}

main().catch((e) => { console.error(e); process.exit(1); });
