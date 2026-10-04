import { z } from "zod";
import { isSafeFontStack } from "../sanitize/css.ts";
import { sanitizeMediaUrl } from "../sanitize/media-url.ts";
import { POPUP_DEVICES } from "../theme/popup-rules.ts";

/** Colour refs omit `from` (legacy). Length/font refs set `from` (W-028). */
export const VariableRef = z.strictObject({
  var: z.string().regex(/^[a-z0-9-]{1,40}$/),
  from: z.enum(["color", "font", "fontSize", "spacing"]).optional(),
});

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
export const ColorValue = z.union([
  z.string().regex(HEX_COLOR, "Use a hex color such as #1a2b3c"),
  VariableRef,
]);

const LengthUnit = z.enum(["px", "rem", "em", "%", "vw", "vh"]);

export const Length = z.strictObject({
  value: z.number().finite().min(0).max(10_000),
  unit: LengthUnit,
});

/** Literal length or a fontSize/spacing variable reference. */
export const LengthValue = z.union([Length, VariableRef]);

/** Width, height and margins may also be `auto` (W-088). */
const SizeValue = z.union([Length, VariableRef, z.literal("auto")]);

/** Top, right, bottom and left may be negative, `auto` or a spacing variable (W-088). */
const OffsetValue = z.union([
  z.strictObject({ value: z.number().finite().min(-10_000).max(10_000), unit: LengthUnit }),
  VariableRef,
  z.literal("auto"),
]);

/** `w/h` with whole numbers 1–9999, emitted as `w / h` (W-088). */
const ASPECT_RATIO = /^[1-9]\d{0,3}\/[1-9]\d{0,3}$/;

const num = (min: number, max: number) => z.number().finite().min(min).max(max);

/** One box shadow in px (W-088). No colour means the text colour, as in CSS. */
const BoxShadow = z.strictObject({
  x: num(-1000, 1000),
  y: num(-1000, 1000),
  blur: num(0, 1000),
  spread: num(-1000, 1000),
  color: ColorValue.optional(),
  inset: z.boolean().optional(),
});

/** Filter functions, emitted in a fixed order; at least one is set (W-088). */
const Filter = z
  .strictObject({
    blur: num(0, 100).optional(),
    brightness: num(0, 300).optional(),
    contrast: num(0, 300).optional(),
    saturate: num(0, 300).optional(),
    grayscale: num(0, 100).optional(),
    hueRotate: num(0, 360).optional(),
  })
  .refine(
    (filter) => Object.values(filter).some((v) => v !== undefined),
    "Set at least one filter",
  );

/**
 * A simple transition (W-089, Normal only): one duration, delay and easing for a fixed property
 * group. `colors` means color, background-color and border-color. No free-form lists or curves.
 */
const Transition = z.strictObject({
  duration: z.number().int().min(0).max(2000),
  delay: z.number().int().min(0).max(2000).optional(),
  easing: z.enum(["ease", "ease-in", "ease-out", "ease-in-out", "linear"]),
  property: z.enum(["all", "colors", "opacity", "shadow", "filter"]),
});

