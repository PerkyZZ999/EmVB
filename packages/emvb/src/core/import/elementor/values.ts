/**
 * Elementor setting values → EmVB style values (W-945). Every reader returns `undefined` for a
 * value it can't represent; the caller notes what it dropped. Nothing here trusts the input.
 */
import { HEX_COLOR, LENGTH_UNITS } from "../../css-keywords.ts";
import { isSafeFontStack } from "../../sanitize/css.ts";
import { sanitizeMediaUrl } from "../../sanitize/media-url.ts";
import type { StyleProps } from "../../schema/style.ts";

export type Settings = Record<string, unknown>;
type Length = { value: number; unit: (typeof LENGTH_UNITS)[number] };
type Style = Record<string, unknown>;

export const isRecord = (value: unknown): value is Settings =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const str = (value: unknown): string | undefined =>
  typeof value === "string" ? value : typeof value === "number" ? String(value) : undefined;

/** A finite number from a number or a numeric string ("12", "1.5"); `undefined` for "" or junk. */
export function num(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string" || !/^\s*-?\d+(?:\.\d+)?\s*$/.test(value)) return undefined;
  return Number(value);
}

const UNITS = new Set<string>(LENGTH_UNITS);

/** `{ unit, size }` (Elementor slider) or a bare number (px) → Length. */
export function slider(value: unknown, { negative = false } = {}): Length | undefined {
  const size = isRecord(value) ? num(value["size"]) : num(value);
  if (size === undefined) return undefined;
  const raw = isRecord(value) ? str(value["unit"]) : undefined;
  const unit = raw === undefined || raw === "" || raw === "custom" ? "px" : raw;
  if (!UNITS.has(unit)) return undefined;
  if (Math.abs(size) > 10_000 || (!negative && size < 0)) return undefined;
  return { value: size, unit: unit as Length["unit"] };
}

const SIDES = ["top", "right", "bottom", "left"] as const;
export type Side = (typeof SIDES)[number];

/** `{ unit, top, right, bottom, left }` (Elementor dimensions) → per-side Lengths. */
export function dimensions(
  value: unknown,
  { negative = false } = {},
): Partial<Record<Side, Length>> {
  if (!isRecord(value)) return {};
  const out: Partial<Record<Side, Length>> = {};
  for (const side of SIDES) {
    const length = slider({ size: value[side], unit: value["unit"] }, { negative });
    if (length) out[side] = length;
  }
  return out;
}

const hex2 = (n: number) =>
  Math.round(Math.min(255, Math.max(0, n)))
    .toString(16)
    .padStart(2, "0");

/** Hex, `rgb()`/`rgba()` (to 8-digit hex) or `transparent`. Other colour syntax → undefined. */
export function color(value: unknown): string | undefined {
  const raw = str(value)?.trim();
  if (!raw) return undefined;
  if (HEX_COLOR.test(raw)) return raw.toLowerCase();
  if (raw.toLowerCase() === "transparent") return "#00000000";
  const rgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+%?)\s*)?\)$/i.exec(
    raw,
  );
  if (!rgb) return undefined;
  const [r, g, b] = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  const alphaText = rgb[4];
  let alpha = 1;
  if (alphaText !== undefined) {
    alpha = alphaText.endsWith("%") ? Number(alphaText.slice(0, -1)) / 100 : Number(alphaText);
  }
  if (![r, g, b, alpha].every(Number.isFinite)) return undefined;
  const base = `#${hex2(r)}${hex2(g)}${hex2(b)}`;
  return alpha >= 1 ? base : `${base}${hex2(alpha * 255)}`;
}

/** A family name as a safe stack: `"Roboto Slab", sans-serif`. */
export function fontStack(family: unknown): string | undefined {
  const name = str(family)?.trim();
  if (!name || !/^[A-Za-z0-9 _.-]{1,80}$/.test(name)) return undefined;
  const stack = `"${name}", sans-serif`;
  return isSafeFontStack(stack) ? stack : undefined;
}

const WEIGHTS = new Set(["100", "200", "300", "400", "500", "600", "700", "800", "900"]);

export function fontWeight(value: unknown): StyleProps["fontWeight"] | undefined {
  const raw = str(value);
  if (raw === "normal" || raw === "bold") return raw;
  if (raw && WEIGHTS.has(raw)) return Number(raw) as StyleProps["fontWeight"];
  return undefined;
}

