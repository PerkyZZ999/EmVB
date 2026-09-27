import { defineConfig } from "@playwright/test";

// A-09: use the system Chromium instead of downloading Playwright's browsers.
const executablePath = process.env["EMVB_CHROMIUM"] ?? "/usr/bin/chromium";

const platforms = [
  { name: "node", port: 4411, command: "bun run demo:node" },
  { name: "cloudflare", port: 4412, command: "bun run demo:cf" },
] as const;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.e2e\.ts$/,
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env["CI"]),
  retries: 0,
  reporter: [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    launchOptions: { executablePath },
    trace: "retain-on-failure",
  },
  projects: platforms.flatMap(({ name, port }) => [
    {
      name: `${name}-setup`,
      testMatch: /auth\.setup\.ts$/,
      use: { baseURL: `http://127.0.0.1:${port}` },
    },
    {
      name,
      dependencies: [`${name}-setup`],
      use: { baseURL: `http://127.0.0.1:${port}`, storageState: `e2e/.auth/${name}.json` },
    },
  ]),
  webServer: platforms.map(({ port, command }) => ({
    command,
    // The site root, not an EmVB route, so a broken plugin fails tests instead of server startup.
    url: `http://127.0.0.1:${port}/`,
    reuseExistingServer: !process.env["CI"],
    timeout: 180_000,
    stdout: "ignore" as const,
    stderr: "pipe" as const,
  })),
});
