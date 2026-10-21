import { describe, expect, test } from "bun:test";
import { defaultElement, ELEMENTS } from "../elements/index.ts";
import type { FormDefinitions, PublicFormDefinition } from "../forms/definition.ts";
import { emptyDesign } from "../schema/design.ts";
import type { Layout, LayoutNode } from "../schema/layout.ts";
import { renderPage } from "./index.ts";

const field = (type: "select" | "radio", id: string, name: string): LayoutNode =>
  ({ id, type, props: { field: name, label: name } }) as LayoutNode;

const layout: Layout = {
  schemaVersion: 17,
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
      '<select class="ec-form-input" id="emvb-field-sele0001" name="topic" aria-describedby="emvb-field-sele0001-error"><option value="">Choose…</option><option value="sales">Sales</option><option value="support">Support</option></select>',
    );
  });

  test("a radio group lists one labelled radio per option", () => {
    expect(html).toContain(
      '<label class="emvb-form-radio-label"><input type="radio" name="size" value="s"> Small</label><label class="emvb-form-radio-label"><input type="radio" name="size" value="l"> Large</label>',
    );
  });

  test("fields without options, or not in any definition, keep their placeholders", () => {
    expect(html).toContain(
      'name="plain" aria-describedby="emvb-field-sele0002-error"><option value="">Choose…</option></select>',
    );
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
    schemaVersion: 17,
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
      '<select class="ec-form-input" id="emvb-field-sele0001" name="topic" aria-describedby="emvb-field-sele0001-error" required="">',
    );
    expect(html).toContain(
      '<input type="email" class="ec-form-input" id="emvb-field-text0001" name="email" aria-describedby="emvb-field-text0001-error" required="" minlength="5" maxlength="80" pattern=".+@example.com">',
    );
    expect(html).toContain(
      '<input type="number" class="ec-form-input" id="emvb-field-text0002" name="age" aria-describedby="emvb-field-text0002-error" min="18" max="99" step="any">',
    );
    expect(html).toContain(
      '<input type="date" class="ec-form-input" id="emvb-field-text0003" name="when" aria-describedby="emvb-field-text0003-error">',
    );
    expect(html).toContain(
      '<input type="checkbox" id="emvb-field-chek0001" name="agree" value="true" aria-describedby="emvb-field-chek0001-error" required="">',
    );
    expect(html).toContain('class="emvb-form-required" aria-hidden="true"> *</span>');
    // Topic, Email and I agree carry the mark; Age and When don't.
    const marks = html.split('class="emvb-form-required"').length - 1;
    expect(marks).toBe(3);
    // W-441: the checkbox's mark is hidden from screen readers too, not a plain " *".
    expect(html).toContain('I agree<span class="emvb-form-required" aria-hidden="true"> *</span>');
  });

  test("W-578: a number field takes decimals, as the forms plugin's server does", () => {
    // Without step="any" the browser's step of 1 (counted from min) refused 2.5, and with a
    // min of 0.5 it refused every whole number, so the forms client blocked valid answers.
    expect(html).toMatch(/name="age"[^>]*step="any"/);
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
      '<input type="text" class="ec-form-input" id="emvb-field-text0009" name="nick" aria-label="nick" aria-describedby="emvb-field-text0009-error">',
    );
  });

  test("a form pattern that can hang the browser is left off the control", () => {
    const bad: PublicFormDefinition = {
      ...typed,
      pages: [
        {
          fields: [
            {
              name: "email",
              type: "email",
              label: "Email",
              required: false,
              validation: { pattern: "(a+)+" },
            },
          ],
        },
      ],
    };
    const rendered = renderPage(typedLayout, emptyDesign(), {
      formDefinitions: new Map([["contact", bad]]),
    }).html;
    expect(rendered.includes("pattern=")).toBe(false);
    expect(rendered.includes("(a+)+")).toBe(false);
  });

  test("a pattern browsers refuse in v mode is repaired, not dropped (W-538)", () => {
    const render = (pattern: string) =>
      renderPage(typedLayout, emptyDesign(), {
        formDefinitions: new Map([
          [
            "contact",
            {
              ...typed,
              pages: [
                {
                  fields: [
                    {
                      name: "email",
                      type: "email",
                      label: "Email",
                      required: false,
                      validation: { pattern },
                    },
                  ],
                },
              ],
            },
          ],
        ]),
      }).html;
    expect(render("[A-Za-z0-9_-]+")).toContain('pattern="[A-Za-z0-9_\\-]+"');
    expect(render("[-(a)]+")).toContain('pattern="[\\-\\(a\\)]+"');
    expect(render("[a-z]+")).toContain('pattern="[a-z]+"');
    for (const pattern of ["[A-Za-z0-9_\\-]+", "[\\-\\(a\\)]+"]) {
      expect(() => new RegExp(`^(?:${pattern})$`, "v")).not.toThrow();
    }
  });

  test("a repeated non-capturing or lookahead group is kept (W-594)", () => {
    const render = (pattern: string) =>
      renderPage(typedLayout, emptyDesign(), {
        formDefinitions: new Map([
          [
            "contact",
            {
              ...typed,
              pages: [
                {
                  fields: [
                    {
                      name: "email",
                      type: "email",
                      label: "Email",
                      required: false,
                      validation: { pattern },
                    },
                  ],
                },
              ],
            },
          ],
        ]),
      }).html;
    expect(render("(?:ab)+")).toContain('pattern="(?:ab)+"');
    expect(render("(?=.*\\d)(?:ab)+")).toContain("pattern=");
    expect(render("(?:a+)+")).not.toContain("pattern=");
    expect(render("(?:a|aa)+")).not.toContain("pattern=");
  });

  test("an alternating form pattern that can hang the browser is left off the control", () => {
    const bad: PublicFormDefinition = {
      ...typed,
      pages: [
        {
          fields: [
            {
              name: "email",
              type: "email",
              label: "Email",
              required: false,
              validation: { pattern: "(a|aa)+" },
            },
          ],
        },
      ],
    };
    const rendered = renderPage(typedLayout, emptyDesign(), {
      formDefinitions: new Map([["contact", bad]]),
    }).html;
    expect(rendered.includes("pattern=")).toBe(false);
    expect(rendered.includes("(a|aa)+")).toBe(false);
  });
});

