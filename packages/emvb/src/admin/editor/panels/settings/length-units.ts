import { STYLE_LABELS, type StyleKey } from "./style-sections.ts";

export type LengthUnit = "px" | "rem" | "em" | "%" | "vw" | "vh";
export type UnitChoice = LengthUnit | "auto";
export type LengthLiteral = { value: number; unit: LengthUnit };

const BOX: readonly UnitChoice[] = ["px", "%", "rem", "em", "vw", "vh"];
const BOX_AUTO: readonly UnitChoice[] = [...BOX, "auto"];

/** Units each length property offers in its unit menu (DESIGN.md § Inputs). */
const UNITS: Partial<Record<StyleKey, readonly UnitChoice[]>> = {
  width: BOX_AUTO,
  height: BOX_AUTO,
  marginTop: BOX_AUTO,
  marginRight: BOX_AUTO,
  marginBottom: BOX_AUTO,
  marginLeft: BOX_AUTO,
  fontSize: ["px", "rem", "em", "%", "vw"],
  lineHeight: ["px", "rem", "em", "%"],
  letterSpacing: ["px", "rem", "em"],
  borderWidth: ["px", "rem", "em"],
  borderRadius: ["px", "%", "rem", "em"],
};

export const unitsFor = (key: StyleKey): readonly UnitChoice[] => UNITS[key] ?? BOX;

const NEGATIVE = new Set<StyleKey>([]);

export type ParsedLength =
  | { ok: true; value: LengthLiteral | "auto" | undefined }
  | { ok: false; message: string };

const DRAFT = /^(-?(?:\d+(?:\.\d*)?|\.\d+))\s*(px|rem|em|%|vw|vh)?$/i;

const listed = (units: readonly string[]) =>
  units.length > 1 ? `${units.slice(0, -1).join(", ")} or ${units.at(-1)}` : (units[0] ?? "");

/**
 * Parses a length field's text: a number in `unit`, a number with its own unit ("50%",
 * "1.5rem"), `auto` where allowed, or empty for unset.
 */
export function parseLengthDraft(draft: string, key: StyleKey, unit: LengthUnit): ParsedLength {
  const text = draft.trim();
  if (text === "") return { ok: true, value: undefined };
  const label = STYLE_LABELS[key];
  const allowed = unitsFor(key);
  if (text.toLowerCase() === "auto") {
    return allowed.includes("auto")
      ? { ok: true, value: "auto" }
      : { ok: false, message: `${label} can't be auto. Enter a number.` };
  }
  const match = DRAFT.exec(text);
  const n = match ? Number(match[1]) : Number.NaN;
  if (!match || !Number.isFinite(n)) {
    return { ok: false, message: `Enter a number, such as 16 or 16${unit}.` };
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
    return { ok: false, message: `${label} can be up to 10000. Enter a smaller number.` };
  }
  return { ok: true, value: { value: n, unit: typed } };
}
