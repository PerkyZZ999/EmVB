// W-774: "ß" folds to "ss" like the command palette, so "strasse" finds "Straße" in lists too.
export const fold = (text: string) =>
  text.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase().replace(/ß/g, "ss");

/**
 * Every search word must appear in one of the fields,
 * ignoring case and accents, so "about us" finds "About Us" and "/about-us".
 */
export function matchesSearch(query: string, ...fields: string[]): boolean {
  const haystack = fold(fields.join(" "));
  return fold(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

/**
 * W-978: when `query` matches an item only through its content, a short piece of that content
 * around the first word, so the list can say why the item is shown. Undefined otherwise.
 */
export function contentSnippet(
  query: string,
  content: string | undefined,
  ...fields: string[]
): string | undefined {
  if (!content || !query.trim() || matchesSearch(query, ...fields)) return undefined;
  const words = fold(query).split(/\s+/).filter(Boolean);
  const folded = fold(content);
  const at = Math.min(...words.map((w) => folded.indexOf(w)).filter((i) => i >= 0));
  if (!Number.isFinite(at)) return undefined;
  // Folding can change lengths (ß → ss); close enough for a preview.
  const start = Math.max(0, at - 30);
  const end = Math.min(content.length, at + 60);
  return `${start > 0 ? "…" : ""}${content.slice(start, end).trim()}${end < content.length ? "…" : ""}`;
}
