import { z } from "zod";
import {
  ALIGN_ITEMS,
  ALIGN_SELF,
  BACKGROUND_POSITIONS,
  BACKGROUND_REPEATS,
  BACKGROUND_SIZES,
  BORDER_STYLES,
  CURSORS,
  FLEX_DIRECTIONS,
  FLEX_WRAPS,
  FONT_STYLES,
  HEX_COLOR,
  JUSTIFY_CONTENT,
  LENGTH_UNITS,
  OBJECT_FITS,
  OVERFLOW_WRAPS,
  OVERFLOWS,
  POSITIONS,
  TEXT_ALIGNS,
  TEXT_DECORATIONS,
  TEXT_TRANSFORMS,
  TRANSITION_EASINGS,
  TRANSITION_PROPERTIES,
  WHITE_SPACES,
} from "../css-keywords.ts";
import { isSafeFontStack } from "../sanitize/css.ts";
import { sanitizeMediaUrl } from "../sanitize/media-url.ts";
import { POPUP_DEVICES } from "../theme/popup-rules.ts";
import { MOTION_EFFECTS, MOTION_LIMITS } from "./motion.ts";

/** Colour refs omit `from` (legacy). Length/font refs set `from` (W-028). */
export const VariableRef = z.strictObject({
  var: z.string().regex(/^[a-z0-9-]{1,40}$/),
  from: z.enum(["color", "font", "fontSize", "spacing"]).optional(),
});

export const ColorValue = z.union([
  z.string().regex(HEX_COLOR, "Use a hex color such as #1a2b3c"),
  VariableRef,
]);

/** `ch` since W-331: the width of a "0", for readable line lengths such as 65ch. */
const LengthUnit = z.enum(LENGTH_UNITS);

export const Length = z.strictObject({
  value: z.number().finite().min(0).max(10_000),
  unit: LengthUnit,
});

/** Literal length or a fontSize/spacing variable reference. */
export const LengthValue = z.union([Length, VariableRef]);

/** Width, height and margins may also be `auto` (W-088). */
const SizeValue = z.union([Length, VariableRef, z.literal("auto")]);

/**
 * Top, right, bottom and left may be negative, `auto` or a spacing variable (W-088); so may
 * margins since W-331, to pull an element over its neighbour.
 */
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
/**
 * W-953: move, scale and rotate, written as CSS's own `translate`, `scale` and `rotate` so an
 * entrance (which animates `transform`) never cancels it. In a hover state it is a lift.
 */
const Transform = z
  .strictObject({
    /** Pixels, right and down. */
    x: z.number().int().min(-2000).max(2000).optional(),
    y: z.number().int().min(-2000).max(2000).optional(),
    /** Percent, 100 = unchanged. */
    scale: z.number().int().min(10).max(400).optional(),
    /** Degrees, clockwise. */
    rotate: z.number().int().min(-360).max(360).optional(),
  })
  .refine((t) => Object.values(t).some((v) => v !== undefined), "Set at least one transform");

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
  easing: z.enum(TRANSITION_EASINGS),
  property: z.enum(TRANSITION_PROPERTIES),
});

/**
 * A spin or pulse; off for visitors who prefer reduced motion. It stops after about 5 s
 * (W-848) unless `loop` is true (W-853, D-059). `{ type: "none" }` (W-248) stops an animation a
 * device would otherwise inherit from a wider one.
 */
const IconAnimation = z.union([
  z.strictObject({
    type: z.enum(["spin", "pulse"]),
    duration: z.number().int().min(200).max(10_000),
    loop: z.literal(true).optional(),
  }),
  z.strictObject({ type: z.literal("none") }),
]);

/**
 * Scroll motion (W-319): effects tied to the element's trip through the screen (or the page's
 * scroll), with CSS scroll-driven animations. Browsers without them, and visitors who prefer
 * reduced motion, see the element still. `{ type: "none" }` stops motion a wider device sets.
 */
