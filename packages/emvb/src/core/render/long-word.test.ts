import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import type { Layout } from "../schema/layout.ts";
import { renderPage } from "./index.ts";

// W-299: a heading or text holding one word longer than the line (a pasted URL) widened the page
// past a phone's screen, so the whole page scrolled sideways.
describe("long words (W-299)", () => {
  const layout: Layout = {
    schemaVersion: 17,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      children: [
        {
          id: "head0001",
          type: "heading",
          props: { text: `https://example.com/${"segment".repeat(40)}`, level: 1 },
        },
      ],
    },
  };

  test("containers, the root among them, let a word too long for the line break", () => {
    const { css, html } = renderPage(layout, emptyDesign());
    expect(html.startsWith('<div class="emvb-root emvb-container">')).toBe(true);
    expect(css).toMatch(/\.emvb-container\{[^}]*overflow-wrap:break-word/);
  });

  // W-764: a button label is a flex item, so break-word alone left it one unbreakable line.
  test("W-764: a button lets a long label break", () => {
    const withButton: Layout = {
      schemaVersion: 17,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [{ id: "btn00001", type: "button", props: { text: "x".repeat(200), href: "/" } }],
      },
    };
    const { css } = renderPage(withButton, emptyDesign());
    expect(css).toMatch(/\.emvb-button\{[^}]*overflow-wrap:anywhere/);
  });

  // W-765: a tab label is a flex item in the tab list, so a long word kept the whole label on one line.
  test("W-765: a tab label lets a long word break", () => {
    const withTabs: Layout = {
      schemaVersion: 17,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          { id: "tabs0001", type: "tabs", props: { tabs: ["x".repeat(200)] }, children: [] },
        ],
      },
    };
    const { css } = renderPage(withTabs, emptyDesign());
    expect(css).toMatch(/\.emvb-tab-label\{[^}]*min-width:0;overflow-wrap:anywhere/);
  });
});
