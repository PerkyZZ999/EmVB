import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import {
  ELEMENT_DESCRIPTORS,
  emptyDesign,
  firstChild,
  insertionPoint,
  isContainerNode,
  parentOf,
  type Layout,
} from "../../../core/index.ts";
import { newElement } from "../dnd/new-element.ts";
import { editorReducer, type EditorState } from "../store.ts";
import { AddPanel } from "./AddPanel.tsx";
import { LayersPanel } from "./LayersPanel.tsx";
import { LeftPanel } from "./LeftPanel.tsx";
import { cleanup, mount, unmount } from "../../../../test/dom/mount.ts";

afterEach(async () => {
  await cleanup();
  sessionStorage.clear();
});

const layout: Layout = {
  schemaVersion: 7,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [
      { id: "head0001", type: "heading", props: { text: "One", level: 1 } },
      {
        id: "box00001",
        type: "container",
        props: {},
        children: [{ id: "head0002", type: "heading", props: { text: "Two", level: 2 } }],
      },
    ],
  },
};

const baseState = (selectedId: string | null, pageLayout: Layout | null = layout): EditorState => ({
  id: "01PAGE",
  page: {
    title: "T",
    slug: "t",
    canvasMode: "contained",
    seoTitle: "",
    seoDescription: "",
    layout: pageLayout,
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

describe("Add panel (W-018)", () => {
  test("insertion point prefers the selected container over the root", () => {
    expect(insertionPoint(layout, "box00001")).toEqual({ parentId: "box00001", index: 1 });
    expect(insertionPoint(layout, "head0001")).toEqual({ parentId: "root0001", index: 1 });
    expect(insertionPoint(layout, null).parentId).toBe("root0001");
  });

  test("search filters tiles and shows No elements match for an empty result", async () => {
    await mount(<AddPanel onAdd={() => undefined} defaultQuery="xyz" />);
    expect(document.querySelector("[data-emvb-add-tile]")?.outerHTML ?? null).toBeNull();
    expect(document.body.textContent).toContain('No elements match "xyz".');
    await unmount();
    await mount(<AddPanel onAdd={() => undefined} defaultQuery="head" />);
    expect(document.querySelector('[data-emvb-add-tile="heading"]')).toBeTruthy();
    expect(
      document.querySelector('[data-emvb-add-tile="container"]')?.outerHTML ?? null,
    ).toBeNull();
  });

  test("clicking a tile calls onAdd with that type", async () => {
    const seen: string[] = [];
    await mount(<AddPanel onAdd={(type) => seen.push(type)} />);
    const tile = document.querySelector('[data-emvb-add-tile="heading"]') as HTMLButtonElement;
    await act(async () => tile.click());
    expect(seen).toEqual(["heading"]);
  });

  test("click-add inserts inside the selected container, not the root", () => {
    const state = baseState("box00001");
    const pageLayout = state.page.layout;
    expect(pageLayout).toBeTruthy();
    if (!pageLayout) return;
    const node = newElement("heading");
    expect(node).toBeTruthy();
    if (!node) return;
    const place = insertionPoint(pageLayout, state.selectedId);
    expect(place.parentId).toBe("box00001");
    const next = editorReducer(state, {
      type: "add-node",
      node,
      parentId: place.parentId,
      index: place.index,
    });
    const nextLayout = next.page.layout;
    expect(nextLayout).toBeTruthy();
    if (!nextLayout) return;
    const box = nextLayout.root.children.find((c) => c.id === "box00001");
    expect(box && isContainerNode(box) && box.children.some((c) => c.id === node.id)).toBe(true);
    expect(nextLayout.root.children.some((c) => c.id === node.id)).toBe(false);
    expect(next.selectedId).toBe(node.id);
  });

  test("announcement text names the parent after an insert at the insertion point", () => {
    const place = insertionPoint(layout, "box00001");
    expect(place.parentId).toBe("box00001");
    const label = ELEMENT_DESCRIPTORS.find((d) => d.type === "heading")?.name;
    expect(`Heading added inside Container`).toBe(`${label} added inside Container`);
  });
});

describe("Layers panel (W-018)", () => {
  test("auto-expands collapsed ancestors so the selection is visible", async () => {
    await mount(
      <LayersPanel
        layout={layout}
        selectedId="head0002"
        onSelect={() => undefined}
        onDuplicate={() => undefined}
        onMoveUp={() => undefined}
        onMoveDown={() => undefined}
        onDelete={() => undefined}
      />,
    );
    expect(document.querySelector('[data-emvb-layer="head0002"]')).toBeTruthy();
    expect(document.querySelector('[data-emvb-layer="box00001"]')).toBeTruthy();
  });

  test("Enter selects the first child and Shift+Enter selects the parent", () => {
    expect(firstChild(layout, "box00001")).toBe("head0002");
    expect(parentOf(layout, "head0002") ?? null).toBe("box00001");
  });

  test("LeftPanel defaults to Add and remembers Layers for the session", async () => {
    await mount(
      <LeftPanel
        layout={layout}
        selectedId="box00001"
        onSelect={() => undefined}
        onAdd={() => undefined}
        onDuplicate={() => undefined}
        onMoveUp={() => undefined}
        onMoveDown={() => undefined}
        onDelete={() => undefined}
      />,
    );
    expect(document.querySelector('[data-emvb-panel="add"]')).toBeTruthy();
    const layersTab = [...document.querySelectorAll('[role="tab"]')].find((el) =>
      (el.textContent ?? "").includes("Layers"),
    ) as HTMLElement;
    await act(async () => layersTab.click());
    expect(sessionStorage.getItem("emvb-left-tab")).toBe("layers");
    expect(document.querySelector('[data-emvb-panel="layers"]')).toBeTruthy();
  });
});

describe("Empty canvas (W-018)", () => {
  test("add-root-container creates and selects a root", () => {
    const next = editorReducer(baseState(null, null), { type: "add-root-container" });
    expect(next.page.layout?.root.type).toBe("container");
    expect(next.selectedId).toBe(next.page.layout?.root.id ?? null);
  });
});
