import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import removeRunData, {
  authFile,
  DATA_ROOT,
  platformDataDir,
  pruneStaleRuns,
  runDataDir,
} from "../e2e/support/demo-data.ts";
import { server } from "../playwright.shared.ts";
import { prodAuthFiles } from "../e2e/support/prod-auth.ts";

// W-1035: every e2e run gets its own demo data folder, never the developer's demo databases.
const saved = { ...process.env };
afterEach(() => {
  for (const key of [
    "EMVB_E2E_DATA",
    "EMVB_E2E_DATA_OWNED",
    "EMVB_REUSE_SERVER",
    "EMVB_E2E_AUTH_DIR",
  ]) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

test("W-1035: a run makes its own folder under e2e/.data, and its servers get one per platform", () => {
  delete process.env["EMVB_E2E_DATA"];
  const run = runDataDir();
  expect(run.startsWith(join(DATA_ROOT, "run-"))).toBe(true);
  expect(runDataDir()).toBe(run);
  const node = platformDataDir("node");
  expect(node).toBe(join(run, "node"));
  expect(existsSync(node)).toBe(true);
  const demo = server("bun run demo:node", 4411, 1000, node);
  expect(demo.env["EMVB_DEMO_DATA"]).toBe(node);
  // A running demo on the port is the developer's, with their data: not reused unless asked.
  expect(demo.reuseExistingServer).toBe(false);
  removeRunData();
  expect(existsSync(run)).toBe(false);
});

test("W-1035: a folder the caller names (a seeded-bug lane) is used and kept", () => {
  const lane = mkdtempSync(join(tmpdir(), "emvb-lane-"));
  process.env["EMVB_E2E_DATA"] = lane;
  delete process.env["EMVB_E2E_DATA_OWNED"];
  expect(platformDataDir("cloudflare")).toBe(join(lane, "cloudflare"));
  removeRunData();
  expect(existsSync(lane)).toBe(true);
  rmSync(lane, { recursive: true, force: true });
});

test("W-1035: leftovers of interrupted runs are removed, the current run's folder is not", () => {
  delete process.env["EMVB_E2E_DATA"];
  const current = runDataDir();
  mkdirSync(current, { recursive: true });
  const stale = join(DATA_ROOT, "run-1-1");
  mkdirSync(stale, { recursive: true });
  const old = new Date(Date.now() - 7 * 60 * 60 * 1000);
  utimesSync(stale, old, old);
  utimesSync(current, old, old);
  pruneStaleRuns();
  expect(existsSync(stale)).toBe(false);
  expect(existsSync(current)).toBe(true);
  removeRunData();
});

test("W-1035: both demos read their data folder from EMVB_DEMO_DATA", async () => {
  const node = await Bun.file(join(import.meta.dir, "../demos/node/astro.config.mjs")).text();
  expect(node).toContain('process.env["EMVB_DEMO_DATA"]');
  expect(node).toContain('url: `file:${data ? join(data, "data.db") : "./data.db"}`');
  expect(node).toContain('directory: data ? join(data, "uploads") : "./uploads"');
  const cf = await Bun.file(join(import.meta.dir, "../demos/cloudflare/astro.config.mjs")).text();
  expect(cf).toContain("cloudflare(data ? { persistState: { path: data } } : {})");
});

test("W-1096: each parallel e2e:full run signs in to its own server and keeps its own sign-in file", () => {
  delete process.env["EMVB_E2E_AUTH_DIR"];
  expect(authFile("node")).toBe("e2e/.auth/node.json");
  process.env["EMVB_E2E_AUTH_DIR"] = "e2e/.auth/shard-2";
  expect(authFile("cloudflare")).toBe("e2e/.auth/shard-2/cloudflare.json");
});

test("W-1096: both demos keep a Vite cache per parallel run when EMVB_VITE_CACHE names one", async () => {
  const configs = await Promise.all(
    ["node", "cloudflare"].map((demo) =>
      Bun.file(join(import.meta.dir, `../demos/${demo}/astro.config.mjs`)).text(),
    ),
  );
  for (const config of configs) {
    expect(config).toContain('const viteCache = process.env["EMVB_VITE_CACHE"];');
    expect(config).toContain("...(viteCache ? { cacheDir: viteCache } : {}),");
  }
});

test("W-1096: parallel runs' dev servers skip Astro's one-dev-server-per-folder lock", async () => {
  const [e2e, prod] = await Promise.all(
    ["../playwright.config.ts", "../playwright.prod.config.ts"].map((f) =>
      Bun.file(join(import.meta.dir, f)).text(),
    ),
  );
  expect(e2e).toContain("astro dev --host 127.0.0.1 --port ${nodePort} --ignore-lock");
  expect(e2e).toContain("astro dev --host 127.0.0.1 --port ${cfPort} --ignore-lock");
  expect(prod).toContain("astro dev --host 127.0.0.1 --port ${p.dev} --ignore-lock");
});

test("W-1096: both demos pre-bundle the dependencies the editor loads lazily", async () => {
  const configs = await Promise.all(
    ["node", "cloudflare"].map((demo) =>
      Bun.file(join(import.meta.dir, `../demos/${demo}/astro.config.mjs`)).text(),
    ),
  );
  for (const config of configs) {
    // Nested ids: photocn is EmVB's dependency, not the demo's, so a bare id doesn't resolve.
    for (const id of ["photocn", "photocn/dom", "photocn/react"])
      expect(config).toContain(`"@perkyzz/emvb > ${id}",`);
    expect(config).toContain('"@emdash-cms/plugin-forms/client",');
  }
});

test("W-1098: production specs use the same server to author and read pages", async () => {
  const specs = await Promise.all(
    ["extensions", "public", "image-editor"].map((spec) =>
      Bun.file(join(import.meta.dir, `../e2e/${spec}.prod.ts`)).text(),
    ),
  );
  for (const spec of specs) {
    expect(spec).toContain("browser.newContext({ baseURL, storageState: auth })");
    expect(spec).toContain("requestFactory.newContext({ baseURL, storageState: auth })");
  }
});

test("W-1098: the production auth server hands off after sign-in", async () => {
  mkdirSync(DATA_ROOT, { recursive: true });
  const data = mkdtempSync(join(DATA_ROOT, "prod-auth-"));
  const authServer = Bun.spawn(
    [
      "bun",
      join(import.meta.dir, "../e2e/support/prod-auth.ts"),
      "sh",
      "-c",
      "printf ready; exec sleep 30",
    ],
    { env: { ...process.env, EMVB_DEMO_DATA: data }, stdout: "pipe", stderr: "inherit" },
  );
  try {
    const { release, stopped } = prodAuthFiles(data);
    const reader = authServer.stdout.getReader();
    const ready = await reader.read();
    reader.releaseLock();
    expect(new TextDecoder().decode(ready.value)).toBe("ready");
    expect(existsSync(stopped)).toBe(false);
    writeFileSync(release, "");
    expect(await authServer.exited).toBe(0);
    expect(existsSync(stopped)).toBe(true);
  } finally {
    authServer.kill("SIGTERM");
    rmSync(data, { recursive: true, force: true });
  }
});
