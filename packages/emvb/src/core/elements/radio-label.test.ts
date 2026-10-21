import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import type { Layout } from "../schema/layout.ts";
import { renderPage } from "../render/index.ts";

describe("radio group is named by its legend (W-442, W-524)", () => {
  test("the question is the fieldset's legend; no label points at nothing", () => {
    const html = renderPage(
      {
        schemaVersion: 15,
        root: {
          id: "root0001",
          type: "container",
          props: {},
          children: [
            {
              id: "form0001",
              type: "form",
              props: { formId: "f1" },
              children: [
                { id: "radi0001", type: "radio", props: { field: "plan", label: "Plan" } },
              ],
            },
          ],
        },
      } as unknown as Layout,
      emptyDesign(),
    ).html;
    expect(html).toContain(
      '<fieldset class="emvb-radio-group" aria-describedby="emvb-field-radi0001-error"><legend class="emvb-form-label" id="emvb-field-radi0001-label">Plan</legend>',
    );
    expect(html).not.toContain('<label class="emvb-form-label"');
    expect(html).not.toContain("aria-labelledby");
    expect(html).not.toContain('for="emvb-field-radi0001"');
  });
});
