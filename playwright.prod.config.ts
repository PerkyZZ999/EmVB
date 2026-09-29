import { defineConfig } from "@playwright/test";
import { baseConfig, server } from "./playwright.shared.ts";

// Production-output checks (W-011): pages are authored through the dev servers (dev-bypass
// sign-in) and read back from the production builds, which share the same database.
const platforms = [
  { name: "node", script: "demo:node", dev: 4411, prod: 4421 },
  { name: "cloudflare", script: "demo:cf", dev: 4412, prod: 4422 },
] as const;

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
    ...platforms.map(({ script, prod }) =>
      server(`bun run ${script}:build && bun run ${script}:prod`, prod, 300_000),
    ),
    ...platforms.map(({ script, dev }) => server(`bun run ${script}`, dev, 180_000)),
  ],
});
