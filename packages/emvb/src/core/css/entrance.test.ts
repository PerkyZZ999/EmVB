import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import { LAYOUT_SCHEMA_VERSION, type Layout } from "../schema/layout.ts";
import { styleDeclarations } from "../sanitize/css.ts";
import { renderPage } from "../render/index.ts";

const page = (): Layout => ({
  schemaVersion: LAYOUT_SCHEMA_VERSION,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [
      {
        id: "head0001",
        type: "heading",
        props: { text: "Hello", level: 1 },
        style: { motion: { entrance: { type: "fade-up", duration: 400 } } },
      },
    ],
  },
});

describe("entrance animation", () => {
  test("a fade-up plays once and reduced motion turns it off", () => {
    const { css } = renderPage(page(), emptyDesign());
    expect(css).toContain("@keyframes emvb-fade-up{from{opacity:0;transform:translateY(8px)}");
    expect(css).toContain("animation:emvb-fade-up 400ms ease-out both");
    expect(css).toContain(
      "@media (prefers-reduced-motion: reduce){.emvb-e-head0001{animation:none}}",
    );
  });

  test("an unknown entrance type is dropped", () => {
    const result = styleDeclarations({ entrance: { type: "spin", duration: 400 } });
    expect(result.declarations).toEqual([]);
    expect(result.rejected).toContain("entrance");
  });
});

describe("W-670: an entrance set only in a container query", () => {
  test("sends its keyframes and turns off for reduced motion", () => {
    const layout: Layout = {
      schemaVersion: LAYOUT_SCHEMA_VERSION,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          {
            id: "box00001",
            type: "container",
            props: {},
            children: [],
            query: {
              min: 600,
              style: { motion: { entrance: { type: "fade-up", duration: 400 } } },
            },
          },
        ],
      },
    } as Layout;
    const { css } = renderPage(layout, emptyDesign());
    expect(css).toContain("@container (min-width:600px){.emvb-e-box00001{animation:emvb-fade-up");
    expect(css).toContain("@keyframes emvb-fade-up{");
    expect(css).toContain(
      "@media (prefers-reduced-motion: reduce){.emvb-e-box00001{animation:none}}",
    );
  });
});

describe("W-670: an entrance in a tag default", () => {
  test("sends its keyframes and turns off for reduced motion", () => {
    const design = {
      ...emptyDesign(),
      defaults: { h1: { motion: { entrance: { type: "fade-up", duration: 400 } } } },
    } as ReturnType<typeof emptyDesign>;
    const { css } = renderPage(page(), design);
    expect(css).toContain(":where(.emvb-root) h1{animation:emvb-fade-up");
    expect(css).toContain(
      "@media (prefers-reduced-motion: reduce){.emvb-e-head0001,:where(.emvb-root) h1{animation:none}}",
    );
  });
});
