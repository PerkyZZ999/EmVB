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
    ["paddingRight", len(8), "padding-inline-end", "8px"],
    ["paddingBottom", len(8), "padding-bottom", "8px"],
    ["paddingLeft", len(8), "padding-inline-start", "8px"],
    ["marginTop", len(4), "margin-top", "4px"],
    ["marginRight", len(4), "margin-inline-end", "4px"],
    ["marginBottom", len(4), "margin-bottom", "4px"],
    ["marginLeft", len(4), "margin-inline-start", "4px"],
    ["fontSize", len(18), "font-size", "18px"],
    ["fontWeight", 700, "font-weight", "700"],
    ["lineHeight", len(28), "line-height", "28px"],
    ["letterSpacing", len(1), "letter-spacing", "1px"],
    ["textAlign", "center", "text-align", "center"],
    ["textTransform", "uppercase", "text-transform", "uppercase"],
    ["textDecoration", "line-through", "text-decoration", "line-through"],
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

  test.each([
    ["width", { value: 50, unit: "vw" }, "width", "50vw"],
    ["minHeight", { value: 100, unit: "vh" }, "min-height", "100vh"],
    ["width", "auto", "width", "auto"],
    ["height", "auto", "height", "auto"],
    ["marginLeft", "auto", "margin-inline-start", "auto"],
    ["marginRight", "auto", "margin-inline-end", "auto"],
    ["marginTop", "auto", "margin-top", "auto"],
    ["marginBottom", "auto", "margin-bottom", "auto"],
  ] as const)("W-088: %s accepts %p", (key, raw, css, expected) => {
    expect(StyleProps.safeParse({ [key]: raw }).success).toBe(true);
    expect(styleDeclarations({ [key]: raw })).toEqual({
      declarations: [{ property: css, value: expected }],
      rejected: [],
    });
  });

  test.each(["minWidth", "maxWidth", "minHeight", "paddingTop", "gap", "fontSize", "borderRadius"])(
    "W-088: %s refuses auto in the schema and the CSS mapper",
    (key) => {
      expect(StyleProps.safeParse({ [key]: "auto" }).success).toBe(false);
      expect(styleDeclarations({ [key]: "auto" }).rejected).toEqual([key]);
    },
  );

  test.each(["vmin", "ex", "pt", "AUTO", " auto", "auto;x", "calc(1px)"])(
    "W-088: an unknown unit or keyword %p is refused",
    (bad) => {
      const raw =
        bad.startsWith("v") || bad === "ex" || bad === "pt" ? { value: 1, unit: bad } : bad;
      expect(StyleProps.safeParse({ width: raw }).success).toBe(false);
      expect(styleDeclarations({ width: raw }).rejected).toEqual(["width"]);
    },
  );

  test.each([
    ["maxHeight", len(400), "max-height", "400px"],
    ["overflow", "hidden", "overflow", "hidden"],
    ["overflow", "clip", "overflow", "clip"],
    ["aspectRatio", "16/9", "aspect-ratio", "16 / 9"],
    ["aspectRatio", "9999/1", "aspect-ratio", "9999 / 1"],
    ["aspectRatio", "auto", "aspect-ratio", "auto"],
    ["objectFit", "cover", "object-fit", "cover"],
    ["objectFit", "scale-down", "object-fit", "scale-down"],
  ] as const)("W-088 Size: %s %p maps to %s", (key, raw, css, expected) => {
    expect(StyleProps.safeParse({ [key]: raw }).success).toBe(true);
    expect(styleDeclarations({ [key]: raw })).toEqual({
      declarations: [{ property: css, value: expected }],
      rejected: [],
    });
  });

  test.each([
    ["overflow", "overlay"],
    ["objectFit", "stretch"],
    ["aspectRatio", "0/9"],
    ["aspectRatio", "16/0"],
    ["aspectRatio", "16 / 9"],
    ["aspectRatio", "1.5"],
    ["aspectRatio", "10000/1"],
    ["aspectRatio", "16/9;color:red"],
    ["aspectRatio", 1.5],
    ["maxHeight", "auto"],
  ] as const)("W-088 Size: %s refuses %p", (key, raw) => {
    expect(StyleProps.safeParse({ [key]: raw }).success).toBe(false);
    expect(styleDeclarations({ [key]: raw }).rejected).toEqual([key]);
  });

  test.each(CSS_INJECTION_CORPUS)(
    "W-088 Size: keywords and ratios reject injection %p",
    (value) => {
      for (const key of ["overflow", "aspectRatio", "objectFit"]) {
        expect(StyleProps.safeParse({ [key]: value }).success).toBe(false);
        expect(styleDeclarations({ [key]: value }).rejected).toEqual([key]);
      }
    },
  );

  test.each([
    ["position", "sticky", "position", "sticky"],
    ["top", { value: -12, unit: "px" }, "top", "-12px"],
    ["right", { value: 10, unit: "%" }, "inset-inline-end", "10%"],
    ["bottom", "auto", "bottom", "auto"],
    ["left", { var: "gap", from: "spacing" }, "inset-inline-start", "var(--emvb-s-gap)"],
    ["left", { value: -10_000, unit: "vw" }, "inset-inline-start", "-10000vw"],
    ["zIndex", 10, "z-index", "10"],
    ["zIndex", -9999, "z-index", "-9999"],
  ] as const)("W-088 Position: %s %p maps to %s", (key, raw, css, expected) => {
    expect(StyleProps.safeParse({ [key]: raw }).success).toBe(true);
    expect(styleDeclarations({ [key]: raw })).toEqual({
      declarations: [{ property: css, value: expected }],
      rejected: [],
    });
  });

  test.each([
    ["position", "inherit"],
    ["top", { value: -10_001, unit: "px" }],
    ["top", { value: 10_001, unit: "px" }],
    ["right", { value: 1, unit: "pt" }],
    ["bottom", "calc(1px)"],
    ["zIndex", 1.5],
    ["zIndex", 10_000],
    ["zIndex", "10"],
    ["zIndex", Number.NaN],
  ] as const)("W-088 Position: %s refuses %p", (key, raw) => {
    expect(StyleProps.safeParse({ [key]: raw }).success).toBe(false);
    expect(styleDeclarations({ [key]: raw }).rejected).toEqual([key]);
  });

  test("W-088 Position: only offsets (and margins, W-331) may be negative", () => {
    for (const key of ["paddingTop", "width", "gap"]) {
      expect(StyleProps.safeParse({ [key]: len(-1) }).success).toBe(false);
      expect(styleDeclarations({ [key]: len(-1) }).rejected).toEqual([key]);
    }
  });

  const shadow = { x: 0, y: 4, blur: 12, spread: 0 };

  test.each([
    ["opacity", 0.5, "opacity", "0.5"],
    ["opacity", 0, "opacity", "0"],
    ["boxShadow", { ...shadow, color: "#0000002e" }, "box-shadow", "0px 4px 12px 0px #0000002e"],
    [
      "boxShadow",
      { x: 1, y: -2, blur: 0, spread: -3, color: { var: "ink" }, inset: true },
      "box-shadow",
      "inset 1px -2px 0px -3px var(--emvb-c-ink)",
    ],
    ["boxShadow", { ...shadow, inset: false }, "box-shadow", "0px 4px 12px 0px"],
    [
      "filter",
      { hueRotate: 90, blur: 4, brightness: 120 },
      "filter",
      "blur(4px) brightness(120%) hue-rotate(90deg)",
    ],
    [
      "filter",
      { grayscale: 100, saturate: 0, contrast: 300 },
      "filter",
      "contrast(300%) saturate(0%) grayscale(100%)",
    ],
    ["cursor", "not-allowed", "cursor", "not-allowed"],
  ] as const)("W-088 Effects: %s %p maps to %s", (key, raw, css, expected) => {
    expect(StyleProps.safeParse({ [key]: raw }).success).toBe(true);
    expect(styleDeclarations({ [key]: raw })).toEqual({
      declarations: [{ property: css, value: expected }],
      rejected: [],
    });
  });

  test.each([
    ["opacity", 1.5],
    ["opacity", -0.1],
    ["opacity", "0.5"],
    ["boxShadow", { ...shadow, blur: -1 }],
    ["boxShadow", { ...shadow, x: 1001 }],
    ["boxShadow", { ...shadow, color: "red" }],
    ["boxShadow", { ...shadow, color: "#000;x:y" }],
    ["boxShadow", { ...shadow, inset: "yes" }],
    ["boxShadow", { ...shadow, extra: 1 }],
    ["boxShadow", { x: 0, y: 4 }],
    ["boxShadow", "0 4px 12px black"],
    ["filter", {}],
    ["filter", { brightness: 301 }],
    ["filter", { blur: -1 }],
    ["filter", { sepia: 50 }],
    ["filter", { blur: 1, sepia: 50 }],
    ["filter", "blur(4px)"],
    ["cursor", "auto"],
    ["cursor", "url(x.png), pointer"],
  ] as const)("W-088 Effects: %s refuses %p", (key, raw) => {
    expect(StyleProps.safeParse({ [key]: raw }).success).toBe(false);
    expect(styleDeclarations({ [key]: raw }).rejected).toEqual([key]);
  });

  test("W-088 Effects: a non-colour variable on the shadow is dropped, as on Color", () => {
    const raw = { ...shadow, color: { var: "gap", from: "spacing" } };
    expect(styleDeclarations({ boxShadow: raw }).rejected).toEqual(["boxShadow"]);
    expect(styleDeclarations({ color: raw.color }).rejected).toEqual(["color"]);
  });

  test("negative padding is rejected by the schema and the CSS mapper", () => {
    expect(StyleProps.safeParse({ paddingTop: len(-1) }).success).toBe(false);
    expect(cssLength(len(-1))).toBeUndefined();
    expect(styleDeclarations({ paddingTop: len(-1) }).rejected).toContain("paddingTop");
  });

  test("a local font stack may quote family names (QA-1)", () => {
    const value = `'Inter', "Noto Sans", sans-serif`;
    expect(StyleProps.safeParse({ fontFamily: value }).success).toBe(true);
    expect(styleDeclarations({ fontFamily: value })).toEqual({
      declarations: [{ property: "font-family", value }],
      rejected: [],
    });
  });

  test.each([...CSS_INJECTION_CORPUS, "'Inter", "'a'}b{", "'a\\'", "'a</style>'"])(
    "font family rejects injection %p",
    (value) => {
      expect(StyleProps.safeParse({ fontFamily: value }).success).toBe(false);
      expect(styleDeclarations({ fontFamily: value }).rejected).toEqual(["fontFamily"]);
    },
  );

  test.each(CSS_INJECTION_CORPUS)("colour rejects injection %p", (value) => {
    expect(cssColor(value)).toBeUndefined();
    expect(StyleProps.safeParse({ color: value }).success).toBe(false);
  });
});
