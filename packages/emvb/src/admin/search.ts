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
