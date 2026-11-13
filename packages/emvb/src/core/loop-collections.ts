/**
 * S-11 (W-1000): `emvb({ loopCollections })`, the collections Loops may list on the public site.
 * Unset, every collection with published entries can be listed (as before 1.1.2). Kept on
 * globalThis for the same reason as the geo-header setting (core/geo-trust.ts).
 */
const KEY = Symbol.for("emvb.loopCollections");
const SLUG = /^[a-z][a-z0-9_]{0,62}$/;
const MAX = 100;

type Holder = { [KEY]?: readonly string[] };

/** The allowlist from the option: collection slugs, or undefined when the option isn't a list. */
export function loopCollectionSlugs(input: unknown): string[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const out: string[] = [];
  for (const item of input) {
    if (typeof item !== "string") continue;
    const slug = item.trim();
    if (SLUG.test(slug) && !out.includes(slug)) out.push(slug);
    if (out.length === MAX) break;
  }
  return out;
}

export function setLoopCollections(input: unknown): void {
  (globalThis as Holder)[KEY] = loopCollectionSlugs(input);
}

/** True when a Loop may list `collection` on this site. */
export function loopCollectionAllowed(collection: string): boolean {
  const allowed = (globalThis as Holder)[KEY];
  return allowed === undefined || allowed.includes(collection);
}