/** Style properties for layout and text elements (W-017 / R-012). Unknown keys are rejected. */
export const StyleProps = z.strictObject({
  flexDirection: z.enum(["row", "column", "row-reverse", "column-reverse"]).optional(),
  flexWrap: z.enum(["nowrap", "wrap", "wrap-reverse"]).optional(),
  justifyContent: z
    .enum(["flex-start", "flex-end", "center", "space-between", "space-around", "space-evenly"])
    .optional(),
  alignItems: z.enum(["stretch", "flex-start", "flex-end", "center", "baseline"]).optional(),
  gap: LengthValue.optional(),
  /** How many grid columns this element spans (1–12). */
  gridColumnSpan: z.number().int().min(1).max(12).optional(),
  /** How many grid rows this element spans (1–12). */
  gridRowSpan: z.number().int().min(1).max(12).optional(),
  width: SizeValue.optional(),
  minWidth: LengthValue.optional(),
  maxWidth: LengthValue.optional(),
  height: SizeValue.optional(),
  minHeight: LengthValue.optional(),
  maxHeight: LengthValue.optional(),
  overflow: z.enum(["visible", "hidden", "clip", "scroll", "auto"]).optional(),
  aspectRatio: z
    .union([z.literal("auto"), z.string().regex(ASPECT_RATIO, "Use a ratio such as 16/9")])
    .optional(),
  objectFit: z.enum(["fill", "contain", "cover", "none", "scale-down"]).optional(),
  paddingTop: LengthValue.optional(),
  paddingRight: LengthValue.optional(),
  paddingBottom: LengthValue.optional(),
  paddingLeft: LengthValue.optional(),
  marginTop: SizeValue.optional(),
  marginRight: SizeValue.optional(),
  marginBottom: SizeValue.optional(),
  marginLeft: SizeValue.optional(),
  position: z.enum(["static", "relative", "absolute", "fixed", "sticky"]).optional(),
  top: OffsetValue.optional(),
  right: OffsetValue.optional(),
  bottom: OffsetValue.optional(),
  left: OffsetValue.optional(),
  zIndex: z.number().int().min(-9999).max(9999).optional(),
  fontFamily: z
    .union([
      z.string().min(1).max(200).refine(isSafeFontStack, "Font stack looks unsafe."),
      VariableRef,
    ])
    .optional(),
  fontSize: LengthValue.optional(),
  fontWeight: z
    .union([
      z.literal(400),
      z.literal(500),
      z.literal(600),
      z.literal(700),
      z.enum(["normal", "bold"]),
    ])
    .optional(),
  lineHeight: LengthValue.optional(),
  letterSpacing: LengthValue.optional(),
  textAlign: z.enum(["left", "center", "right", "justify"]).optional(),
  textTransform: z.enum(["none", "uppercase", "lowercase", "capitalize"]).optional(),
  /** W-113. A button sets `none` in its base CSS, so it is not underlined unless a style says so. */
  textDecoration: z.enum(["none", "underline", "overline", "line-through"]).optional(),
  color: ColorValue.optional(),
  backgroundColor: ColorValue.optional(),
  /** http(s) or a site path. Spaces, quotes and parentheses are refused so the URL can sit inside `url("")`. */
  backgroundImage: z
    .string()
    .min(1)
    .max(2000)
    .refine(
      (value) => sanitizeMediaUrl(value) === value && !/[()\\\s"'`]/.test(value),
      "Use an http(s) URL or a site path, with no spaces or parentheses",
    )
    .optional(),
  backgroundSize: z.enum(["auto", "cover", "contain"]).optional(),
  backgroundPosition: z
    .enum([
      "center",
      "top",
      "bottom",
      "left",
      "right",
      "top left",
      "top right",
      "bottom left",
      "bottom right",
    ])
    .optional(),
  backgroundRepeat: z.enum(["no-repeat", "repeat", "repeat-x", "repeat-y"]).optional(),
  /** Video behind the element. Same URL rules as a background image (W-110). */
  backgroundVideo: z
    .string()
    .min(1)
    .max(2000)
    .refine(
      (value) => sanitizeMediaUrl(value) === value && !/[()\\\s"'`]/.test(value),
      "Use an http(s) URL or a site path, with no spaces or parentheses",
    )
    .optional(),
  /** Two-stop linear gradient. Stops are colours, so a variable binding is a colour use (W-094). */
  gradient: z
    .strictObject({
      angle: z.number().int().min(0).max(360),
      from: ColorValue,
      to: ColorValue,
    })
    .optional(),
  /** A colour laid over the image and gradient. `opacity` is 0–1 (W-094). */
  overlay: z
    .strictObject({
      color: ColorValue,
      opacity: z.number().finite().min(0).max(1),
    })
    .optional(),
  borderWidth: LengthValue.optional(),
  /** Per-side widths (W-138, D-044), after `borderWidth`, so a side beats the all-sides value. */
  borderTopWidth: LengthValue.optional(),
  borderRightWidth: LengthValue.optional(),
  borderBottomWidth: LengthValue.optional(),
  borderLeftWidth: LengthValue.optional(),
  borderStyle: z.enum(["none", "solid", "dashed", "dotted"]).optional(),
  borderColor: ColorValue.optional(),
  borderRadius: LengthValue.optional(),
  /** Per-corner radii (W-138, D-044), after `borderRadius`. */
  borderTopLeftRadius: LengthValue.optional(),
  borderTopRightRadius: LengthValue.optional(),
  borderBottomRightRadius: LengthValue.optional(),
  borderBottomLeftRadius: LengthValue.optional(),
  opacity: z.number().finite().min(0).max(1).optional(),
  boxShadow: BoxShadow.optional(),
  filter: Filter.optional(),
  cursor: z
    .enum([
      "default",
      "pointer",
      "text",
      "move",
      "grab",
      "not-allowed",
      "help",
      "crosshair",
      "zoom-in",
    ])
    .optional(),
  transition: Transition.optional(),
  /**
   * Plays once (W-101, W-107). `delay` waits before it starts. `view` starts as the element
   * scrolls into view, using CSS scroll-driven animations, and falls back to playing on load.
   * Not a state style.
   */
  entrance: z
    .strictObject({
      type: z.enum(["fade", "fade-up", "fade-down", "slide-up", "slide-down", "scale"]),
      duration: z.number().int().min(0).max(2000),
      delay: z.number().int().min(0).max(2000).optional(),
      trigger: z.enum(["load", "view"]).optional(),
    })
    .optional(),
});

export type StyleProps = z.infer<typeof StyleProps>;

/**
 * `states` on a node or class (D-032, W-089): hover, focus (`:focus-visible`) and active, each with
 * the same keys and limits as `style` except `transition` and `entrance`. Unknown states are refused.
 */
const StateStyle = StyleProps.omit({ transition: true, entrance: true });

export const StyleStates = z.strictObject({
  hover: StateStyle.optional(),
  focus: StateStyle.optional(),
  active: StateStyle.optional(),
});

export type StyleStates = z.infer<typeof StyleStates>;

/**
 * Tablet and mobile overrides (W-096). Desktop is the element's `style`. Only keys that differ
 * are stored. A phone matches both media queries, so mobile wins over tablet for the same key.
 */
export const DeviceStyles = z.strictObject({
  tablet: StyleProps.optional(),
  mobile: StyleProps.optional(),
});

export type DeviceStyles = z.infer<typeof DeviceStyles>;

/** Devices on which the element is `display: none`. Empty means shown everywhere. */
export const HiddenOn = z.array(z.enum(POPUP_DEVICES)).max(3);

export type HiddenOn = z.infer<typeof HiddenOn>;
