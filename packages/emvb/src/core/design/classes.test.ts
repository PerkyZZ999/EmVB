import { describe, expect, test } from "bun:test";
import { emptyDesign, type DesignSystem } from "../schema/design.ts";
import type { Layout } from "../schema/layout.ts";
import {
  addClassId,
  clearClassRefs,
  duplicateClass,
  findClassUsages,
  hasLocalStyles,
  localStylesToClass,
  localToClassRefusal,
  moveClassId,
  moveDesignClass,
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

describe("moveDesignClass", () => {
  const design = {
    ...emptyDesign(),
    classes: [
      { id: "a", name: "A", style: {} },
      { id: "b", name: "B", style: {} },
      { id: "c", name: "C", style: {} },
    ],
  };

  test("moves a class one step, and the ends stay put", () => {
    expect(moveDesignClass(design, "a", 1).classes?.map((cls) => cls.id)).toEqual(["b", "a", "c"]);
    expect(moveDesignClass(design, "a", -1)).toBe(design);
    expect(moveDesignClass(design, "missing", 1)).toBe(design);
    expect(design.classes?.map((cls) => cls.id)).toEqual(["a", "b", "c"]);
  });
});

describe("findClassUsages / clearClassRefs (W-032)", () => {
  test("finds and clears class ids across the tree", () => {
    const layout: Layout = {
      schemaVersion: 10,
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

  test("copies tablet and mobile styles and Hide on too, as separate objects (W-135)", () => {
    const devices = {
      tablet: { color: "#00ff00" },
      mobile: { fontSize: { value: 14, unit: "px" as const } },
    };
    const design = {
      ...emptyDesign(),
      classes: [{ id: "card", name: "Card", style: {}, devices, hiddenOn: ["mobile" as const] }],
    };
    const copy = duplicateClass(design, "card", "x").classes?.[1];
    expect(copy?.devices).toEqual(devices);
    expect(copy?.devices?.tablet).not.toBe(devices.tablet);
    expect(copy?.hiddenOn).toEqual(["mobile"]);
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

describe("localStylesToClass (W-134)", () => {
  const node = {
    id: "butn0001",
    type: "button" as const,
    props: { text: "Go" },
    classes: ["card"],
    htmlId: "go",
    hiddenOn: ["mobile" as const],
    style: { backgroundColor: "#1d4ed8" },
    states: { hover: { backgroundColor: "#1e3a8a" } },
    devices: { mobile: { backgroundColor: "#f59e0b" } },
  };
  const design: DesignSystem = {
    ...emptyDesign(),
    classes: [
      { id: "card", name: "Card", style: {} },
      { id: "primary", name: "Primary", style: {} },
    ],
  };

  test("moves every local style into a new class added and applied last", () => {
    const moved = localStylesToClass(design, node, "Primary");
    if (!moved) throw new Error("expected a class");
    expect(moved.classId).toBe("primary-2");
    expect(moved.design.classes?.map((c) => c.id)).toEqual(["card", "primary", "primary-2"]);
    expect(moved.design.classes?.at(-1)).toEqual({
      id: "primary-2",
      name: "Primary",
      style: node.style,
      states: node.states,
      devices: node.devices,
    });
    expect(moved.node).toEqual({
      id: "butn0001",
      type: "button",
      props: { text: "Go" },
      classes: ["card", "primary-2"],
      htmlId: "go",
      hiddenOn: ["mobile"],
    });
    // The class holds copies: changing it later doesn't reach back into the element.
    const made = moved.design.classes?.at(-1);
    if (made) made.style.color = "#000000";
    expect(node.style).toEqual({ backgroundColor: "#1d4ed8" });
  });

  test("state-only or device-only styles count; none, a blank name or a full list refuse", () => {
    const bare = { id: "butn0001", type: "button" as const, props: { text: "Go" } };
    expect(hasLocalStyles(bare)).toBe(false);
    expect(hasLocalStyles({ ...bare, style: { color: undefined } })).toBe(false);
    expect(hasLocalStyles({ ...bare, states: { focus: { color: "#000000" } } })).toBe(true);
    expect(hasLocalStyles({ ...bare, devices: { tablet: { color: "#000000" } } })).toBe(true);
    expect(localStylesToClass(design, bare, "X")).toBeNull();
    expect(localStylesToClass(design, node, "   ")).toBeNull();
    expect(localToClassRefusal(design, bare)).toBe("This element has no local styles to save.");
    const many = {
      ...design,
      classes: Array.from({ length: 100 }, (_, i) => ({ id: `c${i}`, name: `C${i}`, style: {} })),
    };
    expect(localToClassRefusal(many, node)).toBe(
      "This site already has 100 classes, the most allowed.",
    );
    const crowded = { ...node, classes: Array.from({ length: 20 }, (_, i) => `k${i}`) };
    expect(localToClassRefusal(design, crowded)).toBe(
      "20 classes is the most one element can have.",
    );
    expect(localStylesToClass(design, crowded, "X")).toBeNull();
  });
});
