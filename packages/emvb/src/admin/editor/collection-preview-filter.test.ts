import { describe, expect, test } from "bun:test";
import { matchesPreviewFilter } from "./collection-previews.ts";

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
