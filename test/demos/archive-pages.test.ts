import { beforeEach, describe, expect, mock, test } from "bun:test";
import { themeContextFrom } from "../../packages/emvb/src/astro/theme-context.ts";
import { archivePageTitle } from "../../packages/emvb/src/core/index.ts";

type Theme = {
  content: object | null;
  notFound: boolean;
  canonicalPath?: string;
  archiveTitle?: string;
};
let theme: Theme;
const resolved: string[] = [];

mock.module("@perkyzz/emvb/astro", () => ({
  themeContextFrom,
  archivePageTitle,
  resolveThemeParts: async (_astro: unknown, ctx: { path: string; page?: number }) => {
    resolved.push(`${ctx.path}#${ctx.page}`);
    return { ...theme, canonicalPath: theme.canonicalPath ?? archivePath(ctx) };
  },
}));
const archivePath = (ctx: { path: string; page?: number }) =>
  (ctx.page ?? 1) > 1 ? `${ctx.path}/page/${ctx.page}` : ctx.path;

// Loaded by path so the root typecheck doesn't follow the demo into the plugin's .astro entry.
const HELPER = "../../demos/node/src/utils/archive-page.ts";
const { resolveArchivePage } = (await import(HELPER)) as {
  resolveArchivePage: (
    astro: never,
  ) => Promise<Response | { theme: Theme; page: number; title: string }>;
};

const astro = (path: string) =>
  ({
    url: new URL(path, "http://site.test"),
    redirect: (to: string, status: number) =>
      new Response(null, { status, headers: { location: to } }),
    rewrite: async () => new Response("Not found page", { status: 200 }),
  }) as never;

beforeEach(() => {
  theme = { content: { html: "<p>posts</p>" }, notFound: false };
  resolved.length = 0;
});

describe("demo numbered archive pages (W-224)", () => {
  test("page 2 of an archive renders with the resolved theme", async () => {
    const result = await resolveArchivePage(astro("/category/news/page/2"));
    expect(result).toMatchObject({ page: 2, theme: { content: { html: "<p>posts</p>" } } });
    // W-229: the archive's title with the page number; "Archive" when the theme has none.
    expect(result).toMatchObject({ title: "Archive – page 2" });
    theme.archiveTitle = "Posts";
    expect(await resolveArchivePage(astro("/posts/page/3"))).toMatchObject({
      title: "Posts – page 3",
    });
    expect(resolved).toEqual(["/category/news#2", "/posts#3"]);
  });
  test("/page/1 moves permanently to the bare archive URL", async () => {
    const result = (await resolveArchivePage(astro("/posts/page/1"))) as Response;
    expect(result.status).toBe(301);
    expect(result.headers.get("location")).toBe("/posts");
  });
  test("past the last page, without an Archive part, or a bad number: 404 page", async () => {
    theme.notFound = true;
    const past = (await resolveArchivePage(astro("/posts/page/9"))) as Response;
    expect(past.status).toBe(404);
    expect(await past.text()).toBe("Not found page");
    theme = { content: null, notFound: false };
    expect(((await resolveArchivePage(astro("/tag/a/page/2"))) as Response).status).toBe(404);
    expect(((await resolveArchivePage(astro("/posts/page/0"))) as Response).status).toBe(404);
    expect(resolved).toEqual(["/posts#9", "/tag/a#2"]);
  });
});
