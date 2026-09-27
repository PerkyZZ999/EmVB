import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import { renderPage } from "../render/index.ts";
import { successSignalLayout } from "./success-layout.ts";

describe("success-signal layout (W-039)", () => {
  test("public render has no editor-only data-emvb attributes", () => {
    const layout = successSignalLayout({
      formId: "form-1",
      colorVar: "brand",
      classId: "hero",
      imageSrc: "/hero.png",
      heading: "Hello",
    });
    const design = {
      ...emptyDesign(),
      variables: { colors: [{ id: "brand", name: "Brand", value: "#112233" }] },
      classes: [{ id: "hero", name: "Hero", style: { color: "#abcdef" } }],
    };
    const { html, needsFormsRuntime } = renderPage(layout, design);
    expect(needsFormsRuntime).toBe(true);
    expect(html).toContain("data-ec-form");
    expect(html).toContain("Hello");
    expect(html).toContain("emvb-k-hero");
    expect(html).not.toContain("data-emvb");
  });

  test("form submit control and email field are present for visitor submit", () => {
    const layout = successSignalLayout({
      formId: "form-1",
      colorVar: "brand",
      classId: "hero",
      imageSrc: "/hero.png",
      heading: "Hello",
    });
    const { html } = renderPage(layout, emptyDesign());
    expect(html).toContain('name="email"');
    expect(html).toContain("ec-form-submit");
    expect(html).toContain('name="formId"');
  });
});
