import { expect, test } from "bun:test";
import { validateLayout } from "../packages/emvb/src/core/index.ts";
import { benchLayout, benchRenderMedian, sortedTimes } from "./bench-render.ts";

const count = (n: { children?: unknown[] }): number =>
  1 + (n.children ?? []).reduce<number>((sum, c) => sum + count(c as { children?: unknown[] }), 0);

test("the benchmark layout is a valid layout of exactly 300 nodes", () => {
  const layout = benchLayout();
  expect(validateLayout(layout).ok).toBe(true);
  expect(count(layout.root)).toBe(300);
});

test("the median helper times real renders and returns a finite positive median", () => {
  const median = benchRenderMedian(5);
  expect(Number.isFinite(median)).toBe(true);
  expect(median).toBeGreaterThan(0);
});

test("sortedTimes runs the warm-up untimed and returns one ascending time per timed run", () => {
  let calls = 0;
  const times = sortedTimes(
    () => {
      calls++;
      const until = performance.now() + (calls % 3) * 0.2;
      while (performance.now() < until) {
        // busy-wait so the timed runs differ
      }
    },
    4,
    9,
  );
  expect(calls).toBe(13);
  expect(times).toHaveLength(9);
  expect(times).toEqual(times.toSorted((a, b) => a - b));
  expect(Math.max(...times)).toBeGreaterThan(Math.min(...times));
});
