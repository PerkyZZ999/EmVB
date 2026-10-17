import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Every destructive button's visible text, from the JSX after `variant="destructive"`. */
function destructiveLabels(): string[] {
  const root = join(import.meta.dir, "..");
  const labels: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".tsx") && !entry.name.endsWith(".test.tsx")) {
        const source = readFileSync(path, "utf8");
        for (const match of source.matchAll(/variant="destructive"[^>]*>\s*([^<]+?)\s*<\/Button>/g))
          labels.push(match[1] ?? "");
      }
    }
  };
  walk(root);
  return labels;
}

test("UX-015: destructive buttons restate the action and its object, never a bare verb", () => {
  const labels = destructiveLabels();
  expect(labels.length >= 6).toBe(true);
  expect(labels.filter((label) => !/\s/.test(label.replace(/\{[^}]*\}/g, "x y")))).toEqual([]);
});
