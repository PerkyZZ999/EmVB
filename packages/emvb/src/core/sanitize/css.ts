import { STYLE_STATES, type StyleStateName } from "../schema/state-names.ts";
import type { StyleProps } from "../schema/style.ts";

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const VAR_ID = /^[a-z0-9-]{1,40}$/;
const UNITS = new Set(["px", "rem", "em", "%", "vw", "vh"]);
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
const OVERFLOW = new Set(["visible", "hidden", "clip", "scroll", "auto"]);
const OBJECT_FIT = new Set(["fill", "contain", "cover", "none", "scale-down"]);
const POSITION = new Set(["static", "relative", "absolute", "fixed", "sticky"]);
const CURSOR = new Set([
  "default",
  "pointer",
  "text",
  "move",
  "grab",
  "not-allowed",
  "help",
  "crosshair",
  "zoom-in",
]);
const ASPECT_RATIO = /^([1-9]\d{0,3})\/([1-9]\d{0,3})$/;
const FONT_WEIGHT = new Set(["normal", "bold", "400", "500", "600", "700"]);
const FORBIDDEN = /[{};<>\\"'`]|\/\*|url\(|expression\(|@import|javascript:/i;

/** Last line of defence on every emitted value, even ones built by the typed validators below. */
export function isSafeCssValue(value: string): boolean {
  return value.length > 0 && value.length <= 200 && !FORBIDDEN.test(value) && !/[\n\r]/.test(value);
}

const FAMILY = String.raw`(?:'[\p{L}\p{N} _.-]+'|"[\p{L}\p{N} _.-]+"|[\p{L}\p{N}_-]+(?: [\p{L}\p{N}_-]+)*)`;
const FONT_STACK = new RegExp(String.raw`^${FAMILY}(?:\s*,\s*${FAMILY})*$`, "u");

/**
 * A comma-separated font stack whose family names may be quoted. Quoted names hold only letters,
 * digits, spaces, `_`, `.` and `-`, so a quote can never open or close anything else.
 */
export function isSafeFontStack(value: string): boolean {
  return (
    isSafeCssValue(value) ||
    (value.length <= 200 && !/[\n\r]/.test(value) && FONT_STACK.test(value))
  );
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

/** Public class selector fragment `emvb-k-<id>` (never unprefixed). */
export function styleClassName(id: string): string | undefined {
  if (!/^[a-z0-9-]{1,40}$/.test(id)) return undefined;
  return `emvb-k-${id}`;
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
    return isSafeFontStack(value) && !HEX_COLOR.test(value) ? value : undefined;
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

/** A length, or `auto` where the property allows it (W-088). */
const cssLengthOrAuto = (value: unknown): string | undefined =>
  value === "auto" ? "auto" : cssLength(value);

/** An offset: `auto`, a variable, or a length from -10000 to 10000 (W-088). */
function cssOffset(value: unknown): string | undefined {
  if (value === "auto") return "auto";
  if (typeof value !== "object" || value === null || "var" in value) return cssLength(value);
  const { value: n, unit } = value as { value?: unknown; unit?: unknown };
  if (typeof n !== "number" || !Number.isFinite(n) || n < -10_000 || n > 10_000) return undefined;
  if (typeof unit !== "string" || !UNITS.has(unit)) return undefined;
  return `${n}${unit}`;
}

const cssZIndex = (value: unknown): string | undefined =>
  Number.isInteger(value) && (value as number) >= -9999 && (value as number) <= 9999
    ? String(value)
    : undefined;

const inRange = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;

const cssOpacity = (value: unknown) => (inRange(value, 0, 1) ? String(value) : undefined);

const SHADOW_KEYS = new Set(["x", "y", "blur", "spread", "color", "inset"]);

/** `[inset] x y blur spread [colour]`, built only from checked numbers and a checked colour. */
function cssBoxShadow(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  if (Object.keys(value).some((key) => !SHADOW_KEYS.has(key))) return undefined;
  const { x, y, blur, spread, color, inset } = value as Record<string, unknown>;
  if (!inRange(x, -1000, 1000) || !inRange(y, -1000, 1000)) return undefined;
  if (!inRange(blur, 0, 1000) || !inRange(spread, -1000, 1000)) return undefined;
  if (inset !== undefined && typeof inset !== "boolean") return undefined;
  const colour = color === undefined ? undefined : cssColor(color);
  if (color !== undefined && colour === undefined) return undefined;
  const parts = [inset ? "inset" : "", `${x}px ${y}px ${blur}px ${spread}px`, colour ?? ""];
  return parts.filter(Boolean).join(" ");
}

/** Filter functions in a fixed order, each with its own range and unit. */
const FILTERS: ReadonlyArray<[key: string, fn: string, max: number, unit: string]> = [
  ["blur", "blur", 100, "px"],
  ["brightness", "brightness", 300, "%"],
  ["contrast", "contrast", 300, "%"],
  ["saturate", "saturate", 300, "%"],
  ["grayscale", "grayscale", 100, "%"],
  ["hueRotate", "hue-rotate", 360, "deg"],
];
const FILTER_KEYS = new Set(FILTERS.map(([key]) => key));

function cssFilter(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const filter = value as Record<string, unknown>;
  if (Object.keys(filter).some((key) => !FILTER_KEYS.has(key))) return undefined;
  const parts: string[] = [];
  for (const [key, fn, max, unit] of FILTERS) {
    const n = filter[key];
    if (n === undefined) continue;
    if (!inRange(n, 0, max)) return undefined;
    parts.push(`${fn}(${n}${unit})`);
  }
  return parts.length > 0 ? parts.join(" ") : undefined;
}

function cssAspectRatio(value: unknown): string | undefined {
  if (value === "auto") return "auto";
  const match = typeof value === "string" ? ASPECT_RATIO.exec(value) : null;
  return match ? `${match[1]} / ${match[2]}` : undefined;
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

const TRANSITION_EASINGS = new Set(["ease", "ease-in", "ease-out", "ease-in-out", "linear"]);
const TRANSITION_PROPERTIES: Readonly<Record<string, readonly string[]>> = {
  all: ["all"],
  colors: ["color", "background-color", "border-color"],
  opacity: ["opacity"],
  shadow: ["box-shadow"],
  filter: ["filter"],
};
const TRANSITION_KEYS = new Set(["duration", "delay", "easing", "property"]);

const ms = (n: unknown) => (Number.isInteger(n) && inRange(n, 0, 2000) ? `${n}ms` : undefined);

/** W-089: `{ duration, delay?, easing, property }` to one transition entry per CSS property. */
function cssTransition(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const t = value as Record<string, unknown>;
  if (Object.keys(t).some((key) => !TRANSITION_KEYS.has(key))) return undefined;
  const duration = ms(t["duration"]);
  const delay = t["delay"] === undefined ? "" : ms(t["delay"]);
  const easing = typeof t["easing"] === "string" && TRANSITION_EASINGS.has(t["easing"]);
  const properties =
    typeof t["property"] === "string" && Object.hasOwn(TRANSITION_PROPERTIES, t["property"])
      ? TRANSITION_PROPERTIES[t["property"]]
      : undefined;
  if (!duration || delay === undefined || !easing || !properties) return undefined;
  const timing = `${duration} ${t["easing"] as string}${delay ? ` ${delay}` : ""}`;
  return properties.map((property) => `${property} ${timing}`).join(",");
}

const PROPERTY_MAP: {
  [K in keyof Required<StyleProps>]: { css: string; toValue: (v: unknown) => string | undefined };
} = {
  flexDirection: { css: "flex-direction", toValue: cssFlexDirection },
  flexWrap: { css: "flex-wrap", toValue: keyword(FLEX_WRAPS) },
  justifyContent: { css: "justify-content", toValue: keyword(JUSTIFY) },
  alignItems: { css: "align-items", toValue: keyword(ALIGN) },
  gap: { css: "gap", toValue: cssLength },
  width: { css: "width", toValue: cssLengthOrAuto },
  minWidth: { css: "min-width", toValue: cssLength },
  maxWidth: { css: "max-width", toValue: cssLength },
  height: { css: "height", toValue: cssLengthOrAuto },
  minHeight: { css: "min-height", toValue: cssLength },
  maxHeight: { css: "max-height", toValue: cssLength },
  overflow: { css: "overflow", toValue: keyword(OVERFLOW) },
  aspectRatio: { css: "aspect-ratio", toValue: cssAspectRatio },
  objectFit: { css: "object-fit", toValue: keyword(OBJECT_FIT) },
  paddingTop: { css: "padding-top", toValue: cssLength },
  paddingRight: { css: "padding-right", toValue: cssLength },
  paddingBottom: { css: "padding-bottom", toValue: cssLength },
  paddingLeft: { css: "padding-left", toValue: cssLength },
  marginTop: { css: "margin-top", toValue: cssLengthOrAuto },
  marginRight: { css: "margin-right", toValue: cssLengthOrAuto },
  marginBottom: { css: "margin-bottom", toValue: cssLengthOrAuto },
  marginLeft: { css: "margin-left", toValue: cssLengthOrAuto },
  position: { css: "position", toValue: keyword(POSITION) },
  top: { css: "top", toValue: cssOffset },
  right: { css: "right", toValue: cssOffset },
  bottom: { css: "bottom", toValue: cssOffset },
  left: { css: "left", toValue: cssOffset },
  zIndex: { css: "z-index", toValue: cssZIndex },
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
  opacity: { css: "opacity", toValue: cssOpacity },
  boxShadow: { css: "box-shadow", toValue: cssBoxShadow },
  filter: { css: "filter", toValue: cssFilter },
  cursor: { css: "cursor", toValue: keyword(CURSOR) },
  transition: { css: "transition", toValue: cssTransition },
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
    const safe =
      value !== undefined &&
      (entry?.css === "font-family" ? isSafeFontStack(value) : isSafeCssValue(value));
    if (entry && safe) {
      declarations.push({ property: entry.css, value });
    } else {
      rejected.push(key);
    }
  }
  return { declarations, rejected };
}

/** Transitions are Normal only (W-089): a state's `transition` is dropped and reported. */
const withoutTransition = (style: unknown): unknown => {
  if (typeof style !== "object" || style === null || !("transition" in style)) return style;
  const { transition: _drop, ...rest } = style as Record<string, unknown>;
  return rest;
};

export type StateDeclarations = Partial<Record<StyleStateName, Declaration[]>>;

/**
 * `states` (W-089) through the same mappers and gates as `style`. Rejected keys are reported as
 * `<state>.<key>`; an unknown state name is reported whole.
 */
export function stateDeclarations(states: unknown): {
  states: StateDeclarations;
  rejected: string[];
} {
  const result: StateDeclarations = {};
  const rejected: string[] = [];
  if (typeof states !== "object" || states === null) return { states: result, rejected };
  for (const key of Object.keys(states)) {
    if (!STYLE_STATES.includes(key as StyleStateName)) rejected.push(key);
  }
  for (const state of STYLE_STATES) {
    const style = (states as Record<string, unknown>)[state];
    if (style === undefined) continue;
    const { declarations, rejected: bad } = styleDeclarations(withoutTransition(style));
    if (typeof style === "object" && style !== null && "transition" in style)
      bad.push("transition");
    if (declarations.length > 0) result[state] = declarations;
    for (const key of bad) rejected.push(`${state}.${key}`);
  }
  return { states: result, rejected };
}
