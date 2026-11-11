import { expect, test } from "bun:test";
import {
  defaultElement,
  LAYOUT_SCHEMA_VERSION,
  type Layout,
  type LayoutNode,
} from "../../../core/index.ts";
import { findNode } from "../../../core/tree-ops.ts";
import { emptyDesign } from "../../../core/index.ts";
import { editorReducer, type EditorState } from "../store.ts";
import { withLoopPostTitleLevel } from "./new-element.ts";

const title = (id: string, level = 1): LayoutNode =>
  ({ id, type: "post-title", props: { level } }) as LayoutNode;
const layout = (children: LayoutNode[]): Layout => ({
  schemaVersion: LAYOUT_SCHEMA_VERSION,
  root: { id: "root0001", type: "container", props: {}, children },
});
const loop = (children: LayoutNode[]): LayoutNode =>
  ({
    ...defaultElement("loop", "loop0001"),
    children: [{ id: "box00001", type: "container", props: {}, children }],
  }) as LayoutNode;
const level = (l: Layout, id: string) => (findNode(l, id)?.props as { level?: number }).level;

test("a new Post title inside a Loop is an H2; outside it stays H1 (W-968)", () => {
  const inside = layout([loop([title("pt000001")])]);
  expect(level(withLoopPostTitleLevel(inside, "pt000001"), "pt000001")).toBe(2);
  const outside = layout([title("pt000001")]);
  expect(level(withLoopPostTitleLevel(outside, "pt000001"), "pt000001")).toBe(1);
});

test("in a loop item part any new Post title is an H2; a chosen level is kept", () => {
  const l = layout([title("pt000001")]);
  expect(level(withLoopPostTitleLevel(l, "pt000001", "loop_item"), "pt000001")).toBe(2);
  const h3 = layout([loop([title("pt000002", 3)])]);
  expect(level(withLoopPostTitleLevel(h3, "pt000002"), "pt000002")).toBe(3);
});

test("a Post title dropped into a Loop on the canvas becomes an H2", () => {
  const state: EditorState = {
    id: "01PAGE",
    page: {
      title: "Blog",
      slug: "blog",
      canvasMode: "site-layout",
      seoTitle: "",
      seoDescription: "",
      layout: layout([loop([])]),
    },
    status: "draft",
    rev: "rev1",
    design: emptyDesign(),
    designRevision: null,
    selectedId: null,
    version: 0,
    savedVersion: 0,
    lastDeleted: null,
  };
  const next = editorReducer(state, {
    type: "add-node",
    node: title("pt000009"),
    parentId: "box00001",
    index: 0,
  });
  expect(level(next.page.layout as Layout, "pt000009")).toBe(2);
});
