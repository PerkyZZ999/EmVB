/**
 * Elementor settings → EmVB `style` and `devices` (W-945). Elementor stores a responsive value
 * as `key`, `key_tablet` and `key_mobile`; each reader runs once per device with a getter that
 * adds the suffix, and the tablet and mobile results keep only what changed.
 */
import { ALIGN_ITEMS, BORDER_STYLES, JUSTIFY_CONTENT } from "../../css-keywords.ts";
import { globalRef, type ImportContext, typographyFromGlobal } from "./context.ts";
import {
  backgroundPosition,
  backgroundUrl,
  changedKeys,
  color,
  dimensions,
  flexValue,
  fontWeight,
  isEmptyStyle,
  isRecord,
  num,
  putRadius,
  putSides,
  type Settings,
  slider,
  str,
  textAlign,
} from "./values.ts";

export type Style = Record<string, unknown>;
export type Device = "" | "_tablet" | "_mobile";

/** Reads one device's style from a widget's settings. */
export type Reader = (s: Settings, d: Device, ctx: ImportContext, el: string) => Style;

/** Style for desktop plus tablet/mobile overrides, from several readers. */
export function deviceStyles(
  s: Settings,
  ctx: ImportContext,
  el: string,
  readers: readonly Reader[],
): { style?: Style; devices?: { tablet?: Style; mobile?: Style } } {
  const read = (d: Device) => Object.assign({}, ...readers.map((r) => r(s, d, ctx, el))) as Style;
  const desktop = read("");
  const tablet = changedKeys(desktop, read("_tablet"));
  const mobile = changedKeys({ ...desktop, ...tablet }, read("_mobile"));
  const devices: { tablet?: Style; mobile?: Style } = {};
  if (!isEmptyStyle(tablet)) devices.tablet = tablet;
  if (!isEmptyStyle(mobile)) devices.mobile = mobile;
  return {
    ...(isEmptyStyle(desktop) ? {} : { style: desktop }),
    ...(Object.keys(devices).length > 0 ? { devices } : {}),
  };
}

/** Tablet/mobile values only exist under the suffixed key; desktop-only keys skip other devices. */
const at = (s: Settings, key: string, d: Device) => s[`${key}${d}`];

/** A colour setting: the `__globals__` reference wins, as in Elementor. Desktop only. */
export function colorAt(
  s: Settings,
  key: string,
  ctx: ImportContext,
  d: Device = "",
): string | undefined {
  if (d !== "") return color(at(s, key, d));
  const ref = globalRef(s, key);
  if (ref !== undefined && ref !== "") return ctx.globalColor(ref) ?? color(s[key]);
  return color(s[key]);
}

/** Padding, margin, background, border, radius, shadow and size of a box. `p` is "" or "_". */
export function boxReader(p: "" | "_"): Reader {
  return (s, d, ctx, el) => {
    const style: Style = {};
    putSides(style, "padding", at(s, `${p}padding`, d));
    putSides(style, "margin", at(s, `${p}margin`, d), true);
    Object.assign(style, background(s, `${p}background_`, d, ctx, el));
    const borderType = str(s[`${p}border_border`]);
    if (borderType && borderType !== "none" && borderType !== "") {
      if (d === "") {
        style["borderStyle"] = (BORDER_STYLES as readonly string[]).includes(borderType)
          ? borderType
          : "solid";
        if (!(BORDER_STYLES as readonly string[]).includes(borderType)) {
          ctx.note("approximated", el, `Border style "${borderType}" is shown as solid.`);
        }
        const borderColor = colorAt(s, `${p}border_color`, ctx);
        if (borderColor) style["borderColor"] = borderColor;
      }
      const widths = dimensions(at(s, `${p}border_width`, d));
      const values = Object.values(widths);
      if (values.length === 4 && sameLength(values)) {
        style["borderWidth"] = values[0];
      } else {
        putSides(style, "border", at(s, `${p}border_width`, d));
        for (const side of ["Top", "Right", "Bottom", "Left"]) {
          const value = style[`border${side}`];
          if (value) {
            delete style[`border${side}`];
            style[`border${side}Width`] = value;
          }
        }
      }
    }
    putRadius(style, at(s, `${p}border_radius`, d));
    if (d === "" && s[`${p}box_shadow_box_shadow_type`] === "yes") {
      const shadow = s[`${p}box_shadow_box_shadow`];
      if (isRecord(shadow)) {
        const value = {
          x: clamp(num(shadow["horizontal"]) ?? 0, -1000, 1000),
          y: clamp(num(shadow["vertical"]) ?? 0, -1000, 1000),
          blur: clamp(num(shadow["blur"]) ?? 10, 0, 1000),
          spread: clamp(num(shadow["spread"]) ?? 0, -1000, 1000),
          ...(color(shadow["color"]) ? { color: color(shadow["color"]) } : {}),
          ...(str(s[`${p}box_shadow_box_shadow_position`]) === "inset" ? { inset: true } : {}),
        };
        style["boxShadow"] = value;
      }
    }
    const zIndex = num(at(s, `${p}z_index`, d));
    if (zIndex !== undefined && Number.isInteger(zIndex) && Math.abs(zIndex) <= 9999)
      style["zIndex"] = zIndex;
    if (d === "" && (str(s[`${p}position`]) === "absolute" || str(s[`${p}position`]) === "fixed")) {
      ctx.note(
        "approximated",
        el,
        "Absolute or fixed positioning was left out; the element sits in the flow.",
      );
    }
    return style;
  };
}

