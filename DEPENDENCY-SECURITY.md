# Dependency remediation (2026-09-28)

This update preserves the direct dependency ranges and uses non-forced npm
remediation plus scoped overrides for upstream-pinned dependencies. It does not
change benchmark methodology or provision cloud resources.

## Verified fixes

- `tar` resolves to 7.5.22. GitHub confirms CVE-2026-59873 in
  [GHSA-23hp-3jrh-7fpw](https://github.com/advisories/GHSA-23hp-3jrh-7fpw):
  versions <=7.5.18 are affected and 7.5.19 is the first fix. The selected version
  also addresses the later recursion advisory affecting <=7.5.20.
- Non-forced lockfile updates resolve the other available fixes reported by npm.
- Overrides select patched `js-yaml` 4.3.2 for the Hey API parser, `protobufjs`
  8.8.0 for the OTLP transformer, and `lodash` 4.18.1 for blessed-contrib.
- OpenTelemetry core and Jaeger propagator overrides select 2.9.0 only for 2.x
  consumers. They deliberately do not force 1.x consumers across a major version.
- The regenerated lockfile records the vendored Arker package, fixing the base
  lockfile's missing-link failure during `npm ci`.

Remove each override when its upstream dependency selects a patched version,
then repeat installation, smoke tests, and audit.

## Remaining findings

Final npm audit: **0 critical, 0 high, 41 moderate, 0 low** affected packages.
These include propagated dependency findings, not 41 distinct advisories.
The remaining underlying advisories are:

- [GHSA-8988-4f7v-96qf](https://github.com/advisories/GHSA-8988-4f7v-96qf):
  OpenTelemetry core 1.30.1 under CodeSandbox's Sentry/instrumentation dependencies.
  Requires an upstream-compatible telemetry migration rather than forcing 2.x
  into 1.x consumers.
- [GHSA-776f-qx25-q3cc](https://github.com/advisories/GHSA-776f-qx25-q3cc):
  `xml2js` under CodeSandbox -> blessed-contrib -> map-canvas. Requires review of
  the legacy parser integration before upgrading across its pre-1.0 API ranges.

The initial npm audit reported 67 affected packages (1 critical, 22 high,
42 moderate, 2 low). These counts are not directly comparable to Vanta's supplied
90 findings. Repository Dependabot alert access returned HTTP 403; public GitHub
advisories and npm registry audit data were available. This is not a clean-audit
claim or acceptance of the remaining risks.

## Validation

Validated on Node 22.23.2 and npm 10.9.8:

- `npm ci --ignore-scripts --no-audit`: passed.
- `npm run build:vendor-arker`: passed.
- Sandbox, storage, and browser provider registry imports with `node --import tsx`:
  passed without creating external resources.
- Local smoke assertions for W3C baggage and Jaeger round trips, OTLP trace/log
  and metrics serialization, YAML parsing, and blessed-contrib's lodash template:
  passed.
- `npx tsc --noEmit`: fails at `src/storage/providers.ts:19`, because `region`
  is not a property of `S3Config`. Reproduced on base commit
  `2701051d8e134bdc15535b8af0132478e13237ec` after `npm install --ignore-scripts`.
- `git diff --check`: passed.

There is no unit-test script. Live benchmarks and dependency install scripts were
not run. The repository's `.nvmrc` says Node 20, but its existing dependency tree
already requires Node 22 (including Tensorlake's Undici >=22.19.0); Node 20 is
not validated by this change.
