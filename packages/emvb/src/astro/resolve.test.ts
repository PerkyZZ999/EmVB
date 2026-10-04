import { afterAll, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import * as realEmDash from "emdash";
import * as realPluginUtils from "emdash/plugin-utils";
import { defaultElement, type Layout, type LayoutNode } from "../core/index.ts";

/**
 * W-091: `resolveEmVBPage` had no unit test (only e2e:prod). bun's `mock.module` is global to the
 * process, so the fakes only answer while this file runs and fall back to EmDash afterwards.
 */
let active = true;
type Found = { entry: { id: string; data: Record<string, unknown> } | null; isPreview?: boolean };
let lookup: (collection: string, slug: string) => Promise<Found> = async () => ({ entry: null });
const lookups: string[] = [];
type Call = { plugin: string; method: string; path: string; body: string };
const handlerCalls: Call[] = [];

mock.module("emdash", () => ({
  ...realEmDash,
  getEmDashEntry: (...args: Parameters<typeof realEmDash.getEmDashEntry>) => {
    if (!active) return realEmDash.getEmDashEntry(...args);
    lookups.push(`${args[0]}/${String(args[1])}`);
    return lookup(args[0], String(args[1]));
  },
}));
mock.module("emdash/plugin-utils", () => ({
  ...realPluginUtils,
  getPublicPluginApiRouteHandler: (locals: never) =>
    active
      ? async (plugin: string, method: string, path: string, request: Request) => {
          handlerCalls.push({ plugin, method, path, body: await request.text() });
          if (path === "/design") {
            return {
              data: {
                design: {
                  schemaVersion: 10,
                  variables: { colors: [{ id: "brand", name: "Brand", value: "#112233" }] },
                },
              },
            };
          }
          return {
            success: true,
            data: { name: "Contact", slug: "contact", settings: {}, pages: [] },
          };
        }
      : realPluginUtils.getPublicPluginApiRouteHandler(locals),
}));

const { resolveEmVBPage } = await import("./resolve.ts");

afterAll(() => {
  active = false;
});

const heading: LayoutNode = { id: "head0001", type: "heading", props: { text: "Hello", level: 1 } };
const layout = (...children: LayoutNode[]): Layout => ({
  schemaVersion: 10,
  root: { id: "root0001", type: "container", props: {}, children },
});
const astro = (params: Record<string, string | undefined>) => ({
  params,
  url: new URL("http://site.test/about"),
  locals: {},
});
const page = (data: Record<string, unknown>, isPreview?: boolean): Found => ({
  entry: { id: "p1", data: { id: "p1", ...data } },
  ...(isPreview === undefined ? {} : { isPreview }),
});

beforeEach(() => {
  lookups.length = 0;
  handlerCalls.length = 0;
  lookup = async () => ({ entry: null });
});

describe("resolveEmVBPage (W-091, R-030, R-052)", () => {
  test("no slug is not an EmVB page and reads nothing", async () => {
    expect(await resolveEmVBPage(astro({}))).toBeNull();
    expect(await resolveEmVBPage(astro({ slug: "" }))).toBeNull();
    expect(lookups).toEqual([]);
  });

  test("the slug comes from the named route parameter", async () => {
    await resolveEmVBPage(astro({ slug: "wrong", path: "about" }), { param: "path" });
    await resolveEmVBPage(astro({ slug: "about" }));
    expect(lookups).toEqual(["emvb_pages/about", "emvb_pages/about"]);
  });

  test("a missing collection or entry is not an EmVB page", async () => {
    lookup = async () => {
      throw new Error("no such collection");
    };
    expect(await resolveEmVBPage(astro({ slug: "about" }))).toBeNull();
    lookup = async () => ({ entry: null });
    expect(await resolveEmVBPage(astro({ slug: "about" }))).toBeNull();
    expect(handlerCalls).toEqual([]);
  });

  test("a page renders with the stored design, title, canvas mode and the entry", async () => {
    const found = page({ title: "About", canvas_mode: "blank", layout: layout(heading) });
    lookup = async () => found;
    const resolved = await resolveEmVBPage(astro({ slug: "about" }));
    expect(resolved?.entry === found.entry).toBe(true);
    expect([resolved?.title, resolved?.canvasMode, resolved?.isPreview]).toEqual([
      "About",
      "blank",
      false,
    ]);
    expect(resolved?.html).toContain(">Hello</h1>");
    expect(resolved?.css).toContain("--emvb-c-brand:#112233");
    expect(handlerCalls.map((c) => `${c.plugin} ${c.method} ${c.path}`)).toEqual([
      "emvb GET /design",
    ]);
  });

  test("any other canvas mode is the site layout, a non-text title is empty, a preview is flagged", async () => {
    lookup = async () => page({ title: 7, canvas_mode: "full", layout: layout(heading) }, true);
    const resolved = await resolveEmVBPage(astro({ slug: "about" }));
    expect([resolved?.title, resolved?.canvasMode, resolved?.isPreview]).toEqual([
      "",
      "site-layout",
      true,
    ]);
  });

  test("forms on the page get their definitions; a page without forms asks for none", async () => {
    const form = {
      ...defaultElement("form", "form0001"),
      props: { formId: "contact" },
    } as LayoutNode;
    lookup = async () => page({ layout: JSON.stringify(layout(form)) });
    const resolved = await resolveEmVBPage(astro({ slug: "contact" }));
    expect(handlerCalls.map((c) => `${c.method} ${c.path} ${c.body}`)).toEqual([
      "GET /design ",
      'POST /definition {"id":"contact"}',
    ]);
    expect(resolved?.needsFormsRuntime).toBe(true);
  });

  test("an unreadable layout renders empty, asks for no forms and logs the page id", async () => {
    const error = spyOn(console, "error").mockImplementation(() => {});
    try {
      lookup = async () => ({ entry: { id: "x", data: { layout: "{broken" } } });
      const resolved = await resolveEmVBPage(astro({ slug: "about" }));
      expect([resolved?.html, resolved?.css]).toEqual(["", ""]);
      expect(handlerCalls.map((c) => c.path)).toEqual(["/design"]);
      expect(error.mock.calls).toEqual([
        ["emvb: stored layout is unreadable", { pageId: "about" }],
      ]);
    } finally {
      error.mockRestore();
    }
  });
});
