import {
  themeContext404,
  themeContextFrom,
  themeContextFromContent,
  themeContextFront,
  themeContextSearch,
} from "../../src/astro/theme-context.ts";

const post = { collection: "posts", id: "01POST", slug: "hello" };
const PATHS = [
  "/",
  "//",
  "/search",
  "/search/",
  "/category/news",
  "/category/caf%C3%A9",
  "/category/a/b",
  "/tag/js/",
  "/tag/",
  "/posts",
  "/posts/hello",
  "/about",
  "/about/",
  "/docs/intro",
];
const OPTIONS = [
  {},
  { content: post },
  { content: null },
  { is404: true },
  { is404: true, isFront: true, isSearch: true, content: post },
  { isFront: true },
  { isFront: true, content: post },
  { isSearch: true },
  { isSearch: true, content: post },
];

/** Every request context the helpers build, with undefined keys kept, in key order. */
export function themeContextCases(): string {
  const cases = PATHS.flatMap((path) =>
    OPTIONS.map((options) => ({
      path,
      options,
      context: themeContextFrom(new URL(`https://example.com${path}`), options),
    })),
  );
  const helpers = {
    front: themeContextFront(),
    notFound: themeContext404(),
    notFoundAt: themeContext404("/missing"),
    search: themeContextSearch(),
    searchAt: themeContextSearch("/find"),
    fromContent: themeContextFromContent(post, "/blog/hello/"),
    fromContentRoot: themeContextFromContent(post, "/"),
  };
  return JSON.stringify({ cases, helpers }, (_key, value) => value ?? `<${String(value)}>`, 2);
}
