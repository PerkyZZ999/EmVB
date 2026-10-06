import { STYLE_STATES, type StyleStateName } from "../schema/state-names.ts";
import type { StyleProps } from "../schema/style.ts";
import { sanitizeMediaUrl } from "./media-url.ts";

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
const TEXT_TRANSFORM = new Set(["none", "uppercase", "lowercase", "capitalize"]);
const TEXT_DECORATION = new Set(["none", "underline", "overline", "line-through"]);
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

const ENTRANCES = new Set(["fade", "fade-up", "fade-down", "slide-up", "slide-down", "scale"]);

/** `emvb-<type> <ms> ease-out [delay] both`. A bad trigger drops the whole entrance. */
function cssEntrance(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const { type, duration, delay, trigger } = value as {
    type?: unknown;
    duration?: unknown;
    delay?: unknown;
    trigger?: unknown;
  };
  if (typeof type !== "string" || !ENTRANCES.has(type)) return undefined;
  if (!Number.isInteger(duration) || (duration as number) < 0 || (duration as number) > 2000) {
    return undefined;
  }
  if (trigger !== undefined && trigger !== "load" && trigger !== "view") return undefined;
  if (
    delay !== undefined &&
    (!Number.isInteger(delay) || (delay as number) < 0 || (delay as number) > 2000)
  ) {
    return undefined;
  }
  const wait = typeof delay === "number" && delay > 0 ? ` ${delay}ms` : "";
  return `emvb-${type} ${duration}ms ease-out${wait} both`;
}

function cssTextAlign(value: unknown): string | undefined {
  if (value === "left") return "start";
  if (value === "right") return "end";
  if (value === "center" || value === "justify") return value;
  return undefined;
}

const cssGridSpan = (value: unknown): string | undefined =>
  Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 12
    ? `span ${value}`
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

export type Declaration = { property: string; value: string };

const BACKGROUND_SIZE = new Set(["auto", "cover", "contain"]);
const BACKGROUND_POSITION = new Set([
  "center",
  "top",
  "bottom",
  "left",
  "right",
  "top left",
  "top right",
  "bottom left",
  "bottom right",
]);
const BACKGROUND_REPEAT = new Set(["no-repeat", "repeat", "repeat-x", "repeat-y"]);
const BACKGROUND_KEYS = new Set([
  "backgroundImage",
  "backgroundSize",
  "backgroundPosition",
  "backgroundRepeat",
  "gradient",
  "overlay",
  "backgroundVideo",
]);

/** Backstop for values that must contain `url()` or quotes, which `isSafeCssValue` refuses. */
function isSafeBackground(value: string): boolean {
  return value.length > 0 && value.length <= 4096 && !/[{};<>\\`]|\/\*|\n|\r/.test(value);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A media URL wrapped for CSS. The schema already refuses quotes, spaces and parentheses. */
function cssBackgroundImage(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (sanitizeMediaUrl(value) !== value || /[()\\\s"'`]/.test(value)) return undefined;
  const css = `url("${value}")`;
  return isSafeBackground(css) ? css : undefined;
}

const GRADIENT_POSITION = new Set([
  "center",
  "top",
  "bottom",
  "left",
  "right",
  "top left",
  "top right",
  "bottom left",
  "bottom right",
]);

function cssAngle(value: unknown, fallback: number): number | undefined {
  const angle = value === undefined ? fallback : value;
  if (!Number.isInteger(angle) || (angle as number) < 0 || (angle as number) > 360)
    return undefined;
  return angle as number;
}

