import { describe, expect, test } from "bun:test";
import { collectCollectionLoops, type Layout } from "../../core/index.ts";
import { matchesPreviewFilter, withPartLayouts } from "./collection-previews.ts";

describe("canvas Loop previews apply field filters (W-330)", () => {
  test("a field the entries have is checked; either value of a repeated field matches", () => {
    expect(matchesPreviewFilter({ team: "design" }, { team: "design" })).toBe(true);
    expect(matchesPreviewFilter({ team: "sales" }, { team: "design" })).toBe(false);
    expect(matchesPreviewFilter({ team: "sales" }, { team: ["design", "sales"] })).toBe(true);
    expect(matchesPreviewFilter({ featured: true }, { featured: "true" })).toBe(true);
  });

  test("a field the entries don't carry (a taxonomy) doesn't filter the preview", () => {
    expect(matchesPreviewFilter({ team: "design" }, { category: "news" })).toBe(true);
    expect(matchesPreviewFilter({}, undefined)).toBe(true);
  });
});

describe("list fields filter like the published page (W-505)", () => {
  test("a list or object field never matches, even a one-item list", () => {
    expect(matchesPreviewFilter({ tags: ["news"] }, { tags: "news" })).toBe(false);
    expect(matchesPreviewFilter({ tags: ["news", "sport"] }, { tags: "news" })).toBe(false);
    expect(matchesPreviewFilter({ meta: { a: "news" } }, { meta: "news" })).toBe(false);
  });
});

describe("W-667: collection Loops inside parts on the canvas", () => {
  test("a Loop inside a Loop Item or section part is found next to the page's own", () => {
    const wrap = (children: unknown[]) =>
      ({
        schemaVersion: 17,
        root: { id: "root0001", type: "container", props: {}, children },
      }) as unknown as Layout;
    const loop = (id: string, collection: string) => ({
      id,
      type: "loop",
      props: { collection },
      children: [],
    });
    const page = wrap([loop("loop0001", "team")]);
    const part = wrap([loop("loop0002", "projects")]);
    const merged = withPartLayouts(page, [part]);
    expect(collectCollectionLoops(merged as Layout).map((l) => l.nodeId)).toEqual([
      "loop0001",
      "loop0002",
    ]);
    expect(withPartLayouts(page, [])).toBe(page);
    expect(withPartLayouts(null, [part])).toBeNull();
  });
});
