import type { StyleProps } from "../schema/style.ts";

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const VAR_ID = /^[a-z0-9-]{1,40}$/;
const UNITS = new Set(["px", "rem", "em", "%"]);
const FLEX_DIRECTIONS = new Set(["row", "column", "row-reverse", "column-reverse"]);
const FLEX_WRAPS = new Set(["nowrap", "wrap", "wrap-reverse"]);
const JUSTIFY = new Set([
  "flex-start",
  "flex-end",
  "center",
  "space-between",
  "space-around",
  "space-evenly",
]);
const ALIGN = new Set(["stretch", "flex-start", "flex-end", "center", "baseline"]);
const TEXT_ALIGN = new Set(["left", "center", "right", "justify"]);
const TEXT_TRANSFORM = new Set(["none", "uppercase", "lowercase", "capitalize"]);
const BORDER_STYLE = new Set(["none", "solid", "dashed", "dotted"]);
const FONT_WEIGHT = new Set(["normal", "bold", "400", "500", "600", "700"]);
const FORBIDDEN = /[{};<>\\"'`]|\/\*|url\(|expression\(|@import|javascript:/i;

/** Last line of defence on every emitted value, even ones built by the typed validators below. */
export function isSafeCssValue(value: string): boolean {
  return value.length > 0 && value.length <= 200 && !FORBIDDEN.test(value) && !/[\n\r]/.test(value);
}

export function colorVariableName(id: string): string | undefined {
  return VAR_ID.test(id) ? `--emvb-c-${id}` : undefined;
}

export function fontVariableName(id: string): string | undefined {
  return VAR_ID.test(id) ? `--emvb-f-${id}` : undefined;
}

export function fontSizeVariableName(id: string): string | undefined {
  return VAR_ID.test(id) ? `--emvb-fs-${id}` : undefined;
}

export function spacingVariableName(id: string): string | undefined {
  return VAR_ID.test(id) ? `--emvb-s-${id}` : undefined;
}

type VarFrom = "color" | "font" | "fontSize" | "spacing";

function refOf(value: object): { id: string; from: VarFrom } | undefined {
  if (!("var" in value) || typeof (value as { var?: unknown }).var !== "string") return undefined;
  const id = (value as { var: string }).var;
  if (!VAR_ID.test(id)) return undefined;
  const from = (value as { from?: unknown }).from;
  if (from === undefined || from === "color") return { id, from: "color" };
  if (from === "font" || from === "fontSize" || from === "spacing") return { id, from };
  return undefined;
}

export function cssColor(value: unknown): string | undefined {
  if (typeof value === "string") return HEX_COLOR.test(value) ? value.toLowerCase() : undefined;
  if (typeof value === "object" && value !== null) {
    const ref = refOf(value);
    if (!ref || ref.from !== "color") return undefined;
    const name = colorVariableName(ref.id);
    return name ? `var(${name})` : undefined;
  }
  return undefined;
}

function cssFontFamily(value: unknown): string | undefined {
  if (typeof value === "string") {
    return isSafeCssValue(value) && !HEX_COLOR.test(value) ? value : undefined;
  }
  if (typeof value === "object" && value !== null) {
    const ref = refOf(value);
    if (!ref || ref.from !== "font") return undefined;
    const name = fontVariableName(ref.id);
    return name ? `var(${name})` : undefined;
  }
  return undefined;
}

export function cssLength(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const ref = refOf(value);
  if (ref) {
    if (ref.from === "fontSize") {
      const name = fontSizeVariableName(ref.id);
      return name ? `var(${name})` : undefined;
    }
    if (ref.from === "spacing") {
      const name = spacingVariableName(ref.id);
      return name ? `var(${name})` : undefined;
    }
    return undefined;
  }
  const { value: n, unit } = value as { value?: unknown; unit?: unknown };
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 10_000) return undefined;
  if (typeof unit !== "string" || !UNITS.has(unit)) return undefined;
  return `${n}${unit}`;
}

