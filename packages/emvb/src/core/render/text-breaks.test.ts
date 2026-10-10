import { describe, expect, test } from "bun:test";
import { emptyDesign, type Layout } from "../index.ts";
import { renderPage } from "./index.ts";

const page = (text: string): Layout =>
  ({
    schemaVersion: 14,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      children: [{ id: "text0001", type: "text", props: { text } }],
    },
  }) as Layout;

describe("a Text paragraph's line breaks show on the page (W-264)", () => {
  test("the line breaks stay in the markup and the Text base CSS keeps them (pre-line)", () => {
    const result = renderPage(page("Line one\nLine two"), emptyDesign());
    expect(result.html).toContain("Line one\nLine two");
    expect(result.css).toContain(":where(.emvb-text){white-space:pre-line}");
  });
  test("the rule has no specificity, so a class or local style can still set white-space", () => {
    const result = renderPage(page("x"), emptyDesign());
    expect(result.css).not.toMatch(/(^|\})\.emvb-text\{[^}]*white-space/);
  });
});
