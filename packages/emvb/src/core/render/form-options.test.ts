import { describe, expect, test } from "bun:test";
import { defaultElement } from "../elements/index.ts";
import type { FormDefinitions, PublicFormDefinition } from "../forms/definition.ts";
import { emptyDesign } from "../schema/design.ts";
import type { Layout, LayoutNode } from "../schema/layout.ts";
import { renderPage } from "./index.ts";

const field = (type: "select" | "radio", id: string, name: string): LayoutNode =>
  ({ id, type, props: { field: name, label: name } }) as LayoutNode;

const layout: Layout = {
  schemaVersion: 13,
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

describe("form fields take the definition's type and limits (W-297)", () => {
  const typed: PublicFormDefinition = {
    name: "Contact",
    slug: "contact",
    status: "active",
    settings: {},
    pages: [
      {
        fields: [
          { name: "topic", type: "select", label: "Topic", required: true },
          {
            name: "email",
            type: "email",
            label: "Email",
            required: true,
            validation: { minLength: 5, maxLength: 80, pattern: ".+@example.com" },
          },
          {
            name: "age",
            type: "number",
            label: "Age",
            required: false,
            validation: { min: 18, max: 99 },
          },
          { name: "agree", type: "checkbox", label: "I agree", required: true },
          { name: "when", type: "date", label: "When", required: false },
        ],
      },
    ],
  };
  const typedLayout: Layout = {
    schemaVersion: 13,
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
            { id: "text0001", type: "text-input", props: { field: "email", label: "Email" } },
            { id: "text0002", type: "text-input", props: { field: "age", label: "Age" } },
            { id: "chek0001", type: "checkbox", props: { field: "agree", label: "I agree" } },
            { id: "text0003", type: "text-input", props: { field: "when", label: "When" } },
          ],
        } as LayoutNode,
      ],
    },
  };

  const html = renderPage(typedLayout, emptyDesign(), {
    formDefinitions: new Map([["contact", typed]]),
  }).html;

  test("the input type, required, limits and a mark reach the markup, and the form skips the browser bubble", () => {
    expect(html).toContain('<form class="emvb-form ec-form" method="POST"');
    expect(html).toContain('novalidate=""');
    expect(html).toContain(
      '<select class="ec-form-input" id="emvb-field-sele0001" name="topic" required="">',
    );
    expect(html).toContain(
      '<input type="email" class="ec-form-input" id="emvb-field-text0001" name="email" required="" minlength="5" maxlength="80" pattern=".+@example.com">',
    );
    expect(html).toContain(
      '<input type="number" class="ec-form-input" id="emvb-field-text0002" name="age" min="18" max="99">',
    );
    expect(html).toContain(
      '<input type="date" class="ec-form-input" id="emvb-field-text0003" name="when">',
    );
    expect(html).toContain(
      '<input type="checkbox" id="emvb-field-chek0001" name="agree" value="true" required="">',
    );
    expect(html).toContain('class="emvb-form-required" aria-hidden="true"> *</span>');
    // Topic and Email carry the mark and I agree ends in one; Age and When don't.
    const marks = html.split('class="emvb-form-required"').length - 1;
    expect(marks).toBe(2);
    expect(html).toContain("> I agree *<");
  });

  test("a field the definition doesn't have keeps a plain, optional text input", () => {
    const extra = renderPage(
      {
        ...typedLayout,
        root: {
          ...typedLayout.root,
          children: [
            {
              ...defaultElement("form", "form0001"),
              props: { formId: "contact" },
              children: [{ id: "text0009", type: "text-input", props: { field: "nick" } }],
            } as LayoutNode,
          ],
        },
      } as Layout,
      emptyDesign(),
      { formDefinitions: new Map([["contact", typed]]) },
    ).html;
    expect(extra).toContain(
      '<input type="text" class="ec-form-input" id="emvb-field-text0009" name="nick">',
    );
  });
});
