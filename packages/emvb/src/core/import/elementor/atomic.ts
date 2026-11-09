/**
 * Elementor 4 "atomic" elements (W-945): e-flexbox, e-div-block, e-heading, e-paragraph,
 * e-button, e-image, e-svg, e-form…, e-accordion…, e-tabs…. Their styles are CSS properties
 * with typed values (`{ $$type, value }`) in classes, each class a list of variants by
 * breakpoint and state. A template export carries the global classes and variables it uses
 * (`global_classes`, `global_variables`); their styles are inlined on each element, so an
 * import never rewrites the site's own design system.
 */
import {
  ALIGN_ITEMS,
  BORDER_STYLES,
  FLEX_DIRECTIONS,
  FLEX_WRAPS,
  JUSTIFY_CONTENT,
  LENGTH_UNITS,
  OBJECT_FITS,
  OVERFLOWS,
  POSITIONS,
  TEXT_ALIGNS,
  TEXT_DECORATIONS,
  TEXT_TRANSFORMS,
} from "../../css-keywords.ts";
import { FIELD_NAME_PATTERN } from "../../schema/layout.ts";
import { sanitizeHref } from "../../sanitize/href.ts";
import { sanitizeMediaUrl } from "../../sanitize/media-url.ts";
import { type ImportContext, svgFileId } from "./context.ts";
import { declarations, decodeRawCss, finishBorders } from "./css.ts";
import { cleanText, decodeEntities, embedVideoUrl, splitLong } from "./html.ts";
import type { Style } from "./style.ts";
import {
  altFromUrl,
  changedKeys,
  color,
  fontWeight,
  isEmptyStyle,
  isRecord,
  type Settings,
  str,
} from "./values.ts";
import type { AtomicSnapshots, ClassDef, Value, ClassVariant } from "./snapshots.ts";
import { type Env, type N, node } from "./widgets.ts";

/** `{ $$type, value }` → value; plain values pass through. */
const un = (v: unknown): unknown => (isRecord(v) && "$$type" in v ? (v as Value).value : v);
const typeOf = (v: unknown) =>
  isRecord(v) && typeof v["$$type"] === "string" ? (v["$$type"] as string) : undefined;

const UNITS = new Set<string>(LENGTH_UNITS);
type Len = { value: number; unit: string };

/**
 * A size. Fluid Elementor values `max(A, min(B, …))` become B (the large-screen value) with A
 * offered for phones; a bare number with the custom unit is returned as a number.
 */
