import { describe, expect, test } from "bun:test";
import type { ContentPort } from "./content-port.ts";
import { probeCounter, totalPagesFor } from "./page-count.ts";

const port = (count: number, calls: unknown[] = [], fail = false) =>
  ({
    getCollection: async (_collection: string, filter: { offset?: number; limit?: number }) => {
      calls.push(filter);
      if (fail) return { entries: [], error: new Error("db down") };
      const offset = filter.offset ?? 0;
      return { entries: offset < count ? [{ id: `P${offset}` }] : [] };
    },
  }) as unknown as ContentPort;

describe("probeCounter (W-916)", () => {
  test("counts exactly with one-row queries", async () => {
    for (const n of [1, 2, 7, 20, 21, 1000, 12_345]) {
      const calls: { limit?: number }[] = [];
      // oxlint-disable-next-line no-await-in-loop -- one count at a time, to read its calls.
      expect(await probeCounter(port(n, calls))({ collection: "posts", atLeast: 1 })).toBe(n);
      expect(calls.every((c) => c.limit === 1)).toBe(true);
      expect(calls.length).toBeLessThanOrEqual(2 * Math.ceil(Math.log2(n + 1)) + 2);
    }
  });

  test("starts past what the archive already saw and keeps its filter", async () => {
    const calls: { offset?: number; where?: unknown }[] = [];
    const where = { category: "news" };
    const count = await probeCounter(port(45, calls))({ collection: "posts", where, atLeast: 41 });
    expect(count).toBe(45);
    expect(calls.every((c) => (c.offset ?? 0) >= 40 && c.where === where)).toBe(true);
  });

  test("a failing query is an unknown count", async () => {
    expect(await probeCounter(port(9, [], true))({ collection: "posts", atLeast: 1 })).toBe(
      undefined,
    );
  });

  test("pages round up and never fall below the current page", () => {
    expect(totalPagesFor(45, 20, 1)).toBe(3);
    expect(totalPagesFor(40, 20, 2)).toBe(2);
    expect(totalPagesFor(10, 20, 3)).toBeUndefined();
    expect(totalPagesFor(undefined, 20, 1)).toBeUndefined();
  });
});
