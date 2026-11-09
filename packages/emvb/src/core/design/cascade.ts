import { flattenMotion } from "../migrate/v18.ts";
import type { FlatStyleProps, StyleProps } from "../schema/style.ts";

/** Classes the element uses, in Site styles list order. Later entries win, matching the CSS. */
export function classStylesInListOrder(
  classes: ReadonlyArray<{ id: string; style?: StyleProps | FlatStyleProps }> | undefined,
  appliedIds: readonly string[],
): Array<StyleProps | FlatStyleProps | undefined> {
  const applied = new Set(appliedIds);
  return (classes ?? []).filter((cls) => applied.has(cls.id)).map((cls) => cls.style);
}

/**
 * Merge class styles, then local. Later entries win (R-021 / W-030).
 * Pass classes from `classStylesInListOrder`, not from the order written on the element.
 * Pure — does not consult CSS; used for editor computed-style tables and unit tests.
 * The result uses the flat motion keys (W-925), so a class's entrance and another's scroll motion
 * both survive, as they do in the CSS.
 */
export function resolveCascade(
  classStylesInAppliedOrder: ReadonlyArray<StyleProps | FlatStyleProps | undefined>,
  local?: StyleProps | FlatStyleProps,
): FlatStyleProps {
  const out: Record<string, unknown> = {};
  for (const style of classStylesInAppliedOrder) {
    if (!style) continue;
    Object.assign(out, flattenMotion(style));
  }
  if (local) Object.assign(out, flattenMotion(local));
  return out as FlatStyleProps;
}
