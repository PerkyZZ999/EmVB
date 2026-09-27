import { expect, test } from "bun:test";
import { validateLayout } from "../packages/emvb/src/core/index.ts";
import { benchLayout } from "./bench-render.ts";

const count = (n: { children?: unknown[] }): number =>
  1 + (n.children ?? []).reduce<number>((sum, c) => sum + count(c as { children?: unknown[] }), 0);

test("the benchmark layout is a valid layout of exactly 300 nodes", () => {
  const layout = benchLayout();
  expect(validateLayout(layout).ok).toBe(true);
  expect(count(layout.root)).toBe(300);
});
