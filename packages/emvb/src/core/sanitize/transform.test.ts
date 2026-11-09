import { describe, expect, test } from "bun:test";
import { CSS_INJECTION_CORPUS } from "../../../test/fixtures/xss.ts";
import { renderPage } from "../render/index.ts";
import { emptyDesign } from "../schema/design.ts";
import type { Layout } from "../schema/layout.ts";
import { StyleProps } from "../schema/style.ts";
import { styleDeclarations, stateDeclarations } from "./css.ts";

describe("transforms (W-953)", () => {
  test("move, scale and rotate are CSS's own properties, only those set", () => {
    expect(styleDeclarations({ transform: { x: 8, y: -4, scale: 105, rotate: -15 } })).toEqual({
      declarations: [
        { property: "translate", value: "8px -4px" },
        { property: "scale", value: "1.05" },
        { property: "rotate", value: "-15deg" },
      ],
      rejected: [],
    });
    expect(styleDeclarations({ transform: { y: -4 } }).declarations).toEqual([
      { property: "translate", value: "0px -4px" },
    ]);
  });

  test.each([
    [{}],
    [{ x: 2001 }],
    [{ y: 1.5 }],
    [{ scale: 5 }],
    [{ scale: 401 }],
    [{ rotate: 361 }],
    [{ skew: 10 }],
    [{ x: "8px" }],
  ])("refuses %p", (transform) => {
    expect(StyleProps.safeParse({ transform }).success).toBe(false);
    expect(styleDeclarations({ transform }).rejected).toEqual(["transform"]);
  });

  test.each(CSS_INJECTION_CORPUS)("never writes %p", (value) => {
    expect(styleDeclarations({ transform: { x: value } }).rejected).toEqual(["transform"]);
  });

  test("a hover transform is a lift, animated by a transform transition", () => {
    const { states } = stateDeclarations({ hover: { transform: { y: -4 } } });
    expect(states["hover"]).toEqual([{ property: "translate", value: "0px -4px" }]);
    const { declarations } = styleDeclarations({
      // The flat form the CSS generator passes (stored under `motion.transition`).
      transition: { duration: 200, easing: "ease-out", property: "transform" },
    });
    expect(declarations).toEqual([
      {
        property: "transition",
        value: "translate 200ms ease-out,scale 200ms ease-out,rotate 200ms ease-out",
      },
    ]);
  });

  test("an entrance (which animates transform) and a transform both reach the page", () => {
    const page: Layout = {
      schemaVersion: 18,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        style: {
          transform: { rotate: 3 },
          motion: { entrance: { type: "fade-up", duration: 400 } },
        },
        states: { hover: { transform: { y: -6 } } },
        children: [],
      },
    };
    const { css } = renderPage(page, emptyDesign());
    expect(css).toContain("rotate:3deg");
    expect(css).toContain("animation:emvb-fade-up");
    expect(css).toMatch(/:hover\{[^}]*translate:0px -6px/);
  });
});
