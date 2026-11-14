/**
 * W-897 (W-P02): host collections whose entries carry an `emvb:canvas` field. Only EmDash-style
 * slugs are kept; EmVB's own collections are left out because their hooks already cover them.
 */
export const MAX_CANVAS_COLLECTIONS = 20;
const OWN = new Set(["emvb_pages", "emvb_theme_parts"]);
const SLUG = /^[a-z][a-z0-9_]{0,62}$/;

export function canvasCollectionSlugs(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const item of input) {
    if (typeof item !== "string") continue;
    const slug = item.trim();
    if (!SLUG.test(slug) || OWN.has(slug) || out.includes(slug)) continue;
    out.push(slug);
    if (out.length === MAX_CANVAS_COLLECTIONS) break;
  }
  return out;
}

/**
 * W-1036 (S-08, render side): the running site's list, set when the plugin starts and read when
 * `resolveEmVBPage` renders a host collection. Kept on globalThis like core/geo-trust.ts. Unset
 * (the plugin never started in this process, as in unit tests) means "unknown", never "unlisted".
 */
const KEY = Symbol.for("emvb.canvasCollections");
const WARNED = Symbol.for("emvb.canvasCollectionsWarned");

type Holder = { [KEY]?: readonly string[]; [WARNED]?: Set<string> };

export function setCanvasCollections(input: unknown): void {
  (globalThis as Holder)[KEY] = canvasCollectionSlugs(input);
}

/**
 * True the first time a layout from `collection` renders while the site's `canvasCollections`
 * leaves it out: the caller logs one warning per collection and process (1.3; 2.0 refuses).
 */
export function unlistedCanvasCollectionFirstSeen(collection: string): boolean {
  const holder = globalThis as Holder;
  const listed = holder[KEY];
  if (listed === undefined || listed.includes(collection) || OWN.has(collection)) return false;
  const warned = (holder[WARNED] ??= new Set());
  if (warned.has(collection)) return false;
  warned.add(collection);
  return true;
}
