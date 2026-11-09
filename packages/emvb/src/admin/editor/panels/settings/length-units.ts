import { STYLE_LABELS, type StyleKey } from "./style-sections.ts";

export type LengthUnit = "px" | "rem" | "em" | "%" | "vw" | "vh" | "ch";
/** `x` is a unitless number, for Line height only (W-213). */
export type UnitChoice = LengthUnit | "auto" | "x";
export type LengthLiteral = { value: number; unit: LengthUnit };

const BOX: readonly UnitChoice[] = ["px", "%", "rem", "em", "vw", "vh", "ch"];
const BOX_AUTO: readonly UnitChoice[] = [...BOX, "auto"];

/** Units each length property offers in its unit menu (DESIGN.md § Inputs). */
const UNITS: Partial<Record<StyleKey, readonly UnitChoice[]>> = {
  width: BOX_AUTO,
  height: BOX_AUTO,
  flexBasis: BOX_AUTO,
  marginTop: BOX_AUTO,
  marginRight: BOX_AUTO,
  marginBottom: BOX_AUTO,
  marginLeft: BOX_AUTO,
  top: BOX_AUTO,
  right: BOX_AUTO,
  bottom: BOX_AUTO,
  left: BOX_AUTO,
  // vh since W-910, for hero headings sized to the screen height.
  fontSize: ["px", "rem", "em", "%", "vw", "vh"],
  // em first, so a typed 1.5 means 1.5 times the font size, not 1.5 px (W-125).
  lineHeight: ["em", "px", "rem", "%", "x"],
  letterSpacing: ["px", "rem", "em"],
  markerSize: ["em", "px", "rem", "%"],
  borderWidth: ["px", "rem", "em"],
  borderTopWidth: ["px", "rem", "em"],
  borderRightWidth: ["px", "rem", "em"],
  borderBottomWidth: ["px", "rem", "em"],
  borderLeftWidth: ["px", "rem", "em"],
  borderRadius: ["px", "%", "rem", "em"],
  borderTopLeftRadius: ["px", "%", "rem", "em"],
  borderTopRightRadius: ["px", "%", "rem", "em"],
  borderBottomRightRadius: ["px", "%", "rem", "em"],
  borderBottomLeftRadius: ["px", "%", "rem", "em"],
};

export const unitsFor = (key: StyleKey): readonly UnitChoice[] => UNITS[key] ?? BOX;

/** Keys that take a negative number; margins since W-331. */
const NEGATIVE = new Set<StyleKey>([
  "top",
  "right",
  "bottom",
  "left",
  "letterSpacing",
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
]);

/** W-955: a fluid size, px on small screens to px on large ones. */
export type FluidLiteral = { fluid: { min: number; max: number } };

/** Keys that take a fluid size ("32–56"): type, gap, sizes, padding and margins (W-955). */
const FLUID = new Set<StyleKey>([
  "fontSize",
  "gap",
  "width",
  "minWidth",
  "maxWidth",
  "height",
  "minHeight",
  "maxHeight",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
]);

export const takesFluid = (key: StyleKey) => FLUID.has(key);

export const isFluid = (value: unknown): value is FluidLiteral =>
  typeof value === "object" &&
  value !== null &&
  "fluid" in value &&
  typeof (value as FluidLiteral).fluid?.min === "number" &&
  typeof (value as FluidLiteral).fluid?.max === "number";

/** How a fluid size reads in a length field: "32–56" (px). */
export const fluidDraft = (value: FluidLiteral) => `${value.fluid.min}–${value.fluid.max}`;

/** "32–56", "32-56px", "32 to 56": small-screen and large-screen px. */
const FLUID_DRAFT = /^(\d+(?:\.\d+)?)\s*(?:px)?\s*(?:–|—|-|to|→)\s*(\d+(?:\.\d+)?)\s*(?:px)?$/i;

export type ParsedLength =
  | { ok: true; value: LengthLiteral | FluidLiteral | "auto" | number | undefined }
  | { ok: false; message: string };

const DRAFT = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*(px|rem|em|%|vw|vh|ch)?$/i;
/** A number with a unit EmVB doesn't take ("100dvh", "12pt"), or a comma decimal ("1,5") (W-262). */
const OTHER_UNIT = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)\s*[a-z%]+$/i;
const COMMA_DECIMAL = /^[+-]?\d*,\d+\s*[a-z%]*$/i;

const listed = (units: readonly string[]) =>
  units.length > 1 ? `${units.slice(0, -1).join(", ")} or ${units.at(-1)}` : (units[0] ?? "");

/**
 * Parses a length field's text: a number in `unit`, a number with its own unit ("50%",
 * "1.5rem"), `auto` where allowed, or empty for unset.
 */
export function parseLengthDraft(
  draft: string,
  key: StyleKey,
  unit: LengthUnit | "x",
): ParsedLength {
  const text = draft.trim();
  if (text === "") return { ok: true, value: undefined };
  const label = STYLE_LABELS[key];
  const allowed = unitsFor(key);
  if (text.toLowerCase() === "auto") {
    return allowed.includes("auto")
      ? { ok: true, value: "auto" }
      : { ok: false, message: `${label} can't be auto. Enter a number.` };
  }
  const range = FLUID_DRAFT.exec(text);
  if (range) {
    if (!FLUID.has(key)) {
      return { ok: false, message: `${label} takes one number, not a range.` };
    }
    const min = Number(range[1]);
    const max = Number(range[2]);
    if (min > 10_000 || max > 10_000) {
      return { ok: false, message: `${label} can be up to 10000. Enter a smaller number.` };
    }
    return { ok: true, value: { fluid: { min, max } } };
  }
  const match = DRAFT.exec(text);
  const n = match ? Number(match[1]) : Number.NaN;
  if (!match || !Number.isFinite(n)) {
    if (COMMA_DECIMAL.test(text)) {
      return { ok: false, message: "Use a dot for decimals, such as 1.5." };
    }
    if (OTHER_UNIT.test(text)) {
      return {
        ok: false,
        message: `${label} takes ${listed(allowed.filter((u) => u !== "auto" && u !== "x"))}.`,
      };
    }
    return { ok: false, message: `Enter a number, such as 16 or 16${unit}.` };
  }
  if (unit === "x" && !match[2] && allowed.includes("x")) {
    // W-213: unitless line height, 0–100.
    if (n < 0 || n > 100) {
      return { ok: false, message: `${label} without a unit can be from 0 to 100.` };
    }
    return { ok: true, value: n };
  }
  const typed = (match[2]?.toLowerCase() ?? unit) as LengthUnit;
  if (!allowed.includes(typed)) {
    return {
      ok: false,
      message: `${label} takes ${listed(allowed.filter((u) => u !== "auto"))}.`,
    };
  }
  if (n < 0 && !NEGATIVE.has(key)) {
    return {
      ok: false,
      message: `${label} can't be negative. Enter 0 or more.`,
    };
  }
  if (Math.abs(n) > 10_000) {
    return {
      ok: false,
      message: NEGATIVE.has(key)
        ? `${label} can be from -10000 to 10000.`
        : `${label} can be up to 10000. Enter a smaller number.`,
    };
  }
  return { ok: true, value: { value: n, unit: typed } };
}
