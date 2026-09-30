import { describe, expect, test } from "bun:test";
import { container, heading, nested, randomLayouts } from "../../test/fixtures/layouts.ts";
import {
  REASONS,
  addNode,
  canDrop,
  duplicateNode,
  firstChild,
  insertionPoint,
  moveDown,
  moveIn,
  moveNode,
  moveOut,
  moveUp,
  nextInOrder,
  parentOf,
  previousInOrder,
  selectionAfterDelete,
  subtreeSize,
  type Arranged,
} from "./arrange.ts";
import { MAX_DEPTH, MAX_NODES } from "./limits.ts";
import { isContainerNode, type Layout, type LayoutNode } from "./schema/layout.ts";
import { findNode } from "./tree-ops.ts";
import { validateLayout } from "./validate.ts";

/**
 * root
 * ├─ a (heading)
 * ├─ box (container)
 * │  ├─ b (heading)
 * │  └─ inner (container)
 * │     └─ c (heading)
 * └─ d (heading)
 */
const page = (): Layout => ({
  schemaVersion: 3,
  root: container("root0001", [
    heading("aaaa0001"),
    container("box00001", [heading("bbbb0001"), container("inner001", [heading("cccc0001")])]),
    heading("dddd0001"),
  ]) as Layout["root"],
});

const ids = (node: LayoutNode | undefined): string[] =>
  node && isContainerNode(node) ? node.children.map((child) => child.id) : [];

function layoutOf(result: Arranged): Layout {
  if (!result.ok) throw new Error(`refused: ${result.reason}`);
  return result.layout;
}

const allIds = (node: LayoutNode): string[] => [
  node.id,
  ...(isContainerNode(node) ? node.children.flatMap(allIds) : []),
];

describe("canDrop (R-003 drop rules)", () => {
  test("a container can't go into itself or anything inside it", () => {
    const layout = page();
    for (const target of ["box00001", "inner001"])
      expect(canDrop(layout, { kind: "existing", id: "box00001" }, target)).toEqual({
        ok: false,
        reason: REASONS.intoItself,
      });
  });

  test("only containers accept children", () => {
    expect(canDrop(page(), { kind: "existing", id: "aaaa0001" }, "dddd0001")).toEqual({
      ok: false,
      reason: REASONS.notContainer,
    });
  });

  test("the root can't be moved, and unknown ids are refused", () => {
    const layout = page();
    expect(canDrop(layout, { kind: "existing", id: "root0001" }, "box00001")).toEqual({
      ok: false,
      reason: REASONS.rootFixed,
    });
    expect(canDrop(layout, { kind: "existing", id: "nope0000" }, "box00001").ok).toBe(false);
    expect(canDrop(layout, { kind: "existing", id: "aaaa0001" }, "nope0000").ok).toBe(false);
  });

  test("valid moves and new elements are allowed", () => {
    const layout = page();
    expect(canDrop(layout, { kind: "existing", id: "aaaa0001" }, "inner001")).toEqual({ ok: true });
    expect(canDrop(layout, { kind: "existing", id: "inner001" }, "root0001")).toEqual({ ok: true });
    expect(canDrop(layout, { kind: "new", node: heading("newh0001") }, "box00001")).toEqual({
      ok: true,
    });
  });

  test("the depth limit counts the whole subtree being dropped", () => {
    const deep = nested(MAX_DEPTH);
    const deepest = `c${String(MAX_DEPTH - 1).padStart(7, "0")}`;
    const aboveDeepest = `c${String(MAX_DEPTH - 2).padStart(7, "0")}`;
    const box = container("newc0001", [heading("newh0001")]);
    expect(canDrop(deep, { kind: "new", node: heading("newh0001") }, deepest)).toEqual({
      ok: true,
    });
    expect(canDrop(deep, { kind: "new", node: box }, deepest)).toEqual({
      ok: false,
      reason: REASONS.tooDeep,
    });
    expect(canDrop(deep, { kind: "new", node: box }, aboveDeepest)).toEqual({ ok: true });
    const wide = layoutOf(
      addNode(deep, container("side0001", [heading("side0002")]), {
        parentId: deep.root.id,
        index: 1,
      }),
    );
    expect(canDrop(wide, { kind: "existing", id: "side0001" }, deepest)).toEqual({
      ok: false,
      reason: REASONS.tooDeep,
    });
    expect(canDrop(wide, { kind: "existing", id: "side0001" }, aboveDeepest)).toEqual({ ok: true });
  });

  test("new elements can't push the page past the element limit", () => {
    const full: Layout = {
      schemaVersion: 3,
      root: container(
        "root0001",
        Array.from({ length: MAX_NODES - 1 }, (_, i) => heading(`h${String(i).padStart(7, "0")}`)),
      ) as Layout["root"],
    };
    expect(canDrop(full, { kind: "new", node: heading("newh0001") }, "root0001")).toEqual({
      ok: false,
      reason: REASONS.tooMany,
    });
    expect(duplicateNode(full, "h0000000")).toEqual({ ok: false, reason: REASONS.tooMany });
    expect(canDrop(full, { kind: "existing", id: "h0000001" }, "root0001").ok).toBe(true);
  });
});

