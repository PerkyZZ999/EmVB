import { describe, expect, test } from "bun:test";
import { emptyDesign, renderPage, validateDesign } from "../index.ts";
import { generateCss } from "../css/generate.ts";
import type { Layout } from "./layout.ts";

const page = (style: Record<string, unknown>): Layout => ({
  schemaVersion: 1,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [
      {
        id: "head0001",
        type: "heading",
        props: { text: "Hi", level: 2 },
        style: style as never,
      },
    ],
  },
});

describe("design variables (W-028, R-020)", () => {
  test("fonts, fontSizes and spacings emit namespaced custom properties", () => {
    const design = {
      schemaVersion: 1 as const,
      variables: {
        colors: [{ id: "brand", name: "Brand", value: "#112233" }],
        fonts: [{ id: "body", name: "Body", value: "Noto Sans, sans-serif" }],
        fontSizes: [{ id: "lg", name: "Large", value: { value: 24, unit: "px" as const } }],
        spacings: [{ id: "md", name: "Medium", value: { value: 16, unit: "px" as const } }],
      },
    };
    expect(validateDesign(design).ok).toBe(true);
    const css = generateCss({
      design,
      usedTypes: new Set(["heading"]),
      baseCss: new Map([["heading", ".emvb-heading{margin:0}"]]),
      localRules: [],
    });
    expect(css).toContain("--emvb-c-brand:#112233");
    expect(css).toContain("--emvb-f-body:Noto Sans, sans-serif");
    expect(css).toContain("--emvb-fs-lg:24px");
    expect(css).toContain("--emvb-s-md:16px");
  });

  test("length and font refs resolve to the correct custom-property prefixes", () => {
    const design = {
      ...emptyDesign(),
      variables: {
        colors: [],
        fonts: [{ id: "body", name: "Body", value: "Georgia, serif" }],
        fontSizes: [{ id: "lg", name: "Large", value: { value: 20, unit: "px" as const } }],
        spacings: [{ id: "md", name: "Medium", value: { value: 12, unit: "px" as const } }],
      },
    };
    const { css } = renderPage(
      page({
        fontFamily: { var: "body", from: "font" },
        fontSize: { var: "lg", from: "fontSize" },
        paddingTop: { var: "md", from: "spacing" },
      }),
      design,
    );
    expect(css).toContain("font-family:var(--emvb-f-body)");
    expect(css).toContain("font-size:var(--emvb-fs-lg)");
    expect(css).toContain("padding-top:var(--emvb-s-md)");
    expect(css).not.toContain("font-size:var(--emvb-s-");
    expect(css).not.toContain("padding-top:var(--emvb-fs-");
  });

  test("unsafe font stacks are refused by the schema or dropped from CSS", () => {
    const bad = {
      schemaVersion: 1 as const,
      variables: {
        colors: [],
        fonts: [{ id: "x", name: "X", value: "Arial;}body{x:y" }],
        fontSizes: [],
        spacings: [],
      },
    };
    const parsed = validateDesign(bad);
    // Schema may accept the string; generateCss must not emit it.
    if (parsed.ok) {
      const css = generateCss({
        design: parsed.design,
        usedTypes: new Set(),
        baseCss: new Map(),
        localRules: [],
      });
      expect(css).not.toContain(";}body{");
      expect(css).not.toContain("--emvb-f-x:");
    }
  });

  test("legacy designs with only colors still validate", () => {
    expect(
      validateDesign({
        schemaVersion: 1,
        variables: { colors: [{ id: "a", name: "A", value: "#abc" }] },
      }).ok,
    ).toBe(true);
  });
});