export function cssFlexDirection(value: unknown): string | undefined {
  return typeof value === "string" && FLEX_DIRECTIONS.has(value) ? value : undefined;
}

const keyword =
  (allowed: Set<string>) =>
  (value: unknown): string | undefined =>
    typeof value === "string" && allowed.has(value) ? value : undefined;

function cssFontWeight(value: unknown): string | undefined {
  if (typeof value === "number" && FONT_WEIGHT.has(String(value))) return String(value);
  if (typeof value === "string" && FONT_WEIGHT.has(value)) return value;
  return undefined;
}

const PROPERTY_MAP: {
  [K in keyof Required<StyleProps>]: { css: string; toValue: (v: unknown) => string | undefined };
} = {
  flexDirection: { css: "flex-direction", toValue: cssFlexDirection },
  flexWrap: { css: "flex-wrap", toValue: keyword(FLEX_WRAPS) },
  justifyContent: { css: "justify-content", toValue: keyword(JUSTIFY) },
  alignItems: { css: "align-items", toValue: keyword(ALIGN) },
  gap: { css: "gap", toValue: cssLength },
  width: { css: "width", toValue: cssLength },
  minWidth: { css: "min-width", toValue: cssLength },
  maxWidth: { css: "max-width", toValue: cssLength },
  height: { css: "height", toValue: cssLength },
  minHeight: { css: "min-height", toValue: cssLength },
  paddingTop: { css: "padding-top", toValue: cssLength },
  paddingRight: { css: "padding-right", toValue: cssLength },
  paddingBottom: { css: "padding-bottom", toValue: cssLength },
  paddingLeft: { css: "padding-left", toValue: cssLength },
  marginTop: { css: "margin-top", toValue: cssLength },
  marginRight: { css: "margin-right", toValue: cssLength },
  marginBottom: { css: "margin-bottom", toValue: cssLength },
  marginLeft: { css: "margin-left", toValue: cssLength },
  fontFamily: { css: "font-family", toValue: cssFontFamily },
  fontSize: { css: "font-size", toValue: cssLength },
  fontWeight: { css: "font-weight", toValue: cssFontWeight },
  lineHeight: { css: "line-height", toValue: cssLength },
  letterSpacing: { css: "letter-spacing", toValue: cssLength },
  textAlign: { css: "text-align", toValue: keyword(TEXT_ALIGN) },
  textTransform: { css: "text-transform", toValue: keyword(TEXT_TRANSFORM) },
  color: { css: "color", toValue: cssColor },
  backgroundColor: { css: "background-color", toValue: cssColor },
  borderWidth: { css: "border-width", toValue: cssLength },
  borderStyle: { css: "border-style", toValue: keyword(BORDER_STYLE) },
  borderColor: { css: "border-color", toValue: cssColor },
  borderRadius: { css: "border-radius", toValue: cssLength },
};

/** Exported for table-driven tests (W-017). */
export const STYLE_PROPERTY_MAP = PROPERTY_MAP;

export type Declaration = { property: string; value: string };

/** Converts style props into safe declarations; anything that fails validation is dropped and reported. */
export function styleDeclarations(style: unknown): {
  declarations: Declaration[];
  rejected: string[];
} {
  const declarations: Declaration[] = [];
  const rejected: string[] = [];
  if (typeof style !== "object" || style === null) return { declarations, rejected };
  for (const [key, raw] of Object.entries(style)) {
    const entry = Object.hasOwn(PROPERTY_MAP, key)
      ? PROPERTY_MAP[key as keyof StyleProps]
      : undefined;
    const value = entry?.toValue(raw);
    if (entry && value !== undefined && isSafeCssValue(value)) {
      declarations.push({ property: entry.css, value });
    } else {
      rejected.push(key);
    }
  }
  return { declarations, rejected };
}