function cssGradient(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  if (
    Object.keys(value).some(
      (key) => key !== "type" && key !== "angle" && key !== "position" && key !== "stops",
    )
  )
    return undefined;
  const { type, stops } = value;
  if (type !== "linear" && type !== "radial" && type !== "conic") return undefined;
  if (!Array.isArray(stops) || stops.length < 2 || stops.length > 10) return undefined;
  const parts: string[] = [];
  for (const stop of stops) {
    if (!isRecord(stop) || Object.keys(stop).some((key) => key !== "color" && key !== "at"))
      return undefined;
    const color = cssColor(stop["color"]);
    const at = stop["at"];
    if (!color || !Number.isInteger(at) || (at as number) < 0 || (at as number) > 100)
      return undefined;
    parts.push(`${color} ${at as number}%`);
  }
  const list = parts.join(", ");
  let css: string;
  if (type === "radial") {
    const position = value["position"] === undefined ? "center" : value["position"];
    if (typeof position !== "string" || !GRADIENT_POSITION.has(position)) return undefined;
    css = `radial-gradient(circle at ${position}, ${list})`;
  } else {
    const angle = cssAngle(value["angle"], type === "conic" ? 0 : 180);
    if (angle === undefined) return undefined;
    css =
      type === "conic"
        ? `conic-gradient(from ${angle}deg, ${list})`
        : `linear-gradient(${angle}deg, ${list})`;
  }
  return isSafeBackground(css) ? css : undefined;
}

/** `#rgb` / `#rrggbb` (and an existing alpha) times `opacity`, as 8-digit hex. */
function hexWithAlpha(hex: string, opacity: number): string | undefined {
  let body = hex.slice(1).toLowerCase();
  if (body.length === 3 || body.length === 4) body = [...body].map((ch) => ch + ch).join("");
  if (body.length !== 6 && body.length !== 8) return undefined;
  const existing = body.length === 8 ? Number.parseInt(body.slice(6), 16) / 255 : 1;
  const alpha = Math.round(existing * opacity * 255)
    .toString(16)
    .padStart(2, "0");
  return `#${body.slice(0, 6)}${alpha}`;
}

function overlayPaint(color: string, opacity: number): string | undefined {
  if (opacity === 1) return color;
  if (color.startsWith("var(")) {
    return `color-mix(in srgb, ${color} ${Math.round(opacity * 100)}%, transparent)`;
  }
  return HEX_COLOR.test(color) ? hexWithAlpha(color, opacity) : undefined;
}

function cssOverlay(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  if (Object.keys(value).some((key) => key !== "color" && key !== "opacity")) return undefined;
  const color = cssColor(value["color"]);
  const opacity = value["opacity"];
  if (
    !color ||
    typeof opacity !== "number" ||
    !Number.isFinite(opacity) ||
    opacity < 0 ||
    opacity > 1
  )
    return undefined;
  const paint = overlayPaint(color, opacity);
  if (!paint) return undefined;
  const css = `linear-gradient(${paint}, ${paint})`;
  return isSafeBackground(css) ? css : undefined;
}

/**
 * Image, gradient and overlay share `background-image`. The overlay is the top layer, then the
 * image, then the gradient. Size, position and repeat apply to the image; the other layers fill.
 */