describe("a field uses the form it sits in", () => {
  test("two forms with the same field name keep their own options", () => {
    const select = (id: string): LayoutNode =>
      ({ id, type: "select", props: { field: "topic", label: "Topic" } }) as LayoutNode;
    const form = (id: string, formId: string, fieldId: string): LayoutNode =>
      ({
        id,
        type: "form",
        props: { formId },
        children: [select(fieldId)],
      }) as LayoutNode;
    const page: Layout = {
      schemaVersion: 17,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [form("form0001", "alpha", "sele0001"), form("form0002", "beta", "sele0002")],
      },
    };
    const def = (name: string, value: string): PublicFormDefinition => ({
      name,
      slug: name,
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
              options: [{ label: name, value }],
            },
          ],
        },
      ],
    });
    const html = renderPage(page, emptyDesign(), {
      formDefinitions: new Map([
        ["alpha", def("Alpha", "a")],
        ["beta", def("Beta", "b")],
      ]),
    }).html;
    expect(html).toContain('<option value="a">Alpha</option>');
    expect(html).toContain('<option value="b">Beta</option>');
    expect(html.includes('<option value="a">Alpha</option><option value="b">Beta</option>')).toBe(
      false,
    );
  });

  test("a form inside a synced section uses that section's definition", () => {
    const sectionForm: Layout = {
      schemaVersion: 17,
      root: {
        id: "rootsec1",
        type: "container",
        props: {},
        children: [
          {
            id: "form0001",
            type: "form",
            props: { formId: "newsletter" },
            children: [
              { id: "sele0001", type: "select", props: { field: "topic", label: "Topic" } },
            ],
          } as LayoutNode,
        ],
      },
    };
    const page: Layout = {
      schemaVersion: 17,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          { id: "sec00001", type: "section", props: { partId: "SEC00001" }, children: [] },
        ],
      },
    };
    const html = renderPage(page, emptyDesign(), {
      dynamic: { sectionTemplates: { SEC00001: sectionForm } },
      formDefinitions: new Map([
        [
          "newsletter",
          {
            name: "News",
            slug: "newsletter",
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
                    options: [{ label: "Weekly", value: "weekly" }],
                  },
                ],
              },
            ],
          },
        ],
      ]),
    }).html;
    expect(html).toContain('<option value="weekly">Weekly</option>');
  });
});

describe("radio options keep the group's legend (W-524)", () => {
  const required: FormDefinitions = new Map([
    [
      "contact",
      {
        ...definition,
        pages: [
          {
            fields: [
              {
                name: "size",
                type: "radio",
                label: "Size",
                required: true,
                options: [{ label: "Small", value: "s" }],
              },
            ],
          },
        ],
      } as PublicFormDefinition,
    ],
  ]);
  const { html } = renderPage(layout, emptyDesign(), { formDefinitions: required });

  test("the legend comes first, with the required mark, then the options", () => {
    expect(html).toMatch(
      /<fieldset class="emvb-radio-group" aria-describedby="emvb-field-radi0001-error"><legend class="emvb-form-label" id="emvb-field-radi0001-label">size<span class="emvb-form-required"[^>]*>[^<]*<\/span><\/legend><label class="emvb-form-radio-label"><input type="radio" name="size" value="s" required=""> Small<\/label><\/fieldset>/,
    );
  });
});

