import { FONT_FAMILY_NAME, UNICODE_RANGE } from "../schema/design.ts";
import type { FontFace, FontVariable } from "../schema/design.ts";
import { fontVariableName } from "../sanitize/css.ts";
import { sanitizeMediaUrl } from "../sanitize/media-url.ts";

/**
 * W-1072: the characters a font file URL may hold in the emitted CSS. A URL that passes the media
 * URL check may still hold braces, parentheses, `;` or spaces, which are harmless inside a quoted
 * `url("…")` but would confuse the scoping pass, so those URLs are left out.
 */
const SRC_CHARS = /^[A-Za-z0-9\-._~:/?#[\]@!$&*+,=%]+$/;

/**
 * A font file URL safe to write in `url("…")`, or undefined. Only a path on the site itself
 * (`/…`, never `//host`): a page must not ask Google Fonts or any other host for a font, even when
 * a design was edited by hand, imported or written by an agent.
 */
export function fontFaceSrc(src: string): string | undefined {
  const url = sanitizeMediaUrl(src);
  if (!url?.startsWith("/") || url.startsWith("//")) return undefined;
  return SRC_CHARS.test(url) ? url : undefined;
}

/**
 * A double-quoted CSS string. Letters, digits, spaces, `_`, `.` and `-` stay as they are; any
 * other character (a quote, a backslash, a newline, `<`) is written as a hex escape.
 */
export function cssString(value: string): string {
  let out = "";
  for (const ch of value) {
    out += /^[\p{L}\p{N} _.-]$/u.test(ch) ? ch : `\\${(ch.codePointAt(0) ?? 0).toString(16)} `;
  }
  return `"${out}"`;
}

function faceRule(family: string, face: FontFace): string | undefined {
  const src = fontFaceSrc(face.src);
  if (!src) return undefined;
  if (!Number.isInteger(face.weight) || face.weight < 1 || face.weight > 1000) return undefined;
  if (face.style !== "normal" && face.style !== "italic") return undefined;
  const range =
    face.unicodeRange !== undefined && face.unicodeRange.length <= 1000
      ? UNICODE_RANGE.test(face.unicodeRange)
        ? `;unicode-range:${face.unicodeRange}`
        : undefined
      : "";
  if (range === undefined) return undefined;
  return `@font-face{font-family:${cssString(family)};src:url("${src}") format("woff2");font-weight:${face.weight};font-style:${face.style};font-display:swap${range}}`;
}

/** Every `@font-face` rule of one font variable, whether a page uses it or not. */
export function fontFaceRules(font: Pick<FontVariable, "family" | "faces">): string[] {
  const family = font.family;
  if (!family || !FONT_FAMILY_NAME.test(family)) return [];
  const rules = (font.faces ?? []).flatMap((face) => faceRule(family, face) ?? []);
  return [...new Set(rules)];
}

/**
 * W-1072: the `@font-face` rules of the font variables `sheet` uses (`var(--emvb-f-<id>)`), so a
 * page downloads only the fonts it shows. Empty when no used variable has custom faces, so every
 * existing design keeps the exact CSS it had.
 */
export function fontFaceCss(fonts: readonly FontVariable[] | undefined, sheet: string): string {
  const rules = (fonts ?? []).flatMap((font) => {
    const name = fontVariableName(font.id);
    if (!name || !font.faces?.length) return [];
    if (!sheet.includes(`var(${name})`) && !sheet.includes(`var(${name},`)) return [];
    return fontFaceRules(font);
  });
  return [...new Set(rules)].join("");
}