describe("moveNode", () => {
  test("the index counts the target's children before the move", () => {
    const later = layoutOf(moveNode(page(), "aaaa0001", "root0001", 3));
    expect(ids(later.root)).toEqual(["box00001", "dddd0001", "aaaa0001"]);
    const earlier = layoutOf(moveNode(page(), "dddd0001", "root0001", 0));
    expect(ids(earlier.root)).toEqual(["dddd0001", "aaaa0001", "box00001"]);
    const middle = layoutOf(moveNode(page(), "aaaa0001", "root0001", 2));
    expect(ids(middle.root)).toEqual(["box00001", "aaaa0001", "dddd0001"]);
  });

  test("dropping just before or after itself changes nothing", () => {
    for (const index of [1, 2])
      expect(layoutOf(moveNode(page(), "box00001", "root0001", index))).toEqual(page());
  });

  test("moves between containers carry the whole subtree and select it", () => {
    const result = moveNode(page(), "inner001", "root0001", 0);
    expect(result).toMatchObject({ ok: true, selected: "inner001" });
    const layout = layoutOf(result);
    expect(ids(layout.root)).toEqual(["inner001", "aaaa0001", "box00001", "dddd0001"]);
    expect(ids(findNode(layout, "inner001"))).toEqual(["cccc0001"]);
    expect(ids(findNode(layout, "box00001"))).toEqual(["bbbb0001"]);
  });

  test("refusals leave the layout alone and the input is never mutated", () => {
    const before = page();
    const snapshot = structuredClone(before);
    expect(moveNode(before, "box00001", "inner001", 0)).toEqual({
      ok: false,
      reason: REASONS.intoItself,
    });
    layoutOf(moveNode(before, "cccc0001", "root0001", 0));
    expect(before).toEqual(snapshot);
  });
});

describe("addNode and insertionPoint (click to add)", () => {
  test("into a selected container at the end, after a selected element, else at the end of the page", () => {
    const layout = page();
    expect(insertionPoint(layout, "box00001")).toEqual({ parentId: "box00001", index: 2 });
    expect(insertionPoint(layout, "bbbb0001")).toEqual({ parentId: "box00001", index: 1 });
    expect(insertionPoint(layout, "root0001")).toEqual({ parentId: "root0001", index: 3 });
    expect(insertionPoint(layout, null)).toEqual({ parentId: "root0001", index: 3 });
    expect(insertionPoint(layout, "nope0000")).toEqual({ parentId: "root0001", index: 3 });
  });

  test("addNode inserts and selects the new element", () => {
    const layout = page();
    const result = addNode(layout, heading("newh0001"), insertionPoint(layout, "bbbb0001"));
    expect(result).toMatchObject({ ok: true, selected: "newh0001" });
    expect(ids(findNode(layoutOf(result), "box00001"))).toEqual([
      "bbbb0001",
      "newh0001",
      "inner001",
    ]);
  });
});

describe("duplicateNode", () => {
  test("puts a deep copy with fresh ids right after the original", () => {
    const result = duplicateNode(page(), "box00001");
    const layout = layoutOf(result);
    const [, original, copy] = layout.root.children;
    if (!original || !copy || !result.ok) throw new Error("expected a copy");
    expect(copy.id).toBe(result.selected);
    expect(original.id).toBe("box00001");
    const copyIds = allIds(copy);
    expect(copyIds).toHaveLength(4);
    for (const id of copyIds) expect(allIds(original)).not.toContain(id);
    const strip = (node: LayoutNode): unknown =>
      isContainerNode(node)
        ? { ...node, id: "", children: node.children.map(strip) }
        : { ...node, id: "" };
    expect(strip(copy)).toEqual(strip(original));
    expect(new Set(allIds(layout.root)).size).toBe(allIds(layout.root).length);
  });

  test("never reuses an id already on the page, even when the generator collides", () => {
    const values = [...Array.from({ length: 8 }, () => 0), ...Array.from({ length: 8 }, () => 0.5)];
    let i = 0;
    const layout: Layout = {
      schemaVersion: 3,
      root: container("root0001", [heading("aaaaaaaa")]) as Layout["root"],
    };
    const result = duplicateNode(layout, "aaaaaaaa", () => values[i++ % values.length] ?? 0);
    expect(result.ok && result.selected).not.toBe("aaaaaaaa");
    expect(validateLayout(layoutOf(result)).ok).toBe(true);
  });

  test("the root can't be duplicated", () => {
    expect(duplicateNode(page(), "root0001")).toEqual({ ok: false, reason: REASONS.rootCopy });
  });
});

