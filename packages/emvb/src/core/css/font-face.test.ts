import { describe, expect, test } from "bun:test";
import { renderPage } from "../render/index.ts";
import { DesignSystem, emptyDesign, type FontVariable } from "../schema/design.ts";
import type { Layout } from "../schema/layout.ts";
import { cssString, fontFaceCss, fontFaceSrc } from "./font-face.ts";

// W-1072: custom fonts. A font variable's faces become @font-face rules on pages that use it.

const SRC = "/_emdash/api/plugins/emvb/font?id=0123456789abcdef";

const brand = (extra: Partial<FontVariable> = {}): FontVariable => ({
  id: "brand",
  name: "Brand",
  value: "'Brand Sans', sans-serif",
  family: "Brand Sans",
  faces: [
    { weight: 400, style: "normal", src: SRC },
    { weight: 700, style: "italic", src: SRC, unicodeRange: "U+0000-00FF, U+0131" },
  ],
  ...extra,
});

const design = (font: FontVariable | undefined) => {
  const d = emptyDesign();
  d.variables.fonts = font ? [font] : [];
  return d;
};

const page = (fontFamily: unknown) =>
  ({
    schemaVersion: 18,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      ...(fontFamily === undefined ? {} : { style: { fontFamily } }),
      children: [],
    },
  }) as Layout;

describe("custom fonts (W-1072)", () => {
  test("a used font variable emits its faces with font-display swap, before the sheet", () => {
    const { css } = renderPage(page({ var: "brand", from: "font" }), design(brand()));
    expect(
      css.startsWith(
        `@font-face{font-family:"Brand Sans";src:url("${SRC}") format("woff2");font-weight:400;font-style:normal;font-display:swap}` +
          `@font-face{font-family:"Brand Sans";src:url("${SRC}") format("woff2");font-weight:700;font-style:italic;font-display:swap;unicode-range:U+0000-00FF, U+0131}`,
      ),
    ).toBe(true);
  });

  test("an unused font variable sends no font, and a design without faces keeps its exact CSS", () => {
    const unused = renderPage(page(undefined), design(brand())).css;
    expect(unused.includes("@font-face")).toBe(false);
    const { family: _f, faces: _x, ...plain } = brand();
    expect(unused).toBe(renderPage(page(undefined), design(plain)).css);
    const used = page({ var: "brand", from: "font" });
    expect(renderPage(used, design(plain)).css.includes("@font-face")).toBe(false);
  });

  test("the scoped sheet of a theme part keeps the @font-face rule unprefixed", () => {
    const { css } = renderPage(page({ var: "brand", from: "font" }), design(brand()), {
      scope: "hdr",
    });
    expect(css).toContain('@font-face{font-family:"Brand Sans";src:url(');
    expect(css.includes(":where(.emvb-s-hdr) @font-face")).toBe(false);
  });

  test("family names are quoted with every other character escaped", () => {
    expect(cssString("Brand Sans")).toBe('"Brand Sans"');
    expect(cssString('a"}body{color:red')).toBe('"a\\22 \\7d body\\7b color\\3a red"');
    expect(cssString("x\\</style>")).toBe('"x\\5c \\3c \\2f style\\3e "');
  });

  test("an unsafe family, URL or range is never written", () => {
    const sheet = "a{font-family:var(--emvb-f-brand)}";
    expect(fontFaceCss([brand({ family: 'x"}*{color:red' })], sheet)).toBe("");
    for (const src of [
      "javascript:alert(1)",
      "//evil.test/f.woff2",
      'f.woff2") ; x{',
      "/f.woff2){}*{color:red}",
      "data:font/woff2;base64,AAAA",
      "/a b.woff2",
    ]) {
      expect(fontFaceSrc(src)).toBeUndefined();
      expect(fontFaceCss([brand({ faces: [{ weight: 400, style: "normal", src }] })], sheet)).toBe(
        "",
      );
    }
    const range = brand({
      faces: [{ weight: 400, style: "normal", src: SRC, unicodeRange: "U+0;}*{color:red" }],
    });
    expect(fontFaceCss([range], sheet)).toBe("");
    expect(fontFaceSrc("/fonts/brand.woff2?v=1")).toBe("/fonts/brand.woff2?v=1");
  });

  test("a font on another host is never written, so pages ask no third party for fonts", () => {
    const sheet = "a{font-family:var(--emvb-f-brand)}";
    for (const src of [
      "https://fonts.gstatic.com/s/opensans/v40/a.woff2",
      "https://fonts.googleapis.com/css2?family=Open+Sans",
      "https://cdn.example.test/f.woff2",
      "http://127.0.0.1:4411/f.woff2",
      "fonts/relative.woff2",
    ]) {
      expect(fontFaceSrc(src)).toBeUndefined();
      expect(fontFaceCss([brand({ faces: [{ weight: 400, style: "normal", src }] })], sheet)).toBe(
        "",
      );
    }
  });

  test("the design schema takes faces additively and refuses an unsafe family or range", () => {
    expect(DesignSystem.safeParse(design(brand())).success).toBe(true);
    expect(DesignSystem.safeParse(design(brand({ family: 'Brand"' }))).success).toBe(false);
    expect(DesignSystem.safeParse(design(brand({ family: "Brand " }))).success).toBe(false);
    const badRange = brand({
      faces: [{ weight: 400, style: "normal", src: SRC, unicodeRange: "latin" }],
    });
    expect(DesignSystem.safeParse(design(badRange)).success).toBe(false);
    const badStyle = { ...brand(), faces: [{ weight: 400, style: "oblique", src: SRC }] };
    expect(DesignSystem.safeParse(design(badStyle as FontVariable)).success).toBe(false);
    for (const src of ["https://fonts.gstatic.com/s/x.woff2", "//cdn.example.test/x.woff2"]) {
      const offSite = brand({ faces: [{ weight: 400, style: "normal", src }] });
      expect(DesignSystem.safeParse(design(offSite)).success).toBe(false);
    }
  });
});