/** All four lengths are equal (one shorthand value will do). */
const sameLength = (values: readonly { value: number; unit: string }[]) =>
  values.every((v) => v.value === values[0]?.value && v.unit === values[0]?.unit);

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** `background_*` (or `_background_*`): classic colour and image, gradient, overlay. */
function background(s: Settings, k: string, d: Device, ctx: ImportContext, el: string): Style {
  const style: Style = {};
  const kind = str(s[`${k}background`]);
  if (kind === "classic") {
    const fill = colorAt(s, `${k}color`, ctx, d);
    if (fill) style["backgroundColor"] = fill;
    const url = backgroundUrl(at(s, `${k}image`, d));
    if (url) {
      ctx.externalImage(url);
      style["backgroundImage"] = url;
      const size = str(at(s, `${k}size`, d));
      if (size === "cover" || size === "contain" || size === "auto") style["backgroundSize"] = size;
      else if (d === "") style["backgroundSize"] = "auto";
      const position = backgroundPosition(at(s, `${k}position`, d));
      if (position) style["backgroundPosition"] = position;
      const repeat = str(at(s, `${k}repeat`, d));
      if (
        repeat === "no-repeat" ||
        repeat === "repeat" ||
        repeat === "repeat-x" ||
        repeat === "repeat-y"
      ) {
        style["backgroundRepeat"] = repeat;
      }
      if (d === "" && str(s[`${k}attachment`]) === "fixed") {
        ctx.note(
          "approximated",
          el,
          "Fixed (parallax) background attachment scrolls with the page.",
        );
      }
    }
  } else if (kind === "gradient" && d === "") {
    const a = colorAt(s, `${k}color`, ctx);
    const b = colorAt(s, `${k}color_b`, ctx);
    if (a && b) {
      const stopA = clamp(
        Math.round(
          num(
            isRecord(s[`${k}color_stop`]) ? (s[`${k}color_stop`] as Settings)["size"] : undefined,
          ) ?? 0,
        ),
        0,
        100,
      );
      const stopB = clamp(
        Math.round(
          num(
            isRecord(s[`${k}color_b_stop`])
              ? (s[`${k}color_b_stop`] as Settings)["size"]
              : undefined,
          ) ?? 100,
        ),
        0,
        100,
      );
      const radial = str(s[`${k}gradient_type`]) === "radial";
      const angle =
        num(
          isRecord(s[`${k}gradient_angle`])
            ? (s[`${k}gradient_angle`] as Settings)["size"]
            : undefined,
        ) ?? 180;
      style["gradient"] = {
        type: radial ? "radial" : "linear",
        ...(radial
          ? { position: backgroundPosition(s[`${k}gradient_position`]) ?? "center" }
          : { angle: clamp(Math.round(((angle % 360) + 360) % 360), 0, 360) }),
        stops: [
          { color: a, at: stopA },
          { color: b, at: Math.max(stopA, stopB) },
        ],
      };
    }
  } else if (kind === "video" && d === "") {
    const link = str(s[`${k}video_link`])?.trim();
    if (link && /^https?:\/\/[^\s()"'`\\]+\.(?:mp4|webm|ogg)(?:\?[^\s()"'`\\]*)?$/i.test(link)) {
      style["backgroundVideo"] = link;
    } else {
      ctx.note(
        "approximated",
        el,
        "A YouTube or Vimeo background video was left out (EmVB plays video files only).",
      );
    }
    const fallback = backgroundUrl(s[`${k}video_fallback`]);
    if (fallback) style["backgroundImage"] = fallback;
  } else if (kind === "slideshow" && d === "") {
    const slides = s[`${k}slideshow_gallery`];
    const first = Array.isArray(slides) ? backgroundUrl(slides[0]) : undefined;
    if (first) style["backgroundImage"] = first;
    ctx.note("approximated", el, "A background slideshow shows its first image only.");
  }
  if (d === "") {
    // `background_` → `background_overlay_`, `_background_` → `_background_overlay_`.
    const ok = `${k}overlay_`;
    const overlayKind = str(s[`${ok}background`]);
    if (overlayKind === "classic") {
      const overlay = colorAt(s, `${ok}color`, ctx);
      const opacity = s[`${ok}opacity`];
      const amount = num(isRecord(opacity) ? opacity["size"] : opacity);
      if (overlay) style["overlay"] = { color: overlay, opacity: clamp(amount ?? 0.5, 0, 1) };
    } else if (overlayKind === "gradient") {
      ctx.note("approximated", el, "A gradient overlay was left out.");
    }
  }
  return style;
}

/**
 * Typography under `p` (`typography`, `title_typography`, ...). Elementor applies it only when
 * `${p}_typography` is "custom" or a global; `fallback` is the widget's default global (stock
 * Elementor) when `ctx.useDefaults`.
 */
export function typographyReader(p: string, fallback?: string): Reader {
  return (s, d, ctx: ImportContext, el) => {
    const style: Style = {};
    const ref = globalRef(s, `${p}_typography`);
    if (d === "") {
      const global =
        ref !== undefined && ref !== ""
          ? ctx.globalTypography(ref)
          : str(s[`${p}_typography`]) !== "custom" && fallback && ctx.useDefaults
            ? ctx.globalTypography(fallback)
            : undefined;
      if (global) Object.assign(style, typographyFromGlobal(ctx, global));
    }
    if (str(s[`${p}_typography`]) !== "custom") return style;
    if (d === "") {
      const family = ctx.useFont(s[`${p}_font_family`]);
      if (family) style["fontFamily"] = family;
      const weight = fontWeight(s[`${p}_font_weight`]);
      if (weight !== undefined) style["fontWeight"] = weight;
      const transform = str(s[`${p}_text_transform`]);
      if (
        transform === "uppercase" ||
        transform === "lowercase" ||
        transform === "capitalize" ||
        transform === "none"
      ) {
        style["textTransform"] = transform;
      }
      const decoration = str(s[`${p}_text_decoration`]);
      if (
        decoration === "underline" ||
        decoration === "overline" ||
        decoration === "line-through" ||
        decoration === "none"
      ) {
        style["textDecoration"] = decoration;
      }
      if (str(s[`${p}_font_style`]) === "italic" || str(s[`${p}_font_style`]) === "oblique") {
        ctx.note(
          "approximated",
          el,
          "Italic text is shown upright (EmVB has no italic style setting).",
        );
      }
    }
    const size = slider(at(s, `${p}_font_size`, d));
    if (size) style["fontSize"] = size;
    const lineHeight = at(s, `${p}_line_height`, d);
    const lh = slider(lineHeight);
    if (lh) {
      const unit = isRecord(lineHeight) ? str(lineHeight["unit"]) : undefined;
      style["lineHeight"] =
        unit === "em" || unit === "" || unit === undefined ? Math.min(lh.value, 100) : lh;
    }
    const spacing = slider(at(s, `${p}_letter_spacing`, d), { negative: true });
    if (spacing) style["letterSpacing"] = spacing;
    return style;
  };
}

/** Text colour from `key` (or the widget's default global) and alignment from `alignKey`. */
export function textReader(colorKey: string, fallback?: string, alignKey = "align"): Reader {
  return (s, d, ctx) => {
    const style: Style = {};
    const fill =
      colorAt(s, colorKey, ctx, d) ??
      (d === "" && fallback && ctx.useDefaults && !s[colorKey]
        ? ctx.globalColor(fallback)
        : undefined);
    if (fill) style["color"] = fill;
    const align = textAlign(at(s, alignKey, d));
    if (align) style["textAlign"] = align;
    return style;
  };
}

/** Flex settings of a container (`flex_direction`, `flex_gap`, ...), with Elementor's defaults. */
export const flexReader: Reader = (s, d) => {
  const style: Style = {};
  const direction = str(at(s, "flex_direction", d));
  if (
    direction === "row" ||
    direction === "column" ||
    direction === "row-reverse" ||
    direction === "column-reverse"
  ) {
    style["flexDirection"] = direction;
  } else if (d === "") {
    style["flexDirection"] = "column";
  }
  const justify = flexValue(at(s, "flex_justify_content", d), JUSTIFY_CONTENT);
  if (justify) style["justifyContent"] = justify;
  const align = flexValue(at(s, "flex_align_items", d), ALIGN_ITEMS);
  if (align) style["alignItems"] = align;
  const wrap = str(at(s, "flex_wrap", d));
  if (wrap === "wrap" || wrap === "nowrap" || wrap === "wrap-reverse") style["flexWrap"] = wrap;
  const gapValue = at(s, "flex_gap", d);
  const gap = isRecord(gapValue)
    ? slider({ size: gapValue["column"] ?? gapValue["size"], unit: gapValue["unit"] })
    : undefined;
  if (gap) style["gap"] = gap;
  else if (d === "") style["gap"] = { value: 20, unit: "px" };
  const minHeight = slider(at(s, "min_height", d));
  if (minHeight) style["minHeight"] = minHeight;
  return style;
};

/** Width of a child box: containers' `width`, widgets' `_element_width` (+ custom width). */
export const widthReader =
  (key: "width" | "_element_custom_width"): Reader =>
  (s, d) => {
    const style: Style = {};
    if (key === "_element_custom_width") {
      const mode = str(at(s, "_element_width", d));
      if (mode === "auto") style["width"] = "auto";
      else if (mode === "initial") {
        const width = slider(at(s, key, d));
        if (width) style["width"] = width;
      }
      return style;
    }
    const width = slider(at(s, key, d));
    if (width) style["width"] = width;
    return style;
  };

const ENTRANCES: Record<string, string> = {
  fadeIn: "fade",
  fadeInUp: "fade-up",
  fadeInDown: "fade-down",
  slideInUp: "slide-up",
  slideInDown: "slide-down",
  zoomIn: "scale",
};

/** `_animation` / `animation` → an on-view entrance. */
export function entrance(s: Settings, ctx: ImportContext, el: string): Style | undefined {
  const name = str(s["_animation"]) ?? str(s["animation"]);
  if (!name || name === "none") return undefined;
  let type = ENTRANCES[name];
  if (!type) {
    type = "fade";
    ctx.note("approximated", el, `Entrance animation "${name}" is shown as a fade.`);
  }
  const speed = str(s["animation_duration"]);
  const duration = speed === "slow" ? 2000 : speed === "fast" ? 750 : 1250;
  const delayRaw = num(s["_animation_delay"] ?? s["animation_delay"]);
  const delay = delayRaw !== undefined ? clamp(Math.round(delayRaw), 0, 2000) : undefined;
  return { type, duration, trigger: "view", ...(delay ? { delay } : {}) };
}

/** `hide_desktop` / `hide_tablet` / `hide_mobile` → `hiddenOn`. */
export function hiddenOn(s: Settings): ("desktop" | "tablet" | "mobile")[] | undefined {
  const out: ("desktop" | "tablet" | "mobile")[] = [];
  if (str(s["hide_desktop"])) out.push("desktop");
  if (str(s["hide_tablet"])) out.push("tablet");
  if (str(s["hide_mobile"])) out.push("mobile");
  return out.length > 0 ? out : undefined;
}
