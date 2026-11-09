/**
 * CSS text from Elementor (Pro custom CSS, Elementor 4 variant CSS) → EmVB style keys (W-945).
 * Only properties EmVB has a setting for, with the same value checks; the rest is reported.
 */
import { ALIGN_ITEMS } from "../../css-keywords.ts";
import { isSafeFontStack } from "../../sanitize/css.ts";
import type { ImportContext } from "./context.ts";
import type { Style } from "./style.ts";
import { color, fontWeight, num, textAlign } from "./values.ts";

const CSS_LENGTH = /^(-?\d+(?:\.\d+)?)(px|rem|em|%|vw|vh|ch)?$/;

function cssLength(value: string, negative = false) {
  const m = CSS_LENGTH.exec(value.trim());
  if (!m) return undefined;
  const n = Number(m[1]);
  if (!negative && n < 0) return undefined;
  if (n !== 0 && !m[2]) return undefined;
  return { value: n, unit: m[2] ?? "px" };
}

const SIDE_KEYS = ["Top", "Right", "Bottom", "Left"] as const;

/**
 * CSS draws a styled side at `medium` width unless told otherwise. EmVB has one border style, so
 * when only some sides are meant to show (their own width or style), the others get width 0.
 */
export function finishBorders(style: Style): void {
  const sides = new Set<string>((style["__styleSides"] as string[] | undefined) ?? []);
  delete style["__styleSides"];
  const styled = style["borderStyle"] !== undefined && style["borderStyle"] !== "none";
  if (!styled || style["borderWidth"] !== undefined) return;
  const widths = SIDE_KEYS.filter((side) => style[`border${side}Width`] !== undefined);
  if (widths.length === 0 && sides.size === 0) return;
  for (const side of SIDE_KEYS) {
    if (style[`border${side}Width`] === undefined && !sides.has(side)) {
      style[`border${side}Width`] = { value: 0, unit: "px" };
    }
  }
}

/** `center center`, `50% 0%`, `top left` … → EmVB's position keywords. */
function objectPosition(value: string): string | undefined {
  const words = value
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((w) => ({ "0%": "left-or-top", "50%": "center", "100%": "right-or-bottom" })[w] ?? w);
  if (words.length === 0 || words.length > 2) return undefined;
  const [first = "center", second = "center"] = words;
  const horizontal =
    [first, second].find((w) => w === "left" || w === "right") ??
    (first === "left-or-top" ? "left" : first === "right-or-bottom" ? "right" : "center");
  const vertical =
    [first, second].find((w) => w === "top" || w === "bottom") ??
    (second === "left-or-top" ? "top" : second === "right-or-bottom" ? "bottom" : "center");
  if (
    ![first, second].every((w) =>
      ["left", "right", "top", "bottom", "center", "left-or-top", "right-or-bottom"].includes(w),
    )
  )
    return undefined;
  if (vertical === "center") return horizontal;
  if (horizontal === "center") return vertical;
  return `${vertical} ${horizontal}`;
}

