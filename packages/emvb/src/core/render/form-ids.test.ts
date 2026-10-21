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
      schemaVersion: 16,
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
    // W-780: each control's error slot has an id too (4 controls).
    expect(ids.length).toBe(10);
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

test("W-780: every control names its own error slot, even with the form twice on a page", () => {
  const radio = {
    id: "radi0001",
    type: "radio",
    props: { field: "plan", label: "Plan" },
  } as LayoutNode;
  const layout: Layout = {
    schemaVersion: 16,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      children: [
        form("form0001", [field("inpt0001", "text-input"), field("chek0001", "checkbox"), radio]),
        form("form0002", [field("inpt0002", "textarea"), field("sele0002", "select")]),
      ],
    },
  };
  const { html } = renderPage(layout, emptyDesign());
  document.body.innerHTML = html;
  const controls = [
    ...document.querySelectorAll<HTMLElement>("input, select, textarea, fieldset"),
  ].filter(
    (el) =>
      !(el.tagName === "INPUT" && el.closest("fieldset")) &&
      (el as HTMLInputElement).type !== "hidden" &&
      el.getAttribute("name") !== "_hp",
  );
  expect(controls.length).toBe(5);
  for (const control of controls) {
    const slot = document.getElementById(control.getAttribute("aria-describedby") ?? "none");
    expect(slot?.getAttribute("data-error-for") ?? "missing").toBe(
      control.getAttribute("name") ?? control.querySelector("input")?.getAttribute("name") ?? "?",
    );
  }
});
