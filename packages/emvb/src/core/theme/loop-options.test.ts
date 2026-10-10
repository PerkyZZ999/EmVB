import { describe, expect, test } from "bun:test";
import { validateLayout } from "../validate.ts";
import type { LayoutNode } from "../schema/layout.ts";
import { collectCollectionLoops, loopPermalink, parseLoopFilter } from "./dynamic.ts";

const page = (props: Record<string, unknown>) => ({
  schemaVersion: 14,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [
      { id: "loop0001", type: "loop", props: { collection: "team", ...props }, children: [] },
    ] as LayoutNode[],
  },
});
const valid = (props: Record<string, unknown>) => validateLayout(page(props)).ok;

describe("Loop link pattern, fields and filters (W-330)", () => {
  test("the schema takes site paths with {slug} or {id}, field slugs and field=value filters", () => {
    expect(valid({ permalink: "/team/{slug}" })).toBe(true);
    expect(valid({ permalink: "/p/{id}-{slug}/" })).toBe(true);
    expect(valid({ permalink: "/team/" })).toBe(false);
    expect(valid({ permalink: "//evil.test/{slug}" })).toBe(false);
    expect(valid({ permalink: "javascript:{slug}" })).toBe(false);
    expect(valid({ permalink: "/t/{title}/{slug}" })).toBe(false);
    expect(valid({ imageField: "photo", excerptField: "short_bio" })).toBe(true);
    expect(valid({ imageField: "Photo" })).toBe(false);
    expect(valid({ filter: "category=news; team = design" })).toBe(true);
    expect(valid({ filter: "category" })).toBe(false);
    expect(valid({ filter: "a=<script>" })).toBe(false);
  });

  test("filters parse to a where: same field twice is either value, at most 5 pairs", () => {
    expect(parseLoopFilter("category=news; category=featured;team=design")).toEqual({
      category: ["news", "featured"],
      team: "design",
    });
    expect(parseLoopFilter("a=1;b=2;c=3;d=4;e=5;f=6")).toEqual({
      a: "1",
      b: "2",
      c: "3",
      d: "4",
      e: "5",
    });
    expect(parseLoopFilter("nope")).toBeUndefined();
    expect(parseLoopFilter(42)).toBeUndefined();
  });

  test("links fill {slug} and {id}, URL-encoded", () => {
    expect(loopPermalink("/team/{slug}", { slug: "ana lee/x", id: "01" })).toBe(
      "/team/ana%20lee%2Fx",
    );
    expect(loopPermalink("/p/{id}", { slug: "s", id: "01A" })).toBe("/p/01A");
  });

  test("collected loops carry the options hosts need", () => {
    const layout = page({
      permalink: "/people/{slug}",
      imageField: "photo",
      excerptField: "role",
      filter: "team=design",
    });
    expect(collectCollectionLoops(layout as never)).toEqual([
      {
        nodeId: "loop0001",
        collection: "team",
        limit: 6,
        order: "newest",
        permalink: "/people/{slug}",
        imageField: "photo",
        excerptField: "role",
        where: { team: "design" },
      },
    ]);
    expect(collectCollectionLoops(page({}) as never)[0]).toEqual({
      nodeId: "loop0001",
      collection: "team",
      limit: 6,
      order: "newest",
    });
  });
});
