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
import { type Computer } from '@arker-ai/sdk';
export interface ArkerProviderOptions {
    apiKey: string;
    /** Golden checkpoint to fork from. Defaults to "ubuntu". */
    checkpoint?: string;
    baseUrl?: string;
    region?: string;
}
/** Minimal ComputeSDK-compatible sandbox backed by an @arker-ai/sdk Computer. */
declare class ArkerSandbox {
    private readonly computer;
    readonly provider = "arker";
    constructor(computer: Computer);
    get sandboxId(): string;
    /** Native provider instance — the @arker-ai/sdk Computer (has run/fork/delete). */
    getInstance(): Computer;
    runCommand(command: string, options?: {
        timeout?: number;
        release?: string;
    }): Promise<{
        stdout: string;
        stderr: string;
        exitCode: number;
        durationMs: number;
    }>;
    destroy(): Promise<void>;
}
/**
 * ComputeSDK provider factory. Returns a `compute`-shaped object exposing
 * `sandbox.create()`. Each create forks a fresh VM from the configured golden
 * checkpoint (the canonical Arker fork-based create path).
 */
export declare function arker(options: ArkerProviderOptions): {
    sandbox: {
        create(_opts?: Record<string, unknown>): Promise<ArkerSandbox>;
    };
};
export default arker;
