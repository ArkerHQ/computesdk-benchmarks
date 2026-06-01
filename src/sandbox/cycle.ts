/**
 * Cycle benchmark — emits the Arker website's raw-data schema.
 *
 * Each trial: create → exec_0 → pause(warm) → sleep(gapWarm) → resume →
 * exec_warm → pause(cold) → sleep(gapCold) → resume → exec_cold → destroy.
 *
 * The pause between execs uses each provider's $0-idle primitive (see
 * pause.ts) so idle cost during the gap is zero. The three measured
 * latencies map 1:1 onto what the Arker benchmarks page consumes:
 *
 *   phase_ms.t0_fork_run        = create + first exec   (cold-start)
 *   phase_ms.t_warm_restore_run = warm restore + exec   (post short gap)
 *   phase_ms.t_cold_restore_run = cold restore + exec   (post long gap)
 *
 * Output object is `{ trials: Trial[], ... }`, wrapped as `{ payload, result }`
 * by the exporter to match the per-cell files the website's loader reads.
 */
import { pauseSandbox, resumeSandbox } from './pause.js';
import type { ProviderConfig } from './types.js';

export interface CyclePhaseMs {
  create: number;
  exec_0: number;
  t0_fork_run: number;          // create + exec_0
  t_warm_restore_run: number;   // resume_warm + exec_warm
  t_cold_restore_run: number;   // resume_cold + exec_cold
}

export interface CycleTrial {
  phase_ms: Partial<CyclePhaseMs>;
  errors: string[];
}

export interface CycleResult {
  test: 'cycle';
  provider: string;
  workload: string;
  concurrency: number;
  gap_warm_sec: number;
  gap_cold_sec: number;
  trials: CycleTrial[];
  n_full_cycle_success: number;
}

export interface CycleOptions {
  workload: string;
  /** Shell command to run for each exec phase; must print something for validation. */
  workloadCode: string;
  concurrency: number;
  gapWarmSec: number;
  gapColdSec: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function timedExec(sandbox: any, code: string): Promise<number> {
  const t0 = performance.now();
  const res = await sandbox.runCommand(code);
  const dt = performance.now() - t0;
  if (res && typeof res.exitCode === 'number' && res.exitCode !== 0) {
    throw new Error(`exec exit ${res.exitCode}: ${res.stderr || ''}`.slice(0, 180));
  }
  return dt;
}

export async function runCycleBenchmark(
  config: ProviderConfig,
  opts: CycleOptions,
): Promise<CycleResult> {
  const { name, sandboxOptions } = config;
  const missing = config.requiredEnvVars.filter((v) => !process.env[v]);
  const base: CycleResult = {
    test: 'cycle', provider: name, workload: opts.workload,
    concurrency: opts.concurrency, gap_warm_sec: opts.gapWarmSec,
    gap_cold_sec: opts.gapColdSec, trials: [], n_full_cycle_success: 0,
  };
  if (missing.length > 0) return base;

  const compute = await config.createCompute();
  const recreate = () => compute.sandbox.create(sandboxOptions);

  const oneTrial = async (): Promise<CycleTrial> => {
    const phase_ms: Partial<CyclePhaseMs> = {};
    const errors: string[] = [];
    let sandbox: any = null;
    try {
      // PHASE: create + exec_0 (t0_fork_run)
      const tc = performance.now();
      sandbox = await recreate();
      phase_ms.create = performance.now() - tc;
      phase_ms.exec_0 = await timedExec(sandbox, opts.workloadCode);
      phase_ms.t0_fork_run = phase_ms.create + phase_ms.exec_0;

      // PHASE: warm pause → gap → resume + exec_warm
      const warmRef = await pauseSandbox(name, sandbox, 'warm');
      await sleep(opts.gapWarmSec * 1000);
      const tw = performance.now();
      sandbox = await resumeSandbox(warmRef, recreate);
      await timedExec(sandbox, opts.workloadCode);
      // total wall for warm restore + exec — matches Arker's t_warm_restore_run
      phase_ms.t_warm_restore_run = performance.now() - tw;

      // PHASE: cold pause → gap → resume + exec_cold
      const coldRef = await pauseSandbox(name, sandbox, 'cold');
      await sleep(opts.gapColdSec * 1000);
      const tcold = performance.now();
      sandbox = await resumeSandbox(coldRef, recreate);
      await timedExec(sandbox, opts.workloadCode);
      phase_ms.t_cold_restore_run = performance.now() - tcold;
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    } finally {
      if (sandbox) {
        try { await sandbox.destroy(); } catch { /* best-effort */ }
      }
    }
    return { phase_ms, errors };
  };

  const trials = await Promise.all(
    Array.from({ length: opts.concurrency }, () => oneTrial()),
  );
  const full = trials.filter(
    (t) => t.errors.length === 0 &&
      t.phase_ms.t0_fork_run! > 0 &&
      t.phase_ms.t_warm_restore_run! > 0 &&
      t.phase_ms.t_cold_restore_run! > 0,
  ).length;

  return { ...base, trials, n_full_cycle_success: full };
}
