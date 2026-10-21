import { expect, test } from "bun:test";
import { defaultElement } from "../elements/index.ts";
import { emptyDesign } from "../schema/design.ts";
import type { Layout, LayoutNode } from "../schema/layout.ts";
import { renderPage } from "./index.ts";

const layout = {
  schemaVersion: 17,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [
      {
        ...defaultElement("tabs", "tabs0001"),
        children: [
          {
            id: "tabp0001",
            type: "tab-panel",
            props: { label: "One" },
            style: { paddingTop: { value: 40, unit: "px" } },
            children: [],
          },
          { id: "tabp0002", type: "tab-panel", props: { label: "Two" }, children: [] },
        ],
      } as LayoutNode,
    ],
  },
} as Layout;

test("a tab panel keeps its own style (W-598)", () => {
  const { html, css } = renderPage(layout, emptyDesign());
  const host = document.createElement("div");
  host.innerHTML = html;
  const first = host.querySelector("#emvb-tabs-tabs0001-panel-0");
  expect(first?.className).toBe("emvb-tab-panel emvb-e-tabp0001");
  expect(first?.getAttribute("role")).toBe("tabpanel");
  expect(css).toContain(".emvb-e-tabp0001{");
  expect(css).toMatch(/\.emvb-e-tabp0001\{[^}]*padding-top:40px/);
});

test("a styled panel's display can't reveal the inactive panels (W-598)", () => {
  const base = defaultElement("tabs", "x").type;
  expect(base).toBe("tabs");
  const { css } = renderPage(layout, emptyDesign());
  expect(css).toContain(
    ".emvb-tabs:has(> .emvb-tab-input:nth-of-type(1):checked) > .emvb-tab-panels > .emvb-tab-panel:not(:nth-of-type(1)){display:none!important}",
  );
});
