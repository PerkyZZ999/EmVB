import { describe, expect, test } from "bun:test";
import { emptyDesign, renderPage, type Layout } from "../index.ts";
import { isReservedAttribute } from "./extras.ts";

describe("forms-client attribute names stay reserved (W-191)", () => {
  test("data-ec-*, data-page and the other names the forms client reads are not rendered", () => {
    for (const name of [
      "data-ec-form",
      "data-ec-next",
      "data-page",
      "data-error-for",
      "data-form-id",
      "data-emvb-id",
    ]) {
      expect(isReservedAttribute(name)).toBe(true);
    }
    expect(isReservedAttribute("data-track")).toBe(false);
    const layout: Layout = {
      schemaVersion: 12,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        attributes: [
          { name: "data-ec-form", value: "" },
          { name: "data-page", value: "1" },
          { name: "data-track", value: "hero" },
        ],
        children: [],
      },
    };
    const { html } = renderPage(layout, emptyDesign());
    expect(html).not.toContain("data-ec-form");
    expect(html).not.toContain("data-page");
    expect(html).toContain('data-track="hero"');
  });
});
