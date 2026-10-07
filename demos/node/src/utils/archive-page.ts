import type { AstroGlobal } from "astro";
import { resolveThemeParts, themeContextFrom, type ResolvedThemeParts } from "@perkyzz/emvb/astro";

/**
 * Numbered archive pages (`/posts/page/2`, `/category/x/page/2`, `/tag/x/page/2`) are EmVB's:
 * the Archive theme part's Loop sets the page size and its Pagination element links them.
 * `/page/1` moves to the bare archive URL; a page past the last one, or a site without an
 * Archive part, is a 404. The host's own lists keep their `?cursor=` paging.
 */
export async function resolveArchivePage(
  Astro: AstroGlobal,
): Promise<Response | { theme: ResolvedThemeParts; page: number }> {
  const context = themeContextFrom(Astro.url);
  if (context.kind !== "archive" || context.page === undefined) return notFound(Astro);
  const theme = await resolveThemeParts(Astro, context);
  const path = Astro.url.pathname.replace(/\/+$/, "") || "/";
  if (theme.canonicalPath && theme.canonicalPath !== path) {
    return Astro.redirect(theme.canonicalPath, 301);
  }
  if (!theme.content || theme.notFound) return notFound(Astro);
  return { theme, page: context.page };
}

async function notFound(Astro: AstroGlobal): Promise<Response> {
  const response = await Astro.rewrite("/404");
  return new Response(response.body, { status: 404, headers: response.headers });
}