/** `selector { … }` rules on the element itself (Elementor Pro custom CSS). */
export function customCss(css: string, ctx: ImportContext, name: string): Style {
  const style: Style = {};
  const source = css.slice(0, 20_000).replace(/\/\*[\s\S]*?\*\//g, "");
  const unmapped = new Set<string>();
  let other = false;
  for (const rule of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = (rule[1] ?? "").trim();
    if (selector !== "selector" && selector !== "body") {
      other = true;
      continue;
    }
    for (const declaration of (rule[2] ?? "").split(";")) {
      const at = declaration.indexOf(":");
      if (at === -1) continue;
      const prop = declaration.slice(0, at).trim().toLowerCase();
      const value = declaration
        .slice(at + 1)
        .replace(/!important/i, "")
        .trim();
      if (!prop || !value) continue;
      if (!applyCss(style, prop, value)) unmapped.add(prop);
    }
  }
  if (other)
    ctx.note(
      "approximated",
      name,
      "Custom CSS rules for inner parts or other selectors weren't imported.",
    );
  if (unmapped.size > 0)
    ctx.note(
      "approximated",
      name,
      `Custom CSS properties left out: ${[...unmapped].slice(0, 8).join(", ")}.`,
    );
  finishBorders(style);
  return style;
}

/**
 * Bare declarations (Elementor 4 variant CSS, stored base64 encoded). Returns the style and the
 * property names EmVB has no setting for.
 */
export function declarations(css: string): { style: Style; unmapped: string[] } {
  const style: Style = {};
  const unmapped: string[] = [];
  for (const declaration of css
    .slice(0, 20_000)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(";")) {
    const at = declaration.indexOf(":");
    if (at === -1) continue;
    const prop = declaration.slice(0, at).trim().toLowerCase();
    const value = declaration
      .slice(at + 1)
      .replace(/!important/i, "")
      .trim();
    if (prop && value && !applyCss(style, prop, value)) unmapped.push(prop);
  }
  return { style, unmapped };
}

/** Decodes Elementor 4's `custom_css: { raw }` (base64 of UTF-8 CSS); undefined when it isn't. */
export function decodeRawCss(raw: unknown): string | undefined {
  if (typeof raw !== "string" || raw.length > 40_000 || !/^[A-Za-z0-9+/=\s]*$/.test(raw))
    return undefined;
  try {
    const bytes = Uint8Array.from(atob(raw.replace(/\s+/g, "")), (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return undefined;
  }
}

function applyCss(style: Style, prop: string, value: string): boolean {
  switch (prop) {
    case "color":
    case "background-color": {
      const c = color(value);
      if (!c) return false;
      style[prop === "color" ? "color" : "backgroundColor"] = c;
      return true;
    }
    case "background": {
      const c = color(value);
      if (!c) return false;
      style["backgroundColor"] = c;
      return true;
    }
    case "font-size":
    case "max-width":
    case "min-height":
    case "border-radius":
    case "width": {
      const l = cssLength(value);
      if (!l) return false;
      const keys: Record<string, string> = {
        "font-size": "fontSize",
        "max-width": "maxWidth",
        "min-height": "minHeight",
        "border-radius": "borderRadius",
        width: "width",
      };
      style[keys[prop] ?? prop] = l;
      return true;
    }
    case "font-weight": {
      // Variable fonts allow any weight; EmVB stores hundreds, so 750 becomes 800.
      const n = num(value);
      const w = fontWeight(
        n !== undefined && n >= 1 && n <= 1000
          ? String(Math.min(900, Math.max(100, Math.round(n / 100) * 100)))
          : value,
      );
      if (w === undefined) return false;
      style["fontWeight"] = w;
      return true;
    }
    case "text-align": {
      const a = textAlign(value);
      if (!a) return false;
      style["textAlign"] = a;
      return true;
    }
    case "text-transform":
      if (!["none", "uppercase", "lowercase", "capitalize"].includes(value)) return false;
      style["textTransform"] = value;
      return true;
    case "opacity": {
      const n = num(value);
      if (n === undefined || n < 0 || n > 1) return false;
      style["opacity"] = n;
      return true;
    }
    case "letter-spacing": {
      const l = cssLength(value, true);
      if (!l) return false;
      style["letterSpacing"] = l;
      return true;
    }
    case "place-items":
    case "align-items": {
      const first = value.split(/\s+/)[0] ?? "";
      const mapped = first === "start" ? "flex-start" : first === "end" ? "flex-end" : first;
      if (!(ALIGN_ITEMS as readonly string[]).includes(mapped)) return false;
      style["alignItems"] = mapped;
      return true;
    }
    case "overflow":
    case "overflow-x":
    case "overflow-y": {
      if (!["visible", "hidden", "clip", "scroll", "auto"].includes(value)) return false;
      style[prop === "overflow" ? "overflow" : prop === "overflow-x" ? "overflowX" : "overflowY"] =
        value;
      return true;
    }
    case "font-style":
      if (value !== "normal" && value !== "italic" && value !== "oblique") return false;
      style["fontStyle"] = value === "normal" ? "normal" : "italic";
      return true;
    case "white-space": {
      const mapped = value === "pre" ? "pre-wrap" : value === "break-spaces" ? "pre-wrap" : value;
      if (!["normal", "nowrap", "pre-line", "pre-wrap"].includes(mapped)) return false;
      style["whiteSpace"] = mapped;
      return true;
    }
    case "overflow-wrap":
    case "word-wrap":
      if (!["normal", "break-word", "anywhere"].includes(value)) return false;
      style["overflowWrap"] = value;
      return true;
    case "object-position": {
      const position = objectPosition(value);
      if (!position) return false;
      style["objectPosition"] = position;
      return true;
    }
    case "font-family": {
      const stack = value.replace(/'/g, '"').trim();
      if (!isSafeFontStack(stack)) return false;
      style["fontFamily"] = stack;
      return true;
    }
    case "gap":
    case "column-gap": {
      const parts = value.split(/\s+/);
      const l = cssLength(parts[parts.length - 1] ?? "");
      if (!l) return false;
      style["gap"] = l;
      return true;
    }
    case "border-style":
    case "border-top-style":
    case "border-right-style":
    case "border-bottom-style":
    case "border-left-style": {
      // EmVB has one border style. A side style is remembered (`__styleSides`) so the other
      // sides get width 0 when the element's style is finished.
      if (!["none", "solid", "dashed", "dotted"].includes(value)) return false;
      style["borderStyle"] = value;
      const side = prop.split("-")[1] ?? "";
      if (prop !== "border-style" && value !== "none") {
        const sides = (style["__styleSides"] as string[] | undefined) ?? [];
        style["__styleSides"] = [...sides, side.charAt(0).toUpperCase() + side.slice(1)];
      }
      return true;
    }
    case "border-color":
    case "border-top-color":
    case "border-right-color":
    case "border-bottom-color":
    case "border-left-color": {
      const c = color(value);
      if (!c) return false;
      style["borderColor"] = c;
      return true;
    }
    case "border-top-width":
    case "border-right-width":
    case "border-bottom-width":
    case "border-left-width": {
      const l = cssLength(value);
      if (!l) return false;
      const side = prop.split("-")[1] ?? "";
      style[`border${side.charAt(0).toUpperCase()}${side.slice(1)}Width`] = l;
      return true;
    }
    case "border":
    case "border-top":
    case "border-right":
    case "border-bottom":
    case "border-left": {
      // `1px solid #ddd` in any order.
      let ok = false;
      for (const part of value.split(/\s+(?![^(]*\))/)) {
        if (["none", "solid", "dashed", "dotted"].includes(part)) {
          style["borderStyle"] = part;
          ok = true;
        } else if (cssLength(part)) {
          const side = prop === "border" ? "" : (prop.split("-")[1] ?? "");
          style[
            side ? `border${side.charAt(0).toUpperCase()}${side.slice(1)}Width` : "borderWidth"
          ] = cssLength(part);
          ok = true;
        } else if (color(part)) {
          style["borderColor"] = color(part);
          ok = true;
        }
      }
      return ok;
    }
    case "line-height": {
      // `normal` is about 1.2 for most text fonts.
      if (value === "normal") {
        style["lineHeight"] = 1.2;
        return true;
      }
      const n = num(value);
      if (n !== undefined && n >= 0 && n <= 100) {
        style["lineHeight"] = n;
        return true;
      }
      const l = cssLength(value);
      if (!l) return false;
      style["lineHeight"] = l;
      return true;
    }
    case "padding":
    case "margin": {
      const parts = value
        .split(/\s+/)
        .map((v) => (v === "auto" && prop === "margin" ? "auto" : cssLength(v, prop === "margin")));
      if (parts.length === 0 || parts.length > 4 || parts.some((p) => p === undefined))
        return false;
      const [t, r = t, b = t, l = r] = parts;
      const base = prop === "padding" ? "padding" : "margin";
      if (prop === "padding" && [t, r, b, l].includes("auto")) return false;
      style[`${base}Top`] = t;
      style[`${base}Right`] = r;
      style[`${base}Bottom`] = b;
      style[`${base}Left`] = l;
      return true;
    }
    default:
      return false;
  }
}
