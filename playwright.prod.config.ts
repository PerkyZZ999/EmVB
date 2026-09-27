import { defineConfig } from "@playwright/test";

// Production-output checks (W-011): pages are authored through the dev servers (dev-bypass
// sign-in) and read back from the production builds, which share the same database.
const executablePath = process.env["EMVB_CHROMIUM"] ?? "/usr/bin/chromium";

const platforms = [
  { name: "node", script: "demo:node", dev: 4411, prod: 4421 },
  { name: "cloudflare", script: "demo:cf", dev: 4412, prod: 4422 },
] as const;

const server = (command: string, port: number, timeout: number) => ({
  command,
  url: `http://127.0.0.1:${port}/`,
  reuseExistingServer: !process.env["CI"],
  timeout,
  stdout: "ignore" as const,
  stderr: "pipe" as const,
});

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env["CI"]),
  retries: 0,
  reporter: [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: { launchOptions: { executablePath }, trace: "retain-on-failure" },
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
