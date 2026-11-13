import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EMDASH_SETS, EMDASH_ZOD, rootWithEmDash, withEmDash } from "./use-emdash.ts";

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
  // 1.5 in this repository since W-1008; 1.4 in CI's EmDash 1.4 job, after use-emdash.ts.
  const matching = Object.values(EMDASH_SETS).filter((set) =>
    Object.entries(set).every(([name, version]) => plugin.devDependencies[name] === version),
  );
  expect(matching).toHaveLength(1);
  const peers = plugin.peerDependencies["@cloudflare/kumo"]?.split(" || ") ?? [];
  for (const set of Object.values(EMDASH_SETS))
    expect(peers).toContain(set["@cloudflare/kumo"] ?? "none");
});

test("W-1008: CI keeps the EmDash 1.4 floor tested: unit and Astro tests on 1.4.0", () => {
  const ci = readFileSync(join(import.meta.dir, "../.github/workflows/ci.yml"), "utf8");
  expect(ci).toMatch(
    /use-emdash\.ts 1\.4\.0\n\s+- run: bun install\n\s+- run: bun test \.\/packages \.\/test\n\s+- run: bun run test:astro\n/,
  );
  // The 1.5 base audits with nothing ignored.
  expect(ci).toContain("      - run: bun audit --audit-level=high\n");
});

test("W-1008: the 1.4 set is EmDash 1.4.0's own pins", () => {
  expect(EMDASH_SETS["1.4.0"]).toEqual({
    emdash: "1.4.0",
    "@cloudflare/kumo": "2.6.0",
    "@emdash-cms/plugin-forms": "0.2.12",
  });
  const root = JSON.parse(readFileSync(join(import.meta.dir, "../package.json"), "utf8")) as {
    overrides: Record<string, string>;
  };
  expect(rootWithEmDash(root, "1.4.0").overrides["zod"]).toBe("4.5.4");
});

test("W-1007: the EmDash 1.5 run uses 1.5's zod, and EmVB's zod range admits both", () => {
  const root = JSON.parse(readFileSync(join(import.meta.dir, "../package.json"), "utf8")) as {
    overrides: Record<string, string>;
  };
  expect(rootWithEmDash(root, "1.5.0").overrides["zod"]).toBe("4.6.7");
  const range =
    (
      JSON.parse(readFileSync(join(import.meta.dir, "../packages/emvb/package.json"), "utf8")) as {
        dependencies: Record<string, string>;
      }
    ).dependencies["zod"] ?? "";
  for (const zod of Object.values(EMDASH_ZOD)) expect(Bun.semver.satisfies(zod, range)).toBe(true);
  expect(Bun.semver.satisfies("5.0.0", range)).toBe(false);
});
