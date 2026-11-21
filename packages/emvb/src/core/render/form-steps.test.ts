import { describe, expect, test } from "bun:test";
import { canDrop } from "../arrange.ts";
import { defaultElement } from "../elements/index.ts";
import type { PublicFormDefinition } from "../forms/definition.ts";
import { nestingIssues } from "../nesting.ts";
import { emptyDesign } from "../schema/design.ts";
import { type Layout, type LayoutNode, validateLayout } from "../index.ts";
import { renderPage } from "./index.ts";

const input = (id: string, field: string, extra: Record<string, unknown> = {}): LayoutNode =>
  ({ id, type: "text-input", props: { field, label: field, ...extra } }) as LayoutNode;

const step = (id: string, title: string | undefined, children: LayoutNode[]): LayoutNode =>
  ({ id, type: "form-step", props: title === undefined ? {} : { title }, children }) as LayoutNode;

const page = (form: Record<string, unknown>, children: LayoutNode[]): Layout => ({
  schemaVersion: 18,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [
      {
        ...defaultElement("form", "form0001"),
        props: { formId: "trip", ...form },
        children,
      } as LayoutNode,
    ],
  },
});

const definition: PublicFormDefinition = {
  name: "Trip",
  slug: "trip",
  status: "active",
  settings: {},
  pages: [
    {
      fields: [
        { name: "name", type: "text", label: "Name", required: true },
        {
          name: "guests",
          type: "number",
          label: "Guests",
          required: true,
          validation: { min: 1, max: 12 },
        },
        { name: "arrive", type: "date", label: "Arrive", required: true },
        { name: "budget", type: "text", label: "Budget", required: false },
        { name: "email", type: "email", label: "Email", required: true },
      ],
    },
  ],
};

const render = (layout: Layout, mode: "public" | "editor" = "public") =>
  renderPage(layout, emptyDesign(), {
    formDefinitions: new Map([["trip", definition]]),
    mode,
  }).html;

describe("form steps (W-1065)", () => {
  const stepped = page({ nextLabel: "Continue", prevLabel: " " }, [
    { id: "text0001", type: "text", props: { text: "Book a trip" } } as LayoutNode,
    step("step0001", "You", [input("inpt0001", "name"), input("inpt0002", "email")]),
    step("step0002", undefined, [input("inpt0003", "guests"), input("inpt0004", "arrive")]),
    { id: "subm0001", type: "submit", props: { label: "Book" } } as LayoutNode,
  ]);

  test("the layout saves: a step is a new optional type", () => {
    expect(validateLayout(stepped).ok).toBe(true);
    expect(nestingIssues(stepped)).toEqual([]);
  });

  test("each step is one of the forms plugin's pages, in order, with the plugin's buttons", () => {
    const html = render(stepped);
    expect(html).not.toContain('data-page="0"><');
    expect(html).toMatch(
      /<fieldset class="emvb-form-step[^"]* ec-form-page" data-page="0" tabindex="-1"><legend class="emvb-form-step-title">You<\/legend>/,
    );
    // An untitled step is named by its place, so screen readers still say which one it is.
    expect(html).toMatch(/data-page="1" tabindex="-1" aria-label="Step 2">/);
    expect(html.indexOf('data-page="0"')).toBeLessThan(html.indexOf('data-page="1"'));
    // Progress before the first step; Previous and Next hidden until the script shows them.
    expect(html.indexOf("data-ec-progress")).toBeLessThan(html.indexOf('data-page="0"'));
    expect(html).toContain(
      '<div class="emvb-form-step-nav"><button type="button" class="emvb-form-step-prev" data-ec-prev="" hidden="">Previous</button><button type="button" class="emvb-form-step-next" data-ec-next="" hidden="">Continue</button></div>',
    );
    // The nav follows the last step; the Submit button and the intro stay outside the pages.
    expect(html.indexOf("emvb-form-step-nav")).toBeGreaterThan(html.indexOf('data-page="1"'));
    expect(html.indexOf("ec-form-submit")).toBeGreaterThan(html.indexOf("emvb-form-step-nav"));
    expect(html.indexOf("Book a trip")).toBeLessThan(html.indexOf('data-page="0"'));
  });

  test("a form without steps keeps its single page, and the nav is only for stepped forms", () => {
    const html = render(page({}, [input("inpt0001", "name")]));
    expect(html).toContain('<div data-page="0">');
    expect(html).not.toContain("data-ec-next");
    expect(html).not.toContain("emvb-form-step");
  });

  test("step titles and button labels are escaped", () => {
    const html = render(
      page({ nextLabel: '<b>"go"</b>' }, [step("step0001", "<img src=x onerror=1>", [])]),
    );
    expect(html).toContain("&lt;img src=x onerror=1&gt;");
    expect(html).toContain('&lt;b&gt;"go"&lt;/b&gt;</button>');
    expect(html).not.toContain("<img src=x");
  });

  test("the step CSS waits for no motion preference before animating", () => {
    const css = renderPage(stepped, emptyDesign(), { mode: "public" }).css;
    expect(css).toContain("@media (prefers-reduced-motion:no-preference)");
    // The forms script hides Submit until the last step; the Submit's own display can't undo it.
    expect(css).toContain(
      ".emvb-form-step-nav [hidden],.emvb-form .ec-form-submit[hidden]{display:none!important}",
    );
  });

  test("the editor canvas shows every step, with the buttons hidden", () => {
    const html = render(stepped, "editor");
    expect(html).toContain('data-page="1"');
    expect(html).not.toContain("<fieldset hidden");
  });

  test("a step goes only directly inside a form", () => {
    const fresh = { kind: "new" as const, node: step("step0009", "x", []) };
    expect(canDrop(stepped, fresh, "form0001").ok).toBe(true);
    expect(canDrop(stepped, fresh, "root0001")).toEqual({
      ok: false,
      reason: "Form steps can only go directly inside a form.",
    });
    expect(canDrop(stepped, fresh, "step0001").ok).toBe(false);
    const nested = page({}, [step("step0001", "a", [step("step0002", "b", [])])]);
    expect(nestingIssues(nested).map((issue) => issue.message)).toEqual([
      "Form steps can only go directly inside a form. (form-step step0002)",
    ]);
    // Fields may go into a step: it sits inside the form.
    expect(canDrop(stepped, { kind: "new", node: input("inpt0009", "x") }, "step0001").ok).toBe(
      true,
    );
  });
});

