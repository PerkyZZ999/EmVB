import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import type { Layout, LayoutNode } from "../schema/layout.ts";
import { StyleProps } from "../schema/style.ts";
import { validateLayout } from "../validate.ts";
import { renderPage } from "./index.ts";

const page = (list: Record<string, unknown>, style?: Record<string, unknown>): Layout => ({
  schemaVersion: 18,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [
      {
        id: "list0001",
        type: "list",
        props: { items: ["One", "Two", "Three"], ...list },
        ...(style ? { style } : {}),
      } as LayoutNode,
    ],
  },
});

describe("list markers and numbered steps (W-952)", () => {
  test("a number marker makes a numbered list in that style", () => {
    const { html, css } = renderPage(page({ marker: "upper-roman", start: 3 }), emptyDesign());
    expect(html).toContain('<ol class="emvb-list emvb-e-list0001" start="3">');
    expect(css).toContain(".emvb-e-list0001{list-style-type:upper-roman}");
  });

  test("a bullet marker keeps an unnumbered list, and start only applies when numbered", () => {
    const { html, css } = renderPage(page({ marker: "square", start: 4 }), emptyDesign());
    expect(html).toContain('<ul class="emvb-list emvb-e-list0001">');
    expect(css).toContain("list-style-type:square");
  });

  test("numbered steps draw each number in a circle, counted from Start at", () => {
    const { html, css } = renderPage(
      page({ marker: "steps", start: 2 }, { markerColor: "#ff6600" }),
      emptyDesign(),
    );
    expect(html).toContain('<ol class="emvb-list emvb-e-list0001 emvb-list--steps" start="2">');
    expect(css).toContain(".emvb-list--steps>li::before{content:counter(list-item)");
    expect(css).toContain("--emvb-marker-color:#ff6600");
    expect(css).not.toContain("list-style-type:steps");
  });

  test("marker colour and size reach the markers", () => {
    const { css } = renderPage(
      page({}, { markerColor: "#ff0000", markerSize: { value: 1.25, unit: "em" } }),
      emptyDesign(),
    );
    expect(css).toContain("--emvb-marker-color:#ff0000");
    expect(css).toContain("--emvb-marker-size:1.25em");
    expect(css).toContain(".emvb-list>li::marker{color:var(--emvb-marker-color,inherit)");
  });

  test("a list without markers or steps gets no new CSS (pages saved before keep theirs)", () => {
    const { css } = renderPage(page({ ordered: true }), emptyDesign());
    expect(css).not.toContain("::marker");
    expect(css).not.toContain("emvb-list--steps");
  });

  test.each([
    [{ marker: "lower-greek" }],
    [{ marker: "steps;color:red" }],
    [{ start: 0 }],
    [{ start: 1.5 }],
  ])("refuses %p", (props) => {
    expect(validateLayout(page(props)).ok).toBe(false);
  });

  test.each([["red;}body{x"], ["url(x)"], [{ var: "no spaces allowed" }]])(
    "marker colour refuses %p",
    (value) => {
      expect(StyleProps.safeParse({ markerColor: value }).success).toBe(false);
    },
  );
});
