/**
 * Per-provider "zero-dollar pause" helper.
 *
 * The cycle benchmark (src/sandbox/cycle.ts) needs to leave a sandbox idle
 * for a gap (e.g. 60s warm, 120s cold) WITHOUT paying for idle compute, then
 * bring it back and re-measure restore+exec. Every provider exposes a
 * different "save state and come back for $0 while idle" primitive; this
 * helper picks the right one per provider by probing the underlying SDK
 * handle that ComputeSDK wraps (`sandbox.getInstance()`).
 *
 * Mechanism per provider (mirrors Arker's own cross-provider methodology):
 *   - e2b        → handle.betaPause() / handle.pause(); resume re-connects.
 *   - daytona    → handle.stop() + handle.archive(); resume = start()/from snapshot.
 *   - modal      → snapshotFilesystem() (stable) or snapshot(); restore from snap.
 *   - arker      → run with release="cpu,memory,disk" (evict to S3) then resume.
 *   - generic    → handle.pause()/handle.suspend()/handle.stop() if present.
 * If no $0 primitive is found, we fall back to a destroy+recreate (cold), which
 * is still $0-idle (nothing runs during the gap) and is the honest lower bound
 * for providers that have no pause/restore.
 *
 * Returns a PauseRef the caller passes to `resume()`. Keep this MINIMAL and
 * capability-probed — providers' wrapper surfaces differ and shift over time.
 */

export type PauseLevel = 'warm' | 'cold';

export interface PauseRef {
  provider: string;
  level: PauseLevel;
  /** How the pause was performed (for result provenance). */
  mechanism: string;
  /** Opaque restore token (snapshot id, sandbox id, etc.). */
  token?: string;
  /** Kept live for providers that resume the same handle in-process. */
  _sandbox?: any;
  /** Set when the only $0-idle option was destroy+recreate. */
  recreate?: boolean;
}

/** Best-effort: reach the underlying provider SDK handle behind a ComputeSDK sandbox. */
function instanceOf(sandbox: any): any {
  try {
    if (typeof sandbox?.getInstance === 'function') return sandbox.getInstance();
  } catch { /* fall through */ }
  return sandbox?.instance ?? sandbox?.handle ?? sandbox;
}

async function tryCall(obj: any, names: string[], ...args: any[]): Promise<{ ok: boolean; name?: string; value?: any }> {
  for (const n of names) {
    const fn = obj?.[n];
    if (typeof fn === 'function') {
      const value = await fn.call(obj, ...args);
      return { ok: true, name: n, value };
    }
  }
  return { ok: false };
}

/**
 * Pause `sandbox` so it costs $0 while idle. `level` lets providers that have
 * a warm/cold distinction (daytona stop vs archive, arker mem vs S3-evict)
 * pick the right depth; providers with a single primitive ignore it.
 */
export async function pauseSandbox(
  provider: string,
  sandbox: any,
  level: PauseLevel,
): Promise<PauseRef> {
  const inst = instanceOf(sandbox);
  const base: PauseRef = { provider, level, mechanism: 'unknown', _sandbox: sandbox };

  if (provider === 'e2b') {
    const r = await tryCall(inst, ['betaPause', 'pause']);
    if (r.ok) return { ...base, mechanism: r.name! };
  } else if (provider === 'daytona') {
    const stopped = await tryCall(inst, ['stop']);
    if (level === 'cold') await tryCall(inst, ['archive']);
    if (stopped.ok) return { ...base, mechanism: level === 'cold' ? 'stop+archive' : 'stop' };
  } else if (provider === 'modal') {
    const snap = await tryCall(inst, ['snapshotFilesystem', 'snapshot']);
    if (snap.ok) {
      const token = (snap.value && (snap.value.id ?? snap.value)) as string | undefined;
      await tryCall(inst, ['terminate', 'kill', 'destroy']);
      return { ...base, mechanism: snap.name!, token, _sandbox: undefined };
    }
  } else if (provider === 'arker') {
    // Arker's "pause" is a `/run` carrying a `release` directive:
    //   warm = release "cpu,memory"      → drop vCPU threads + write the mem
    //          snapshot to LOCAL disk (no S3). Resume re-mmaps it. $0 idle.
    //   cold = release "cpu,memory,disk" → also push the snapshot to S3 and
    //          free local disk. Resume pulls it back from S3. $0 idle.
    //
    // The `release` field is an Arker-specific extension that ComputeSDK's
    // generic `runCommand(cmd, opts)` wrapper STRIPS (its options type only
    // knows background/cwd/env/onStdout/onStderr/timeout). We must reach the
    // native @computesdk/arker instance via getInstance() and call its
    // `run(cmd, { release })`, which forwards `release` to the Arker backend.
    const release = level === 'cold' ? 'cpu,memory,disk' : 'cpu,memory';
    const r = await tryCall(inst, ['run', 'runCommand'], 'true', { release } as any)
      .catch(() => ({ ok: false } as any));
    if (r.ok) return { ...base, mechanism: `release=${release}` };
  }

  // Generic probe for any other provider's pause/suspend/stop primitive.
  const generic = await tryCall(inst, ['pause', 'suspend', 'stop', 'hibernate']);
  if (generic.ok) return { ...base, mechanism: generic.name! };

  // No $0 pause primitive — destroy now and recreate on resume. Still $0 idle.
  await tryCall(sandbox, ['destroy', 'kill', 'terminate']).catch(() => ({ ok: false }));
  return { ...base, mechanism: 'destroy+recreate', recreate: true, _sandbox: undefined };
}

/**
 * Resume a paused sandbox and return a usable ComputeSDK sandbox handle.
 * `recreate()` is supplied by the caller (closes over the provider's
 * `compute.sandbox.create`) for the no-pause-primitive fallback path.
 */
export async function resumeSandbox(
  ref: PauseRef,
  recreate: () => Promise<any>,
): Promise<any> {
  if (ref.recreate || !ref._sandbox) {
    // destroy+recreate fallback, or a provider whose snapshot killed the
    // original handle (modal): the cleanest restore is a fresh sandbox.
    return recreate();
  }
  const inst = instanceOf(ref._sandbox);
  if (ref.provider === 'e2b') {
    await tryCall(inst, ['betaResume', 'resume', 'connect']);
  } else if (ref.provider === 'daytona') {
    await tryCall(inst, ['start', 'resume']);
  } else if (ref.provider === 'arker') {
    // arker resumes lazily on the next run; nothing to do here.
  } else {
    await tryCall(inst, ['resume', 'start', 'unpause', 'wake']);
  }
  return ref._sandbox;
}
