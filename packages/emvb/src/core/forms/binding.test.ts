import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import type { Layout } from "../schema/layout.ts";
import { renderPage } from "../render/index.ts";
import { findMissingRequiredFields } from "./binding.ts";
import type { PublicFormDefinition } from "./definition.ts";

const definition = (_id: string): PublicFormDefinition => ({
  name: "Contact",
  slug: "contact",
  status: "active",
  pages: [
    {
      fields: [
        { name: "email", type: "email", label: "Email", required: true },
        { name: "note", type: "textarea", label: "Note", required: false },
      ],
    },
  ],
  settings: { spamProtection: "honeypot", submitLabel: "Send" },
});

const layoutWithForm = (withEmail: boolean): Layout => ({
  schemaVersion: 10,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [
      {
        id: "form0001",
        type: "form",
        props: { formId: "form-1" },
        children: [
          ...(withEmail
            ? [
                {
                  id: "inp00001",
                  type: "text-input" as const,
                  props: { field: "email", label: "Email" },
                },
              ]
            : []),
          { id: "sub00001", type: "submit", props: { label: "Send" } },
        ],
      },
    ],
  },
});

describe("form binding (W-035)", () => {
  test("flags required fields with no bound input", () => {
    const definitions = new Map([["form-1", definition("form-1")]]);
    expect(findMissingRequiredFields(layoutWithForm(false), definitions)).toEqual([
      { formNodeId: "form0001", formId: "form-1", field: "email" },
    ]);
    expect(findMissingRequiredFields(layoutWithForm(true), definitions)).toEqual([]);
  });
});

describe("forms markup contract (W-035)", () => {
  test("emits data-ec-form, data-page, honeypot, and needsFormsRuntime", () => {
    const definitions = new Map([["form-1", definition("form-1")]]);
    const { html, needsFormsRuntime } = renderPage(layoutWithForm(true), emptyDesign(), {
      formDefinitions: definitions,
    });
    expect(needsFormsRuntime).toBe(true);
    expect(html).toContain("data-ec-form");
    expect(html).toContain('data-form-id="form-1"');
    expect(html).toContain('data-page="0"');
    expect(html).toContain('name="formId"');
    expect(html).toContain('name="_hp"');
    expect(html).toContain("data-form-status");
    expect(html).toContain("ec-form-submit");
    expect(html).toContain('data-error-for="email"');
  });

  test("pages without a form stay needsFormsRuntime false", () => {
    const layout: Layout = {
      schemaVersion: 10,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [{ id: "head0001", type: "heading", props: { text: "Hi", level: 1 } }],
      },
    };
    const result = renderPage(layout, emptyDesign());
    expect(result.needsFormsRuntime).toBe(false);
    expect(result.html).not.toContain("data-ec-form");
  });
});

describe("forms submit contract (W-037)", () => {
  test("hidden formId matches the bound form props", () => {
    const definitions = new Map([["form-1", definition("form-1")]]);
    const { html } = renderPage(layoutWithForm(true), emptyDesign(), {
      formDefinitions: definitions,
    });
    expect(html).toMatch(/name="formId"[^>]*value="form-1"|value="form-1"[^>]*name="formId"/);
  });

  test("a page with a form always needs the forms runtime", () => {
    const { needsFormsRuntime } = renderPage(layoutWithForm(true), emptyDesign());
    expect(needsFormsRuntime).toBe(true);
  });
});

describe("unbound form preview (QA)", () => {
  test("empty formId shows an editor placeholder and is omitted publicly", () => {
    const layout: Layout = {
      schemaVersion: 10,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [{ id: "form0001", type: "form", props: { formId: "" }, children: [] }],
      },
    };
    const editor = renderPage(layout, emptyDesign(), { mode: "editor" });
    expect(editor.html).toContain("data-emvb-form-unbound");
    expect(editor.html).toContain("Bind a form in settings");
    expect(editor.html).not.toContain("data-ec-form");
    expect(editor.needsFormsRuntime).toBe(false);

    const pub = renderPage(layout, emptyDesign());
    expect(pub.html).not.toContain("data-ec-form");
    expect(pub.html).not.toContain("data-emvb-form-unbound");
    expect(pub.needsFormsRuntime).toBe(false);
  });
});
