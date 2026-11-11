import { defineConfig } from "@playwright/test";
import { baseConfig, server } from "./playwright.shared.ts";

// Production-output checks (W-011): pages are authored through the dev servers (dev-bypass
// sign-in) and read back from the production builds, which share the same database.
// W-986: the seeded-bug runner's e2e lanes each use their own ports, as in playwright.config.ts.
const port = (name: string, fallback: number) => Number(process.env[name] ?? fallback);
const platforms = [
  {
    name: "node",
    script: "demo:node",
    dir: "demos/node",
    dev: port("EMVB_E2E_NODE_PORT", 4411),
    prod: port("EMVB_E2E_NODE_PROD_PORT", 4421),
    defaults: [4411, 4421],
  },
  {
    name: "cloudflare",
    script: "demo:cf",
    dir: "demos/cloudflare",
    dev: port("EMVB_E2E_CF_PORT", 4412),
    prod: port("EMVB_E2E_CF_PROD_PORT", 4422),
    defaults: [4412, 4422],
  },
] as const;

type Platform = (typeof platforms)[number];
const custom = (p: Platform) => p.dev !== p.defaults[0] || p.prod !== p.defaults[1];
const devCommand = (p: Platform) =>
  custom(p)
    ? `bun run --cwd ${p.dir} astro dev --host 127.0.0.1 --port ${p.dev}`
    : `bun run ${p.script}`;
const prodCommand = (p: Platform) => {
  if (!custom(p)) return `bun run ${p.script}:prod`;
  return p.name === "node"
    ? `cd ${p.dir} && HOST=127.0.0.1 PORT=${p.prod} bun ./dist/server/entry.mjs`
    : `cd ${p.dir} && bunx wrangler dev --ip 127.0.0.1 --port ${p.prod}`;
};

/**
 * W-986: `--project=node-public` (as the seeded-bug runner passes it) builds and starts only the
 * Node demo's servers; a run without --project starts both platforms' servers, as before.
 */
const requested = new Set(
  process.argv.flatMap((arg, i) =>
    arg.startsWith("--project=")
      ? [arg.slice("--project=".length)]
      : arg === "--project" && process.argv[i + 1]
        ? [process.argv[i + 1] as string]
        : [],
  ),
);
const servers = platforms.filter(
  (p) =>
    requested.size === 0 || requested.has(`${p.name}-public`) || requested.has(`${p.name}-setup`),
);

export default defineConfig({
  ...baseConfig,
  testDir: "./e2e",
  projects: platforms.flatMap(({ name, dev, prod }) => [
    {
      name: `${name}-setup`,
      testMatch: /auth\.setup\.ts$/,
      use: { baseURL: `http://127.0.0.1:${dev}` },
    },
    {
      name: `${name}-public`,
      testMatch: /.*\.prod\.ts$/,
      dependencies: [`${name}-setup`],
      use: { baseURL: `http://127.0.0.1:${prod}` },
      metadata: { dev: `http://127.0.0.1:${dev}`, auth: `e2e/.auth/${name}.json` },
    },
  ]),
  // Playwright starts these in order. The builds come first: an `astro build` running next to a
  // warm `astro dev` in the same project left the dev admin unable to hydrate (VALIDATION W-011).
  webServer: [
    ...servers.map((p) =>
      server(`bun run ${p.script}:build && ${prodCommand(p)}`, p.prod, 300_000),
    ),
    ...servers.map((p) => server(devCommand(p), p.dev, 180_000)),
  ],
});
