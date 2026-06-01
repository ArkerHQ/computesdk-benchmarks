import type { ProviderConfig } from './types.js';

/**
 * All provider benchmark configurations.
 *
 * Direct mode providers use ComputeSDK's open source package directly (no ComputeSDK API key).
 * Automatic mode providers route through the ComputeSDK gateway (requires COMPUTESDK_API_KEY).
 *
 * Provider SDK barrels are imported LAZILY (dynamic `import()` inside each
 * `createCompute`) rather than statically at module load. Several barrels pull
 * in heavy / environment-sensitive transitive deps — e.g. `@computesdk/daytona`
 * → `@aws-sdk/client-s3` — and a single bad barrel would otherwise crash the
 * whole module (and every `--provider` export) at import time. Lazy loading
 * means importing `providers` for the arker export only resolves the barrels
 * actually used.
 */
export const providers: ProviderConfig[] = [
  // --- Arker (canonical reference provider) ---
  {
    name: 'arker',
    requiredEnvVars: ['ARKER_API_KEY'],
    createCompute: async () => {
      const { arker } = await import('@computesdk/arker');
      // The Arker SDK needs a region OR baseUrl to resolve its endpoint.
      // Default to us-west-2 (the canonical benchmark region) when unset.
      return arker({
        apiKey: process.env.ARKER_API_KEY!,
        region: process.env.ARKER_REGION || 'us-west-2',
        baseUrl: process.env.ARKER_BASE_URL,
      });
    },
  },
  // --- Direct mode (provider SDK packages) ---
  {
    name: 'archil',
    requiredEnvVars: ['ARCHIL_API_KEY', 'ARCHIL_REGION', 'ARCHIL_DISK_ID'],
    createCompute: async () => {
      const { archil } = await import('@computesdk/archil');
      return archil({ apiKey: process.env.ARCHIL_API_KEY!, region: process.env.ARCHIL_REGION! });
    },
    sandboxOptions: { metadata: { diskId: process.env.ARCHIL_DISK_ID! } }
  },
  {
    name: 'blaxel',
    requiredEnvVars: ['BL_API_KEY', 'BL_WORKSPACE'],
    createCompute: async () => {
      const { blaxel } = await import('@computesdk/blaxel');
      return blaxel({ apiKey: process.env.BL_API_KEY!, workspace: process.env.BL_WORKSPACE!, region: 'us-was-1' });
    },
  },
  {
    name: 'cloudflare',
    requiredEnvVars: ['CLOUDFLARE_SANDBOX_URL', 'CLOUDFLARE_SANDBOX_SECRET'],
    createCompute: async () => {
      const { cloudflare } = await import('@computesdk/cloudflare');
      return cloudflare({ sandboxUrl: process.env.CLOUDFLARE_SANDBOX_URL!, sandboxSecret: process.env.CLOUDFLARE_SANDBOX_SECRET! });
    },
  },
  {
    name: 'codesandbox',
    requiredEnvVars: ['CSB_API_KEY'],
    createCompute: async () => {
      const { codesandbox } = await import('@computesdk/codesandbox');
      return codesandbox({ apiKey: process.env.CSB_API_KEY! });
    },
    destroyTimeoutMs: 1_000,
  },
  {
    name: 'daytona',
    requiredEnvVars: ['DAYTONA_API_KEY'],
    createCompute: async () => {
      const { daytona } = await import('@computesdk/daytona');
      return daytona({ apiKey: process.env.DAYTONA_API_KEY! });
    },
    sandboxOptions: { autoStopInterval: 15, autoDeleteInterval: 0 },
  },
  {
    name: 'declaw',
    requiredEnvVars: ['DECLAW_API_KEY'],
    createCompute: async () => {
      const { declaw } = await import('@computesdk/declaw');
      return declaw({ apiKey: process.env.DECLAW_API_KEY! });
    },
  },
  {
    name: 'e2b',
    requiredEnvVars: ['E2B_API_KEY'],
    createCompute: async () => {
      const { e2b } = await import('@computesdk/e2b');
      return e2b({ apiKey: process.env.E2B_API_KEY! });
    },
  },
  {
    name: 'hopx',
    requiredEnvVars: ['HOPX_API_KEY'],
    createCompute: async () => {
      const { hopx } = await import('@computesdk/hopx');
      return hopx({ apiKey: process.env.HOPX_API_KEY! });
    },
  },
  {
    name: 'modal',
    requiredEnvVars: ['MODAL_TOKEN_ID', 'MODAL_TOKEN_SECRET'],
    createCompute: async () => {
      const { modal } = await import('@computesdk/modal');
      return modal({ tokenId: process.env.MODAL_TOKEN_ID!, tokenSecret: process.env.MODAL_TOKEN_SECRET! });
    },
  },
  {
    name: 'namespace',
    requiredEnvVars: ['NSC_TOKEN'],
    createCompute: async () => {
      const { namespace } = await import('@computesdk/namespace');
      return namespace({ token: process.env.NSC_TOKEN! });
    },
    sandboxOptions: { image: 'node:22' },
  },
  // {
  //   name: 'northflank',
  //   requiredEnvVars: ['NORTHFLANK_TOKEN', 'NORTHFLANK_PROJECT_ID'],
  //   createCompute: async () => {
  //     const { northflank } = await import('@computesdk/northflank');
  //     return northflank({
  //       token: process.env.NORTHFLANK_TOKEN!,
  //       projectId: process.env.NORTHFLANK_PROJECT_ID!,
  //       runtime: 'node',
  //     });
  //   },
  // },
  {
    name: 'runloop',
    requiredEnvVars: ['RUNLOOP_API_KEY'],
    createCompute: async () => {
      const { runloop } = await import('@computesdk/runloop');
      return runloop({ apiKey: process.env.RUNLOOP_API_KEY! });
    },
  },
  {
    name: 'sprites',
    requiredEnvVars: ['SPRITES_TOKEN'],
    createCompute: async () => {
      const { sprites } = await import('@computesdk/sprites');
      return sprites({ apiKey: process.env.SPRITES_TOKEN! });
    },
  },
  {
    name: 'tensorlake',
    requiredEnvVars: ['TENSORLAKE_API_KEY'],
    createCompute: async () => {
      const { tensorlake } = await import('@computesdk/tensorlake');
      return tensorlake({ apiKey: process.env.TENSORLAKE_API_KEY! });
    },
  },
  {
    name: 'upstash',
    requiredEnvVars: ['UPSTASH_BOX_API_KEY'],
    createCompute: async () => {
      const { upstash } = await import('@computesdk/upstash');
      return upstash({ apiKey: process.env.UPSTASH_BOX_API_KEY! });
    },
    sandboxOptions: { ephemeral: true },
  },
  {
    name: 'vercel',
    requiredEnvVars: ['VERCEL_TOKEN', 'VERCEL_TEAM_ID', 'VERCEL_PROJECT_ID'],
    createCompute: async () => {
      const { vercel } = await import('@computesdk/vercel');
      return vercel({ token: process.env.VERCEL_TOKEN!, teamId: process.env.VERCEL_TEAM_ID!, projectId: process.env.VERCEL_PROJECT_ID! });
    },
  },
];
