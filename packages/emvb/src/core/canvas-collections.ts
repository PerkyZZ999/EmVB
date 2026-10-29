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
