import { describe, expect, test } from "bun:test";
import { container } from "../../../test/fixtures/layouts.ts";
import { renderPage } from "../render/index.ts";
import { emptyDesign } from "../schema/design.ts";
import type { Layout } from "../schema/layout.ts";
import { form } from "./form-elements.ts";

const layout: Layout = {
  schemaVersion: 9,
  root: container("root0001", [
    {
      id: "form0001",
      type: "form",
      props: { formId: "contact" },
      children: [
        {
          id: "inp00001",
          type: "text-input",
          props: { field: "email", label: "Email" },
          style: { color: "#123456" },
        },
        { id: "txt00001", type: "textarea", props: { field: "note", label: "Note" } },
      ],
    },
  ]) as Layout["root"],
};

/** The field rules W-114 added after the form's own rules. */
const fieldRules = () => {
  const css = form.baseCss ?? "";
  return css.slice(css.indexOf("}", css.indexOf(".ec-form-hp{")) + 1);
};

const selectorsOf = (css: string) =>
  [...css.matchAll(/([^{}]+)\{[^{}]*\}/g)].map((m) => m[1] ?? "");

describe("published form fields have a default look (W-114)", () => {
  test("inputs, selects and textareas get a border, padding and the page's font and colour", () => {
    const { css } = renderPage(layout, emptyDesign());
    const input = /:where\(\.emvb-form \.ec-form-input\)\{([^}]*)\}/.exec(css)?.[1] ?? "";
    for (const declaration of [
      "box-sizing:border-box",
      "width:100%",
      "font:inherit",
      "color:inherit",
      "border:1px solid color-mix(in srgb,currentColor 30%,transparent)",
      "border-radius:6px",
    ]) {
      expect(input).toContain(declaration);
    }
    expect(css).toContain(
      ":where(.emvb-form textarea.ec-form-input){min-height:7.5em;resize:vertical}",
    );
    expect(css).toContain(
      ":where(.emvb-form .ec-form-input:focus-visible){outline:2px solid currentColor",
    );
  });

  test("every field rule has no specificity, so a class, a field style or the theme overrides it", () => {
    const selectors = selectorsOf(fieldRules());
    expect(selectors.length).toBeGreaterThanOrEqual(8);
    for (const selector of selectors) {
      expect(selector).toMatch(/^:where\([^{}]*\)(::placeholder)?$/);
    }
  });

  test("a field's own style comes after the defaults, on the box the control inherits from", () => {
    const { css } = renderPage(layout, emptyDesign());
    expect(css.indexOf(".emvb-e-inp00001{color:#123456}")).toBeGreaterThan(
      css.indexOf(":where(.emvb-form .ec-form-input){"),
    );
  });
});
