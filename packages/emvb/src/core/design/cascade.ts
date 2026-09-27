import type { StyleProps } from "../schema/style.ts";

/**
 * Merge class styles in applied order, then local. Later entries win (R-021 / W-030).
 * Pure — does not consult CSS; used for editor computed-style tables and unit tests.
 */
export function resolveCascade(
  classStylesInAppliedOrder: ReadonlyArray<StyleProps | undefined>,
  local?: StyleProps,
): StyleProps {
  const out: Record<string, unknown> = {};
  for (const style of classStylesInAppliedOrder) {
    if (!style) continue;
    Object.assign(out, style);
  }
  if (local) Object.assign(out, local);
  return out as StyleProps;
}
