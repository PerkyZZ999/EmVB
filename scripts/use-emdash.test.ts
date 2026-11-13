import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EMDASH_SETS, withEmDash } from "./use-emdash.ts";

const plugin = JSON.parse(
  readFileSync(join(import.meta.dir, "../packages/emvb/package.json"), "utf8"),
) as { devDependencies: Record<string, string>; peerDependencies: Record<string, string> };

test("W-1002: the EmDash 1.5 set swaps emdash, Kumo and the forms plugin together", () => {
  const next = withEmDash(plugin, "1.5.0") as typeof plugin;
  expect(next.devDependencies["emdash"]).toBe("1.5.0");
  expect(next.devDependencies["@cloudflare/kumo"]).toBe("2.15.0");
  expect(next.devDependencies["@emdash-cms/plugin-forms"]).toBe("0.2.13");
  expect(() => withEmDash(plugin, "9.9.9")).toThrow("No EmDash set");
});

test("W-1002: the dev versions are one whole EmDash set, and every set's Kumo is a peer", () => {
  // 1.4 in this repository; 1.5 in CI's EmDash 1.5 job, after use-emdash.ts.
  const matching = Object.values(EMDASH_SETS).filter((set) =>
    Object.entries(set).every(([name, version]) => plugin.devDependencies[name] === version),
  );
  expect(matching).toHaveLength(1);
  const peers = plugin.peerDependencies["@cloudflare/kumo"]?.split(" || ") ?? [];
  for (const set of Object.values(EMDASH_SETS))
    expect(peers).toContain(set["@cloudflare/kumo"] ?? "none");
});

test("W-1002: CI runs the unit tests on EmDash 1.5 too", () => {
  const ci = readFileSync(join(import.meta.dir, "../.github/workflows/ci.yml"), "utf8");
  expect(ci).toContain("bun scripts/use-emdash.ts 1.5.0");
  expect(ci).toMatch(/use-emdash\.ts 1\.5\.0\n\s+- run: bun install\n\s+- run: bun test /);
});