/** A link setting `{ url, is_external }` or a bare string. Only the URL text; the caller sanitizes. */
export function link(value: unknown): { url: string; newTab: boolean } | undefined {
  if (typeof value === "string")
    return value.trim() ? { url: value.trim(), newTab: false } : undefined;
  if (!isRecord(value)) return undefined;
  const url = str(value["url"])?.trim();
  if (!url) return undefined;
  return { url, newTab: value["is_external"] === "on" || value["is_external"] === true };
}

/** An image setting `{ url, id, alt }`, with a usable URL. */
export function image(value: unknown): { url: string; alt?: string } | undefined {
  if (!isRecord(value)) return undefined;
  const url = sanitizeMediaUrl(str(value["url"])?.trim() ?? "");
  if (!url) return undefined;
  const alt = str(value["alt"])?.trim();
  return alt ? { url, alt: alt.slice(0, 500) } : { url };
}

/** "Hero-banner_2x.jpg" → "Hero banner 2x": a starting point for alt text, flagged in the report. */
export function altFromUrl(url: string): string {
  const file = decodeURIComponentSafe(url.split(/[?#]/)[0]?.split("/").pop() ?? "");
  const words = file
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/-\d+x\d+$/, "")
    .replace(/[-_.]+/g, " ")
    .trim();
  return words ? (words.charAt(0).toUpperCase() + words.slice(1)).slice(0, 120) : "Image";
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Elementor's text alignment values, old and new. */
export function textAlign(value: unknown): StyleProps["textAlign"] | undefined {
  switch (str(value)) {
    case "left":
    case "start":
      return "left";
    case "center":
      return "center";
    case "right":
    case "end":
      return "right";
    case "justify":
      return "justify";
    default:
      return undefined;
  }
}

/** Elementor flex values (`flex-start`, `start`, `space-between`, ...) → CSS flex keywords. */
export function flexValue(value: unknown, allowed: readonly string[]): string | undefined {
  const raw = str(value);
  if (!raw) return undefined;
  const mapped = raw === "start" ? "flex-start" : raw === "end" ? "flex-end" : raw;
  return allowed.includes(mapped) ? mapped : undefined;
}

const capitalized = (side: Side) => side.charAt(0).toUpperCase() + side.slice(1);

/** Writes four sides (`paddingTop`, ...) from an Elementor dimensions value. */
export function putSides(style: Style, prefix: string, value: unknown, negative = false): void {
  for (const [side, length] of Object.entries(dimensions(value, { negative }))) {
    style[`${prefix}${capitalized(side as Side)}`] = length;
  }
}

/** Border radius: one value when all four corners match, else per corner. */
export function putRadius(style: Style, value: unknown): void {
  const sides = dimensions(value);
  const values = Object.values(sides);
  if (values.length === 0) return;
  const same =
    values.length === 4 &&
    values.every((v) => v.value === values[0]?.value && v.unit === values[0]?.unit);
  if (same) {
    style["borderRadius"] = values[0];
    return;
  }
  // Elementor's order is top-left, top-right, bottom-right, bottom-left as top/right/bottom/left.
  const corners = {
    top: "borderTopLeftRadius",
    right: "borderTopRightRadius",
    bottom: "borderBottomRightRadius",
    left: "borderBottomLeftRadius",
  } as const;
  for (const [side, length] of Object.entries(sides)) style[corners[side as Side]] = length;
}

/** Elementor's background image positions → EmVB's keywords. */
export function backgroundPosition(value: unknown): string | undefined {
  const raw = str(value);
  if (!raw) return undefined;
  const allowed = [
    "center",
    "top",
    "bottom",
    "left",
    "right",
    "top left",
    "top right",
    "bottom left",
    "bottom right",
    "center center",
    "center left",
    "center right",
    "top center",
    "bottom center",
  ];
  if (!allowed.includes(raw)) return undefined;
  const map: Record<string, string> = {
    "center center": "center",
    "center left": "left",
    "center right": "right",
    "top center": "top",
    "bottom center": "bottom",
  };
  return map[raw] ?? raw;
}

export const isEmptyStyle = (style: Style | undefined) => !style || Object.keys(style).length === 0;

/** Keys of `next` whose value differs from `base` (device overrides store only the change). */
export function changedKeys(base: Style, next: Style): Style {
  const out: Style = {};
  for (const [key, value] of Object.entries(next)) {
    if (JSON.stringify(base[key]) !== JSON.stringify(value)) out[key] = value;
  }
  return out;
}

/** Media URL for a background (no spaces or parentheses, as EmVB's schema requires). */
export function backgroundUrl(value: unknown): string | undefined {
  const url = image(value)?.url;
  return url && !/[()\\\s"'`]/.test(url) ? url : undefined;
}
