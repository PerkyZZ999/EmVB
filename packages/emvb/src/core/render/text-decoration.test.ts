import { describe, expect, test } from "bun:test";
import { container } from "../../../test/fixtures/layouts.ts";
import { emptyDesign } from "../schema/design.ts";
import type { Layout, LayoutNode } from "../schema/layout.ts";
import { StyleProps } from "../schema/style.ts";
import { renderPage } from "./index.ts";

const page = (children: LayoutNode[]): Layout => ({
  schemaVersion: 12,
  root: container("root0001", children) as Layout["root"],
});

const rule = (css: string, selector: string) => {
  const start = css.indexOf(`${selector}{`);
  return start === -1 ? undefined : css.slice(start, css.indexOf("}", start) + 1);
};

describe("text decoration (W-113)", () => {
  test("a button link is not underlined by default, and a plain link keeps the browser underline", () => {
    const { css } = renderPage(
      page([
        { id: "btn00001", type: "button", props: { text: "Go", href: "/go" } },
        { id: "lnk00001", type: "link", props: { text: "Read", href: "/read" } },
      ]),
      emptyDesign(),
    );
    expect(rule(css, ".emvb-button")).toContain("text-decoration:none");
    expect(css).not.toMatch(/\.emvb-link\{[^}]*text-decoration/);
  });

  test("local and hover decorations come after the button's base rule, so they win", () => {
    const { css } = renderPage(
      page([
        {
          id: "btn00001",
          type: "button",
          props: { text: "Go", href: "/go" },
          style: { textDecoration: "line-through" },
          states: { hover: { textDecoration: "underline" } },
        },
      ]),
      emptyDesign(),
    );
    expect(rule(css, ".emvb-e-btn00001")).toBe(".emvb-e-btn00001{text-decoration:line-through}");
    expect(rule(css, ".emvb-e-btn00001:hover")).toBe(
      ".emvb-e-btn00001:hover{text-decoration:underline}",
    );
    expect(css.indexOf(".emvb-button{")).toBeLessThan(css.indexOf(".emvb-e-btn00001{"));
  });

  test("the schema takes none, underline, overline and line-through, and refuses anything else", () => {
    for (const value of ["none", "underline", "overline", "line-through"]) {
      expect(StyleProps.safeParse({ textDecoration: value }).success).toBe(true);
    }
    expect(StyleProps.safeParse({ textDecoration: "blink" }).success).toBe(false);
  });
});
