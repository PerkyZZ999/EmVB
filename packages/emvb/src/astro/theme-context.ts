import { splitArchivePage, type ThemeRequestContext } from "../core/index.ts";

type ContentRef = { collection: string; id: string; slug?: string | null };
type Kind = Pick<ThemeRequestContext, "kind">;

/** A context for `path` that is not the front page, a 404 or a search, plus `rest`. */
const context = (path: string, rest: Kind & Partial<ThemeRequestContext>): ThemeRequestContext => ({
  path,
  isFront: false,
  is404: false,
  isSearch: false,
  ...rest,
});

/**
 * A percent-decoded path segment, or the raw segment when its escapes are malformed (W-305), the
 * way EmDash 1.2's `decodeSlug` stopped throwing: `/category/%E0` is a lookup that finds nothing.
 */
export function decodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** Archive URLs by pattern, and what each adds to the context. */
const ARCHIVES: [RegExp, (match: RegExpExecArray) => Partial<ThemeRequestContext>][] = [
  [
    /^\/category\/([^/]+)$/,
    ([, slug]) => ({ taxonomy: { type: "category", slug: decodePathSegment(slug ?? "") } }),
  ],
  [
    /^\/tag\/([^/]+)$/,
    ([, slug]) => ({ taxonomy: { type: "tag", slug: decodePathSegment(slug ?? "") } }),
  ],
  [/^\/posts$/, () => ({ collection: "posts" })],
];

/**
 * Build a ThemeRequestContext from the request URL and optional host content hint.
 * Hosts can override by passing a fully built context to `resolveThemeParts`.
 */
export function themeContextFrom(
  url: URL,
  options: {
    content?: ContentRef | null;
    is404?: boolean;
    isFront?: boolean;
    isSearch?: boolean;
  } = {},
): ThemeRequestContext {
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const { content } = options;
  if (options.is404 === true) return themeContext404(path);
  if (options.isFront === true || (!content && path === "/")) {
    return context("/", {
      isFront: true,
      kind: "singular",
      collection: content?.collection,
      entryId: content?.id,
    });
  }
  if (options.isSearch === true || path === "/search") return themeContextSearch(path);
  // `/posts/page/2` is page 2 of the `/posts` archive; conditions see `/posts` (W-221).
  const paged = splitArchivePage(path);
  for (const [pattern, extra] of ARCHIVES) {
    const match = paged ? pattern.exec(paged.basePath) : null;
    if (match && paged) {
      return context(paged.basePath, {
        kind: "archive",
        ...extra(match),
        ...(paged.page > 1 || paged.basePath !== path ? { page: paged.page } : {}),
      });
    }
  }
  if (content) {
    return context(path, { kind: "singular", collection: content.collection, entryId: content.id });
  }
  // EmVB / pages singular under /{slug} without an explicit content hint
  if (path !== "/" && !path.includes("/", 1)) {
    return context(path, { kind: "singular", collection: "pages" });
  }
  return context(path, { kind: "other" });
}

export function themeContextFront(): ThemeRequestContext {
  return context("/", { isFront: true, kind: "singular" });
}

export function themeContext404(path = "/404"): ThemeRequestContext {
  return context(path, { is404: true, kind: "other" });
}

export function themeContextFromContent(content: ContentRef, path: string): ThemeRequestContext {
  return themeContextFrom(new URL(path, "http://local.invalid"), { content });
}

export function themeContextSearch(path = "/search"): ThemeRequestContext {
  return context(path, { isSearch: true, kind: "archive" });
}
