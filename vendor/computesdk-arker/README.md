# @computesdk/arker (VENDORED PLACEHOLDER)

This is a **temporary vendored** ComputeSDK provider for Arker, wired in via a
`file:` dependency (`"@computesdk/arker": "file:vendor/computesdk-arker"` in the
root `package.json`).

## Why this exists

The real ComputeSDK Arker provider is **not yet published to npm**:

```
$ npm view @computesdk/arker
npm ERR! 404 Not Found
```

The harness was specced against `@arker-ai/sdk@0.5.0`, but the latest published
version is `0.3.0` (`npm view @arker-ai/sdk versions`). This shim adapts the
published `@arker-ai/sdk` (0.3.0) `Arker`/`Computer` classes to the minimal
ComputeSDK `Sandbox` surface the benchmark harness uses:

- `compute.sandbox.create()` → forks a fresh VM from a golden checkpoint
- `sandbox.runCommand(cmd, { release? })`
- `sandbox.destroy()`
- `sandbox.getInstance()` → the native `Computer` (exposes `run(cmd, { release })`)

The cycle/sustained benchmarks reach `getInstance()` to issue the Arker-specific
`release` directive (`pause.ts`), which the generic ComputeSDK `runCommand`
options type does not carry.

## Build

The shim is TypeScript; its built output (`dist/`) is committed so the `file:`
dependency resolves without a build step on install. To rebuild after editing
`src/index.ts`:

```bash
npm run build:vendor-arker   # from repo root
npm install @computesdk/arker # re-copy dist into node_modules
```

## Replacing the vendored shim

1. Publish the real `@computesdk/arker` provider to npm.
2. Replace the `file:vendor/computesdk-arker` dependency with the published
   version, and bump `@arker-ai/sdk` to the release the provider targets
   (0.5.0 per the original spec).
3. Delete this `vendor/computesdk-arker` directory.

None of the code fixes in this PR (cycle/sustained methodology, pause wiring,
lazy provider barrels, the `arker` ProviderConfig) depend on the *implementation*
in this shim — only on its interface. Swapping in the published package is a
one-line dependency change.
