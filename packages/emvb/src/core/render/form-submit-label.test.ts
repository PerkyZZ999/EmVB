import { describe, expect, test } from "bun:test";
import { emptyDesign, renderPage, type Layout, type LayoutNode } from "../index.ts";

const page = (children: LayoutNode[]): Layout => ({
  schemaVersion: 17,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [{ id: "form0001", type: "form", props: { formId: "contact" }, children }],
  },
});
const submit = (label?: string) =>
  ({ id: "subm0001", type: "submit", props: label ? { label } : {} }) as LayoutNode;

describe("the form's submit label (W-203)", () => {
  test("is the page's Submit button text, which the forms client restores after a submit", () => {
    expect(renderPage(page([submit("Send")]), emptyDesign()).html).toContain(
      'data-submit-label="Send"',
    );
  });
  test("follows a button nested in a box, and falls back to Submit", () => {
    const boxed = {
      id: "boxx0001",
      type: "div-block",
      props: {},
      children: [submit("Join")],
    } as LayoutNode;
    expect(renderPage(page([boxed]), emptyDesign()).html).toContain('data-submit-label="Join"');
    expect(renderPage(page([submit()]), emptyDesign()).html).toContain(
      'data-submit-label="Submit"',
    );
  });
});

// W-766: a long Submit label or checkbox/radio option stayed one line and widened a phone page.
describe("long form labels wrap (W-766)", () => {
  test("W-766: the submit button and check/radio labels let long words break", () => {
    const check = {
      id: "chck0001",
      type: "checkbox",
      props: { field: "ok", label: "x".repeat(150) },
    } as LayoutNode;
    const { css } = renderPage(page([check, submit("y".repeat(80))]), emptyDesign());
    expect(css).toMatch(/\.emvb-submit\{[^}]*max-width:100%;overflow-wrap:anywhere/);
    expect(css).toMatch(/\.emvb-form-checkbox-label,[^{]*\{[^}]*overflow-wrap:anywhere/);
  });
});
