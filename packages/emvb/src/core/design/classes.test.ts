import { describe, expect, test } from "bun:test";
import { emptyDesign, type DesignSystem } from "../schema/design.ts";
import type { Layout } from "../schema/layout.ts";
import {
  addClassId,
  clearClassRefs,
  duplicateClass,
  findClassUsages,
  moveClassId,
  patchClassStyle,
  removeClassId,
  renameClass,
  replaceClassId,
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
      schemaVersion: 7,
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

  test("copies state styles too, as a separate object (W-089)", () => {
    const states = { hover: { color: "#ff0000" }, active: { opacity: 0.5 } };
    const design = {
      ...emptyDesign(),
      classes: [{ id: "card", name: "Card", style: {}, states }],
    };
    const copy = duplicateClass(design, "card", "x").classes?.[1];
    expect(copy?.states).toEqual(states);
    expect(copy?.states).not.toBe(states);
    expect(copy?.states?.hover).not.toBe(states.hover);
  });

  test("missing id is a no-op", () => {
    const design = emptyDesign();
    expect(duplicateClass(design, "nope")).toBe(design);
  });
});

describe("class chip helpers (W-087)", () => {
  const design: DesignSystem = {
    ...emptyDesign(),
    classes: [
      { id: "card", name: "Card", style: { color: "#112233", fontWeight: 700 } },
      { id: "accent", name: "Accent", style: {} },
    ],
  };

  test("renameClass trims the name and keeps the id", () => {
    const next = renameClass(design, "card", "  Card large ");
    expect(next.classes?.map((c) => [c.id, c.name])).toEqual([
      ["card", "Card large"],
      ["accent", "Accent"],
    ]);
    expect(design.classes?.[0]?.name).toBe("Card");
  });

  test("renameClass ignores blank names and unknown ids", () => {
    expect(renameClass(design, "card", "   ")).toBe(design);
    expect(renameClass(design, "nope", "X")).toBe(design);
  });

  test("patchClassStyle merges, clears undefined, and leaves other classes alone", () => {
    const next = patchClassStyle(design, "card", {
      backgroundColor: "#ffffff",
      fontWeight: undefined,
    });
    expect(next.classes?.[0]?.style).toStrictEqual({
      color: "#112233",
      backgroundColor: "#ffffff",
    });
    expect(next.classes?.[1]).toBe(design.classes?.[1]);
    expect(design.classes?.[0]?.style).toEqual({ color: "#112233", fontWeight: 700 });
    expect(patchClassStyle(design, "nope", { color: "#000000" })).toBe(design);
  });

  test("replaceClassId swaps in place, or drops the old id when the new one is applied", () => {
    expect(replaceClassId(["a", "card", "b"], "card", "card-copy")).toEqual([
      "a",
      "card-copy",
      "b",
    ]);
    expect(replaceClassId(["card-copy", "card"], "card", "card-copy")).toEqual(["card-copy"]);
  });
});
