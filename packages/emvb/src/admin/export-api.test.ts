import { expect, test } from "bun:test";
import { emptyDesign, LAYOUT_SCHEMA_VERSION, type Layout } from "../core/index.ts";
import type { Fetcher } from "./api.ts";
import { copyableMedia, exportSite, loadExportData } from "./export-api.ts";

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
