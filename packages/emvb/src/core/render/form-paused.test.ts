import { describe, expect, test } from "bun:test";
import { FORM_PAUSED_TEXT } from "./form.ts";
import {
  emptyDesign,
  renderPage,
  type FormDefinitions,
  type Layout,
  type LayoutNode,
} from "../index.ts";

const field = (id: string, type: string, props: Record<string, unknown>) =>
  ({ id, type, props }) as LayoutNode;
const layout: Layout = {
  schemaVersion: 14,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [
      {
        id: "form0001",
        type: "form",
        props: { formId: "contact" },
        children: [
          field("sele0001", "select", { field: "topic", label: "Topic" }),
          field("subm0001", "submit", { label: "Send" }),
        ],
      } as LayoutNode,
    ],
  },
};
const paused: FormDefinitions = new Map([
  ["contact", { name: "", slug: "contact", status: "paused", pages: [], settings: {} }],
]);

describe("a paused form (W-326)", () => {
  test("the page says it isn't accepting responses, with no form, fields or Submit", () => {
    const { html } = renderPage(layout, emptyDesign(), { formDefinitions: paused });
    expect(html).toContain(FORM_PAUSED_TEXT);
    expect(html).toContain('role="status"');
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<select");
    expect(html).not.toContain("Send");
  });

  test("an active form still renders its fields", () => {
    const { html } = renderPage(layout, emptyDesign(), { formDefinitions: new Map() });
    expect(html).toContain("<form");
    expect(html).not.toContain(FORM_PAUSED_TEXT);
  });
});
