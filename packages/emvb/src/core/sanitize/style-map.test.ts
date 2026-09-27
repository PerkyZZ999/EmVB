import { describe, expect, test } from "bun:test";
import { StyleProps } from "../schema/style.ts";
import { CSS_INJECTION_CORPUS } from "../../../test/fixtures/xss.ts";
import { STYLE_PROPERTY_MAP, cssColor, cssLength, styleDeclarations } from "./css.ts";

const len = (value: number, unit: "px" | "rem" | "em" | "%" = "px") => ({ value, unit });

describe("style property map (W-017, R-012)", () => {
  test("every StyleProps key has a CSS mapping", () => {
    const keys = Object.keys(STYLE_PROPERTY_MAP) as (keyof typeof STYLE_PROPERTY_MAP)[];
    expect(keys.length).toBeGreaterThan(20);
    for (const key of keys) {
      expect(STYLE_PROPERTY_MAP[key].css.length).toBeGreaterThan(0);
      // Round-trip: an empty object with only unknown keys is rejected by the schema.
      expect(StyleProps.safeParse({ [key]: undefined }).success).toBe(true);
    }
  });

  test.each([
    ["flexDirection", "row", "flex-direction", "row"],
    ["flexWrap", "wrap", "flex-wrap", "wrap"],
    ["justifyContent", "center", "justify-content", "center"],
    ["alignItems", "flex-start", "align-items", "flex-start"],
    ["gap", len(16), "gap", "16px"],
    ["width", len(100, "%"), "width", "100%"],
    ["minWidth", len(10), "min-width", "10px"],
    ["maxWidth", len(800), "max-width", "800px"],
    ["height", len(40), "height", "40px"],
    ["minHeight", len(48), "min-height", "48px"],
    ["paddingTop", len(8), "padding-top", "8px"],
    ["paddingRight", len(8), "padding-right", "8px"],
    ["paddingBottom", len(8), "padding-bottom", "8px"],
    ["paddingLeft", len(8), "padding-left", "8px"],
    ["marginTop", len(4), "margin-top", "4px"],
    ["marginRight", len(4), "margin-right", "4px"],
    ["marginBottom", len(4), "margin-bottom", "4px"],
    ["marginLeft", len(4), "margin-left", "4px"],
    ["fontSize", len(18), "font-size", "18px"],
    ["fontWeight", 700, "font-weight", "700"],
    ["lineHeight", len(28), "line-height", "28px"],
    ["letterSpacing", len(1), "letter-spacing", "1px"],
    ["textAlign", "center", "text-align", "center"],
    ["textTransform", "uppercase", "text-transform", "uppercase"],
    ["color", "#aabbcc", "color", "#aabbcc"],
    ["backgroundColor", { var: "brand" }, "background-color", "var(--emvb-c-brand)"],
    ["borderWidth", len(1), "border-width", "1px"],
    ["borderStyle", "solid", "border-style", "solid"],
    ["borderColor", "#000000", "border-color", "#000000"],
    ["borderRadius", len(6), "border-radius", "6px"],
  ] as const)("%s maps to %s", (key, raw, css, expected) => {
    const { declarations, rejected } = styleDeclarations({ [key]: raw });
    expect(rejected).toEqual([]);
    expect(declarations).toEqual([{ property: css, value: expected }]);
  });

  test("negative padding is rejected by the schema and the CSS mapper", () => {
    expect(StyleProps.safeParse({ paddingTop: len(-1) }).success).toBe(false);
    expect(cssLength(len(-1))).toBeUndefined();
    expect(styleDeclarations({ paddingTop: len(-1) }).rejected).toContain("paddingTop");
  });

  test.each(CSS_INJECTION_CORPUS)("colour rejects injection %p", (value) => {
    expect(cssColor(value)).toBeUndefined();
    expect(StyleProps.safeParse({ color: value }).success).toBe(false);
  });
});
