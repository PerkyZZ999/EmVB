import { describe, expect, test } from "bun:test";
import { addClassId, moveClassId, removeClassId } from "./classes.ts";

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

import type { Layout } from "../schema/layout.ts";
import { clearClassRefs, findClassUsages } from "./classes.ts";

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
