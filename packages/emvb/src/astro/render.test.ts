import { describe, expect, spyOn, test } from "bun:test";
import { s1Page } from "../../test/fixtures/layouts.ts";
import { emptyDesign, renderPage, type DesignSystem } from "../core/index.ts";
import { loadDesign, renderStored } from "./render.ts";

const DESIGN: DesignSystem = {
  schemaVersion: 9,
  variables: { colors: [{ id: "brand", name: "Brand", value: "#123456" }] },
};
const BASE = new URL("http://example.test/pricing");

describe("public design loading (D-013)", () => {
  test("reads the design through the in-process public route", async () => {
    const calls: string[] = [];
    const design = await loadDesign(async (plugin, method, path, request) => {
      calls.push(`${plugin} ${method} ${path} ${request.url}`);
      return { success: true, data: { design: DESIGN, revision: "r1", status: "ok" } };
    }, BASE);
    expect(design).toEqual(DESIGN);
    expect(calls).toEqual(["emvb GET /design http://example.test/_emdash/api/plugins/emvb/design"]);
  });

  test("falls back to an empty design without a handler, on failure, or on an invalid design", async () => {
    expect(await loadDesign(undefined, BASE)).toEqual(emptyDesign());
    expect(
      await loadDesign(async () => {
        throw new Error("down");
      }, BASE),
    ).toEqual(emptyDesign());
    expect(
      await loadDesign(async () => ({ success: true, data: { design: { nope: 1 } } }), BASE),
    ).toEqual(emptyDesign());
  });
});

describe("rendering a stored layout (R-031, R-033)", () => {
  test("object and JSON-string layouts render the core output with the design's variables", () => {
    const expected = renderPage(s1Page(), DESIGN, { scope: "01PAGE" });
    const fromObject = renderStored(s1Page(), DESIGN, "01PAGE");
    expect(fromObject).toEqual({
      html: expected.html,
      css: expected.css,
      needsFormsRuntime: false,
      needsTabsRuntime: false,
    });
    expect(fromObject.css).toContain("#123456");
    expect(renderStored(JSON.stringify(s1Page()), DESIGN, "01PAGE")).toEqual(fromObject);
  });

  test("a page's rules reach only its own markup, so a theme part keeps its styles (W-112)", () => {
    const header = renderStored(s1Page(), DESIGN, "01HEAD");
    const page = renderStored(s1Page(), DESIGN, "01PAGE");
    expect(header.html).toStartWith('<div class="emvb-scope emvb-s-01HEAD">');
    expect(page.html).toStartWith('<div class="emvb-scope emvb-s-01PAGE">');
    expect(page.html).not.toContain("data-emvb");
    const selectors = (css: string) =>
      [
        ...css
          .replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "")
          .matchAll(/([^{}@]+)\{/g),
      ]
        .map((m) => m[1]?.trim() ?? "")
        .filter((selector) => selector && !selector.startsWith("@"));
    const pageSelectors = selectors(page.css).filter((s) => s !== ":where(.emvb-scope)");
    expect(pageSelectors.length).toBeGreaterThan(2);
    for (const list of pageSelectors) {
      for (const selector of list.split(",")) {
        expect(selector).toStartWith(":where(.emvb-s-01PAGE) ");
      }
    }
    expect(page.css).toStartWith(":where(.emvb-scope){display:contents}");
  });

  test("an unreadable or missing layout renders an empty page", () => {
    const empty = { html: "", css: "", needsFormsRuntime: false, needsTabsRuntime: false };
    const logged = spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(renderStored("{nope", DESIGN, "01PAGE")).toEqual(empty);
      expect(renderStored({ schemaVersion: 1 }, DESIGN, "01PAGE")).toEqual(empty);
      // A page with no layout yet is not an error.
      expect(renderStored(null, DESIGN, "01PAGE")).toEqual(empty);
      expect(renderStored(undefined, DESIGN, "01PAGE")).toEqual(empty);
      expect(renderStored("", DESIGN, "01PAGE")).toEqual(empty);
      // Only the page id is logged, never layout content.
      expect(logged.mock.calls).toEqual([
        ["emvb: stored layout is unreadable", { pageId: "01PAGE" }],
        ["emvb: stored layout is unreadable", { pageId: "01PAGE" }],
      ]);
    } finally {
      logged.mockRestore();
    }
  });
});