function composeBackground(style: Record<string, unknown>): {
  declarations: Declaration[];
  rejected: string[];
} {
  const rejected: string[] = [];
  const take = (key: string, css: string | undefined) => {
    if (style[key] === undefined) return undefined;
    if (!css) rejected.push(key);
    return css;
  };
  const image = take("backgroundImage", cssBackgroundImage(style["backgroundImage"]));
  const size = take("backgroundSize", keyword(BACKGROUND_SIZE)(style["backgroundSize"]));
  const position = take(
    "backgroundPosition",
    keyword(BACKGROUND_POSITION)(style["backgroundPosition"]),
  );
  const repeat = take("backgroundRepeat", keyword(BACKGROUND_REPEAT)(style["backgroundRepeat"]));
  const gradient = take("gradient", cssGradient(style["gradient"]));
  const overlay = take("overlay", cssOverlay(style["overlay"]));

  const layers: string[] = [];
  const sizes: string[] = [];
  const positions: string[] = [];
  const repeats: string[] = [];
  const push = (layer: string, layerSize: string, layerPosition: string, layerRepeat: string) => {
    layers.push(layer);
    sizes.push(layerSize);
    positions.push(layerPosition);
    repeats.push(layerRepeat);
  };
  if (overlay) push(overlay, "auto", "center", "no-repeat");
  if (image) push(image, size ?? "cover", position ?? "center", repeat ?? "no-repeat");
  if (gradient) push(gradient, "auto", "center", "no-repeat");

  const declarations: Declaration[] = [];
  if (layers.length > 0) {
    const value = layers.join(",");
    if (!isSafeBackground(value)) {
      for (const key of ["overlay", "backgroundImage", "gradient"]) {
        if (style[key] !== undefined && !rejected.includes(key)) rejected.push(key);
      }
    } else {
      declarations.push({ property: "background-image", value });
      if (layers.length > 1) {
        declarations.push(
          { property: "background-size", value: sizes.join(",") },
          { property: "background-position", value: positions.join(",") },
          { property: "background-repeat", value: repeats.join(",") },
        );
      } else if (image) {
        declarations.push(
          { property: "background-size", value: size ?? "cover" },
          { property: "background-position", value: position ?? "center" },
          { property: "background-repeat", value: repeat ?? "no-repeat" },
        );
      }
    }
  }
  if (!image) {
    if (size) declarations.push({ property: "background-size", value: size });
    if (position) declarations.push({ property: "background-position", value: position });
    if (repeat) declarations.push({ property: "background-repeat", value: repeat });
  }
  return { declarations, rejected };
}

const PROPERTY_MAP: {
  [K in keyof Required<StyleProps>]: { css: string; toValue: (v: unknown) => string | undefined };
} = {
  flexDirection: { css: "flex-direction", toValue: cssFlexDirection },
  flexWrap: { css: "flex-wrap", toValue: keyword(FLEX_WRAPS) },
  justifyContent: { css: "justify-content", toValue: keyword(JUSTIFY) },
  alignItems: { css: "align-items", toValue: keyword(ALIGN) },
  gap: { css: "gap", toValue: cssLength },
  gridColumnSpan: { css: "grid-column", toValue: cssGridSpan },
  gridRowSpan: { css: "grid-row", toValue: cssGridSpan },
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
  paddingRight: { css: "padding-inline-end", toValue: cssLength },
  paddingBottom: { css: "padding-bottom", toValue: cssLength },
  paddingLeft: { css: "padding-inline-start", toValue: cssLength },
  marginTop: { css: "margin-top", toValue: cssLengthOrAuto },
  marginRight: { css: "margin-inline-end", toValue: cssLengthOrAuto },
  marginBottom: { css: "margin-bottom", toValue: cssLengthOrAuto },
  marginLeft: { css: "margin-inline-start", toValue: cssLengthOrAuto },
  position: { css: "position", toValue: keyword(POSITION) },
  top: { css: "top", toValue: cssOffset },
  right: { css: "inset-inline-end", toValue: cssOffset },
  bottom: { css: "bottom", toValue: cssOffset },
  left: { css: "inset-inline-start", toValue: cssOffset },
  zIndex: { css: "z-index", toValue: cssZIndex },
  fontFamily: { css: "font-family", toValue: cssFontFamily },
  fontSize: { css: "font-size", toValue: cssLength },
  fontWeight: { css: "font-weight", toValue: cssFontWeight },
  lineHeight: { css: "line-height", toValue: cssLength },
  letterSpacing: { css: "letter-spacing", toValue: cssLength },
  textAlign: { css: "text-align", toValue: cssTextAlign },
  textTransform: { css: "text-transform", toValue: keyword(TEXT_TRANSFORM) },
  textDecoration: { css: "text-decoration", toValue: keyword(TEXT_DECORATION) },
  color: { css: "color", toValue: cssColor },
  backgroundColor: { css: "background-color", toValue: cssColor },
  backgroundImage: { css: "background-image", toValue: cssBackgroundImage },
  backgroundSize: { css: "background-size", toValue: keyword(BACKGROUND_SIZE) },
  backgroundPosition: { css: "background-position", toValue: keyword(BACKGROUND_POSITION) },
  backgroundRepeat: { css: "background-repeat", toValue: keyword(BACKGROUND_REPEAT) },
  backgroundVideo: { css: "background-image", toValue: () => undefined },
  gradient: { css: "background-image", toValue: cssGradient },
  overlay: { css: "background-image", toValue: cssOverlay },
  borderWidth: { css: "border-width", toValue: cssLength },
  borderTopWidth: { css: "border-top-width", toValue: cssLength },
  borderRightWidth: { css: "border-inline-end-width", toValue: cssLength },
  borderBottomWidth: { css: "border-bottom-width", toValue: cssLength },
  borderLeftWidth: { css: "border-inline-start-width", toValue: cssLength },
  borderStyle: { css: "border-style", toValue: keyword(BORDER_STYLE) },
  borderColor: { css: "border-color", toValue: cssColor },
  borderRadius: { css: "border-radius", toValue: cssLength },
  borderTopLeftRadius: { css: "border-start-start-radius", toValue: cssLength },
  borderTopRightRadius: { css: "border-start-end-radius", toValue: cssLength },
  borderBottomRightRadius: { css: "border-end-end-radius", toValue: cssLength },
  borderBottomLeftRadius: { css: "border-end-start-radius", toValue: cssLength },
  opacity: { css: "opacity", toValue: cssOpacity },
  boxShadow: { css: "box-shadow", toValue: cssBoxShadow },
  filter: { css: "filter", toValue: cssFilter },
  cursor: { css: "cursor", toValue: keyword(CURSOR) },
  transition: { css: "transition", toValue: cssTransition },
  entrance: { css: "animation", toValue: cssEntrance },
};

