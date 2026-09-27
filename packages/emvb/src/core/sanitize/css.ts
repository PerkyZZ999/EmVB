import type { StyleProps } from "../schema/style.ts";

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const VAR_ID = /^[a-z0-9-]{1,40}$/;
const UNITS = new Set(["px", "rem", "em", "%"]);
const FLEX_DIRECTIONS = new Set(["row", "column", "row-reverse", "column-reverse"]);
const FORBIDDEN = /[{};<>\\"'`]|\/\*|url\(|expression\(|@import|javascript:/i;

/** Last line of defence on every emitted value, even ones built by the typed validators below. */
export function isSafeCssValue(value: string): boolean {
  return value.length > 0 && value.length <= 200 && !FORBIDDEN.test(value) && !/[\n\r]/.test(value);
}

export function colorVariableName(id: string): string | undefined {
  return VAR_ID.test(id) ? `--emvb-c-${id}` : undefined;
}

export function cssColor(value: unknown): string | undefined {
  if (typeof value === "string") return HEX_COLOR.test(value) ? value.toLowerCase() : undefined;
  if (typeof value === "object" && value !== null && "var" in value) {
    const name = typeof value.var === "string" ? colorVariableName(value.var) : undefined;
    return name ? `var(${name})` : undefined;
  }
  return undefined;
}

export function cssLength(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const { value: n, unit } = value as { value?: unknown; unit?: unknown };
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 10_000) return undefined;
  if (typeof unit !== "string" || !UNITS.has(unit)) return undefined;
  return `${n}${unit}`;
}

export function cssFlexDirection(value: unknown): string | undefined {
  return typeof value === "string" && FLEX_DIRECTIONS.has(value) ? value : undefined;
}

const PROPERTY_MAP: {
  [K in keyof Required<StyleProps>]: { css: string; toValue: (v: unknown) => string | undefined };
} = {
  flexDirection: { css: "flex-direction", toValue: cssFlexDirection },
  gap: { css: "gap", toValue: cssLength },
  color: { css: "color", toValue: cssColor },
};

export type Declaration = { property: string; value: string };

/** Converts style props into safe declarations; anything that fails validation is dropped and reported. */
export function styleDeclarations(style: unknown): {
  declarations: Declaration[];
  rejected: string[];
} {
  const declarations: Declaration[] = [];
  const rejected: string[] = [];
  if (typeof style !== "object" || style === null) return { declarations, rejected };
  for (const [key, raw] of Object.entries(style)) {
    const entry = Object.hasOwn(PROPERTY_MAP, key)
      ? PROPERTY_MAP[key as keyof StyleProps]
      : undefined;
    const value = entry?.toValue(raw);
    if (entry && value !== undefined && isSafeCssValue(value)) {
      declarations.push({ property: entry.css, value });
    } else {
      rejected.push(key);
    }
  }
  return { declarations, rejected };
}
