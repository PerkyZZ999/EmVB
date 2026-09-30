import type { DesignSystem } from "../../../../core/index.ts";

type StyleClass = NonNullable<DesignSystem["classes"]>[number];

export type ClassOption = { kind: "class"; cls: StyleClass } | { kind: "create"; name: string };

/** Site-wide class cap (design schema) and per-element cap (layout schema). */
export const MAX_SITE_CLASSES = 100;
export const MAX_ELEMENT_CLASSES = 20;

const rank = (cls: StyleClass, q: string) => {
  const name = cls.name.toLowerCase();
  if (name === q) return 0;
  if (name.startsWith(q) || cls.id.startsWith(q)) return 1;
  return 2;
};

/**
 * Suggestions for the class chip input (W-087): classes not yet on the element whose name or id
 * contains the query, exact and prefix matches first, then "Create class" when no class has
 * that exact name.
 */
export function classOptions(
  catalog: readonly StyleClass[],
  applied: readonly string[],
  query: string,
): ClassOption[] {
  const q = query.trim().toLowerCase();
  const available = catalog.filter((cls) => !applied.includes(cls.id));
  const found = q
    ? available
        .filter((cls) => cls.name.toLowerCase().includes(q) || cls.id.includes(q))
        .map((cls, index) => ({ cls, index, rank: rank(cls, q) }))
        .toSorted((a, b) => a.rank - b.rank || a.index - b.index)
        .map(({ cls }) => cls)
    : available;
  const options: ClassOption[] = found.map((cls) => ({ kind: "class", cls }));
  const taken = catalog.some((cls) => cls.name.toLowerCase() === q);
  if (q && !taken) options.push({ kind: "create", name: query.trim() });
  return options;
}

/** The applied class whose name is exactly `query`, ignoring case, if any. */
export const appliedByName = (
  catalog: readonly StyleClass[],
  applied: readonly string[],
  query: string,
) => {
  const q = query.trim().toLowerCase();
  return catalog.find((cls) => applied.includes(cls.id) && cls.name.toLowerCase() === q);
};
