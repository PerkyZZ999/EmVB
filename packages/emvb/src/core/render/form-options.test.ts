import { describe, expect, test } from "bun:test";
import { defaultElement } from "../elements/index.ts";
import type { FormDefinitions, PublicFormDefinition } from "../forms/definition.ts";
import { emptyDesign } from "../schema/design.ts";
import type { Layout, LayoutNode } from "../schema/layout.ts";
import { renderPage } from "./index.ts";

const field = (type: "select" | "radio", id: string, name: string): LayoutNode =>
  ({ id, type, props: { field: name, label: name } }) as LayoutNode;

const layout: Layout = {
  schemaVersion: 12,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [
      {
        ...defaultElement("form", "form0001"),
        props: { formId: "contact" },
        children: [
          field("select", "sele0001", "topic"),
          field("radio", "radi0001", "size"),
          field("select", "sele0002", "plain"),
          field("radio", "radi0002", "unbound"),
        ],
      } as LayoutNode,
    ],
  },
};

const definition: PublicFormDefinition = {
  name: "Contact",
  slug: "contact",
  status: "active",
  settings: {},
  pages: [
    {
      fields: [
        {
          name: "topic",
          type: "select",
          label: "Topic",
          required: false,
          options: [
            { label: "Sales", value: "sales" },
            { label: "Support", value: "support" },
          ],
        },
        {
          name: "size",
          type: "radio",
          label: "Size",
          required: false,
          options: [
            { label: "Small", value: "s" },
            { label: "Large", value: "l" },
          ],
        },
        { name: "plain", type: "select", label: "Plain", required: false },
      ],
    },
  ],
};

const definitions: FormDefinitions = new Map([["contact", definition]]);

describe("form field options from the bound definition (W-035)", () => {
  const { html } = renderPage(layout, emptyDesign(), { formDefinitions: definitions });

  test("a select lists the definition's options after a blank choice", () => {
    expect(html).toContain(
      '<select class="ec-form-input" id="emvb-field-sele0001" name="topic"><option value="">Choose…</option><option value="sales">Sales</option><option value="support">Support</option></select>',
    );
  });

  test("a radio group lists one labelled radio per option", () => {
    expect(html).toContain(
      '<label class="emvb-form-radio-label"><input type="radio" name="size" value="s"> Small</label><label class="emvb-form-radio-label"><input type="radio" name="size" value="l"> Large</label>',
    );
  });

  test("fields without options, or not in any definition, keep their placeholders", () => {
    expect(html).toContain('name="plain"><option value="">Choose…</option></select>');
    expect(html).toContain('name="unbound" value="a"> Option A');
  });
});
