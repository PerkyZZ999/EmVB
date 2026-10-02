import type { StyleProps } from "../schema/style.ts";

/** Classes the element uses, in Site styles list order. Later entries win, matching the CSS. */
export function classStylesInListOrder(
  classes: ReadonlyArray<{ id: string; style?: StyleProps }> | undefined,
  appliedIds: readonly string[],
): Array<StyleProps | undefined> {
  const applied = new Set(appliedIds);
  return (classes ?? []).filter((cls) => applied.has(cls.id)).map((cls) => cls.style);
}

/**
 * Merge class styles, then local. Later entries win (R-021 / W-030).
 * Pass classes from `classStylesInListOrder`, not from the order written on the element.
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