describe("number and date inputs (W-1065)", () => {
  const html = (children: LayoutNode[]) => render(page({}, children));

  test("a plain text field asked for as a number or a date gets that box and its limits", () => {
    const out = html([
      input("inpt0001", "budget", { inputType: "number", min: 0, max: 5000, step: 50 }),
      input("inpt0002", "name", {
        inputType: "date",
        minDate: "2026-01-01",
        maxDate: "2026-12-31",
      }),
    ]);
    expect(out).toContain(
      '<input type="number" class="ec-form-input" id="emvb-field-inpt0001" name="budget" aria-describedby="emvb-field-inpt0001-error" min="0" max="5000" step="50">',
    );
    expect(out).toContain(
      '<input type="date" class="ec-form-input" id="emvb-field-inpt0002" name="name" aria-describedby="emvb-field-inpt0002-error" required="" min="2026-01-01" max="2026-12-31">',
    );
  });

  test("the form field's own type and limits win over the element's", () => {
    const out = html([
      input("inpt0001", "guests", { inputType: "date", min: -5, max: 40, minDate: "2026-01-01" }),
      input("inpt0002", "email", { inputType: "number", min: 1 }),
      input("inpt0003", "arrive", { minDate: "2026-05-01", min: 3 }),
    ]);
    // Number field: its own 1..12 range, the element's step (none: any), no date limits.
    expect(out).toContain(
      '<input type="number" class="ec-form-input" id="emvb-field-inpt0001" name="guests" aria-describedby="emvb-field-inpt0001-error" required="" min="1" max="12" step="any">',
    );
    // Email field: stays an email box, the element's number limits are dropped.
    expect(out).toContain(
      '<input type="email" class="ec-form-input" id="emvb-field-inpt0002" name="email" aria-describedby="emvb-field-inpt0002-error" required="">',
    );
    // Date field: the element's earliest date, not its number limit.
    expect(out).toContain(
      '<input type="date" class="ec-form-input" id="emvb-field-inpt0003" name="arrive" aria-describedby="emvb-field-inpt0003-error" required="" min="2026-05-01">',
    );
  });

  test("untrusted limits: an empty range, a bad date or a non-number is left off", () => {
    const out = html([
      input("inpt0001", "budget", { inputType: "number", min: 10, max: 1, step: 0 }),
      input("inpt0002", "name", {
        inputType: "date",
        minDate: '2026-02-30"><script>',
        maxDate: "2026-12-31",
      }),
      input("inpt0003", "name", {
        inputType: "date",
        minDate: "2026-12-31",
        maxDate: "2026-01-01",
      }),
    ]);
    expect(out).toContain('name="budget" aria-describedby="emvb-field-inpt0001-error" step="any">');
    expect(out).toContain('required="" max="2026-12-31">');
    expect(out).toContain(
      'id="emvb-field-inpt0003" name="name" aria-describedby="emvb-field-inpt0003-error" required="">',
    );
    expect(out).not.toContain("<script>");
  });

  test("the schema refuses a non-date, a day that doesn't exist and a step of 0", () => {
    const ok = (props: Record<string, unknown>) =>
      validateLayout(page({}, [input("inpt0001", "name", props)])).ok;
    expect(ok({ inputType: "date", minDate: "2026-02-28", maxDate: "2028-02-29" })).toBe(true);
    expect(ok({ minDate: "2026-02-30" })).toBe(false);
    expect(ok({ minDate: "26-1-1" })).toBe(false);
    expect(ok({ step: 0 })).toBe(false);
    expect(ok({ min: 1e13 })).toBe(false);
    expect(ok({ inputType: "time" })).toBe(false);
  });

  test("an unbound preview shows the asked-for box too", () => {
    const editor = renderPage(
      page({ formId: "" }, [input("inpt0001", "budget", { inputType: "number" })]),
      emptyDesign(),
      { mode: "editor" },
    ).html;
    expect(editor).toContain("Bind a form in settings");
    const built = render(
      page({ formId: "none" }, [input("inpt0001", "x", { inputType: "number" })]),
    );
    expect(built).toContain('<input type="number"');
    expect(built).toContain('step="any"');
  });
});
