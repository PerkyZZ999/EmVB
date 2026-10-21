import { describe, expect, test } from "bun:test";
import { deleteVariable, emptyDesign, type DesignSystem, type Layout } from "../../core/index.ts";
import { historyReducer, emptyHistory } from "./store.ts";
import { deletionOf, restoreOnUndo } from "./restore-deleted.ts";

// W-252: undoing a Site styles delete brings the variable or class back with its uses.

const design: DesignSystem = {
  ...emptyDesign(),
  variables: {
    ...emptyDesign().variables,
    colors: [
      { id: "ink", name: "Ink", value: "#111111" },
      { id: "brand", name: "Brand", value: "#0055ff" },
      { id: "paper", name: "Paper", value: "#ffffff" },
    ],
  },
  classes: [
    { id: "card", name: "Card", style: { opacity: 0.5 } },
    { id: "tint", name: "Tint", style: { color: "#ff0000" } },
  ],
};
const page: Layout = {
  schemaVersion: 17,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [
      {
        id: "head0001",
        type: "heading",
        props: { text: "A", level: 1 },
        classes: ["card"],
        style: { color: { var: "brand" } },
      },
    ],
  },
};

describe("restoreOnUndo (W-252)", () => {
  test("back on the page from before the delete, the variable returns where it was", () => {
    const deletion = deletionOf(design, page, {
      kind: "variable",
      id: "brand",
      variableKind: "color",
    });
    const after = deleteVariable(design, page, "brand", "color");
    expect(restoreOnUndo(after.design, after.layout, deletion ? [deletion] : [])).toBeNull();
    const restored = restoreOnUndo(after.design, page, deletion ? [deletion] : []);
    expect(restored?.variables.colors.map((c) => c.id)).toEqual(["ink", "brand", "paper"]);
    expect(restored?.classes).toEqual(design.classes);
  });

  test("a deleted class returns at its place in the cascade", () => {
    const deletion = deletionOf(design, page, { kind: "class", id: "card" });
    const without = { ...design, classes: design.classes?.filter((c) => c.id !== "card") };
    const restored = restoreOnUndo(without, page, deletion ? [deletion] : []);
    expect(restored?.classes?.map((c) => c.id)).toEqual(["card", "tint"]);
  });

  test("nothing is restored twice, nor when the item is back already", () => {
    const deletion = deletionOf(design, page, { kind: "class", id: "card" });
    expect(restoreOnUndo(design, page, deletion ? [deletion, deletion] : [])).toBeNull();
  });

  test("undo in the editor history restores the exact page object the delete started from", () => {
    const state = {
      page: { layout: page },
      version: 0,
      selectedId: null,
      lastDeleted: null,
    } as never;
    let history = emptyHistory(state);
    const after = deleteVariable(design, page, "brand", "color");
    history = historyReducer(history, {
      type: "apply-arranged",
      layout: after.layout,
      selected: "root0001",
    } as never);
    expect(history.present.page.layout).toBe(after.layout);
    history = historyReducer(history, { type: "undo" });
    expect(history.present.page.layout).toBe(page);
  });
});

test("W-575: a restored class or variable whose name was taken meanwhile comes back renamed", () => {
  const cls = deletionOf(design, page, { kind: "class", id: "card" });
  const brand = deletionOf(design, page, { kind: "variable", id: "brand", variableKind: "color" });
  if (!cls || !brand) throw new Error("no deletion");
  // After both deletes, a new "card" class and a "BRAND" colour were made.
  const now: DesignSystem = {
    ...design,
    variables: {
      ...design.variables,
      colors: [
        { id: "ink", name: "Ink", value: "#111111" },
        { id: "brand2", name: "BRAND", value: "#00ff00" },
        { id: "paper", name: "Paper", value: "#ffffff" },
      ],
    },
    classes: [
      { id: "tint", name: "Tint", style: {} },
      { id: "card2", name: "card", style: {} },
    ],
  };
  const restored = restoreOnUndo(now, page, [cls, brand]);
  expect(restored?.classes?.find((c) => c.id === "card")?.name).toBe("Card 2");
  expect(restored?.variables.colors.find((v) => v.id === "brand")?.name).toBe("Brand 2");
  // A free name is kept as it was.
  const plain = restoreOnUndo({ ...design, classes: [] }, page, [cls]);
  expect(plain?.classes?.[0]?.name).toBe("Card");
  // A 60-character name still fits with its number.
  const long = "L".repeat(60);
  if (cls.kind !== "class") throw new Error("not a class");
  const longCls = { ...cls, cls: { ...cls.cls, name: long } };
  const taken = { ...design, classes: [{ id: "x", name: long, style: {} }] };
  expect(restoreOnUndo(taken, page, [longCls])?.classes?.find((c) => c.id === "card")?.name).toBe(
    `${"L".repeat(56)} 2`,
  );
});

describe("restoreOnUndo past the class limit (W-576)", () => {
  test("a deleted class isn't restored when the design already has MAX_CLASSES", async () => {
    const { MAX_CLASSES } = await import("../../core/design/classes.ts");
    const full: DesignSystem = {
      ...design,
      classes: Array.from({ length: MAX_CLASSES }, (_, i) => ({
        id: `c${i}`,
        name: `C${i}`,
        style: {},
      })),
    };
    const deletion = deletionOf(design, page, { kind: "class", id: "card" });
    const restored = restoreOnUndo(full, page, deletion ? [deletion] : []);
    expect(restored?.classes?.length ?? MAX_CLASSES).toBe(MAX_CLASSES);
  });
});
