import { describe, expect, test } from "bun:test";
import { generateCss } from "../css/generate.ts";
import { emptyDesign } from "../schema/design.ts";
import type { Layout } from "../schema/layout.ts";
import { renderPage } from "../render/index.ts";
import { resolveCascade } from "./cascade.ts";

describe("resolveCascade (W-030, R-021)", () => {
  test("later class styles and local win (table)", () => {
    const a = { color: "#111111", paddingTop: { value: 4, unit: "px" as const } };
    const b = { color: "#222222", fontSize: { value: 18, unit: "px" as const } };
    const local = { color: "#333333" };
    expect(resolveCascade([a, b], local)).toEqual({
      color: "#333333",
      paddingTop: { value: 4, unit: "px" },
      fontSize: { value: 18, unit: "px" },
    });
    expect(resolveCascade([b, a])).toEqual({
      color: "#111111",
      paddingTop: { value: 4, unit: "px" },
      fontSize: { value: 18, unit: "px" },
    });
    expect(resolveCascade([])).toEqual({});
  });
});

describe("style classes CSS + HTML (W-030)", () => {
  test("emits prefixed .emvb-k-* rules before local .emvb-e-*", () => {
    const design = {
      ...emptyDesign(),
      classes: [
        {
          id: "card",
          name: "Card",
          style: { paddingTop: { value: 8, unit: "px" as const }, color: "#abcdef" },
        },
      ],
    };
    const css = generateCss({
      design,
      usedTypes: new Set(["heading"]),
      baseCss: new Map([["heading", ".emvb-heading{margin:0}"]]),
      localRules: [{ id: "head0001", declarations: [{ property: "color", value: "#000000" }] }],
    });
    expect(css).toContain(".emvb-k-card{padding-top:8px;color:#abcdef}");
    expect(css).not.toContain(".card{");
    const classAt = css.indexOf(".emvb-k-card{");
    const localAt = css.indexOf(".emvb-e-head0001{");
    expect(classAt).toBeGreaterThan(-1);
    expect(localAt).toBeGreaterThan(classAt);
  });

  test("editing a class style changes CSS for every user of that class", () => {
    const design = {
      ...emptyDesign(),
      classes: [{ id: "accent", name: "Accent", style: { color: "#ff0000" } }],
    };
    const layout: Layout = {
      schemaVersion: 4,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          {
            id: "head0001",
            type: "heading",
            props: { text: "A", level: 1 },
            classes: ["accent"],
          },
          {
            id: "head0002",
            type: "heading",
            props: { text: "B", level: 2 },
            classes: ["accent"],
          },
        ],
      },
    };
    const first = renderPage(layout, design);
    expect(first.html).toContain('class="emvb-heading emvb-k-accent"');
    expect(first.css).toContain(".emvb-k-accent{color:#ff0000}");

    const updated = {
      ...design,
      classes: [{ id: "accent", name: "Accent", style: { color: "#00ff00" } }],
    };
    const second = renderPage(layout, updated);
    expect(second.css).toContain(".emvb-k-accent{color:#00ff00}");
    expect(second.css).not.toContain("#ff0000");
    // Both elements still share the class token.
    expect(second.html.match(/emvb-k-accent/g)?.length).toBe(2);
  });

  test("local styles win over class styles in the stylesheet order", () => {
    const design = {
      ...emptyDesign(),
      classes: [{ id: "card", name: "Card", style: { color: "#111111" } }],
    };
    const layout: Layout = {
      schemaVersion: 4,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          {
            id: "head0001",
            type: "heading",
            props: { text: "Hi", level: 1 },
            classes: ["card"],
            style: { color: "#eeeeee" },
          },
        ],
      },
    };
    const { css, html } = renderPage(layout, design);
    expect(html).toContain("emvb-k-card");
    expect(html).toContain("emvb-e-head0001");
    expect(css.indexOf(".emvb-k-card{")).toBeLessThan(css.indexOf(".emvb-e-head0001{"));
  });
});
