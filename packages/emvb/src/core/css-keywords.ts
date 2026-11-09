/**
 * Keyword allowlists the schema and the CSS sanitizer both read (W-357).
 * Emission stays in the sanitizer.
 */

export const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export const LENGTH_UNITS = ["px", "rem", "em", "%", "vw", "vh", "ch"] as const;

export const FLEX_DIRECTIONS = ["row", "column", "row-reverse", "column-reverse"] as const;

export const FLEX_WRAPS = ["nowrap", "wrap", "wrap-reverse"] as const;

export const JUSTIFY_CONTENT = [
  "flex-start",
  "flex-end",
  "center",
  "space-between",
  "space-around",
  "space-evenly",
] as const;

export const ALIGN_ITEMS = ["stretch", "flex-start", "flex-end", "center", "baseline"] as const;

/** W-954: one child's own cross-axis alignment; `auto` follows the parent's Align. */
export const ALIGN_SELF = ["auto", ...ALIGN_ITEMS] as const;

export const TEXT_ALIGNS = ["left", "center", "right", "justify"] as const;

export const TEXT_TRANSFORMS = ["none", "uppercase", "lowercase", "capitalize"] as const;

export const TEXT_DECORATIONS = ["none", "underline", "overline", "line-through"] as const;

export const BORDER_STYLES = ["none", "solid", "dashed", "dotted"] as const;

export const OVERFLOWS = ["visible", "hidden", "clip", "scroll", "auto"] as const;

/**
 * W-952: how a List marks its items. Number styles make it numbered; `steps` puts each number
 * in a circle (numbered steps).
 */
export const LIST_MARKERS = [
  "disc",
  "circle",
  "square",
  "decimal",
  "decimal-leading-zero",
  "lower-alpha",
  "upper-alpha",
  "lower-roman",
  "upper-roman",
  "steps",
  "none",
] as const;

/** List markers that count (the list is an `<ol>`). */
export const NUMBERED_MARKERS: ReadonlySet<string> = new Set([
  "decimal",
  "decimal-leading-zero",
  "lower-alpha",
  "upper-alpha",
  "lower-roman",
  "upper-roman",
  "steps",
]);

/** W-957: upright or italic text. */
export const FONT_STYLES = ["normal", "italic"] as const;

/** W-957: how spaces and line breaks wrap. */
export const WHITE_SPACES = ["normal", "nowrap", "pre-line", "pre-wrap"] as const;

/** W-957: whether long words may break to fit. */
export const OVERFLOW_WRAPS = ["normal", "break-word", "anywhere"] as const;

export const OBJECT_FITS = ["fill", "contain", "cover", "none", "scale-down"] as const;

export const POSITIONS = ["static", "relative", "absolute", "fixed", "sticky"] as const;

export const CURSORS = [
  "default",
  "pointer",
  "text",
  "move",
  "grab",
  "not-allowed",
  "help",
  "crosshair",
  "zoom-in",
] as const;

export const FONT_WEIGHTS = [
  "normal",
  "bold",
  "100",
  "200",
  "300",
  "400",
  "500",
  "600",
  "700",
  "800",
  "900",
] as const;

export const TRANSITION_EASINGS = ["ease", "ease-in", "ease-out", "ease-in-out", "linear"] as const;

export const TRANSITION_PROPERTIES = [
  "all",
  "colors",
  "opacity",
  "shadow",
  "filter",
  // W-953: the move, scale and rotate of a transform (a hover lift).
  "transform",
] as const;

export const BACKGROUND_SIZES = ["auto", "cover", "contain"] as const;

export const BACKGROUND_POSITIONS = [
  "center",
  "top",
  "bottom",
  "left",
  "right",
  "top left",
  "top right",
  "bottom left",
  "bottom right",
] as const;

export const BACKGROUND_REPEATS = ["no-repeat", "repeat", "repeat-x", "repeat-y"] as const;
