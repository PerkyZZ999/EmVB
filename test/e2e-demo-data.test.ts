import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import removeRunData, {
  DATA_ROOT,
  platformDataDir,
  pruneStaleRuns,
  runDataDir,
} from "../e2e/support/demo-data.ts";
import { server } from "../playwright.shared.ts";

// W-1035: every e2e run gets its own demo data folder, never the developer's demo databases.
const saved = { ...process.env };
afterEach(() => {
  for (const key of ["EMVB_E2E_DATA", "EMVB_E2E_DATA_OWNED", "EMVB_REUSE_SERVER"]) {
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
