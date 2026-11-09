import { defineConfig } from "@playwright/test";
import { baseConfig, server } from "./playwright.shared.ts";

const allPlatforms = [
  { name: "node", port: 4411, command: "bun run demo:node" },
  { name: "cloudflare", port: 4412, command: "bun run demo:cf" },
] as const;

/**
 * `EMVB_E2E_PLATFORM=node` (or `cloudflare`) runs one platform and starts only its demo server,
 * so `bun run e2e:full` can run both side by side, each with its own server and data.
 */
const only = process.env["EMVB_E2E_PLATFORM"];
const platforms = allPlatforms.filter((p) => !only || p.name === only);

export default defineConfig({
  ...baseConfig,
  testDir: "./e2e",
  testMatch: /.*\.e2e\.ts$/,
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
  webServer: platforms.map(({ port, command }) => server(command, port, 180_000)),
});
