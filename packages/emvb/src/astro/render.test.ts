import { describe, expect, spyOn, test } from "bun:test";
import { s1Page } from "../../test/fixtures/layouts.ts";
import { emptyDesign, renderPage, type DesignSystem } from "../core/index.ts";
import { loadDesign, renderStored } from "./render.ts";

const DESIGN: DesignSystem = {
  schemaVersion: 3,
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
    const expected = renderPage(s1Page(), DESIGN);
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

  test("an unreadable or missing layout renders an empty page", () => {
    const empty = { html: "", css: "", needsFormsRuntime: false, needsTabsRuntime: false };
    const logged = spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(renderStored("{nope", DESIGN, "01PAGE")).toEqual(empty);
      expect(renderStored({ schemaVersion: 1 }, DESIGN, "01PAGE")).toEqual(empty);
      expect(logged).toHaveBeenCalledTimes(2);
    } finally {
      logged.mockRestore();
    }
    expect(renderStored(null, DESIGN, "01PAGE")).toEqual(empty);
  });
});
