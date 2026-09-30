import { describe, expect, test } from "bun:test";
import { CSS_INJECTION_CORPUS } from "../../../test/fixtures/xss.ts";
import { cssColor, cssFlexDirection, cssLength, isSafeCssValue, styleDeclarations } from "./css.ts";
import { escapeAttr, escapeText } from "./escape.ts";

describe("escaping", () => {
  test("text escapes &, < and >", () => {
    expect(escapeText(`<b>"a" & 'b'</b>`)).toBe(`&lt;b&gt;"a" &amp; 'b'&lt;/b&gt;`);
  });

  test("attributes also escape both quote types", () => {
    expect(escapeAttr(`x" onmouseover='y' <&>`)).toBe(
      "x&quot; onmouseover=&#39;y&#39; &lt;&amp;&gt;",
    );
  });
});

describe("CSS value validators", () => {
  test.each(["}", ";", "</style", "url(", "expression(", "{", "\\", "/*", "@import", "\n"])(
    "the generic guard rejects values containing %p",
    (token) => {
      expect(isSafeCssValue(`red${token}x`)).toBe(false);
    },
  );

  test.each(CSS_INJECTION_CORPUS)(
    "colour rejects %p, as a literal and as a variable id",
    (value) => {
      expect(cssColor(value)).toBeUndefined();
      expect(cssColor({ var: value })).toBeUndefined();
    },
  );

  test("colour accepts hex literals and variable references", () => {
    expect(cssColor("#1A2B3C")).toBe("#1a2b3c");
    expect(cssColor({ var: "brand" })).toBe("var(--emvb-c-brand)");
    expect(cssColor("red")).toBeUndefined();
  });

  test("length accepts only finite, bounded numbers with a known unit", () => {
    expect(cssLength({ value: 16, unit: "px" })).toBe("16px");
    expect(cssLength({ value: 1.5, unit: "rem" })).toBe("1.5rem");
    for (const bad of [
      { value: Number.NaN, unit: "px" },
      { value: Number.POSITIVE_INFINITY, unit: "px" },
      { value: -1, unit: "px" },
      { value: 1, unit: "px;}body{x:y" },
      { value: "1", unit: "px" },
      "16px",
    ]) {
      expect(cssLength(bad)).toBeUndefined();
    }
  });

  test("flex direction is an allowlist", () => {
    expect(cssFlexDirection("row")).toBe("row");
    expect(cssFlexDirection("row;}x{")).toBeUndefined();
  });

  test("styleDeclarations drops unknown and unsafe properties and reports them", () => {
    expect(
      styleDeclarations({
        color: "red;}body{x:y",
        gap: { value: 8, unit: "px" },
        float: "left",
        ["__proto__"]: "x",
      }),
    ).toEqual({
      declarations: [{ property: "gap", value: "8px" }],
      rejected: ["color", "float", "__proto__"],
    });
  });
});
