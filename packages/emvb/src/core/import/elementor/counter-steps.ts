/**
 * W-961: steps numbered by the site's CSS. Some Elementor sites write a numbered list as separate
 * paragraphs and number them with a CSS counter (`.step::before{content:counter(step) "."}`, the
 * counter reset on a parent). EmVB can't run that CSS, so the numbers were lost; consecutive
 * siblings with such a class become one numbered List instead.
 */
import type { ListMarker } from "../../css-keywords.ts";
import { isRecord, str } from "./values.ts";

/** A class whose `::before`/`::after` draws a counter, and the marker that looks like it. */
export type CounterItem = { counter: string; marker: ListMarker };

const STYLES: Record<string, ListMarker> = {
  decimal: "decimal",
  "decimal-leading-zero": "decimal-leading-zero",
  "lower-alpha": "lower-alpha",
  "lower-latin": "lower-alpha",
  "upper-alpha": "upper-alpha",
  "upper-latin": "upper-alpha",
  "lower-roman": "lower-roman",
  "upper-roman": "upper-roman",
};

/** Class name → the counter its `::before`/`::after` draws, from site or page CSS. */
export function counterItems(css: string): Map<string, CounterItem> {
  const items = new Map<string, CounterItem>();
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "").slice(0, 200_000);
  for (const match of clean.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
    const body = match[2] ?? "";
    const drawn = /content\s*:\s*counter\(\s*([A-Za-z_][\w-]*)\s*(?:,\s*([a-z-]+)\s*)?\)/i.exec(
      body,
    );
    if (!drawn) continue;
    const marker = STYLES[(drawn[2] ?? "decimal").toLowerCase()] ?? "decimal";
    for (const selector of (match[1] ?? "").split(",")) {
      const found = /\.([A-Za-z_][\w-]*)::?(?:before|after)\s*$/.exec(selector.trim());
      if (found?.[1]) items.set(found[1], { counter: drawn[1] as string, marker });
    }
  }
  return items;
}

/** The class names an Elementor 4 element carries: global class labels and ids, local ids. */
function classNamesOf(
  raw: Record<string, unknown>,
  labels: (id: string) => string | undefined,
): string[] {
  const settings = isRecord(raw["settings"]) ? raw["settings"] : {};
  const classes = isRecord(settings["classes"]) ? settings["classes"]["value"] : undefined;
  if (!Array.isArray(classes)) return [];
  return classes.flatMap((id) => {
    if (typeof id !== "string") return [];
    const label = labels(id);
    return label ? [id, label] : [id];
  });
}

/** The element's counter, when it is an Elementor 4 paragraph or heading with a counter class. */
export function counterOf(
  raw: unknown,
  items: ReadonlyMap<string, CounterItem>,
  labels: (id: string) => string | undefined,
): CounterItem | undefined {
  if (!isRecord(raw) || items.size === 0) return undefined;
  const type = str(raw["widgetType"]) ?? str(raw["elType"]) ?? "";
  if (type !== "e-paragraph" && type !== "e-heading") return undefined;
  for (const name of classNamesOf(raw, labels)) {
    const item = items.get(name);
    if (item) return item;
  }
  return undefined;
}
