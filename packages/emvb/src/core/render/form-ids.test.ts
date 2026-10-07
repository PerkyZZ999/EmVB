import { describe, expect, test } from "bun:test";
import { emptyDesign, renderPage, type Layout, type LayoutNode } from "../index.ts";

const field = (id: string, type: "text-input" | "textarea" | "select" | "checkbox"): LayoutNode =>
  ({ id, type, props: { field: "email", label: "Email" } }) as LayoutNode;
const form = (id: string, children: LayoutNode[]): LayoutNode => ({
  id,
  type: "form",
  props: { formId: "newsletter" },
  children,
});

describe("form control ids (W-187)", () => {
  test("the same form twice on a page keeps every id unique, and each label targets its own control", () => {
    const layout: Layout = {
      schemaVersion: 12,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          form("form0001", [field("inpt0001", "text-input"), field("chek0001", "checkbox")]),
          form("form0002", [field("inpt0002", "textarea"), field("sele0002", "select")]),
        ],
      },
    };
    const { html } = renderPage(layout, emptyDesign());
    const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids.length).toBe(6);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain("email");
    for (const target of [...html.matchAll(/ for="([^"]+)"/g)].map((m) => m[1])) {
      expect(ids).toContain(target);
    }
    expect(html).toContain('<label class="emvb-form-label" for="emvb-field-inpt0002">');
    expect(html).toContain('id="emvb-field-inpt0002" name="email"');
    expect(html).toContain('id="emvb-hp-form0002"');
    // The forms runtime finds fields and errors by name, which stays the field name.
    expect(html.match(/name="email"/g)?.length).toBe(4);
    expect(html.match(/data-error-for="email"/g)?.length).toBe(4);
  });
});
