import { MAX_INPUT_NUMBER, type TextInputNode } from "../schema/layout.ts";

/** A finite number inside the schema's bounds, as an attribute value; anything else is dropped. */
const numberAttr = (value: unknown): string | undefined =>
  typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= MAX_INPUT_NUMBER
    ? String(value)
    : undefined;

const DATE = /^[1-9]\d{3}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
const dateAttr = (value: unknown): string | undefined =>
  typeof value === "string" && DATE.test(value) ? value : undefined;

/** Both ends of a range, unless the lowest is above the highest: no answer could pass then. */
function range(lo: string | undefined, hi: string | undefined, above: boolean) {
  if (lo !== undefined && hi !== undefined && above) return {};
  return { ...(lo === undefined ? {} : { min: lo }), ...(hi === undefined ? {} : { max: hi }) };
}

/**
 * W-1065: the type and limits of a Text input that asks for a number or a date. Every value is
 * untrusted: a limit that isn't a finite number (or a YYYY-MM-DD date) is left off, and so is a
 * range with nothing in it. Without a step a number takes decimals (W-578).
 */
export function typedInputAttrs(
  type: "number" | "date",
  props: TextInputNode["props"],
  defined: { min?: unknown; max?: unknown } = {},
): Record<string, string> {
  if (type === "date") {
    const lo = dateAttr(props.minDate);
    const hi = dateAttr(props.maxDate);
    return range(lo, hi, lo !== undefined && hi !== undefined && lo > hi);
  }
  // The form field's own limits are the ones the forms plugin checks; they win.
  const loValue = numberAttr(defined.min) !== undefined ? defined.min : props.min;
  const hiValue = numberAttr(defined.max) !== undefined ? defined.max : props.max;
  const lo = numberAttr(loValue);
  const hi = numberAttr(hiValue);
  const step = numberAttr(props.step);
  return {
    ...range(lo, hi, Number(lo) > Number(hi)),
    step: step !== undefined && Number(step) > 0 ? step : "any",
  };
}
