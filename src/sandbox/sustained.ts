/**
 * Sustained throughput benchmark — a REAL closed loop of N concurrent workers.
 *
 * Mirrors Arker's canonical sustained-throughput methodology:
 *
 *   N workers run continuously for `durationSec`. Each worker does:
 *       fork (create) → exec → fire-and-forget delete → repeat
 *   immediately, with NO intra-loop gap. The delete is NOT awaited during
 *   the timed window — the worker moves to the next create the instant
 *   `exec` returns, so EPS reflects fork+exec throughput, not teardown cost.
 *   In-flight deletes are drained AFTER the window closes.
 *
 * Concurrency defaults to 4 to match the Arker /benchmarks page subtitle
 * ("4 connections").
 *
 * Emits exactly the shape the website's benchmarks loader consumes:
 *   { test_meta: { duration_sec }, completions: [ { t_start_s, t_finish_s, wall_ms } ] }
 */
import type { ProviderConfig } from './types.js';

export interface SustainedCompletion {
  t_start_s: number;
  t_finish_s: number;
  wall_ms: number;
}

export interface SustainedResult {
  test_meta: {
    test: 'sustained';
    provider: string;
    workload: string;
    concurrency: number;
    duration_sec: number;
    total_completions: number;
    errors: number;
    mean_eps: number;
  };
  completions: SustainedCompletion[];
  error_events: { t_start_s: number; t_finish_s: number; wall_ms: number; error: string }[];
}

export interface SustainedOptions {
  workload: string;
  /** Shell command run on every fork; must print something. */
  workloadCode: string;
  /** Number of concurrent workers (closed-loop). Default 4 (Arker page = "4 connections"). */
  concurrency: number;
  /** Length of the timed window in seconds. */
  durationSec: number;
}

export async function runSustainedBenchmark(
  config: ProviderConfig,
  opts: SustainedOptions,
): Promise<SustainedResult> {
  const { name, sandboxOptions } = config;
  const base: SustainedResult = {
    test_meta: {
      test: 'sustained', provider: name, workload: opts.workload,
      concurrency: opts.concurrency, duration_sec: opts.durationSec,
      total_completions: 0, errors: 0, mean_eps: 0,
    },
    completions: [],
    error_events: [],
  };

  const missing = config.requiredEnvVars.filter((v) => !process.env[v]);
  if (missing.length > 0) return base;

  const compute = await config.createCompute();
  const create = () => compute.sandbox.create(sandboxOptions);

  const completions: SustainedCompletion[] = [];
  const errorEvents: SustainedResult['error_events'] = [];

  // Fire-and-forget teardown collector. Workers create the task but do
  // NOT await it — they move straight to the next fork. We drain these
  // after the timed window so each cell hands off with zero in-flight
  // sandboxes (avoids tripping provider concurrency caps in the next cell).
  const bgTasks = new Set<Promise<void>>();
  const fireForgetDestroy = (sandbox: any): void => {
    const p = (async () => {
      try { await sandbox.destroy(); } catch { /* best-effort */ }
    })();
    bgTasks.add(p);
    p.finally(() => bgTasks.delete(p));
  };

  const startWall = performance.now();
  const deadlineMs = startWall + opts.durationSec * 1000;

  async function worker(): Promise<void> {
    // Closed loop: keep forking+exec'ing until the window closes. We start
    // a new iteration only while there's still time on the clock; a single
    // in-flight create/exec is allowed to finish past the deadline (its
    // completion is filtered out by t_finish_s windowing in the loader).
    while (performance.now() < deadlineMs) {
      const t0 = performance.now();
      let sandbox: any = null;
      try {
        sandbox = await create();
        const res = await sandbox.runCommand(opts.workloadCode);
        const t1 = performance.now();
        if (res && typeof res.exitCode === 'number' && res.exitCode !== 0) {
          throw new Error(`exec exit ${res.exitCode}: ${(res.stderr || '').slice(0, 120)}`);
        }
        // Fire-and-forget delete — ownership transferred, do NOT await.
        fireForgetDestroy(sandbox);
        sandbox = null;
        completions.push({
          t_start_s: Number(((t0 - startWall) / 1000).toFixed(4)),
          t_finish_s: Number(((t1 - startWall) / 1000).toFixed(4)),
          wall_ms: Number((t1 - t0).toFixed(2)),
        });
      } catch (e) {
        if (sandbox) fireForgetDestroy(sandbox);
        const tErr = performance.now();
        errorEvents.push({
          t_start_s: Number(((t0 - startWall) / 1000).toFixed(4)),
          t_finish_s: Number(((tErr - startWall) / 1000).toFixed(4)),
          wall_ms: Number((tErr - t0).toFixed(2)),
          error: e instanceof Error ? e.message.slice(0, 180) : String(e).slice(0, 180),
        });
      }
    }
  }

  await Promise.all(
    Array.from({ length: opts.concurrency }, () => worker()),
  );

  // Drain in-flight fire-and-forget deletes before reporting so the next
  // cell starts with zero in-flight sandboxes.
  if (bgTasks.size > 0) {
    await Promise.race([
      Promise.allSettled(Array.from(bgTasks)),
      new Promise((r) => setTimeout(r, 60_000)),
    ]);
  }

  base.completions = completions;
  base.error_events = errorEvents;
  base.test_meta.total_completions = completions.length;
  base.test_meta.errors = errorEvents.length;
  base.test_meta.mean_eps = Number((completions.length / opts.durationSec).toFixed(2));
  return base;
}