describe("W-588: length limits the browser can read", () => {
  const def = (validation: Record<string, number>): FormDefinitions =>
    new Map([
      [
        "contact",
        {
          name: "Contact",
          slug: "contact",
          status: "active",
          settings: {},
          pages: [
            { fields: [{ name: "msg", type: "text", label: "Msg", required: false, validation }] },
          ],
        } as PublicFormDefinition,
      ],
    ]);
  const page = (validation: Record<string, number>) =>
    renderPage(
      {
        schemaVersion: 17,
        root: {
          id: "root0001",
          type: "container",
          props: {},
          children: [
            {
              ...defaultElement("form", "form0001"),
              props: { formId: "contact" },
              children: [
                { id: "text0001", type: "text-input", props: { field: "msg", label: "Msg" } },
              ],
            } as LayoutNode,
          ],
        },
      },
      emptyDesign(),
      { formDefinitions: def(validation) },
    ).html;

  test("a fractional length is rounded inward, not dropped by the browser", () => {
    const html = page({ minLength: 2.5, maxLength: 9.5 });
    expect(html).toContain('minlength="3" maxlength="9"');
  });

  test("a negative or non-finite length is left off", () => {
    const html = page({ minLength: -1, maxLength: Number.NaN });
    expect(html).not.toContain("minlength");
    expect(html).not.toContain("maxlength");
  });
});

describe("W-595: hidden fields of the definition", () => {
  const hiddenLayout: Layout = {
    schemaVersion: 17,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      children: [
        {
          ...defaultElement("form", "form0001"),
          props: { formId: "contact" },
          children: [],
        } as LayoutNode,
      ],
    },
  };
  const withHidden: PublicFormDefinition = {
    name: "Contact",
    slug: "contact",
    status: "active",
    settings: {},
    pages: [
      {
        fields: [
          {
            name: "source",
            type: "hidden",
            label: "Source",
            required: true,
            defaultValue: 'site "a" & b',
          } as PublicFormDefinition["pages"][number]["fields"][number],
          { name: "blank", type: "hidden", label: "Blank", required: false },
        ],
      },
    ],
  };

  test("are sent with the form, as the forms plugin's own embed does", () => {
    const { html } = renderPage(hiddenLayout, emptyDesign(), {
      formDefinitions: new Map([["contact", withHidden]]),
    });
    expect(html).toContain(
      '<input type="hidden" name="source" value="site &quot;a&quot; &amp; b">',
    );
    expect(html).toContain('<input type="hidden" name="blank" value="">');
  });
});

describe("W-596: conditional fields", () => {
  const condLayout: Layout = {
    schemaVersion: 17,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      children: [
        {
          ...defaultElement("form", "form0001"),
          props: { formId: "contact" },
          children: [
            { id: "text0001", type: "text-input", props: { field: "other", label: "Other" } },
            { id: "text0002", type: "text-input", props: { field: "odd", label: "Odd" } },
          ],
        } as LayoutNode,
      ],
    },
  };
  const def = {
    name: "Contact",
    slug: "contact",
    status: "active",
    settings: {},
    pages: [
      {
        fields: [
          {
            name: "other",
            type: "text",
            label: "Other",
            required: true,
            condition: { field: "topic", op: "eq", value: "other" },
          },
          { name: "odd", type: "text", label: "Odd", required: true, condition: { op: 3 } },
        ],
      },
    ],
  } as unknown as PublicFormDefinition;

  test("carry the definition's condition, so the forms client hides them and skips their check", () => {
    const { html } = renderPage(condLayout, emptyDesign(), {
      formDefinitions: new Map([["contact", def]]),
    });
    expect(html).toContain(
      '<div class="emvb-text-input emvb-form-field" data-condition="{&quot;field&quot;:&quot;topic&quot;,&quot;op&quot;:&quot;eq&quot;,&quot;value&quot;:&quot;other&quot;}">',
    );
    expect(html.match(/data-condition=/g)?.length).toBe(1);
  });
});

describe("W-686: a Select's empty choice can be worded for the site", () => {
  test("its Placeholder replaces Choose…, with or without the definition's options", () => {
    const worded = (id: string, name: string) =>
      ({
        id,
        type: "select",
        props: { field: name, label: name, placeholder: "Choisir…" },
      }) as LayoutNode;
    const page: Layout = {
      ...layout,
      root: {
        ...layout.root,
        children: [
          {
            ...defaultElement("form", "form0001"),
            props: { formId: "contact" },
            children: [worded("sele0001", "topic"), worded("sele0002", "plain")],
          } as LayoutNode,
        ],
      },
    };
    const { html } = renderPage(page, emptyDesign(), { formDefinitions: definitions });
    expect(html).toContain(
      'name="topic" aria-describedby="emvb-field-sele0001-error"><option value="">Choisir…</option><option value="sales">',
    );
    expect(html).toContain(
      'name="plain" aria-describedby="emvb-field-sele0002-error"><option value="">Choisir…</option></select>',
    );
    expect(html).not.toContain("Choose…");
  });

  test("the Select's settings offer the Placeholder", () => {
    const fields = ELEMENTS.select.descriptor.fields.map((f) => f.key);
    expect(fields).toContain("placeholder");
  });
});
