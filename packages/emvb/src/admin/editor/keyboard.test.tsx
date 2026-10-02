import { describe, expect, test } from "bun:test";
import {
  duplicateNode,
  moveDown,
  moveUp,
  nextInOrder,
  previousInOrder,
  subtreeSize,
  type Layout,
} from "../../core/index.ts";
import { container, heading } from "../../../test/fixtures/layouts.ts";
import { editorReducer, type EditorState } from "./store.ts";
import { emptyDesign } from "../../core/index.ts";

const layout: Layout = {
  schemaVersion: 8,
  root: container("root0001", [
    heading("head0001", "A"),
    container("box00001", [heading("head0002", "B"), heading("head0003", "C")]),
  ]) as Layout["root"],
};

const state = (selectedId: string): EditorState => ({
  id: "01PAGE",
  page: {
    title: "T",
    slug: "t",
    canvasMode: "contained",
    seoTitle: "",
    seoDescription: "",
    layout,
  },
  status: "draft",
  rev: "1",
  design: emptyDesign(),
  designRevision: null,
  selectedId,
  version: 0,
  savedVersion: 0,
  lastDeleted: null,
});

describe("keyboard arrange (W-020)", () => {
  test("↑/↓ walk document order", () => {
    expect(nextInOrder(layout, "head0001")).toBe("box00001");
    expect(previousInOrder(layout, "head0002")).toBe("box00001");
  });

  test("Alt+↓ moves among siblings; Alt+↑ reverses", () => {
    const down = moveDown(layout, "head0002");
    expect(down.ok).toBe(true);
    if (!down.ok) return;
    const kids = (down.layout.root.children[1] as { children: { id: string }[] }).children;
    expect(kids.map((c) => c.id)).toEqual(["head0003", "head0002"]);
    const up = moveUp(down.layout, "head0002");
    expect(up.ok).toBe(true);
    if (!up.ok) return;
    const restored = (up.layout.root.children[1] as { children: { id: string }[] }).children;
    expect(restored.map((c) => c.id)).toEqual(["head0002", "head0003"]);
  });

  test("duplicate selects the copy", () => {
    const result = duplicateNode(layout, "head0001");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.selected).not.toBe("head0001");
    expect(result.layout.root.children).toHaveLength(3);
  });

  test("subtreeSize counts the element and its descendants", () => {
    expect(subtreeSize(layout, "box00001")).toBe(3);
    expect(subtreeSize(layout, "head0001")).toBe(1);
  });

  test("apply-arranged updates the store", () => {
    const down = moveDown(layout, "head0002");
    expect(down.ok).toBe(true);
    if (!down.ok) return;
    const next = editorReducer(state("head0002"), {
      type: "apply-arranged",
      layout: down.layout,
      selected: down.selected,
    });
    expect(next.selectedId).toBe("head0002");
    expect(next.version).toBe(1);
  });

  test("delete asks for subtrees by size (contract for the dialog)", () => {
    expect(subtreeSize(layout, "box00001") > 1).toBe(true);
  });
});
