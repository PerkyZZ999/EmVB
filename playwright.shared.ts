import type { PlaywrightTestConfig } from "@playwright/test";

// A-09: use the system Chromium instead of downloading Playwright's browsers.
const executablePath = process.env["EMVB_CHROMIUM"] ?? "/usr/bin/chromium";

// Astro 7 auto-backgrounds `astro dev` when an AI agent runs it (am-i-vibing), so the webServer
// process exits immediately ("Process from config.webServer exited early"). Astro's own
// ASTRO_DEV_BACKGROUND opt-out keeps the dev servers in the foreground where Playwright manages them.
const foregroundDevEnv = {
  ...Object.fromEntries(
    Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined),
  ),
  ASTRO_DEV_BACKGROUND: "1",
};

/** Run settings both suites share: one worker, no retries, system Chromium. */
export const baseConfig = {
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env["CI"]),
  retries: 0,
  reporter: [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: { launchOptions: { executablePath }, trace: "retain-on-failure" },
} satisfies PlaywrightTestConfig;

/** A demo server Playwright starts, reuses outside CI, and waits on at the site root. */
export const server = (command: string, port: number, timeout: number) => ({
  command,
  // The site root, not an EmVB route, so a broken plugin fails tests instead of server startup.
  url: `http://127.0.0.1:${port}/`,
  reuseExistingServer: !process.env["CI"],
  timeout,
  stdout: "ignore" as const,
  stderr: "pipe" as const,
  env: foregroundDevEnv,
});
