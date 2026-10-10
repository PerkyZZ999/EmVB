import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import type { Layout } from "../schema/layout.ts";
import { renderPage } from "./index.ts";

// W-299: a heading or text holding one word longer than the line (a pasted URL) widened the page
// past a phone's screen, so the whole page scrolled sideways.
describe("long words (W-299)", () => {
  const layout: Layout = {
    schemaVersion: 14,
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
});