describe("keyboard moves (Alt+arrows)", () => {
  test("moveUp and moveDown swap with a sibling and refuse at the edges", () => {
    expect(ids(layoutOf(moveUp(page(), "box00001")).root)).toEqual([
      "box00001",
      "aaaa0001",
      "dddd0001",
    ]);
    expect(ids(layoutOf(moveDown(page(), "box00001")).root)).toEqual([
      "aaaa0001",
      "dddd0001",
      "box00001",
    ]);
    expect(moveUp(page(), "aaaa0001")).toEqual({ ok: false, reason: REASONS.first });
    expect(moveDown(page(), "dddd0001")).toEqual({ ok: false, reason: REASONS.last });
    expect(moveUp(page(), "root0001")).toEqual({ ok: false, reason: REASONS.rootFixed });
  });

  test("moveOut puts it right after its container, and refuses at the top level", () => {
    const layout = layoutOf(moveOut(page(), "bbbb0001"));
    expect(ids(layout.root)).toEqual(["aaaa0001", "box00001", "bbbb0001", "dddd0001"]);
    const twice = layoutOf(moveOut(page(), "cccc0001"));
    expect(ids(findNode(twice, "box00001"))).toEqual(["bbbb0001", "inner001", "cccc0001"]);
    expect(moveOut(page(), "aaaa0001")).toEqual({ ok: false, reason: REASONS.top });
  });

  test("moveIn goes to the end of the container just above, else refuses", () => {
    const layout = layoutOf(moveIn(page(), "dddd0001"));
    expect(ids(findNode(layout, "box00001"))).toEqual(["bbbb0001", "inner001", "dddd0001"]);
    expect(moveIn(page(), "aaaa0001")).toEqual({ ok: false, reason: REASONS.noContainerAbove });
    expect(moveIn(page(), "box00001")).toEqual({ ok: false, reason: REASONS.noContainerAbove });
  });
});

describe("keyboard selection", () => {
  test("↑/↓ walk the page in document order and stop at the ends", () => {
    const order = [
      "root0001",
      "aaaa0001",
      "box00001",
      "bbbb0001",
      "inner001",
      "cccc0001",
      "dddd0001",
    ];
    const layout = page();
    for (const [i, id] of order.entries()) {
      expect(nextInOrder(layout, id)).toBe(order[i + 1] ?? id);
      expect(previousInOrder(layout, id)).toBe(order[i - 1] ?? id);
    }
    expect(nextInOrder(layout, "nope0000")).toBe("root0001");
  });

  test("Enter goes to the first child, Shift+Enter to the parent", () => {
    const layout = page();
    expect(firstChild(layout, "box00001")).toBe("bbbb0001");
    expect(firstChild(layout, "aaaa0001")).toBeUndefined();
    expect(firstChild(layout, "root0001")).toBe("aaaa0001");
    expect(parentOf(layout, "cccc0001")).toBe("inner001");
    expect(parentOf(layout, "root0001")).toBeUndefined();
  });

  test("after a delete the selection goes to the next sibling, else the previous, else the parent", () => {
    const layout = page();
    expect(selectionAfterDelete(layout, "box00001")).toBe("dddd0001");
    expect(selectionAfterDelete(layout, "aaaa0001")).toBe("box00001");
    expect(selectionAfterDelete(layout, "dddd0001")).toBe("box00001");
    expect(selectionAfterDelete(layout, "cccc0001")).toBe("inner001");
    expect(selectionAfterDelete(layout, "root0001")).toBeNull();
    expect(subtreeSize(layout, "box00001")).toBe(4);
    expect(subtreeSize(layout, "nope0000")).toBe(0);
  });
});

describe("arrange properties over random layouts", () => {
  const layouts = randomLayouts(60, 14);

  test("every allowed move keeps all elements, keeps ids unique and stays valid", () => {
    let moves = 0;
    for (const layout of layouts) {
      const every = allIds(layout.root);
      const containers = every.filter((id) => findNode(layout, id)?.type === "container");
      for (const id of every.slice(1))
        for (const target of containers) {
          const result = moveNode(layout, id, target, 1);
          const allowed = canDrop(layout, { kind: "existing", id }, target);
          expect(result.ok).toBe(allowed.ok);
          if (!result.ok) continue;
          moves++;
          const after = allIds(result.layout.root);
          expect(after.toSorted()).toEqual(every.toSorted());
          expect(findNode(result.layout, id)).toEqual(findNode(layout, id));
          expect(parentOf(result.layout, id)).toBe(target);
          expect(validateLayout(result.layout).ok).toBe(true);
        }
    }
    expect(moves).toBeGreaterThan(500);
  });

  test("duplicating adds exactly the subtree, with unique ids", () => {
    for (const layout of layouts)
      for (const id of allIds(layout.root).slice(1)) {
        const after = layoutOf(duplicateNode(layout, id));
        const count = allIds(after.root).length;
        expect(count).toBe(allIds(layout.root).length + subtreeSize(layout, id));
        expect(new Set(allIds(after.root)).size).toBe(count);
        expect(validateLayout(after).ok).toBe(true);
      }
  });
});
