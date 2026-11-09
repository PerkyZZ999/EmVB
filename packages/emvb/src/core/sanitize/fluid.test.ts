import { describe, expect, test } from "bun:test";
import { StyleProps } from "../schema/style.ts";
import { styleDeclarations } from "./css.ts";

const css = (style: Record<string, unknown>) =>
  Object.fromEntries(styleDeclarations(style).declarations.map((d) => [d.property, d.value]));

describe("fluid sizes (W-955)", () => {
  test("a fluid size is a clamp() from its small to its large value", () => {
    expect(
      css({
        fontSize: { fluid: { min: 32, max: 56 } },
        paddingTop: { fluid: { min: 16, max: 48 } },
        marginLeft: { fluid: { min: 0, max: 24 } },
        width: { fluid: { min: 300, max: 600 } },
        gap: { fluid: { min: 8, max: 8 } },
      }),
    ).toEqual({
      "font-size": "clamp(2rem, 1.413rem + 2.6087vw, 3.5rem)",
      "padding-top": "clamp(1rem, 0.2174rem + 3.4783vw, 3rem)",
      "margin-inline-start": "clamp(0rem, -0.587rem + 2.6087vw, 1.5rem)",
      width: "clamp(18.75rem, 11.413rem + 32.6087vw, 37.5rem)",
      gap: "0.5rem",
    });
  });

  test("a larger small value still keeps the size between the two", () => {
    expect(css({ fontSize: { fluid: { min: 40, max: 20 } } })["font-size"]).toBe(
      "clamp(1.25rem, 2.9891rem + -2.1739vw, 2.5rem)",
    );
  });

  test("the keys that take one accept it", () => {
    for (const key of ["fontSize", "gap", "width", "maxWidth", "paddingLeft", "marginTop"]) {
      expect(StyleProps.safeParse({ [key]: { fluid: { min: 1, max: 2 } } }).success).toBe(true);
    }
  });

  test.each([
    [{ fontSize: { fluid: { min: -1, max: 10 } } }],
    [{ fontSize: { fluid: { min: 1, max: 10_001 } } }],
    [{ fontSize: { fluid: { min: "1rem", max: 10 } } }],
    [{ fontSize: { fluid: { min: 1, max: 10, unit: "vw" } } }],
    [{ fontSize: { fluid: { min: 1 } } }],
    [{ lineHeight: { fluid: { min: 1, max: 2 } } }],
    [{ borderWidth: { fluid: { min: 1, max: 2 } } }],
  ])("refuses %p", (style) => {
    expect(StyleProps.safeParse(style).success).toBe(false);
  });

  test("a hostile stored value writes nothing", () => {
    expect(
      css({ fontSize: { fluid: { min: "1);}body{x:(", max: 2 } }, gap: { fluid: null } }),
    ).toEqual({});
  });
});
