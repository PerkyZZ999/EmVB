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