/** From/to values per effect, each effect once, within MOTION_LIMITS (W-319; loops W-938). */
const MotionEffects = z
  .array(
    z.strictObject({
      type: z.enum(MOTION_EFFECTS),
      from: z.number().min(-1000).max(1000),
      to: z.number().min(-1000).max(1000),
    }),
  )
  .min(1)
  .max(MOTION_EFFECTS.length)
  .superRefine((effects, ctx) => {
    const seen = new Set<string>();
    for (const effect of effects) {
      const [min, max] = MOTION_LIMITS[effect.type];
      if ([effect.from, effect.to].some((n) => n < min || n > max)) {
        ctx.addIssue({
          code: "custom",
          message: `${effect.type} goes from ${min} to ${max}`,
        });
      }
      if (seen.has(effect.type)) {
        ctx.addIssue({ code: "custom", message: `${effect.type} is set twice` });
      }
      seen.add(effect.type);
    }
  });

const ScrollMotion = z.union([
  z.strictObject({
    effects: MotionEffects,
    range: z.enum(["enter", "cross", "exit", "page"]),
  }),
  z.strictObject({ type: z.literal("none") }),
]);

/**
 * A looping animation (W-938): the effects play from their `from` to their `to` values over
 * `duration`, and back when `alternate` (the default). Like an Icon's spin (D-057, D-059) it stops
 * after about 5 seconds unless `loop` is true, and it is off for visitors who prefer reduced
 * motion. Presets in the editor (float, pulse, wiggle…) are just effect sets. `{ type: "none" }`
 * stops a loop a wider device sets.
 */
const LoopMotion = z.union([
  z.strictObject({
    effects: MotionEffects,
    duration: z.number().int().min(200).max(20_000),
    easing: z.enum(TRANSITION_EASINGS).optional(),
    alternate: z.boolean().optional(),
    loop: z.literal(true).optional(),
  }),
  z.strictObject({ type: z.literal("none") }),
]);

/**
 * Plays once (W-101, W-107). `delay` waits before it starts. `view` starts as the element
 * scrolls into view, using CSS scroll-driven animations, and falls back to playing on load.
 * Not a state style.
 */
const Entrance = z.strictObject({
  type: z.enum(["fade", "fade-up", "fade-down", "slide-up", "slide-down", "scale"]),
  duration: z.number().int().min(0).max(2000),
  delay: z.number().int().min(0).max(2000).optional(),
  trigger: z.enum(["load", "view"]).optional(),
});

/**
 * Every motion setting of a style, under one key (W-925, layout 18 / design 17): `entrance`,
 * `scroll` (scroll motion), `transition` and `icon` (an Icon's spin or pulse). Before 1.0 these
 * were the flat style keys `entrance`, `scrollMotion`, `transition` and `iconAnimation`; stored
 * documents are moved here on read. Each part keeps its own rules and its own device cascade.
 */
export const Motion = z.strictObject({
  entrance: Entrance.optional(),
  scroll: ScrollMotion.optional(),
  transition: Transition.optional(),
  icon: IconAnimation.optional(),
  loop: LoopMotion.optional(),
});

export type Motion = z.infer<typeof Motion>;

/** A gradient: up to 10 stops (W-160). Also the paint of a gradient overlay (W-949). */
const Gradient = z.strictObject({
  type: z.enum(["linear", "radial", "conic"]),
  angle: z.number().int().min(0).max(360).optional(),
  position: z.enum(BACKGROUND_POSITIONS).optional(),
  stops: z
    .array(
      z.strictObject({
        color: ColorValue,
        at: z.number().int().min(0).max(100),
      }),
    )
    .min(2)
    .max(10),
});

/** A colour or gradient laid over a background (W-094, W-949). */
const Overlay = z.union([
  z.strictObject({
    color: ColorValue,
    opacity: z.number().finite().min(0).max(1),
  }),
  z.strictObject({
    gradient: Gradient,
    opacity: z.number().finite().min(0).max(1).optional(),
  }),
]);

/**
 * Style properties for layout and text elements (W-017 / R-012). Unknown keys are refused here;
 * `validateLayout` and `validateDesign` keep a newer 1.x key aside and puts it back untouched (D-065, W-925).
 */
