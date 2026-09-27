import { describe, expect, test } from "bun:test";
import { s1Page } from "../../../test/fixtures/layouts.ts";
import { emptyDesign, findNode } from "../../core/index.ts";
import { editorReducer, isDirty, type EditorState } from "./store.ts";

const initial = (): EditorState => {
  const layout = s1Page();
  layout.root.children.push({ id: "head0002", type: "heading", props: { text: "Two", level: 2 } });
  return {
    id: "01PAGE",
    page: {
      title: "Home",
      slug: "home",
      canvasMode: "site-layout",
      seoTitle: "",
      seoDescription: "",
      layout,
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
};

describe("editor store (A-07)", () => {
  test("edits mark the page dirty, and a save clears it only if nothing changed meanwhile", () => {
    let state = editorReducer(initial(), { type: "set-page", patch: { title: "Welcome" } });
    expect(isDirty(state)).toBe(true);
    const savingVersion = state.version;
    state = editorReducer(state, { type: "set-page", patch: { seoTitle: "SEO" } });
    state = editorReducer(state, { type: "saved", rev: "rev2", version: savingVersion });
    expect(state.rev).toBe("rev2");
    expect(isDirty(state)).toBe(true);
    state = editorReducer(state, { type: "saved", rev: "rev3", version: state.version });
    expect(isDirty(state)).toBe(false);
  });

  test("selection doesn't dirty the page", () => {
    expect(isDirty(editorReducer(initial(), { type: "select", id: "head0001" }))).toBe(false);
  });

  test("deleting an element clears its selection, and Restore puts it back in place, selected", () => {
    let state = editorReducer(initial(), { type: "select", id: "head0001" });
    state = editorReducer(state, { type: "delete-node", id: "head0001" });
    expect(state.selectedId).toBeNull();
    expect(state.page.layout?.root.children.map((c) => c.id)).toEqual(["head0002"]);
    state = editorReducer(state, { type: "restore" });
    expect(state.page.layout).toEqual(initial().page.layout);
    expect(state.selectedId).toBe("head0001");
    expect(state.lastDeleted).toBeNull();
  });

  test("only the most recent delete can be restored", () => {
    let state = editorReducer(initial(), { type: "delete-node", id: "head0001" });
    state = editorReducer(state, { type: "delete-node", id: "head0002" });
    state = editorReducer(state, { type: "restore" });
    expect(state.page.layout?.root.children.map((c) => c.id)).toEqual(["head0002"]);
    expect(editorReducer(state, { type: "restore" })).toBe(state);
  });

  test("the root can't be deleted", () => {
    const state = initial();
    expect(editorReducer(state, { type: "delete-node", id: "root0001" })).toBe(state);
  });

  test("node updates go through the tree", () => {
    const state = editorReducer(initial(), {
      type: "update-node",
      id: "head0002",
      update: (node) =>
        node.type === "heading" ? { ...node, props: { ...node.props, level: 3 } } : node,
    });
    expect(state.page.layout && findNode(state.page.layout, "head0002")).toMatchObject({
      props: { level: 3 },
    });
  });

  test("an empty page gets a root container, selected", () => {
    const empty = { ...initial(), page: { ...initial().page, layout: null } };
    const state = editorReducer(empty, { type: "add-root-container" });
    expect(state.page.layout?.root).toMatchObject({ type: "container", children: [] });
    expect(state.selectedId).toBe(state.page.layout?.root.id ?? "missing");
  });
});

test("add-node inserts through arrange.addNode and selects the new element", () => {
  let state = initial();
  const rootId = state.page.layout?.root.id;
  expect(rootId).toBeTruthy();
  const node = { id: "headNEW1", type: "heading" as const, props: { text: "Heading", level: 2 } };
  state = editorReducer(state, {
    type: "add-node",
    node,
    parentId: rootId ?? "",
    index: 0,
  });
  expect(state.page.layout?.root.children[0]?.id).toBe("headNEW1");
  expect(state.selectedId).toBe("headNEW1");
  expect(isDirty(state)).toBe(true);
});

test("add-node refuses an invalid drop without changing the layout", () => {
  const before = initial();
  const node = { id: "headNEW1", type: "heading" as const, props: { text: "Heading", level: 2 } };
  const state = editorReducer(before, {
    type: "add-node",
    node,
    parentId: "missing",
    index: 0,
  });
  expect(state.page.layout).toEqual(before.page.layout);
  expect(isDirty(state)).toBe(false);
});
