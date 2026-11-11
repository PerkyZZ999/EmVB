import { describe, expect, test } from "bun:test";
import { s1Page } from "../../../test/fixtures/layouts.ts";
import { renderPage } from "../render/index.ts";
import { emptyDesign, type DesignSystem } from "../schema/design.ts";
import type { Layout } from "../schema/layout.ts";
import { validateDesign, validateLayout } from "../validate.ts";

const withHeading = (set: (heading: Layout["root"]["children"][number]) => void) => {
  const layout = s1Page();
  const heading = layout.root.children[0];
  if (!heading) throw new Error("missing heading");
  set(heading);
  return layout;
};
const css = (set: (heading: Layout["root"]["children"][number]) => void) =>
  renderPage(withHeading(set), emptyDesign()).css;

describe("Wide screen device (W-959)", () => {
  test("style.wide is its own block from 2400 px, building on Desktop", () => {
    const out = css((h) => {
      h.style = { color: "#222222", wide: { fontSize: { value: 64, unit: "px" } } };
    });
    expect(out).toContain(".emvb-e-head0001{color:#222222}");
    expect(out).toContain("@media (min-width: 2400px){.emvb-e-head0001{font-size:64px}}");
    // Never in the Desktop rule.
    expect(out).not.toContain("color:#222222;font-size:64px");
  });

  test("a page without style.wide has no Wide screen CSS", () => {
    const out = css((h) => {
      h.style = { color: "#222222" };
      h.hiddenOn = ["desktop"];
    });
    expect(out).not.toContain("2400");
    expect(out).not.toContain("2399");
  });

  test("hidden on Wide screen only", () => {
    const out = css((h) => {
      h.style = { wide: { hidden: true } };
    });
    expect(out).toContain("@media (min-width: 2400px){.emvb-e-head0001{display:none}}");
  });

  test("hidden on Desktop, shown again on Wide screen", () => {
    const out = css((h) => {
      h.hiddenOn = ["desktop"];
      h.style = { wide: { hidden: false } };
    });
    expect(out).toContain(
      "@media (min-width: 1367px) and (max-width: 2399.98px){.emvb-e-head0001{display:none}}",
    );
    expect(out).not.toContain("@media (min-width: 1367px){");
    const both = css((h) => {
      h.hiddenOn = ["desktop", "laptop"];
      h.style = { wide: { hidden: false } };
    });
    expect(both).toContain(
      "@media (min-width: 1025px) and (max-width: 2399.98px){.emvb-e-head0001{display:none}}",
    );
  });

  test("wide.hidden true on an element already hidden on Desktop adds nothing", () => {
    const out = css((h) => {
      h.hiddenOn = ["desktop"];
      h.style = { wide: { hidden: true } };
    });
    expect(out).toContain("@media (min-width: 1367px){.emvb-e-head0001{display:none}}");
    expect(out).not.toContain("2400");
  });

  test("the editor's Wide screen preview applies the block, and Desktop's doesn't", () => {
    const layout = withHeading((h) => {
      h.style = { wide: { color: "#ff0000" } };
    });
    const wide = renderPage(layout, emptyDesign(), { mode: "editor", previewDevice: "wide" }).css;
    const desktop = renderPage(layout, emptyDesign(), {
      mode: "editor",
      previewDevice: "desktop",
    }).css;
    expect(wide).toContain(".emvb-e-head0001{color:#ff0000}");
    expect(desktop).not.toContain("#ff0000");
  });

  test("a class's style.wide", () => {
    const design: DesignSystem = {
      ...emptyDesign(),
      classes: [
        {
          id: "card",
          name: "Card",
          style: { color: "#111111", wide: { color: "#00ff00", hidden: true } },
        },
      ],
    };
    expect(validateDesign(design).ok).toBe(true);
    const layout = withHeading((h) => {
      h.classes = ["card"];
    });
    const out = renderPage(layout, design).css;
    expect(out).toContain("@media (min-width: 2400px){.emvb-k-card{color:#00ff00}}");
    expect(out).toContain("@media (min-width: 2400px){.emvb-k-card:not(.emvb-root){display:none}}");
  });

  test("style.wide survives validation, and its unknown keys are kept, never rendered", () => {
    const layout = withHeading((h) => {
      h.style = { wide: { color: "#00ff00" } };
    });
    const raw = JSON.parse(JSON.stringify(layout));
    raw.root.children[0].style.wide.futureWide = 1;
    const result = validateLayout(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const stored = result.layout.root.children[0]?.style as Record<string, unknown>;
    expect((stored["wide"] as Record<string, unknown>)["futureWide"]).toBe(1);
    expect(renderPage(result.layout, emptyDesign()).css).not.toContain("futureWide");
  });

  test("the root is never hidden on Wide screen", () => {
    const layout = s1Page();
    layout.root.style = { wide: { hidden: true } };
    expect(renderPage(layout, emptyDesign()).css).not.toContain("2400");
  });
});