export const StyleProps = z.strictObject({
  flexDirection: z.enum(FLEX_DIRECTIONS).optional(),
  flexWrap: z.enum(FLEX_WRAPS).optional(),
  justifyContent: z.enum(JUSTIFY_CONTENT).optional(),
  alignItems: z.enum(ALIGN_ITEMS).optional(),
  gap: LengthValue.optional(),
  /** How many grid columns this element spans (1–12). */
  gridColumnSpan: z.number().int().min(1).max(12).optional(),
  /** How many grid rows this element spans (1–12). */
  gridRowSpan: z.number().int().min(1).max(12).optional(),
  /** First column line (1–13). With a span, emits `start / span n`. */
  gridColumnStart: z.number().int().min(1).max(13).optional(),
  /** First row line (1–13). With a span, emits `start / span n`. */
  gridRowStart: z.number().int().min(1).max(13).optional(),
  /**
   * W-954: how a child of a Flexbox or Container shares the row or column: how much it grows into
   * free space, how much it gives up when space is short, its starting size, its own alignment
   * and its place in the order.
   */
  flexGrow: z.number().finite().min(0).max(100).optional(),
  flexShrink: z.number().finite().min(0).max(100).optional(),
  flexBasis: SizeValue.optional(),
  alignSelf: z.enum(ALIGN_SELF).optional(),
  order: z.number().int().min(-99).max(99).optional(),
  width: SizeValue.optional(),
  minWidth: LengthValue.optional(),
  maxWidth: LengthValue.optional(),
  height: SizeValue.optional(),
  minHeight: LengthValue.optional(),
  maxHeight: LengthValue.optional(),
  overflow: z.enum(OVERFLOWS).optional(),
  /** W-957: one axis only, after `overflow` so it wins (a table that scrolls sideways). */
  overflowX: z.enum(OVERFLOWS).optional(),
  overflowY: z.enum(OVERFLOWS).optional(),
  aspectRatio: z
    .union([z.literal("auto"), z.string().regex(ASPECT_RATIO, "Use a ratio such as 16/9")])
    .optional(),
  objectFit: z.enum(OBJECT_FITS).optional(),
  /** W-957: which part of an image or video stays in view when it is cropped. */
  objectPosition: z.enum(BACKGROUND_POSITIONS).optional(),
  paddingTop: LengthValue.optional(),
  paddingRight: LengthValue.optional(),
  paddingBottom: LengthValue.optional(),
  paddingLeft: LengthValue.optional(),
  marginTop: OffsetValue.optional(),
  marginRight: OffsetValue.optional(),
  marginBottom: OffsetValue.optional(),
  marginLeft: OffsetValue.optional(),
  position: z.enum(POSITIONS).optional(),
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
  /** W-213: any weight 100–900 in steps of 100 (the font must ship it to look different). */
  fontWeight: z
    .union([
      z.literal(100),
      z.literal(200),
      z.literal(300),
      z.literal(400),
      z.literal(500),
      z.literal(600),
      z.literal(700),
      z.literal(800),
      z.literal(900),
      z.enum(["normal", "bold"]),
    ])
    .optional(),
  /** W-213: also a plain number (unitless, 0–100), which scales with each child's font size. */
  lineHeight: z.union([Length, VariableRef, z.number().finite().min(0).max(100)]).optional(),
  /** W-213: may be negative, for tight display headings. */
  letterSpacing: z
    .union([
      z.strictObject({ value: z.number().finite().min(-10_000).max(10_000), unit: LengthUnit }),
      VariableRef,
    ])
    .optional(),
  textAlign: z.enum(TEXT_ALIGNS).optional(),
  textTransform: z.enum(TEXT_TRANSFORMS).optional(),
  /** W-113. A button sets `none` in its base CSS, so it is not underlined unless a style says so. */
  textDecoration: z.enum(TEXT_DECORATIONS).optional(),
  /** W-957. */
  fontStyle: z.enum(FONT_STYLES).optional(),
  whiteSpace: z.enum(WHITE_SPACES).optional(),
  overflowWrap: z.enum(OVERFLOW_WRAPS).optional(),
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
  backgroundSize: z.enum(BACKGROUND_SIZES).optional(),
  backgroundPosition: z.enum(BACKGROUND_POSITIONS).optional(),
  backgroundRepeat: z.enum(BACKGROUND_REPEATS).optional(),
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
  /**
   * Background gradient (W-160). Up to 10 stops. `angle` is the linear direction and the conic
   * start; `position` is the radial centre. A stop colour variable is a colour use.
   */
  gradient: Gradient.optional(),
  /**
   * Laid over the image and gradient (W-094): a colour, or since W-949 a gradient (a scrim that
   * fades from dark behind the text to clear). `opacity` 0–1 fades the whole overlay.
   */
  overlay: Overlay.optional(),
  borderWidth: LengthValue.optional(),
  /** Per-side widths (W-138, D-044), after `borderWidth`, so a side beats the all-sides value. */
  borderTopWidth: LengthValue.optional(),
  borderRightWidth: LengthValue.optional(),
  borderBottomWidth: LengthValue.optional(),
  borderLeftWidth: LengthValue.optional(),
  borderStyle: z.enum(BORDER_STYLES).optional(),
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
  transform: Transform.optional(),
  /** W-957: the same filters applied to what is behind the element (frosted glass). */
  backdropFilter: Filter.optional(),
  cursor: z.enum(CURSORS).optional(),
  /**
   * Icon element glyph styling (W-237). Emitted as custom properties on the icon's wrapper, so
   * they work in states, devices and classes; the Icon's base CSS applies them to its `<svg>`.
   * Elsewhere they do nothing. `iconScale` scales the whole icon (with its background shape).
   */
  iconRotate: z.number().int().min(-360).max(360).optional(),
  iconFlip: z.enum(["none", "horizontal", "vertical", "both"]).optional(),
  iconScale: num(0.1, 4).optional(),
  iconStrokeWidth: num(0.25, 6).optional(),
  /** A drop shadow that follows the glyph's shape (CSS `drop-shadow`), in px. */
  iconShadow: z
    .strictObject({
      x: num(-100, 100),
      y: num(-100, 100),
      blur: num(0, 100),
      color: ColorValue.optional(),
    })
    .optional(),
  motion: Motion.optional(),
});

