import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// S-12 (W-1001): a tag can be moved to other code after review; a commit SHA can't.
test("every GitHub Action in CI is pinned to a full commit SHA", () => {
  const dir = join(import.meta.dir, "../.github/workflows");
  const unpinned: string[] = [];
  for (const name of readdirSync(dir).filter((file) => /\.ya?ml$/.test(file))) {
    for (const line of readFileSync(join(dir, name), "utf8").split("\n")) {
      const uses = /^\s*-?\s*uses:\s*([^\s#]+)/.exec(line)?.[1];
      if (uses && !uses.startsWith("./") && !/@[0-9a-f]{40}$/.test(uses))
        unpinned.push(`${name}: ${uses}`);
    }
  }
  expect(unpinned).toEqual([]);
});

// W-1014: duplication and health run in CI against saved baselines, as advice only.
test("W-1014: fallow dupes and health run in CI as advisory steps with baselines", async () => {
  const ci = readFileSync(join(import.meta.dir, "../.github/workflows/ci.yml"), "utf8");
  for (const script of ["fallow:dupes", "fallow:health"])
    expect(ci).toContain(`- run: bun run ${script}\n        continue-on-error: true\n`);
  const pkg = JSON.parse(readFileSync(join(import.meta.dir, "../package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
  for (const [script, file] of [
    ["fallow:dupes", "scripts/fallow/dupes-baseline.json"],
    ["fallow:health", "scripts/fallow/health-baseline.json"],
  ] as const) {
    expect(pkg.scripts[script]).toContain(`--baseline ${file}`);
    expect(await Bun.file(join(import.meta.dir, "..", file)).exists()).toBe(true);
  }
  expect(pkg.scripts["check"]).not.toContain("fallow:");
});
