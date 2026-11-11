import { expect, test } from "bun:test";
import { emptyDesign, LAYOUT_SCHEMA_VERSION, type Layout } from "../core/index.ts";
import type { Fetcher } from "./api.ts";
import {
  canvasSources,
  copyableMedia,
  entryPath,
  exportableEntries,
  exportSite,
  loadExportData,
} from "./export-api.ts";

const layout = (text: string, src?: string): Layout => ({
  schemaVersion: LAYOUT_SCHEMA_VERSION,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [
      { id: "head0001", type: "heading", props: { text, level: 1 } },
      ...(src ? [{ id: "imag0001", type: "image", props: { src, alt: "A" } } as const] : []),
    ],
  },
});

const published = { ...emptyDesign(), direction: "rtl" as const };

/** A fake EmDash: two pages (one a draft) and the design (draft differs from published). */
const fakeSite: Fetcher = async (path) => {
  if (path.startsWith("/_emdash/api/content/emvb_pages"))
    return Response.json({
      data: {
        items: [
          {
            id: "p1",
            slug: "home",
            status: "published",
            data: { title: "Home", layout: layout("Live home", "/_emdash/api/media/file/a.png") },
            seo: { description: "The home page" },
          },
          {
            id: "p2",
            slug: "wip",
            status: "draft",
            data: { title: "WIP", layout: layout("Draft") },
          },
        ],
      },
    });
  if (path.startsWith("/_emdash/api/content/emvb_theme_parts"))
    return Response.json({ data: { items: [] } });
  if (path.includes("/design/draft"))
    return Response.json({ data: { design: emptyDesign(), published } });
  return Response.json({ error: { code: "NOT_FOUND", message: path } }, { status: 404 });
};

test("only published pages are exported, with the published Site styles (W-963)", async () => {
  const data = await loadExportData(fakeSite);
  expect(data.pages.map((p) => p.id)).toEqual(["p1"]);
  expect(data.pages[0]?.description).toBe("The home page");
  expect(data.design.direction).toBe("rtl");
  expect((await loadExportData(fakeSite, "p2")).pages).toEqual([]);
});

test("the zip holds the page and copies same-origin media (W-963)", async () => {
  const asked: string[] = [];
  const result = await exportSite(fakeSite, {
    copyMedia: true,
    origin: "https://site.test",
    get: async (url) => {
      asked.push(url);
      return new Response(new Uint8Array([7]));
    },
  });
  expect(asked).toEqual(["https://site.test/_emdash/api/media/file/a.png"]);
  expect(result.copied).toBe(1);
  const html = result.site.files.find((f) => f.path === "home/index.html")?.data as string;
  expect(html).toContain('dir="rtl"');
  expect(html).toContain("../media/a.png");
  expect(result.zip.length).toBeGreaterThan(100);
});

test("a failed media download stays a link and is counted", async () => {
  const result = await exportSite(fakeSite, {
    copyMedia: true,
    origin: "https://site.test",
    get: async () => new Response("no", { status: 500 }),
  });
  expect(result.copied).toBe(0);
  expect(result.failed).toBe(1);
  const html = result.site.files.find((f) => f.path === "home/index.html")?.data as string;
  expect(html).toContain("/_emdash/api/media/file/a.png");
});

test("only this site's own media are copied", () => {
  expect(
    copyableMedia(
      ["/a.png", "https://site.test/b.png", "https://cdn.example/c.png", "http://site.test/d.png"],
      "https://site.test",
    ),
  ).toEqual(["/a.png", "https://site.test/b.png"]);
});

/** W-977: a site with a `posts` collection whose entries carry a canvas layout. */
const headerFor = (collection: string) => ({
  id: "h1",
  slug: "h1",
  status: "published",
  updatedAt: "2026-11-01T00:00:00Z",
  data: {
    title: "Posts header",
    part_type: "header",
    layout: layout("Posts header"),
    conditions: {
      schemaVersion: 1,
      rules: [
        { id: "r1", op: "include", group: "singular", name: "collection", args: { collection } },
      ],
    },
  },
});
const postsSite: Fetcher = async (path) => {
  if (path === "/_emdash/api/schema/collections")
    return Response.json({ data: { items: [{ slug: "posts", label: "Posts" }] } });
  if (path.startsWith("/_emdash/api/schema/collections/posts"))
    return Response.json({
      data: {
        item: {
          slug: "posts",
          urlPattern: "/blog/{slug}",
          fields: [{ slug: "canvas", type: "json", widget: "emvb:canvas" }],
        },
      },
    });
  if (path.startsWith("/_emdash/api/content/posts"))
    return Response.json({
      data: {
        items: [
          // Stored as a JSON string, as some hosts do.
          {
            id: "e1",
            slug: "hello",
            status: "published",
            data: { title: "Hello", canvas: JSON.stringify(layout("Hello post")) },
          },
          { id: "e2", slug: "plain", status: "published", data: { title: "Plain", canvas: null } },
          {
            id: "e3",
            slug: "draft",
            status: "draft",
            data: { title: "Draft", canvas: layout("Draft post") },
          },
        ],
      },
    });
  if (path.startsWith("/_emdash/api/content/emvb_theme_parts"))
    return Response.json({ data: { items: [headerFor("posts")] } });
  return fakeSite(path);
};

test("W-977: collections with a canvas field are export sources, with their URL pattern", async () => {
  const sources = await canvasSources(postsSite);
  expect(sources).toEqual([
    { collection: "posts", label: "Posts", field: "canvas", urlPattern: "/blog/{slug}" },
  ]);
  expect(entryPath("/blog/{slug}", "hello")).toBe("/blog/hello");
  expect(entryPath(null, "hello")).toBe("/hello");
});

test("W-977: published entries with a layout export like pages, with the header for their collection", async () => {
  const [source] = await canvasSources(postsSite);
  if (!source) throw new Error("no source");
  expect(await exportableEntries(postsSite, source)).toEqual([{ id: "e1", title: "Hello" }]);
  const result = await exportSite(postsSite, {
    source,
    copyMedia: false,
    origin: "https://site.test",
  });
  expect(result.site.report.pages).toEqual([{ title: "Hello", path: "hello/" }]);
  const html = result.site.files.find((f) => f.path === "hello/index.html")?.data as string;
  expect(html).toContain("Hello post");
  // The header that shows on single posts comes along.
  expect(html).toContain("Posts header");
  // EmVB pages don't get a header meant for posts.
  const pages = await exportSite(postsSite, { copyMedia: false, origin: "https://site.test" });
  const home = pages.site.files.find((f) => f.path === "home/index.html")?.data as string;
  expect(home).not.toContain("Posts header");
});
