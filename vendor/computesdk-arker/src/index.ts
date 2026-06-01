/**
 * VENDORED placeholder for `@computesdk/arker`.
 *
 * The real ComputeSDK Arker provider is not yet published to npm (`npm view
 * @computesdk/arker` → 404 as of 2026-05-31). This vendored shim adapts the
 * published Arker TypeScript SDK (`@arker-ai/sdk`) to the minimal ComputeSDK
 * `Sandbox` surface the benchmark harness needs:
 *
 *     compute.sandbox.create(opts) -> Sandbox
 *     sandbox.runCommand(cmd, opts) -> { stdout, stderr, exitCode, durationMs }
 *     sandbox.destroy()
 *     sandbox.getInstance() -> the native @arker-ai/sdk `Computer`
 *
 * The cycle/sustained benchmarks reach the native `Computer` via
 * `getInstance()` and call `.run('true', { release })` directly — that's how
 * the Arker-specific `release` directive reaches the Arker backend (the generic
 * ComputeSDK `runCommand` options type has no `release` field and strips it).
 *
 * Once `@computesdk/arker` is published, replace this vendored package with it
 * and bump `@arker-ai/sdk` to the release the provider targets (the harness was
 * written against 0.5.0; latest published is 0.3.0). This file stays tiny so
 * swapping it out is a one-line dependency change in package.json.
 */
import { Arker, type Computer, type RunOptions } from '@arker-ai/sdk';

export interface ArkerProviderOptions {
  apiKey: string;
  /** Golden checkpoint to fork from. Defaults to "ubuntu". */
  checkpoint?: string;
  baseUrl?: string;
  region?: string;
}

const dec = new TextDecoder();

/** Minimal ComputeSDK-compatible sandbox backed by an @arker-ai/sdk Computer. */
class ArkerSandbox {
  readonly provider = 'arker';
  constructor(private readonly computer: Computer) {}

  get sandboxId(): string {
    return this.computer.id;
  }

  /** Native provider instance — the @arker-ai/sdk Computer (has run/fork/delete). */
  getInstance(): Computer {
    return this.computer;
  }

  async runCommand(
    command: string,
    options?: { timeout?: number; release?: string },
  ): Promise<{ stdout: string; stderr: string; exitCode: number; durationMs: number }> {
    const t0 = Date.now();
    const runOpts: RunOptions = {};
    // RunRequest.timeout is in seconds (per the Arker OpenAPI schema).
    if (options?.timeout != null) runOpts.timeout = options.timeout;
    if (options?.release != null) runOpts.release = options.release;
    const res = await this.computer.run(command, runOpts);
    const durationMs = Date.now() - t0;
    if (res.type === 'completed') {
      return {
        stdout: typeof res.stdout === 'string' ? res.stdout : dec.decode(res.stdout),
        stderr: typeof res.stderr === 'string' ? res.stderr : dec.decode(res.stderr),
        exitCode: res.exitCode,
        durationMs,
      };
    }
    // Background / PTY runs aren't used by the benchmarks.
    return { stdout: '', stderr: '', exitCode: 0, durationMs };
  }

  async destroy(): Promise<void> {
    await this.computer.delete();
  }
}

/**
 * ComputeSDK provider factory. Returns a `compute`-shaped object exposing
 * `sandbox.create()`. Each create forks a fresh VM from the configured golden
 * checkpoint (the canonical Arker fork-based create path).
 */
export function arker(options: ArkerProviderOptions) {
  const client = new Arker({
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
    region: options.region,
  });
  const checkpoint = options.checkpoint ?? 'ubuntu';

  return {
    sandbox: {
      async create(_opts?: Record<string, unknown>): Promise<ArkerSandbox> {
        // Fork from the named golden checkpoint — POST /v1/vms/{golden}/fork.
        const golden = client.vm(checkpoint);
        const forked = await golden.fork();
        return new ArkerSandbox(forked);
      },
    },
  };
}

export default arker;
