import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import type { Layout } from "../schema/layout.ts";
import { renderPage } from "./index.ts";

describe("the page root is never hidden (W-567)", () => {
  test("a root stored as hidden on every device still shows the page", () => {
    const layout = {
      schemaVersion: 17,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        hiddenOn: ["desktop", "tablet", "mobile"],
        children: [{ id: "head0001", type: "heading", props: { level: 1, text: "Hi" } }],
      },
    } as unknown as Layout;
    const r = renderPage(layout, emptyDesign());
    expect(r.html).toContain("Hi");
    expect(r.css).not.toContain(".emvb-e-root0001{display:none}");
  });
});

describe("W-571: a class hidden on a device doesn't hide the page root", () => {
  test("the class's display:none rule skips the root", () => {
    const layout = {
      schemaVersion: 17,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        classes: ["quiet"],
        children: [
          { id: "box00001", type: "container", props: {}, classes: ["quiet"], children: [] },
        ],
      },
    } as unknown as Layout;
    const design = {
      ...emptyDesign(),
      classes: [{ id: "quiet", name: "Quiet", style: {}, hiddenOn: ["mobile"] }],
    };
    const r = renderPage(layout, design as never);
    const mobile = r.css.slice(r.css.lastIndexOf("@media (max-width: 767.98px)"));
    expect(mobile).toContain("display:none");
    expect(mobile).not.toMatch(/\.emvb-k-quiet[,{]/);
    expect(mobile).toContain(".emvb-k-quiet:not(.emvb-root)");
  });
});
