import { createPage, saveDesign } from "../../../packages/emvb/src/admin/content-api.ts";
import type { Fetcher } from "../../../packages/emvb/src/admin/api.ts";
import { loadDesign } from "../../../packages/emvb/src/admin/editor/useEditorData.ts";
import { slugify, type SharedPage, type ShareRead } from "../../../packages/emvb/src/core/index.ts";

/** What the playground says when a shared link can't open (W-321). */
export function shareProblem(read: Extract<ShareRead, { ok: false }>): string {
  switch (read.reason) {
    case "empty":
      return "That shared link has no page in it.";
    case "too-long":
      return "That shared link is too long to open.";
    case "unreadable":
      return "That shared link is damaged or cut short. Ask for it again, copied whole.";
    case "invalid":
      return `The page in that shared link isn't valid${read.detail ? `: ${read.detail}` : "."}`;
  }
}

/** A slug not yet used: the title's, then -2, -3… */
export function freeSlug(title: string, taken: ReadonlySet<string>): string {
  const base = slugify(title) || "shared-page";
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/**
 * Adds a shared page to the playground as a new page (W-321), and with `styles`, makes its Site
 * styles the playground's (as a draft, like any Site styles edit). Returns the new page's id.
 */
export async function importSharedPage(
  fetcher: Fetcher,
  page: SharedPage,
  options: { styles: boolean; takenSlugs: ReadonlySet<string> },
): Promise<string> {
  if (options.styles && page.design) {
    const current = await loadDesign(fetcher);
    await saveDesign(fetcher, page.design, current.revision);
  }
  return createPage(fetcher, {
    title: page.title,
    slug: freeSlug(page.title, options.takenSlugs),
    layout: page.layout,
  });
}
