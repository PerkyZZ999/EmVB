import { describe, expect, test } from "bun:test";
import { emptyDesign, type DesignSystem } from "../schema/design.ts";
import { LAYOUT_SCHEMA_VERSION, type Layout } from "../schema/layout.ts";
import { renderPage } from "../render/index.ts";
import { styleLayers } from "./trace.ts";

const page = (): Layout => ({
  schemaVersion: LAYOUT_SCHEMA_VERSION,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [
      { id: "butn0001", type: "button", props: { text: "Go", href: "/go" } },
      { id: "butn0002", type: "button", props: { text: "Open" } },
      { id: "link0001", type: "link", props: { text: "Read", href: "/read" } },
    ],
  },
});

const withDefaults = (defaults: DesignSystem["defaults"]): DesignSystem =>
  ({ ...emptyDesign(), defaults }) as DesignSystem;

describe("W-1090 (#30): a site-wide button default reaches link Buttons", () => {
  test("the button default styles a Button rendered as <a>, at tag weight, after the a default", () => {
    const design = withDefaults({
      a: { color: "#0000ee" },
      button: { color: "#ffffff", backgroundColor: "#cc0000" },
    });
    const { css, html } = renderPage(page(), design);
    expect(html).toContain('<a class="emvb-button');
    const rule =
      ":where(.emvb-root) button,:where(.emvb-root) a:where(.emvb-button){color:#ffffff;background-color:#cc0000}";
    expect(css).toContain(rule);
    // Same weight as a tag (0,0,1), later than the `a` default, so it wins over it on a link
    // Button while a class (0,1,0) still beats it.
    expect(css.indexOf(":where(.emvb-root) a{")).toBeLessThan(css.indexOf(rule));
    expect(css).toContain(":where(.emvb-root) a{color:#0000ee}");
  });

  test("a design with no button default emits no button selector", () => {
    const { css } = renderPage(page(), withDefaults({ a: { color: "#0000ee" } }));
    expect(css).not.toContain("emvb-root) button");
    expect(css).not.toContain("a:where(.emvb-button)");
  });

  test("the style trace lists the button default above the a default on a link Button", () => {
    const design = withDefaults({ a: { color: "#0000ee" }, button: { color: "#ffffff" } });
    const linkButton = page().root.children?.[0];
    if (!linkButton) throw new Error("no node");
    const labels = styleLayers(linkButton, design).map((l) => l.source.label);
    expect(labels).toEqual(["Site default (A)", "Site default (BUTTON)"]);
    const link = page().root.children?.[2];
    if (!link) throw new Error("no node");
    expect(styleLayers(link, design).map((l) => l.source.label)).toEqual(["Site default (A)"]);
  });
});
