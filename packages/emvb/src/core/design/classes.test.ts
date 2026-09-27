import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import type { Layout } from "../schema/layout.ts";
import {
  addClassId,
  clearClassRefs,
  duplicateClass,
  findClassUsages,
  moveClassId,
  removeClassId,
} from "./classes.ts";

describe("class id list helpers (W-031)", () => {
  test("add, remove, and reorder persist order", () => {
    let ids = addClassId([], "card");
    ids = addClassId(ids, "accent");
    expect(ids).toEqual(["card", "accent"]);
    expect(addClassId(ids, "card")).toEqual(["card", "accent"]);
    expect(moveClassId(ids, 1, -1)).toEqual(["accent", "card"]);
    expect(moveClassId(ids, 0, -1)).toEqual(["card", "accent"]);
    expect(removeClassId(ids, "card")).toEqual(["accent"]);
  });
});

describe("findClassUsages / clearClassRefs (W-032)", () => {
  test("finds and clears class ids across the tree", () => {
    const layout: Layout = {
      schemaVersion: 1,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          {
            id: "head0001",
            type: "heading",
            props: { text: "A", level: 1 },
            classes: ["card", "accent"],
          },
          {
            id: "head0002",
            type: "heading",
            props: { text: "B", level: 2 },
            classes: ["card"],
          },
        ],
      },
    };
    expect(findClassUsages(layout, "card")).toEqual([
      { nodeId: "head0001" },
      { nodeId: "head0002" },
    ]);
    const cleared = clearClassRefs(layout, "card");
    expect(findClassUsages(cleared, "card")).toEqual([]);
    expect(cleared.root.children[0]?.classes).toEqual(["accent"]);
    expect(cleared.root.children[1]?.classes).toBeUndefined();
  });
});

describe("duplicateClass (W-071)", () => {
  test("copies style under a new id and name", () => {
    const design = {
      ...emptyDesign(),
      classes: [{ id: "card", name: "Card", style: { color: "#112233" } }],
    };
    const next = duplicateClass(design, "card", "x");
    expect(next.classes).toHaveLength(2);
    expect(next.classes?.[1]?.name).toBe("Card copy");
    expect(next.classes?.[1]?.style).toEqual({ color: "#112233" });
    expect(next.classes?.[1]?.id).not.toBe("card");
  });

  test("missing id is a no-op", () => {
    const design = emptyDesign();
    expect(duplicateClass(design, "nope")).toBe(design);
  });
});
