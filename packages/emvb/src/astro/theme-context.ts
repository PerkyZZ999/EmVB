import type { ThemeRequestContext } from "../core/index.ts";

type ContentRef = { collection: string; id: string; slug?: string | null };

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
  const is404 = options.is404 === true;
  const isFront =
    options.isFront === true ||
    (!is404 && !options.content && (path === "/" || path === ""));
  const isSearch = options.isSearch === true || path === "/search";

  if (is404) {
    return {
      path,
      isFront: false,
      is404: true,
      isSearch: false,
      kind: "other",
    };
  }

  if (isFront) {
    return {
      path: "/",
      isFront: true,
      is404: false,
      isSearch: false,
      kind: "singular",
      collection: options.content?.collection,
      entryId: options.content?.id,
    };
  }

  if (isSearch) {
    return {
      path,
      isFront: false,
      is404: false,
      isSearch: true,
      kind: "archive",
    };
  }

  const category = /^\/category\/([^/]+)$/.exec(path);
  if (category) {
    return {
      path,
      isFront: false,
      is404: false,
      isSearch: false,
      kind: "archive",
      taxonomy: { type: "category", slug: decodeURIComponent(category[1] ?? "") },
    };
  }

  const tag = /^\/tag\/([^/]+)$/.exec(path);
  if (tag) {
    return {
      path,
      isFront: false,
      is404: false,
      isSearch: false,
      kind: "archive",
      taxonomy: { type: "tag", slug: decodeURIComponent(tag[1] ?? "") },
    };
  }

  if (path === "/posts") {
    return {
      path,
      isFront: false,
      is404: false,
      isSearch: false,
      kind: "archive",
      collection: "posts",
    };
  }

  if (options.content) {
    return {
      path,
      isFront: false,
      is404: false,
      isSearch: false,
      kind: "singular",
      collection: options.content.collection,
      entryId: options.content.id,
    };
  }

  // EmVB / pages singular under /{slug} without an explicit content hint
  if (path !== "/" && !path.includes("/", 1)) {
    return {
      path,
      isFront: false,
      is404: false,
      isSearch: false,
      kind: "singular",
      collection: "pages",
    };
  }

  return {
    path,
    isFront: false,
    is404: false,
    isSearch: false,
    kind: "other",
  };
}

export function themeContextFront(): ThemeRequestContext {
  return {
    path: "/",
    isFront: true,
    is404: false,
    isSearch: false,
    kind: "singular",
  };
}

export function themeContext404(path = "/404"): ThemeRequestContext {
  return {
    path,
    isFront: false,
    is404: true,
    isSearch: false,
    kind: "other",
  };
}

export function themeContextFromContent(content: ContentRef, path: string): ThemeRequestContext {
  return themeContextFrom(new URL(path, "http://local.invalid"), { content });
}
