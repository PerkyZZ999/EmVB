import { describe, expect, test } from "bun:test";
import { canvasCollectionSlugs, MAX_CANVAS_COLLECTIONS } from "./canvas-collections.ts";

describe("canvasCollections option (W-897)", () => {
  test("keeps valid slugs once, in order", () => {
    expect(canvasCollectionSlugs(["pages", " posts ", "pages"])).toEqual(["pages", "posts"]);
  });
  test("drops EmVB's own collections, bad slugs and non-strings", () => {
    expect(
      canvasCollectionSlugs(["emvb_pages", "emvb_theme_parts", "Pages", "1x", "a-b", "", 3, null]),
    ).toEqual([]);
    expect(canvasCollectionSlugs("pages")).toEqual([]);
  });
  test("keeps at most the limit", () => {
    const many = Array.from({ length: 30 }, (_, i) => `c${i}`);
    expect(canvasCollectionSlugs(many)).toHaveLength(MAX_CANVAS_COLLECTIONS);
  });
});
