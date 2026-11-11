import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import {
  emptyDesign,
  renderPage,
  toggleHiddenOn,
  type Layout,
  type LayoutNode,
} from "../../../core/index.ts";
import { cleanup, mount, settle } from "../../../../test/dom/mount.ts";
import { DeviceBar } from "../canvas/DeviceBar.tsx";
import { applyStylePatch } from "./style-target.ts";

afterEach(cleanup);

test("W-956: the device bar offers Laptop between Desktop and Tablet", async () => {
  const picked: string[] = [];
  await mount(
    <DeviceBar
      device="desktop"
      hidden={false}
      canHide={false}
      hideLabel="Hide on desktop"
      onDevice={(device) => picked.push(device)}
      onToggleHidden={() => undefined}
    />,
  );
  await settle();
  const tabs = [...document.querySelectorAll('[role="tab"]')].map((t) => t.textContent?.trim());
  expect(tabs).toEqual(["Wide screen", "Desktop", "Laptop", "Tablet", "Mobile"]);
  const laptop = [...document.querySelectorAll<HTMLElement>('[role="tab"]')].find(
    (t) => t.textContent?.trim() === "Laptop",
  );
  await act(async () => laptop?.click());
  expect(picked).toContain("laptop");
});

test("W-956: styling on Laptop writes the element's or class's laptop override", () => {
  const node = { id: "head0001", type: "heading", props: { text: "Hi", level: 2 } } as LayoutNode;
  const own = applyStylePatch({
    node,
    design: emptyDesign(),
    classId: null,
    device: "laptop",
    state: "normal",
    patch: { color: "#333333" },
  });
  expect(own.kind === "node" && own.node.devices).toEqual({ laptop: { color: "#333333" } });
  const design = { ...emptyDesign(), classes: [{ id: "card", name: "Card", style: {} }] };
  const cls = applyStylePatch({
    node,
    design,
    classId: "card",
    device: "laptop",
    state: "normal",
    patch: { color: "#444444" },
  });
  expect(cls.kind === "design" && cls.design.classes?.[0]?.devices).toEqual({
    laptop: { color: "#444444" },
  });
});

test("W-959: styling on Wide screen writes the own style's wide record, keeping its hide", () => {
  const node = {
    id: "head0001",
    type: "heading",
    props: { text: "Hi", level: 2 },
    style: { color: "#111111", wide: { hidden: false } },
  } as LayoutNode;
  const own = applyStylePatch({
    node,
    design: emptyDesign(),
    classId: null,
    device: "wide",
    state: "normal",
    patch: { color: "#333333" },
  });
  expect(own.kind === "node" && own.node.style).toEqual({
    color: "#111111",
    wide: { color: "#333333", hidden: false },
  });
  const design = { ...emptyDesign(), classes: [{ id: "card", name: "Card", style: {} }] };
  const cls = applyStylePatch({
    node,
    design,
    classId: "card",
    device: "wide",
    state: "normal",
    patch: { color: "#444444" },
  });
  expect(cls.kind === "design" && cls.design.classes?.[0]?.style).toEqual({
    wide: { color: "#444444" },
  });
  // Clearing the last Wide screen value drops the record.
  const cleared = applyStylePatch({
    node: { ...node, style: { wide: { color: "#333333" } } },
    design: emptyDesign(),
    classId: null,
    device: "wide",
    state: "normal",
    patch: { color: undefined },
  });
  expect(cleared.kind === "node" && cleared.node.style).toBeUndefined();
});

test("W-959: Hide on Desktop in the editor hides at 2400 px and up too", () => {
  const node = { id: "head0001", type: "heading", props: { text: "Hi", level: 2 } } as LayoutNode;
  const { hiddenOn, style } = toggleHiddenOn(node, "desktop");
  const layout: Layout = {
    schemaVersion: 18,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      children: [{ ...node, ...(hiddenOn ? { hiddenOn } : {}), ...(style ? { style } : {}) }],
    },
  };
  const { css } = renderPage(layout, emptyDesign());
  expect(css).toContain("@media (min-width: 1367px){.emvb-e-head0001{display:none}}");
  expect(css).not.toContain("2399.98");
  // And the editor's Wide screen view hides it as well.
  const wide = renderPage(layout, emptyDesign(), { mode: "editor", previewDevice: "wide" }).css;
  expect(wide).toContain(".emvb-e-head0001{display:none}");
});

test("W-959: the Wide screen hide checkbox says it follows Desktop until set", async () => {
  await mount(
    <DeviceBar
      device="wide"
      hidden
      inherited
      canHide
      hideLabel="Hide on wide screen"
      onDevice={() => undefined}
      onToggleHidden={() => undefined}
    />,
  );
  await settle();
  expect(document.querySelector("[data-emvb-hide-inherited]")?.textContent).toContain(
    "follows Desktop",
  );
});