function size(
  v: unknown,
  opts: { negative?: boolean } = {},
): { len?: Len | "auto"; small?: Len; number?: number; fluid?: boolean } {
  const raw = un(v);
  if (!isRecord(raw)) return {};
  const unit = str(raw["unit"]) ?? "px";
  const amount = raw["size"];
  if (unit === "auto") return { len: "auto" };
  if (unit === "custom") {
    const text = str(amount)?.trim() ?? "";
    if (/^-?\d+(?:\.\d+)?$/.test(text)) return { number: Number(text) };
    const plainLen = cssLen(text, opts.negative);
    if (plainLen) return { len: plainLen };
    const fluid =
      /^max\(\s*([^,]+?)\s*,\s*min\(\s*([^,]+?)\s*,/.exec(text) ??
      /^clamp\(\s*([^,]+?)\s*,[^,]+,\s*([^)]+?)\s*\)$/.exec(text);
    if (fluid) {
      const small = cssLen(fluid[1] ?? "", opts.negative);
      const large = cssLen(fluid[2] ?? "", opts.negative);
      if (large) return { len: large, ...(small ? { small } : {}), fluid: true };
    }
    return { fluid: true };
  }
  const n =
    typeof amount === "number"
      ? amount
      : /^-?\d+(?:\.\d+)?$/.test(str(amount) ?? "")
        ? Number(amount)
        : undefined;
  if (n === undefined || !UNITS.has(unit) || Math.abs(n) > 10_000 || (!opts.negative && n < 0))
    return {};
  return { len: { value: n, unit } };
}

function cssLen(text: string, negative = false): Len | undefined {
  const m = /^(-?\d+(?:\.\d+)?)(px|rem|em|%|vw|vh|ch)$/.exec(text.trim());
  if (!m) return undefined;
  const value = Number(m[1]);
  if ((!negative && value < 0) || Math.abs(value) > 10_000) return undefined;
  return { value, unit: m[2] ?? "px" };
}

const SIDES: Record<string, string> = {
  "block-start": "Top",
  "inline-end": "Right",
  "block-end": "Bottom",
  "inline-start": "Left",
};
const CORNERS: Record<string, string> = {
  "start-start": "borderTopLeftRadius",
  "start-end": "borderTopRightRadius",
  "end-end": "borderBottomRightRadius",
  "end-start": "borderBottomLeftRadius",
};
const pick = (list: readonly string[], v: unknown) => {
  const s = str(un(v));
  return s && list.includes(s) ? s : undefined;
};

/** What one variant's props become: base style, phone-only values from fluid sizes, and notes. */
type Converted = {
  style: Style;
  phone: Style;
  /** Applies on tablet and phone (a capped wrapper's side gutters). */
  narrow?: Style;
  display?: string;
  columns?: number;
  tracks?: string[];
  /** `grid-column: 1 / -1`: spans every column of the parent grid. */
  fullRow?: boolean;
  unsupported: string[];
};

function colorOf(v: unknown, snap: AtomicSnapshots): string | undefined {
  if (typeOf(v) === "global-color-variable") {
    const variable = snap.variables.get(str(un(v)) ?? "");
    return color(isRecord(variable?.value) ? un(variable.value) : variable?.value);
  }
  return color(un(v));
}

/** Top-level tokens of a track list (commas and spaces inside parentheses stay put). */
function topLevel(text: string, separator: RegExp): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of text) {
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if (depth === 0 && separator.test(ch)) {
      if (current.trim()) out.push(current.trim());
      current = "";
    } else current += ch;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

const EMVB_TRACK =
  /^(?:1fr|2fr|3fr|auto|min-content|max-content|0|\d+(?:\.\d+)?(?:px|rem|em|%|vw|vh|ch))$/;

/** One CSS track → an EmVB track (`minmax` takes its larger side, fractions round to 1–3fr). */
function emvbTrack(track: string): string | undefined {
  const minmax = /^minmax\(\s*([^,]+?)\s*,\s*(.+?)\s*\)$/.exec(track);
  const value = minmax ? (minmax[2] ?? "") : track;
  const fr = /^(\d*\.?\d+)fr$/.exec(value);
  if (fr) return `${Math.min(3, Math.max(1, Math.round(Number(fr[1]))))}fr`;
  return EMVB_TRACK.test(value) ? value : undefined;
}

/** `grid-template-columns` → a column count and, when the columns differ, EmVB tracks. */
function gridTracks(template: string): { count: number; tracks?: string[] } | undefined {
  const tracks: string[] = [];
  for (const token of topLevel(template.trim(), /\s/)) {
    const repeat = /^repeat\(\s*(\d{1,2})\s*,\s*(.+)\)$/.exec(token);
    const times = repeat ? Number(repeat[1]) : 1;
    const inner = repeat ? topLevel(repeat[2] ?? "", /\s/) : [token];
    for (let i = 0; i < times && tracks.length <= 12; i++) {
      for (const one of inner) {
        const mapped = emvbTrack(one);
        if (!mapped) return undefined;
        tracks.push(mapped);
      }
    }
  }
  if (tracks.length === 0 || tracks.length > 12) return undefined;
  const equal =
    tracks.every((t) => t === tracks[0]) && (tracks[0] === "1fr" || tracks.length === 1);
  return equal ? { count: tracks.length } : { count: tracks.length, tracks };
}

/** One variant's props → EmVB style keys. */
function convert(props: Settings, snap: AtomicSnapshots, ctx: ImportContext): Converted {
  const out: Converted = { style: {}, phone: {}, unsupported: [] };
  const { style, phone } = out;
  const putSize = (key: string, v: unknown, allowAuto = false, negative = false) => {
    const s = size(v, { negative });
    if (s.len === "auto") {
      if (allowAuto) style[key] = "auto";
      return;
    }
    if (s.len) style[key] = s.len;
    if (s.small) phone[key] = s.small;
    if (!s.len && s.fluid) out.unsupported.push(key);
  };
  const putBox = (prefix: "padding" | "margin" | "border", v: unknown, suffix = "") => {
    const raw = un(v);
    const sides = isRecord(raw) && !("size" in raw) ? raw : undefined;
    const entries: [string, unknown][] = sides
      ? Object.entries(sides)
          .filter(([k]) => k in SIDES)
          .map(([k, s]) => [SIDES[k] ?? "", s])
      : ["Top", "Right", "Bottom", "Left"].map((side) => [side, v]);
    for (const [side, s] of entries) {
      const sz = size(s, { negative: prefix === "margin" });
      const key = `${prefix}${side}${suffix}`;
      if (sz.len === "auto") {
        if (prefix === "margin") style[key] = "auto";
      } else if (sz.len) style[key] = sz.len;
      if (sz.small) phone[key] = sz.small;
    }
  };
  for (const [prop, v] of Object.entries(props)) {
    switch (prop) {
      case "color": {
        const c = colorOf(v, snap);
        if (c) style["color"] = c;
        break;
      }
      case "background": {
        const bg = un(v);
        if (!isRecord(bg)) break;
        const c = colorOf(bg["color"], snap);
        if (c) style["backgroundColor"] = c;
        const overlays = un(bg["background-overlay"]);
        if (Array.isArray(overlays) && overlays.length > 0) {
          const kinds = overlays.map((layer) => typeOf(layer));
          const imageAt = kinds.indexOf("background-image-overlay");
          for (const [index, layer] of overlays.entries()) {
            const t = typeOf(layer);
            const body = un(layer);
            if (t === "background-image-overlay" && isRecord(body)) {
              const image = un(body["image"]);
              const src = isRecord(image) ? un(image["src"]) : undefined;
              const url = isRecord(src) ? str(un(src["url"])) : undefined;
              const safe = url ? sanitizeMediaUrl(url) : undefined;
              if (safe && !/[()\\\s"'`]/.test(safe)) {
                ctx.externalImage(safe);
                style["backgroundImage"] = safe;
                const sizeKw = str(un(body["size"]));
                if (sizeKw === "cover" || sizeKw === "contain" || sizeKw === "auto")
                  style["backgroundSize"] = sizeKw;
              } else out.unsupported.push("background image");
            } else if (t === "background-color-overlay" && isRecord(body)) {
              const overlay = colorOf(body["color"], snap);
              if (overlay) style["overlay"] = { color: overlay, opacity: 1 };
            } else if (t === "background-gradient-overlay" && isRecord(body)) {
              const stops = (
                Array.isArray(un(body["stops"])) ? (un(body["stops"]) as unknown[]) : []
              )
                .map((stop) => un(stop))
                .filter(isRecord)
                .map((stop) => ({
                  color: colorOf(stop["color"], snap),
                  at: Number(un(stop["offset"])),
                }))
                .filter(
                  (stop): stop is { color: string; at: number } =>
                    Boolean(stop.color) && Number.isFinite(stop.at),
                )
                .slice(0, 10)
                .map((stop) => ({
                  color: stop.color,
                  at: Math.min(100, Math.max(0, Math.round(stop.at))),
                }));
              if (stops.length >= 2) {
                const radial = str(un(body["type"])) === "radial";
                const angle = Number(un(body["angle"]));
                const gradient = {
                  type: radial ? "radial" : "linear",
                  ...(radial
                    ? {}
                    : {
                        angle: Number.isFinite(angle)
                          ? ((Math.round(angle) % 360) + 360) % 360
                          : 180,
                      }),
                  stops,
                };
                // CSS draws the first layer on top: a gradient before the image is a scrim,
                // EmVB's gradient overlay (W-949); after it, the gradient under the image.
                if (imageAt > index) style["overlay"] = { gradient };
                else style["gradient"] = gradient;
              } else out.unsupported.push("background gradient");
            } else {
              out.unsupported.push("background layer");
            }
          }
        }
        break;
      }
      case "display": {
        const d = str(un(v));
        if (d) out.display = d;
        break;
      }
      case "grid-template-columns": {
        const grid = gridTracks(str(un(v)) ?? "");
        if (grid) {
          out.columns = grid.count;
          if (grid.tracks) out.tracks = grid.tracks;
        } else out.unsupported.push("grid-template-columns");
        break;
      }
      case "font-size":
      case "letter-spacing":
      case "min-width":
      case "min-height":
      case "max-width":
      case "max-height":
        putSize(
          {
            "font-size": "fontSize",
            "letter-spacing": "letterSpacing",
            "min-width": "minWidth",
            "min-height": "minHeight",
            "max-width": "maxWidth",
            "max-height": "maxHeight",
          }[prop] ?? prop,
          v,
          false,
          prop === "letter-spacing",
        );
        break;
      case "width": {
        const raw = un(v);
        const textValue =
          isRecord(raw) && raw["unit"] === "custom" ? (str(raw["size"])?.trim() ?? "") : "";
        // Centred wrappers: min(1180px, calc(100% - 48px)) and calc(100% - 32px).
        const capped =
          /^min\(\s*(\d+(?:\.\d+)?)px\s*,\s*calc\(\s*100%\s*-\s*(\d+(?:\.\d+)?)px\s*\)\s*\)$/.exec(
            textValue,
          );
        const gutter = /^calc\(\s*100%\s*-\s*(\d+(?:\.\d+)?)px\s*\)$/.exec(textValue);
        if (capped) {
          const half = { value: Number(capped[2]) / 2, unit: "px" };
          style["width"] = { value: 100, unit: "%" };
          style["maxWidth"] = { value: Number(capped[1]), unit: "px" };
          out.narrow = { width: "auto", marginLeft: half, marginRight: half };
          break;
        }
        if (gutter) {
          const half = { value: Number(gutter[1]) / 2, unit: "px" };
          style["width"] = "auto";
          style["marginLeft"] = half;
          style["marginRight"] = half;
          break;
        }
        putSize(prop, v, true);
        break;
      }
      case "height":
        putSize(prop, v, true);
        break;
      case "line-height": {
        const s = size(v);
        if (s.number !== undefined && s.number >= 0 && s.number <= 100)
          style["lineHeight"] = s.number;
        else if (s.len && s.len !== "auto")
          style["lineHeight"] = s.len.unit === "em" ? s.len.value : s.len;
        if (s.small) phone["lineHeight"] = s.small;
        break;
      }
      case "padding":
        putBox("padding", v);
        break;
      case "margin":
        putBox("margin", v);
        break;
      case "border-width": {
        const raw = un(v);
        if (isRecord(raw) && !("size" in raw)) putBox("border", v, "Width");
        else {
          const s = size(v);
          if (s.len && s.len !== "auto") style["borderWidth"] = s.len;
        }
        break;
      }
      case "border-radius": {
        const raw = un(v);
        if (isRecord(raw) && !("size" in raw)) {
          for (const [corner, key] of Object.entries(CORNERS)) {
            const s = size(raw[corner]);
            if (s.len && s.len !== "auto") style[key] = s.len;
          }
        } else {
          const s = size(v);
          if (s.len && s.len !== "auto") style["borderRadius"] = s.len;
          if (s.small) phone["borderRadius"] = s.small;
        }
        break;
      }
      case "border-color": {
        const c = colorOf(v, snap);
        if (c) style["borderColor"] = c;
        break;
      }
      case "border-style": {
        const s = pick(BORDER_STYLES, v);
        if (s) style["borderStyle"] = s;
        break;
      }
      case "font-family": {
        const name =
          typeOf(v) === "global-font-variable"
            ? str(snap.variables.get(str(un(v)) ?? "")?.value)
            : str(un(v));
        const stack = ctx.useFont(name);
        if (stack) style["fontFamily"] = stack;
        break;
      }
      case "font-weight": {
        const w = fontWeight(un(v));
        if (w !== undefined) style["fontWeight"] = w;
        break;
      }
      case "gap": {
        const raw = un(v);
        const s = isRecord(raw) && "column" in raw ? size(raw["column"]) : size(v);
        if (s.len && s.len !== "auto") style["gap"] = s.len;
        if (s.small) phone["gap"] = s.small;
        break;
      }
      case "align-items":
      case "justify-content":
      case "flex-direction":
      case "flex-wrap":
      case "text-transform":
      case "text-align":
      case "text-decoration":
      case "overflow":
      case "object-fit":
      case "position": {
        const lists: Record<string, readonly string[]> = {
          "align-items": ALIGN_ITEMS,
          "justify-content": JUSTIFY_CONTENT,
          "flex-direction": FLEX_DIRECTIONS,
          "flex-wrap": FLEX_WRAPS,
          "text-transform": TEXT_TRANSFORMS,
          "text-align": TEXT_ALIGNS,
          "text-decoration": TEXT_DECORATIONS,
          overflow: OVERFLOWS,
          "object-fit": OBJECT_FITS,
          position: POSITIONS,
        };
        const raw = str(un(v));
        const mapped = raw === "start" ? "flex-start" : raw === "end" ? "flex-end" : raw;
        const value =
          pick(lists[prop] ?? [], mapped) ??
          (prop === "text-align" && (raw === "start" || raw === "end")
            ? raw === "start"
              ? "left"
              : "right"
            : undefined);
        const key = prop.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
        if (value) style[key] = value;
        else out.unsupported.push(`${prop}: ${raw ?? "?"}`);
        break;
      }
      case "inset-block-start":
      case "inset-inline-end":
      case "inset-block-end":
      case "inset-inline-start": {
        const key = {
          "inset-block-start": "top",
          "inset-inline-end": "right",
          "inset-block-end": "bottom",
          "inset-inline-start": "left",
        }[prop];
        if (key) putSize(key, v, true, true);
        break;
      }
      case "z-index": {
        const n = Number(un(v));
        if (Number.isInteger(n) && Math.abs(n) <= 9999) style["zIndex"] = n;
        break;
      }
      case "opacity": {
        const s = size(v);
        if (s.len && s.len !== "auto")
          style["opacity"] = Math.min(
            1,
            Math.max(0, s.len.unit === "%" ? s.len.value / 100 : s.len.value),
          );
        else if (s.number !== undefined) style["opacity"] = Math.min(1, Math.max(0, s.number));
        break;
      }
      case "aspect-ratio": {
        const m = /^\s*(\d{1,4})\s*\/\s*(\d{1,4})\s*$/.exec(str(un(v)) ?? "");
        if (m && Number(m[1]) > 0 && Number(m[2]) > 0) style["aspectRatio"] = `${m[1]}/${m[2]}`;
        break;
      }
      case "cursor": {
        const c = str(un(v));
        if (c === "pointer" || c === "default") style["cursor"] = c;
        break;
      }
      case "box-shadow": {
        const list = un(v);
        const first = Array.isArray(list) ? un(list[0]) : undefined;
        if (!isRecord(first)) break;
        const n = (key: string, lo: number, hi: number) => {
          const s = size(first[key], { negative: true });
          return s.len && s.len !== "auto" ? Math.min(hi, Math.max(lo, s.len.value)) : 0;
        };
        const c = colorOf(first["color"], snap);
        style["boxShadow"] = {
          x: n("hOffset", -1000, 1000),
          y: n("vOffset", -1000, 1000),
          blur: n("blur", 0, 1000),
          spread: n("spread", -1000, 1000),
          ...(c ? { color: c } : {}),
          ...(str(un(first["position"])) === "inset" ? { inset: true } : {}),
        };
        break;
      }
      case "transition": {
        const list = un(v);
        const items = (Array.isArray(list) ? list : []).map((item) => un(item)).filter(isRecord);
        const targets = new Set<string>();
        let ms = 0;
        for (const item of items) {
          const selection = un(item["selection"]);
          const key = isRecord(selection) ? str(un(selection["key"])) : undefined;
          const amount = un(item["size"]);
          if (isRecord(amount)) {
            const n = Number(amount["size"]);
            const unitName = str(amount["unit"]);
            if (Number.isFinite(n)) ms = Math.max(ms, unitName === "s" ? n * 1000 : n);
          }
          const mapped =
            key === "opacity"
              ? "opacity"
              : key === "box-shadow"
                ? "shadow"
                : key === "filter"
                  ? "filter"
                  : key && /color/.test(key)
                    ? "colors"
                    : "all";
          targets.add(mapped);
        }
        if (items.length > 0) {
          style["motion"] = {
            transition: {
              property: targets.size === 1 ? [...targets][0] : "all",
              duration: Math.min(2000, Math.max(0, Math.round(ms))),
              easing: "ease",
            },
          };
        }
        break;
      }
      case "grid-column": {
        const span = str(un(v))?.replace(/\s+/g, "");
        if (span === "1/-1" || span === "span-1" || span === "1/span-1") out.fullRow = true;
        else out.unsupported.push(`grid-column: ${span ?? "?"}`);
        break;
      }
      case "flex": {
        // W-954: `{ flexGrow?, flexShrink?, flexBasis? }`.
        const raw = un(v);
        if (!isRecord(raw)) break;
        const grow = Number(un(raw["flexGrow"]));
        const shrink = Number(un(raw["flexShrink"]));
        if (raw["flexGrow"] !== undefined && Number.isFinite(grow) && grow >= 0 && grow <= 100)
          style["flexGrow"] = grow;
        if (
          raw["flexShrink"] !== undefined &&
          Number.isFinite(shrink) &&
          shrink >= 0 &&
          shrink <= 100
        )
          style["flexShrink"] = shrink;
        if (raw["flexBasis"] !== undefined) {
          const basis = size(raw["flexBasis"]);
          if (basis.len) style["flexBasis"] = basis.len;
        }
        break;
      }
      case "align-self":
      case "order": {
        const { style: mapped } = declarations(`${prop}: ${str(un(v)) ?? String(un(v))}`);
        if (Object.keys(mapped).length > 0) Object.assign(style, mapped);
        else out.unsupported.push(prop);
        break;
      }
      case "transform": {
        // W-953: move, scale and rotate; skew and 3D parts are left out.
        const fns = un(isRecord(un(v)) ? (un(v) as Settings)["transform-functions"] : undefined);
        const out3: Record<string, number> = {};
        for (const fn of Array.isArray(fns) ? fns : []) {
          const kind = typeOf(fn);
          const body = un(fn);
          if (!isRecord(body)) continue;
          if (kind === "transform-move") {
            for (const axis of ["x", "y"] as const) {
              const sz = size(body[axis], { negative: true });
              if (sz.len && sz.len !== "auto" && sz.len.unit === "px" && sz.len.value !== 0) {
                out3[axis] = Math.round(Math.min(2000, Math.max(-2000, sz.len.value)));
              }
            }
          } else if (kind === "transform-scale") {
            const x = Number(un(body["x"]));
            if (Number.isFinite(x) && x !== 1)
              out3["scale"] = Math.round(Math.min(4, Math.max(0.1, x)) * 100);
          } else if (kind === "transform-rotate") {
            const z = un(body["z"]);
            const amount = isRecord(z) ? Number(z["size"]) : Number.NaN;
            const unit = isRecord(z) ? str(z["unit"]) : undefined;
            const perUnit: Record<string, number> = {
              deg: 1,
              turn: 360,
              rad: 180 / Math.PI,
              grad: 0.9,
            };
            const deg =
              Number.isFinite(amount) && unit && perUnit[unit]
                ? amount * (perUnit[unit] ?? 1)
                : undefined;
            if (deg !== undefined && deg !== 0)
              out3["rotate"] = Math.round(Math.min(360, Math.max(-360, deg)));
          } else out.unsupported.push(kind ?? "transform");
        }
        if (Object.keys(out3).length > 0) style["transform"] = out3;
        break;
      }
      case "font-style":
      case "white-space":
      case "overflow-wrap":
      case "object-position":
      case "overflow-x":
      case "overflow-y": {
        const raw = str(un(v));
        const { style: mapped } = declarations(`${prop}: ${raw ?? ""}`);
        if (Object.keys(mapped).length > 0) Object.assign(style, mapped);
        else out.unsupported.push(`${prop}: ${raw ?? "?"}`);
        break;
      }
      case "backdrop-filter": {
        const list = un(v);
        const blur = (Array.isArray(list) ? list : [])
          .map((f) => un(f))
          .filter(isRecord)
          .find((f) => str(un(f["func"])) === "blur");
        // `{ func: "blur", args: { $$type: "blur", value: { size: <size> } } }`
        const args = blur ? un(blur["args"]) : undefined;
        const radius = isRecord(args) ? size(args["size"]) : {};
        const px =
          radius.len && radius.len !== "auto" && radius.len.unit === "px"
            ? radius.len.value
            : undefined;
        if (px !== undefined && px >= 0 && px <= 100) style["backdropFilter"] = { blur: px };
        else out.unsupported.push("backdrop-filter");
        break;
      }
      default:
        out.unsupported.push(prop);
    }
  }
  return out;
}

const DEVICE_OF: Record<string, "desktop" | "tablet" | "mobile"> = {
  desktop: "desktop",
  widescreen: "desktop",
  laptop: "tablet",
  tablet_extra: "tablet",
  tablet: "tablet",
  mobile_extra: "mobile",
  mobile: "mobile",
};
/** Elementor's desktop-first cascade, narrowest last: later entries win. */
const BREAKPOINT_ORDER = [
  "widescreen",
  "desktop",
  "laptop",
  "tablet_extra",
  "tablet",
  "mobile_extra",
  "mobile",
];

type AtomicStyle = {
  style: Style;
  devices: { tablet?: Style; mobile?: Style };
  states: { hover?: Style; focus?: Style; active?: Style };
  display: { desktop?: string; tablet?: string; mobile?: string };
  columns: { desktop?: number; tablet?: number; mobile?: number };
  tracks: { desktop?: string[]; tablet?: string[]; mobile?: string[] };
  fullRow: boolean;
};

/** Base styles Elementor gives each atomic element before any class. */
const BASE: Record<string, Settings> = {
  "e-flexbox": {
    display: "flex",
    "flex-direction": "row",
    padding: { $$type: "size", value: { size: 10, unit: "px" } },
  },
  "e-div-block": {
    display: "block",
    padding: { $$type: "size", value: { size: 10, unit: "px" } },
    "min-width": { $$type: "size", value: { size: 30, unit: "px" } },
  },
  "e-button": {
    background: { $$type: "background", value: { color: { $$type: "color", value: "#375EFB" } } },
    color: { $$type: "color", value: "#ffffff" },
    padding: {
      $$type: "dimensions",
      value: {
        "block-start": { $$type: "size", value: { size: 12, unit: "px" } },
        "inline-end": { $$type: "size", value: { size: 24, unit: "px" } },
        "block-end": { $$type: "size", value: { size: 12, unit: "px" } },
        "inline-start": { $$type: "size", value: { size: 24, unit: "px" } },
      },
    },
    "border-radius": { $$type: "size", value: { size: 2, unit: "px" } },
    "border-style": { $$type: "string", value: "none" },
    "text-align": { $$type: "string", value: "center" },
  },
  "e-svg": {
    width: { $$type: "size", value: { size: 65, unit: "px" } },
    height: { $$type: "size", value: { size: 65, unit: "px" } },
  },
};

/** The classes an atomic element uses, in the order their styles apply (last wins). */
function classesOf(el: Settings, snap: AtomicSnapshots): ClassDef[] {
  const settings = isRecord(el["settings"]) ? el["settings"] : {};
  const ids = un(settings["classes"]);
  const local = isRecord(el["styles"]) ? el["styles"] : {};
  const list = Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
  const globals = list
    .filter((id) => snap.classes.has(id))
    // Elementor: a class higher in the Class Manager order wins, so it is applied last.
    .toSorted((a, b) => (snap.rank.get(b) ?? 0) - (snap.rank.get(a) ?? 0))
    .map((id) => snap.classes.get(id) as ClassDef);
  const locals = list.filter((id) => isRecord(local[id])).map((id) => local[id] as ClassDef);
  return [...globals, ...locals];
}

/** Every class and base style of an element, folded into EmVB style, devices and states. */
function atomicStyle(
  type: string,
  el: Settings,
  snap: AtomicSnapshots,
  ctx: ImportContext,
  name: string,
  /** Read again for one value: don't repeat the notes. */
  quiet = false,
): AtomicStyle {
  const layers: Record<"desktop" | "tablet" | "mobile", Style> = {
    desktop: {},
    tablet: {},
    mobile: {},
  };
  const phoneFromFluid: Style = {};
  const narrowFromWidth: Style = {};
  const states: AtomicStyle["states"] = {};
  const display: AtomicStyle["display"] = {};
  const columns: AtomicStyle["columns"] = {};
  const tracks: AtomicStyle["tracks"] = {};
  let fullRow = false;
  const unsupported = new Set<string>();
  const variants: ClassVariant[] = [];
  if (BASE[type])
    variants.push({ meta: { breakpoint: "desktop", state: null }, props: BASE[type] });
  for (const def of classesOf(el, snap)) {
    const own = Array.isArray(def.variants) ? def.variants : [];
    // Within a class, wider breakpoints first so narrower ones override them.
    variants.push(
      ...own.toSorted(
        (a, b) =>
          BREAKPOINT_ORDER.indexOf(a.meta?.breakpoint ?? "desktop") -
          BREAKPOINT_ORDER.indexOf(b.meta?.breakpoint ?? "desktop"),
      ),
    );
  }
  let folded = false;
  for (const variant of variants) {
    const breakpoint = variant.meta?.breakpoint ?? "desktop";
    const state = variant.meta?.state ?? null;
    const device = DEVICE_OF[breakpoint];
    if (!device) {
      unsupported.add(`${breakpoint} breakpoint`);
      continue;
    }
    if (breakpoint !== device && breakpoint !== "widescreen") folded = true;
    const converted = convert(isRecord(variant.props) ? variant.props : {}, snap, ctx);
    if (variant.custom_css) {
      const raw = isRecord(variant.custom_css) ? variant.custom_css["raw"] : undefined;
      const css = decodeRawCss(raw);
      if (css === undefined) unsupported.add("custom CSS");
      else {
        const extra = declarations(css);
        Object.assign(converted.style, extra.style);
        for (const prop of extra.unmapped) unsupported.add(prop);
      }
    }
    for (const u of converted.unsupported) unsupported.add(u);
    if (state) {
      const key = state === "focus-visible" ? "focus" : state;
      if ((key === "hover" || key === "focus" || key === "active") && device === "desktop") {
        states[key] = { ...states[key], ...converted.style };
      } else unsupported.add(`${state} state`);
      continue;
    }
    // A fluid value set for phones uses its small bound there (narrow phones get it in Elementor).
    Object.assign(layers[device], converted.style, device === "mobile" ? converted.phone : {});
    if (device === "desktop") Object.assign(phoneFromFluid, converted.phone);
    if (converted.narrow && device === "desktop") {
      Object.assign(narrowFromWidth, converted.narrow);
    }
    if (converted.display) display[device] = converted.display;
    if (converted.fullRow) fullRow = true;
    if (converted.columns) {
      columns[device] = converted.columns;
      if (converted.tracks) tracks[device] = converted.tracks;
      else delete tracks[device];
    }
  }
  if (folded && !quiet)
    ctx.note(
      "approximated",
      "Breakpoints",
      "Laptop and extra breakpoints were folded into Tablet and Mobile.",
    );
  if (Object.keys(phoneFromFluid).length > 0 && !quiet) {
    ctx.note(
      "approximated",
      "Fluid sizes",
      "Fluid sizes use their large value on desktop and their small value on phones.",
    );
  }
  for (const what of quiet ? [] : unsupported) {
    ctx.note("approximated", name, `Left out a style EmVB has no setting for: ${what}.`);
  }
  for (const layer of [layers.desktop, layers.tablet, layers.mobile]) finishBorders(layer);
  const mobile = { ...narrowFromWidth, ...phoneFromFluid, ...layers.mobile };
  const tablet = changedKeys(layers.desktop, { ...narrowFromWidth, ...layers.tablet });
  const devices: AtomicStyle["devices"] = {};
  if (!isEmptyStyle(tablet)) devices.tablet = tablet;
  const mobileChanged = changedKeys({ ...layers.desktop, ...layers.tablet }, mobile);
  if (!isEmptyStyle(mobileChanged)) devices.mobile = mobileChanged;
  const statesOut: AtomicStyle["states"] = {};
  for (const [k, v] of Object.entries(states))
    if (!isEmptyStyle(v)) statesOut[k as keyof AtomicStyle["states"]] = v;
  // A narrower device with only a count must not inherit a wider device's custom tracks.
  let wider = tracks.desktop;
  for (const device of ["tablet", "mobile"] as const) {
    const count = columns[device];
    if (count && !tracks[device] && wider)
      tracks[device] = Array.from({ length: count }, () => "1fr");
    wider = tracks[device] ?? wider;
  }
  return { style: layers.desktop, devices, states: statesOut, display, columns, tracks, fullRow };
}

// ---------------------------------------------------------------------------------------------
// Elements

const settingsOf = (el: Settings): Settings => (isRecord(el["settings"]) ? el["settings"] : {});
const text = (v: unknown) =>
  cleanText(
    decodeEntities((str(un(v)) ?? "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, "")),
    true,
  );

/** An atomic link: a URL, or a page or dynamic link that can't be resolved here (noted). */
function linkOf(v: unknown, ctx: ImportContext, name: string): { href?: string; newTab?: boolean } {
  const raw = un(v);
  if (!isRecord(raw)) return {};
  const destination = raw["destination"];
  const kind = typeOf(destination);
  const newTab = un(raw["isTargetBlank"]) === true;
  if (kind === "url" || typeof destination === "string") {
    const safe = sanitizeHref(str(un(destination)) ?? "");
    return safe ? { href: safe, ...(newTab ? { newTab: true } : {}) } : {};
  }
  if (kind)
    ctx.note(
      "approximated",
      name,
      "Links to WordPress pages or dynamic values were left out; set them in the editor.",
    );
  return {};
}

/** An Elementor 4 `svg-src` that names only a WordPress media id (W-951). */
function mediaId(v: unknown): number | undefined {
  const source = un(v);
  const id = isRecord(source) ? un(source["id"]) : undefined;
  return typeof id === "number" && Number.isInteger(id) && id > 0 ? id : undefined;
}

/**
 * An Elementor 4 SVG as an Icon (W-951): sized from its width in px (the svg fills the box), named
 * by its link when it has one, decorative otherwise. Without markup the icon is an empty slot.
 */
function svgIcon(
  styled: (n: N) => N,
  ctx: ImportContext,
  iconId: string,
  markup: string | undefined,
  linkProps: { href?: string; newTab?: boolean },
  title: string,
): N {
  const n = styled(
    node(ctx, "icon", {
      iconId,
      ...(markup ? { iconSvg: markup } : {}),
      ...(linkProps.href ? { ...linkProps, title } : { decorative: true }),
    }),
  );
  const width = (n["style"] as Style | undefined)?.width;
  if (isRecord(width) && width["unit"] === "px" && typeof width["value"] === "number") {
    const px = Math.round(width["value"]);
    if (px > 0 && px <= 512) (n["props"] as Record<string, unknown>)["size"] = px;
  }
  return n;
}

function imageUrl(v: unknown): string | undefined {
  const image = un(v);
  const src = isRecord(image) && "src" in image ? un(image["src"]) : image;
  const url = isRecord(src) ? str(un(src["url"])) : undefined;
  return url ? sanitizeMediaUrl(url) : undefined;
}

const LABEL_FOR = (el: Settings) => str(un(settingsOf(el)["input-id"]));

function applyStyle(n: N, s: AtomicStyle): N {
  if (!isEmptyStyle(s.style)) n["style"] = { ...(n["style"] as Style | undefined), ...s.style };
  if (s.devices.tablet || s.devices.mobile) n["devices"] = s.devices;
  if (Object.keys(s.states).length > 0) n["states"] = s.states;
  const hidden = (["desktop", "tablet", "mobile"] as const).filter((d) => s.display[d] === "none");
  if (hidden.length > 0) n["hiddenOn"] = hidden;
  return n;
}

const CONTAINER_TAGS = new Set([
  "section",
  "header",
  "footer",
  "main",
  "article",
  "aside",
  "nav",
  "div",
]);

/** Maps Elementor 4 elements; returns undefined for types it doesn't know. */
export function atomicElement(
  el: Settings,
  ctx: ImportContext,
  snap: AtomicSnapshots,
  env: Env,
): N[] | undefined {
  const nodes = elementNodes(el, ctx, snap, env);
  const [first] = nodes ?? [];
  const grid = env.grid;
  if (first && grid && nodes?.length === 1) {
    const type = str(el["widgetType"]) ?? str(el["elType"]) ?? "";
    if (atomicStyle(type, el, snap, ctx, labelOf(type), true).fullRow) {
      // `grid-column: 1 / -1` spans the parent's columns on each device.
      first["style"] = { ...(first["style"] as Style | undefined), gridColumnSpan: grid.desktop };
      const devices = { ...(first["devices"] as Record<string, Style> | undefined) };
      if (grid.tablet && grid.tablet !== grid.desktop)
        devices["tablet"] = { ...devices["tablet"], gridColumnSpan: grid.tablet };
      if (grid.mobile && grid.mobile !== (grid.tablet ?? grid.desktop))
        devices["mobile"] = { ...devices["mobile"], gridColumnSpan: grid.mobile };
      if (Object.keys(devices).length > 0) first["devices"] = devices;
    }
  }
  return nodes;
}

function elementNodes(
  el: Settings,
  ctx: ImportContext,
  snap: AtomicSnapshots,
  env: Env,
): N[] | undefined {
  const { walk, form } = env;
  const type = str(el["widgetType"]) ?? str(el["elType"]) ?? "";
  const s = settingsOf(el);
  const name = labelOf(type);
  const styled = (n: N) => applyStyle(n, atomicStyle(type, el, snap, ctx, name));
  const kids = (next: Partial<Env> = {}) => {
    const { grid: _grid, ...rest } = env;
    return walk(el["elements"], { ...rest, depth: env.depth + 1, ...next });
  };
  const editorLabel = isRecord(el["editor_settings"])
    ? str(el["editor_settings"]["title"])?.trim().slice(0, 80)
    : undefined;
  const label = (n: N) => {
    if (editorLabel) n["editorLabel"] = editorLabel;
    const id = str(un(s["_cssid"]));
    if (id && /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(id) && !ctx.htmlIds.has(id)) {
      ctx.htmlIds.add(id);
      n["htmlId"] = id;
    }
    return n;
  };

  switch (type) {
    case "e-flexbox":
    case "e-div-block":
    case "e-form-success-message":
    case "e-form-error-message": {
      if (type === "e-form-success-message" || type === "e-form-error-message") {
        ctx.note(
          "approximated",
          "Form",
          "Form success and error messages come from the forms plugin; Elementor's were left out.",
        );
        return [];
      }
      const st = atomicStyle(type, el, snap, ctx, name);
      const d = st.display.desktop ?? (type === "e-flexbox" ? "flex" : "block");
      const tag = str(un(s["tag"]));
      const linkProps = linkOf(s["link"], ctx, name);
      let n: N;
      if (d === "grid") {
        const tablet = st.columns.tablet;
        const mobile = st.columns.mobile;
        n = node(
          ctx,
          "grid",
          {
            columns: st.columns.desktop ?? 1,
            ...(tablet ? { columnsTablet: tablet } : {}),
            ...(mobile ? { columnsMobile: mobile } : {}),
            ...(st.tracks.desktop ? { columnTracks: st.tracks.desktop } : {}),
            ...(st.tracks.tablet ? { columnTracksTablet: st.tracks.tablet } : {}),
            ...(st.tracks.mobile ? { columnTracksMobile: st.tracks.mobile } : {}),
            ...linkProps,
          },
          {
            children: kids({
              parentRow: true,
              grid: {
                desktop: st.columns.desktop ?? 1,
                ...(tablet ? { tablet } : {}),
                ...(mobile ? { mobile } : {}),
              },
            }),
          },
        );
      } else if (
        d === "flex" ||
        d === "inline-flex" ||
        (tag && CONTAINER_TAGS.has(tag) && tag !== "div")
      ) {
        const row =
          d.includes("flex") && (st.style["flexDirection"] ?? "row").toString().startsWith("row");
        n = node(
          ctx,
          "container",
          { ...(tag && CONTAINER_TAGS.has(tag) ? { tag } : {}), ...linkProps },
          {
            style: { flexDirection: d.includes("flex") ? "row" : "column" },
            children: kids({ parentRow: row }),
          },
        );
        // Block on desktop, flex elsewhere is rare; a block box is shown as a column.
      } else {
        n = node(ctx, "div-block", linkProps, { children: kids({ parentRow: false }) });
      }
      applyStyle(n, st);
      // A container that turns into a block on a device stacks its children there.
      for (const device of ["tablet", "mobile"] as const) {
        const dd = st.display[device];
        if (n.type === "container" && dd === "block") {
          const devices = { ...(n["devices"] as Record<string, Style> | undefined) };
          devices[device] = { ...devices[device], flexDirection: "column" };
          n["devices"] = devices;
        }
      }
      return [label(n)];
    }
    case "e-heading": {
      const tag = str(un(s["tag"])) ?? "h2";
      const level = /^h([1-6])$/.exec(tag)?.[1];
      const t = text(s["title"]).replace(/\n+/g, " ");
      if (!t) return [];
      const linkProps = linkOf(s["link"], ctx, name);
      if (level)
        return splitLong(t).map((part) =>
          label(styled(node(ctx, "heading", { text: part, level: Number(level), ...linkProps }))),
        );
      return splitLong(t).map((part) =>
        label(styled(node(ctx, "text", { text: part, tag: tag === "div" ? "div" : "p" }))),
      );
    }
    case "e-paragraph": {
      const t = text(s["paragraph"]);
      if (!t) return [];
      const linkProps = linkOf(s["link"], ctx, name);
      if (linkProps.href)
        return [label(styled(node(ctx, "link", { text: t.slice(0, 2000), ...linkProps })))];
      const tag = str(un(s["tag"]));
      return splitLong(t).map((part) =>
        label(styled(node(ctx, "text", { text: part, ...(tag === "div" ? { tag: "div" } : {}) }))),
      );
    }
    case "e-button": {
      const t = text(s["text"]).replace(/\n+/g, " ") || "Button";
      return [
        label(
          styled(node(ctx, "button", { text: t.slice(0, 2000), ...linkOf(s["link"], ctx, name) })),
        ),
      ];
    }
    case "e-image": {
      const url = imageUrl(s["image"]);
      if (!url) {
        ctx.note("skipped", name, "An image without an address in the export was left out.");
        return [];
      }
      ctx.externalImage(url);
      const alt = text(s["alt"]) || "";
      if (!alt)
        ctx.note(
          "approximated",
          name,
          "Images without alt text got one from their file name; check it.",
        );
      return [
        label(
          styled(
            node(ctx, "image", {
              src: url,
              alt: alt || altFromUrl(url),
              ...linkOf(s["link"], ctx, name),
            }),
          ),
        ),
      ];
    }
    case "e-svg": {
      const url = imageUrl(s["svg"]);
      const linkProps = linkOf(s["link"], ctx, name);
      // W-951: with the file's markup the SVG is inline, so CSS colour reaches currentColor.
      const markup = url ? ctx.svgMarkup(url) : undefined;
      if (url && markup)
        return [label(svgIcon(styled, ctx, svgFileId(url), markup, linkProps, altFromUrl(url)))];
      if (!url) {
        // Elementor exports name an uploaded SVG by its WordPress media id only.
        const media = mediaId(s["svg"]);
        if (media === undefined) return [];
        ctx.note(
          "skipped",
          name,
          "SVG files aren't in Elementor exports, so these are empty Icon elements at their size; pick each file again in the editor (Icon → My uploads).",
        );
        return [label(svgIcon(styled, ctx, `wp-media:${media}`, undefined, linkProps, "Icon"))];
      }
      ctx.externalImage(url);
      ctx.note(
        "approximated",
        name,
        "SVG files that couldn't be read are shown as images, so colours can't change them; add the .svg files in the import dialog to make them recolourable icons.",
      );
      return [
        label(
          styled(
            node(ctx, "image", {
              src: url,
              alt: linkProps.href ? altFromUrl(url) : "",
              ...(linkProps.href ? linkProps : { decorative: true }),
            }),
          ),
        ),
      ];
    }
    case "e-divider":
      return [label(styled(node(ctx, "divider", {})))];
    case "e-youtube": {
      const url = embedVideoUrl(str(un(s["source"])) ?? "") ?? str(un(s["source"]));
      const safe = url ? sanitizeHref(url) : undefined;
      return safe ? [label(styled(node(ctx, "video", { url: safe, title: "Video" })))] : [];
    }
    case "e-accordion": {
      const items = (Array.isArray(el["elements"]) ? el["elements"] : []).filter(isRecord);
      const first = str(un(s["default_state"])) === "first_expanded";
      const children = items.map((item, i) => {
        const parts = (Array.isArray(item["elements"]) ? item["elements"] : []).filter(isRecord);
        const header = parts.find((p) => p["elType"] === "e-accordion-item-header");
        const content = parts.find((p) => p["elType"] === "e-accordion-item-content");
        const summary = (collectText(header) || "Item").slice(0, 200);
        return node(
          ctx,
          "accordion-item",
          { summary, ...(first && i === 0 ? { open: true } : {}) },
          {
            children: content
              ? walk(content["elements"], { ...env, parentRow: false, depth: env.depth + 2 })
              : [],
          },
        );
      });
      return children.length > 0 ? [label(styled(node(ctx, "accordion", {}, { children })))] : [];
    }
    case "e-tabs": {
      const panels: N[] = [];
      const menu = findAll(el, "e-tab");
      const contents = findAll(el, "e-tab-content");
      menu.slice(0, 12).forEach((tab, i) => {
        const content = contents[i];
        panels.push(
          node(
            ctx,
            "tab-panel",
            { label: (collectText(tab) || `Tab ${i + 1}`).slice(0, 2000) },
            {
              children: content
                ? walk(content["elements"], { ...env, parentRow: false, depth: env.depth + 2 })
                : [],
            },
          ),
        );
      });
      return panels.length > 0 ? [label(styled(node(ctx, "tabs", {}, { children: panels })))] : [];
    }
    case "e-form": {
      const labels = new Map<string, string>();
      const byField = new Map<Settings, string>();
      for (const l of findAll(el, "e-form-label")) {
        const id = LABEL_FOR(l);
        if (id) labels.set(id, text(settingsOf(l)["text"]).replace(/\n+/g, " ").slice(0, 200));
      }
      // A label without `input-id` names the field beside it in the same box.
      pairSiblingLabels(el, byField);
      ctx.note(
        "approximated",
        "Form",
        "Connect each imported form to a form in the forms plugin; Elementor's submit actions weren't imported.",
      );
      const n = node(
        ctx,
        "form",
        { formId: "" },
        {
          children: kids({ form: { labels, byField }, parentRow: false }),
        },
      );
      return [label(styled(n))];
    }
    case "e-form-label":
      return form
        ? []
        : [label(styled(node(ctx, "text", { text: text(settingsOf(el)["text"]) || "Label" })))];
    case "e-form-input":
    case "e-form-textarea":
    case "e-form-select":
    case "e-form-checkbox": {
      if (!form) {
        ctx.note("skipped", name, "A form field outside a form was left out.");
        return [];
      }
      const id = str(un(s["_cssid"]));
      let field = str(un(s["name"])) ?? id ?? "";
      field = field.replace(/[^A-Za-z0-9_-]/g, "_");
      if (!FIELD_NAME_PATTERN.test(field) || field.length > 80) field = `field_${ctx.nodes + 1}`;
      const fieldLabel =
        (id ? form.labels.get(id) : undefined) ??
        form.byField?.get(el) ??
        (text(s["label"]) || (type === "e-form-checkbox" ? text(s["value"]) : ""));
      const placeholder = text(s["placeholder"]).slice(0, 200);
      const kind =
        type === "e-form-textarea"
          ? "textarea"
          : type === "e-form-select"
            ? "select"
            : type === "e-form-checkbox"
              ? "checkbox"
              : "text-input";
      if (kind === "select")
        ctx.note(
          "approximated",
          "Form",
          "Select options come from the forms plugin form; Elementor's options weren't imported.",
        );
      return [
        node(ctx, kind, {
          field,
          ...(fieldLabel ? { label: fieldLabel.slice(0, 200) } : {}),
          ...(placeholder && kind !== "checkbox" ? { placeholder } : {}),
        }),
      ];
    }
    case "e-form-submit-button": {
      if (!form) return [];
      const t = text(s["text"]).replace(/\n+/g, " ").slice(0, 80);
      return [label(styled(node(ctx, "submit", t ? { label: t } : {})))];
    }
    default:
      return undefined;
  }
}

const FIELD_TYPES = new Set([
  "e-form-input",
  "e-form-textarea",
  "e-form-select",
  "e-form-checkbox",
]);

function pairSiblingLabels(el: Settings, into: Map<Settings, string>, depth = 0): void {
  if (depth > 12) return;
  const kids = (Array.isArray(el["elements"]) ? el["elements"] : []).filter(isRecord);
  kids.forEach((child, i) => {
    if (child["widgetType"] === "e-form-label" && !LABEL_FOR(child)) {
      const isField = (n: Settings | undefined) =>
        n !== undefined && FIELD_TYPES.has(str(n["widgetType"]) ?? "");
      const target =
        isField(kids[i - 1]) && !into.has(kids[i - 1] as Settings)
          ? kids[i - 1]
          : isField(kids[i + 1])
            ? kids[i + 1]
            : undefined;
      if (target)
        into.set(target, text(settingsOf(child)["text"]).replace(/\n+/g, " ").slice(0, 200));
    }
    pairSiblingLabels(child, into, depth + 1);
  });
}

function findAll(el: Settings, type: string, out: Settings[] = [], depth = 0): Settings[] {
  if (depth > 12) return out;
  for (const child of Array.isArray(el["elements"]) ? el["elements"] : []) {
    if (!isRecord(child)) continue;
    if (child["elType"] === type || child["widgetType"] === type) out.push(child);
    else findAll(child, type, out, depth + 1);
  }
  return out;
}

/** The text of an element subtree (accordion and tab titles). */
function collectText(el: Settings | undefined): string {
  if (!el) return "";
  const parts: string[] = [];
  const visit = (n: Settings, depth: number) => {
    if (depth > 8) return;
    const s = settingsOf(n);
    for (const key of ["title", "paragraph", "text"])
      if (s[key] !== undefined) parts.push(text(s[key]));
    for (const child of Array.isArray(n["elements"]) ? n["elements"] : [])
      if (isRecord(child)) visit(child, depth + 1);
  };
  visit(el, 0);
  return cleanText(parts.join(" ").replace(/[▸▾►▼]\s*/g, ""));
}

function labelOf(type: string): string {
  return (
    type
      .replace(/^e-/, "")
      .split("-")
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ") || "Element"
  );
}
