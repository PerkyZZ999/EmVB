import { describe, expect, test } from "bun:test";
import type { Fetcher } from "./api.ts";
import { listPages } from "./content-api.ts";
import { listThemeParts } from "./theme-api.ts";

const paged = (total: number) => {
  const paths: string[] = [];
  const fetcher: Fetcher = async (path) => {
    paths.push(path);
    const start = Number(new URL(path, "http://x").searchParams.get("cursor") ?? 0);
    const items = Array.from({ length: Math.min(50, total - start) }, (_, i) => ({
      id: `E${start + i}`,
      slug: `s${start + i}`,
      status: "draft",
      data: { title: `T${start + i}`, part_type: "header" },
    }));
    const next = start + 50 < total ? String(start + 50) : undefined;
    return Response.json({ data: { items, ...(next ? { nextCursor: next } : {}) } });
  };
  return { fetcher, paths };
};

describe("lists show every entry, not only the newest 50 (W-204)", () => {
  test("Visual pages follows the cursor to the end", async () => {
    const { fetcher, paths } = paged(120);
    const pages = await listPages(fetcher);
    expect(pages.length).toBe(120);
    expect(pages.at(-1)?.id).toBe("E119");
    expect(paths).toHaveLength(3);
  });
  test("Theme Builder does too, and a cursor that never ends stops", async () => {
    expect((await listThemeParts(paged(75).fetcher)).length).toBe(75);
    let calls = 0;
    const endless: Fetcher = async () => {
      calls += 1;
      return Response.json({ data: { items: [], nextCursor: "again" } });
    };
    await listThemeParts(endless);
    expect(calls).toBe(20);
  });
});
