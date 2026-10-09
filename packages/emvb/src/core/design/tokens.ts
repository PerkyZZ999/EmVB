import type { DesignSystem, FluidRange, LengthVariable } from "../schema/design.ts";

/** Screen widths fluid sizes grow between when the site sets none (W-316). */
export const DEFAULT_FLUID_RANGE: FluidRange = { minWidth: 360, maxWidth: 1280 };

const round = (n: number, places = 4) => Number(n.toFixed(places));

/**
 * `clamp()` growing from `min` px at the range's small screen to `max` px at its large one
 * (W-316), in rem so it follows the visitor's font size. Equal sizes give a plain rem value.
 */
export function fluidClamp(
  min: number,
  max: number,
  range: FluidRange = DEFAULT_FLUID_RANGE,
): string {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  if (lo === hi || range.maxWidth <= range.minWidth) return `${round(max / 16)}rem`;
  const slope = (max - min) / (range.maxWidth - range.minWidth);
  const intercept = min - slope * range.minWidth;
  return `clamp(${round(lo / 16)}rem, ${round(intercept / 16)}rem + ${round(slope * 100)}vw, ${round(hi / 16)}rem)`;
}

/** Musical ratios type scales use, with their names (W-316). */
export const SCALE_RATIOS = [
  { value: 1.125, label: "Major second · 1.125" },
  { value: 1.2, label: "Minor third · 1.2" },
  { value: 1.25, label: "Major third · 1.25" },
  { value: 1.333, label: "Perfect fourth · 1.333" },
  { value: 1.4, label: "Augmented fourth · 1.4" },
  { value: 1.5, label: "Perfect fifth · 1.5" },
  { value: 1.618, label: "Golden ratio · 1.618" },
] as const;

export type ScaleInput = {
  /** Body size on large screens, px. */
  base: number;
  ratio: number;
  /** Body size on small screens, px; unset = not fluid. */
  minBase?: number;
  /** Ratio on small screens (usually smaller); unset = `ratio`. */
  minRatio?: number;
};

const TYPE_STEPS = [
  { id: "fs-xs", name: "Text XS", step: -2 },
  { id: "fs-s", name: "Text S", step: -1 },
  { id: "fs-m", name: "Text M", step: 0 },
  { id: "fs-l", name: "Text L", step: 1 },
  { id: "fs-xl", name: "Heading S", step: 2 },
  { id: "fs-2xl", name: "Heading M", step: 3 },
  { id: "fs-3xl", name: "Heading L", step: 4 },
  { id: "fs-4xl", name: "Display", step: 5 },
] as const;

const SPACE_STEPS = [
  { id: "space-3xs", name: "Space 3XS", times: 0.25 },
  { id: "space-2xs", name: "Space 2XS", times: 0.5 },
  { id: "space-xs", name: "Space XS", times: 0.75 },
  { id: "space-s", name: "Space S", times: 1 },
  { id: "space-m", name: "Space M", times: 1.5 },
  { id: "space-l", name: "Space L", times: 2 },
  { id: "space-xl", name: "Space XL", times: 3 },
  { id: "space-2xl", name: "Space 2XL", times: 4 },
  { id: "space-3xl", name: "Space 3XL", times: 6 },
] as const;

const valid = (n: number | undefined, lo: number, hi: number): n is number =>
  typeof n === "number" && Number.isFinite(n) && n >= lo && n <= hi;

function token(id: string, name: string, max: number, min: number | undefined): LengthVariable {
  const big = round(Math.min(1000, max), 2);
  return {
    id,
    name,
    value: { value: big, unit: "px" },
    ...(min !== undefined && round(min, 2) !== big
      ? { fluid: { min: round(Math.min(1000, min), 2), max: big } }
      : {}),
  };
}

/**
 * A type scale from a base size and a ratio (W-316): eight sizes from Text XS to Display. With a
 * small-screen base (and ratio), each size is fluid between the two.
 */
export function typeScale(input: ScaleInput): LengthVariable[] {
  if (!valid(input.base, 8, 64) || !valid(input.ratio, 1.01, 2)) return [];
  const minBase = valid(input.minBase, 8, 64) ? input.minBase : undefined;
  const minRatio = valid(input.minRatio, 1.01, 2) ? input.minRatio : input.ratio;
  return TYPE_STEPS.map(({ id, name, step }) =>
    token(
      id,
      name,
      input.base * input.ratio ** step,
      minBase === undefined ? undefined : minBase * minRatio ** step,
    ),
  );
}

/** A spacing scale from one base gap (W-316): nine steps from 3XS to 3XL; fluid like type. */
export function spaceScale(input: { base: number; minBase?: number }): LengthVariable[] {
  if (!valid(input.base, 2, 64)) return [];
  const minBase = valid(input.minBase, 2, 64) ? input.minBase : undefined;
  return SPACE_STEPS.map(({ id, name, times }) =>
    token(id, name, input.base * times, minBase === undefined ? undefined : minBase * times),
  );
}

/**
 * Adds generated tokens to the site's font sizes or spacing (W-316). A token whose id exists
 * replaces it in place, so elements using it pick up the new size; others are appended.
 */
export function applyTokens(
  design: DesignSystem,
  list: "fontSizes" | "spacings",
  tokens: LengthVariable[],
): DesignSystem {
  const current = design.variables[list] ?? [];
  const byId = new Map(tokens.map((t) => [t.id, t]));
  const replaced = current.map((v) => byId.get(v.id) ?? v);
  const have = new Set(current.map((v) => v.id));
  const limit = list === "fontSizes" ? 50 : 100;
  const added = tokens.filter((t) => !have.has(t.id)).slice(0, Math.max(0, limit - current.length));
  return { ...design, variables: { ...design.variables, [list]: [...replaced, ...added] } };
}
