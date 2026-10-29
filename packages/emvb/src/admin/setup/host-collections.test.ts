import { describe, expect, test } from "bun:test";
import type { Fetcher } from "../api.ts";
import {
  addCanvasField,
  CANVAS_FIELD_BODY,
  canvasCollectionsSnippet,
  hostCollectionRows,
} from "./host-collections.ts";

const canvasField = { slug: "layout", type: "json", widget: "emvb:canvas" };

describe("host collections setup (W-913)", () => {
  test("W-913: rows say which collections have the field, can get it, or can't", () => {
    const rows = hostCollectionRows(
      [
        { slug: "pages", label: "Pages", fields: [canvasField] },
        { slug: "posts", label: "Posts", fields: [{ slug: "title", type: "string" }] },
        { slug: "docs", label: "", fields: [{ slug: "canvas", type: "string" }] },
        { slug: "emvb_pages", label: "Visual pages", hidden: true, fields: [] },
        { slug: "secret", hidden: true, fields: [] },
      ],
      ["pages"],
    );
    expect(rows).toEqual([
      { slug: "pages", label: "Pages", field: "ready", fieldSlug: "layout", listed: true },
      { slug: "posts", label: "Posts", field: "missing", listed: false },
      { slug: "docs", label: "docs", field: "taken", listed: false },
    ]);
  });

  test("W-913: the snippet lists every collection with the field and keeps canvasStyles", () => {
    const rows = hostCollectionRows(
      [
        { slug: "pages", fields: [canvasField] },
        { slug: "posts", fields: [canvasField] },
        { slug: "team", fields: [] },
      ],
      ["pages"],
    );
    expect(canvasCollectionsSnippet(rows, ["/site.css"])).toBe(
      '// astro.config.mjs, in emdash({ plugins: [...] })\nemvb({ canvasStyles: ["/site.css"], canvasCollections: ["pages","posts"] })',
    );
    expect(canvasCollectionsSnippet([], [])).toContain("emvb({ canvasCollections: [] })");
  });

  test("W-913: Add canvas field posts the emvb:canvas JSON field to the schema API", async () => {
    const calls: { path: string; method?: string; body?: unknown }[] = [];
    const fetcher: Fetcher = async (path, init) => {
      calls.push({ path, method: init?.method, body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ data: { item: {} } }), { status: 201 });
    };
    await addCanvasField(fetcher, "posts");
    expect(calls).toEqual([
      {
        path: "/_emdash/api/schema/collections/posts/fields",
        method: "POST",
        body: { ...CANVAS_FIELD_BODY },
      },
    ]);
    expect(CANVAS_FIELD_BODY).toEqual({
      slug: "canvas",
      label: "Canvas",
      type: "json",
      widget: "emvb:canvas",
      validation: null,
    });
  });
});