/** Exported for table-driven tests (W-017). */
export const STYLE_PROPERTY_MAP = PROPERTY_MAP;

/** All-sides keys whose CSS shorthand must come before the per-side longhands (W-138). */
const SHORTHANDS = new Set(["borderWidth", "borderRadius"]);

/** Entries with `borderWidth` and `borderRadius` first, so a side or corner always wins. */
const shorthandsFirst = (record: Record<string, unknown>): [string, unknown][] => {
  const entries = Object.entries(record);
  return [
    ...entries.filter(([key]) => SHORTHANDS.has(key)),
    ...entries.filter(([key]) => !SHORTHANDS.has(key)),
  ];
};

/** Converts style props into safe declarations; anything that fails validation is dropped and reported. */
export function styleDeclarations(style: unknown): {
  declarations: Declaration[];
  rejected: string[];
} {
  const declarations: Declaration[] = [];
  const rejected: string[] = [];
  if (typeof style !== "object" || style === null) return { declarations, rejected };
  const record = style as Record<string, unknown>;
  for (const [key, raw] of shorthandsFirst(record)) {
    if (BACKGROUND_KEYS.has(key)) continue;
    const entry = Object.hasOwn(PROPERTY_MAP, key)
      ? PROPERTY_MAP[key as keyof StyleProps]
      : undefined;
    const value = entry?.toValue(raw);
    const safe =
      value !== undefined &&
      (entry?.css === "font-family" ? isSafeFontStack(value) : isSafeCssValue(value));
    if (entry && safe) {
      declarations.push({ property: entry.css, value });
      if (key === "entrance") {
        const trigger = (raw as { trigger?: unknown }).trigger;
        if (trigger === "view") {
          declarations.push(
            { property: "animation-timeline", value: "view()" },
            { property: "animation-range", value: "entry 0% cover 40%" },
          );
        }
      }
    } else {
      rejected.push(key);
    }
  }
  const background = composeBackground(record);
  declarations.push(...background.declarations);
  rejected.push(...background.rejected);
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
