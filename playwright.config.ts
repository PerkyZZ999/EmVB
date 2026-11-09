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

/**
 * W-960: `--project=node` (as the seeded-bug runner and single-spec runs pass it) starts only the
 * node demo server, not both; a run without --project starts both.
 */
function requestedPlatforms(argv: readonly string[]): Set<string> | undefined {
  const names: string[] = [];
  argv.forEach((arg, i) => {
    if (arg.startsWith("--project=")) names.push(arg.slice("--project=".length));
    else if (arg === "--project" && argv[i + 1]) names.push(argv[i + 1] as string);
  });
  if (names.length === 0) return undefined;
  return new Set(names.map((name) => name.replace(/-setup$/, "")));
}
const requested = requestedPlatforms(process.argv);
const platforms = allPlatforms.filter((p) => !only || p.name === only);
// Only the servers: workers re-read this file without the CLI flags, so the projects stay the same.
const servers = platforms.filter((p) => !requested || requested.has(p.name));

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
  webServer: servers.map(({ port, command }) => server(command, port, 180_000)),
});
