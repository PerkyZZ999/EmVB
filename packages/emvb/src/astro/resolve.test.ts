import { beforeEach, describe, expect, spyOn, test } from "bun:test";
import { decodeSlug } from "emdash";
import { defaultElement, type Layout, type LayoutNode } from "../core/index.ts";
import type { ContentPort } from "./content-port.ts";
import { resolveEmVBPageWith } from "./resolve.ts";

type Found = { entry: { id: string; data: Record<string, unknown> } | null; isPreview?: boolean };
let lookup: (collection: string, slug: string) => Promise<Found> = async () => ({ entry: null });
const lookups: string[] = [];
type Call = { plugin: string; method: string; path: string; body: string };
const handlerCalls: Call[] = [];

const content = {
  decodeSlug,
  getEntry: async (collection: string, key: string) => {
    lookups.push(`${collection}/${key}`);
    return lookup(collection, key);
  },
  getCollection: async () => ({ entries: [] }),
  getTerm: async () => null,
  getSiteSettings: async () => ({}),
  pluginHandler: () => async (plugin: string, method: string, path: string, request: Request) => {
    handlerCalls.push({ plugin, method, path, body: await request.text() });
    if (path === "/design") {
      return {
        data: {
          design: {
            schemaVersion: 15,
            variables: { colors: [{ id: "brand", name: "Brand", value: "#112233" }] },
          },
        },
      };
    }
    return {
      success: true,
      data: { name: "Contact", slug: "contact", settings: {}, pages: [] },
    };
  },
} as unknown as ContentPort;

const resolveEmVBPage = (
  astro: Parameters<typeof resolveEmVBPageWith>[1],
  options?: Parameters<typeof resolveEmVBPageWith>[2],
) => resolveEmVBPageWith(content, astro, options);

const heading: LayoutNode = { id: "head0001", type: "heading", props: { text: "Hello", level: 1 } };
const layout = (...children: LayoutNode[]): Layout => ({
  schemaVersion: 17,
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

  test("an explicit slug is looked up as-is instead of the route parameter", async () => {
    await resolveEmVBPage(astro({}), { slug: "home" });
    await resolveEmVBPage(astro({ slug: "about" }), { slug: "home" });
    await resolveEmVBPage(astro({}), { slug: "a%20b" });
    expect(await resolveEmVBPage(astro({ slug: "about" }), { slug: "" })).toBeNull();
    expect(lookups).toEqual(["emvb_pages/home", "emvb_pages/home", "emvb_pages/a%20b"]);
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
        ["emvb: stored layout is unreadable", { pageId: "about", path: "", code: "invalid_json" }],
      ]);
    } finally {
      error.mockRestore();
    }
  });
});

describe("resolveEmVBPage(Astro, { visitor }) (W-329)", () => {
  test("a Visitors rule on a segment the host passes shows the element; without it, hides it", async () => {
    const members: LayoutNode = {
      id: "head0002",
      type: "heading",
      props: { text: "Welcome back, member", level: 2 },
      audience: { segments: ["member"] },
    };
    lookup = async () => page({ title: "About", layout: layout(heading, members) });
    const member = await resolveEmVBPage(astro({ slug: "about" }), {
      visitor: { segments: ["member", "pro"] },
    });
    expect(member?.html).toContain("Welcome back, member");
    const guest = await resolveEmVBPage(astro({ slug: "about" }));
    expect(guest?.html).not.toContain("Welcome back, member");
    expect(guest?.html).toContain("Hello");
  });
});

describe("Loop Item parts on a page (W-666)", () => {
  test("a Visitors rule inside a Loop Item part sees the visitor", async () => {
    const itemPart = {
      id: "LIPART1",
      data: {
        id: "LIPART1",
        title: "Team card",
        part_type: "loop_item",
        layout: layout(
          { id: "ptit0001", type: "post-title", props: { level: 3 } },
          {
            id: "head0003",
            type: "heading",
            props: { text: "Members see this", level: 4 },
            audience: { segments: ["member"] },
          },
        ),
      },
    };
    const original = content.getCollection;
    content.getCollection = (async (collection: string) =>
      collection === "emvb_theme_parts"
        ? { entries: [itemPart] }
        : collection === "team"
          ? { entries: [{ id: "e1", slug: "ann", data: { id: "e1", title: "Ann", slug: "ann" } }] }
          : { entries: [] }) as never;
    try {
      const loop = {
        id: "loop0001",
        type: "loop",
        props: { collection: "team", itemPartId: "LIPART1" },
        children: [],
      } as unknown as LayoutNode;
      lookup = async () => page({ title: "Team", layout: layout(loop) });
      const resolved = await resolveEmVBPage(astro({ slug: "team" }), {
        visitor: { segments: ["member"] },
      });
      expect(resolved?.html).toContain("Ann");
      expect(resolved?.html).toContain("Members see this");
    } finally {
      content.getCollection = original;
    }
  });
});
