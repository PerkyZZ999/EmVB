import { describe, expect, test } from "bun:test";
import { emptyDesign, renderPage, type Layout, type LayoutNode } from "../index.ts";

const page = (children: LayoutNode[]): Layout => ({
  schemaVersion: 13,
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
