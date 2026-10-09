/** One command in the Ctrl/Cmd+K palette (W-314). */
export type PaletteItem = {
  id: string;
  group: PaletteGroup;
  label: string;
  /** Shown to the right: a shortcut, an element type, a text preview. */
  hint?: string;
  /** Extra words that should find this item. */
  keywords?: string;
  run: () => void;
};

const PALETTE_GROUPS = ["Actions", "Insert", "Jump to", "Apply class"] as const;
export type PaletteGroup = (typeof PALETTE_GROUPS)[number];

/** Prefixes that narrow the palette to one group, like `>` for actions in code editors. */
const PREFIXES: Record<string, PaletteGroup> = {
  ">": "Actions",
  "+": "Insert",
  "@": "Jump to",
  ".": "Apply class",
};

/**
 * How well `query` matches `text` (W-314): null when its letters don't all appear in order.
 * Higher is better: a prefix beats a word start, which beats a scattered match.
 */
export function fuzzyScore(query: string, text: string): number | null {
  const q = query.trim().toLowerCase();
  const t = text.toLowerCase();
  if (!q) return 0;
  if (t.startsWith(q)) return 1000 - t.length;
  const at = t.indexOf(q);
  if (at >= 0) return (/[\s\-_/.]/.test(t[at - 1] ?? " ") ? 800 : 600) - at - t.length / 100;
  let score = 0;
  let from = 0;
  let previous = -2;
  for (const ch of q) {
    if (ch === " ") continue;
    const found = t.indexOf(ch, from);
    if (found < 0) return null;
    score += found === previous + 1 ? 6 : /[\s\-_/.]/.test(t[found - 1] ?? " ") ? 4 : 1;
    previous = found;
    from = found + 1;
  }
  return score - t.length / 100;
}

/**
 * The items for a query, best first, at most `limit` (W-314). An empty query lists every group
 * in order; a leading `>`, `+`, `@` or `.` narrows to Actions, Insert, Jump to or Apply class.
 */
export function filterPalette(items: PaletteItem[], raw: string, limit = 60): PaletteItem[] {
  const prefix = PREFIXES[raw.trimStart()[0] ?? ""];
  const query = prefix ? raw.trimStart().slice(1) : raw;
  const pool = prefix ? items.filter((item) => item.group === prefix) : items;
  if (!query.trim()) return pool.slice(0, limit);
  const scored: { item: PaletteItem; score: number }[] = [];
  for (const item of pool) {
    const label = fuzzyScore(query, item.label);
    const extra = item.keywords ? fuzzyScore(query, item.keywords) : null;
    const best = Math.max(label ?? -Infinity, extra === null ? -Infinity : extra - 50);
    if (best > -Infinity) scored.push({ item, score: best });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.item);
}