export type StyleProps = z.infer<typeof StyleProps>;

/**
 * The pre-1.0 flat style shape: `motion`'s parts as the top-level keys `entrance`, `scrollMotion`,
 * `transition` and `iconAnimation` (W-925). The editor's style rows and the CSS sanitizer work on
 * this shape; `flattenMotion` and `nestMotion` convert. It is never stored.
 * Its keys are in the 0.x schema order (`transition` after `cursor`, `iconAnimation` after the
 * other icon keys, then `scrollMotion` and `entrance`): a parsed style's CSS is written in that
 * order, so keeping it keeps 0.x pages byte for byte.
 */
const FlatStyleShape = StyleProps.omit({ motion: true }).extend({
  transition: Transition.optional(),
  iconAnimation: IconAnimation.optional(),
  scrollMotion: ScrollMotion.optional(),
  entrance: Entrance.optional(),
  loopMotion: LoopMotion.optional(),
});
const flatShape: Record<string, z.ZodType> = {};
for (const [key, schema] of Object.entries(StyleProps.omit({ motion: true }).shape)) {
  flatShape[key] = schema;
  if (key === "cursor") flatShape["transition"] = Transition.optional();
  if (key === "iconShadow") {
    flatShape["iconAnimation"] = IconAnimation.optional();
    flatShape["scrollMotion"] = ScrollMotion.optional();
    flatShape["entrance"] = Entrance.optional();
    // W-938: added in 1.0, so after every 0.x key (0.x pages keep their CSS order).
    flatShape["loopMotion"] = LoopMotion.optional();
  }
}
export const FlatStyleProps = z.strictObject(flatShape) as unknown as typeof FlatStyleShape;

export type FlatStyleProps = z.infer<typeof FlatStyleProps>;

/** A style edit: flat motion keys (`undefined` clears), or a whole `motion` record. */
export type StylePatch = Partial<FlatStyleProps> & { motion?: Motion | undefined };

/**
 * `states` on a node or class (D-032, W-089): hover, focus (`:focus-visible`) and active, each with
 * the same keys and limits as `style` except `motion`. Unknown states are refused.
 */
const StateStyle = StyleProps.omit({ motion: true });

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
