import { beforeEach, describe, expect, mock, test } from "bun:test";
import * as realEmDash from "emdash";
import { THEME_PARTS_COLLECTION } from "../constants.ts";
import {
  defaultConditionsFor,
  defaultTriggers,
  POPUP_CHROME_CSS,
  type LayoutNode,
  type ThemePartType,
} from "../core/index.ts";
import { themeContextFrom } from "./theme-context.ts";

type Entry = { id: string; data: Record<string, unknown> };
let themeEntries: Entry[] = [];
let postEntries: Entry[] = [];
const collectionCalls: string[] = [];
/** The filters the posts were read with. */
const postFilters: unknown[] = [];
/** When set, every theme-parts page claims there is another one. */
let endlessCursor = false;
/** The filters the theme parts were read with. */
const themeFilters: unknown[] = [];
/** When set, the theme-parts page at this cursor fails: "error" answers with an error, "throw" throws. */
let failAt: { cursor: number; how: "error" | "throw" } | undefined;

mock.module("emdash", () => ({
  ...realEmDash,
  // Pages like EmDash: `limit` entries from `cursor`, and a `nextCursor` while more remain.
  getEmDashCollection: async (
    collection: string,
    filter?: { limit?: number; cursor?: string; offset?: number },
  ) => {
    collectionCalls.push(collection);
    if (collection !== THEME_PARTS_COLLECTION) {
      // Offset paging with `hasMore`, like EmDash (W-221).
      postFilters.push(filter);
      const from = filter?.offset ?? 0;
      const to = filter?.limit === undefined ? postEntries.length : from + filter.limit;
      return { entries: postEntries.slice(from, to), hasMore: to < postEntries.length };
    }
    themeFilters.push(filter);
    const start = Number(filter?.cursor ?? 0);
    if (failAt?.cursor === start) {
      if (failAt.how === "throw") throw new Error("D1 down");
      return { entries: themeEntries.slice(start), error: new Error("query failed") };
    }
    const end = filter?.limit === undefined ? themeEntries.length : start + filter.limit;
    const more = endlessCursor || end < themeEntries.length;
    return { entries: themeEntries.slice(start, end), nextCursor: more ? String(end) : undefined };
  },
  // W-263: term labels for archive titles; "broken" throws, anything else is unknown.
  getTerm: async (taxonomy: string, slug: string) => {
    if (slug === "broken") throw new Error("taxonomy table missing");
    return taxonomy === "category" && slug === "news" ? { slug, label: "News" } : null;
  },
  getEmDashEntry: async (_collection: string, key: string) => ({
    entry: postEntries.find((e) => e.id === key || e.data["slug"] === key) ?? null,
  }),
}));

const { resolveThemeParts } = await import("./resolve-theme.ts");

const layout = (...children: LayoutNode[]) => ({
  schemaVersion: 1,
  root: { id: "root0001", type: "container", props: {}, children },
});
const heading = (id: string, text: string): LayoutNode => ({
  id,
  type: "heading",
  props: { text, level: 2 },
});

function part(
  id: string,
  partType: ThemePartType | "bogus",
  children: LayoutNode[],
  extra: Record<string, unknown> = {},
): Entry {
  return {
    id,
    data: {
      id,
      title: `Part ${id}`,
      part_type: partType,
      layout: layout(...children),
      conditions:
        partType === "bogus" ? undefined : defaultConditionsFor(partType as ThemePartType),
      triggers: defaultTriggers(),
      updatedAt: "2026-09-01T00:00:00Z",
      ...extra,
    },
  };
}

const astro = (path: string) => ({ url: new URL(path, "http://site.test"), locals: {} });

beforeEach(() => {
  endlessCursor = false;
  failAt = undefined;
  themeFilters.length = 0;
  themeEntries = [];
  postEntries = [];
  collectionCalls.length = 0;
  postFilters.length = 0;
});

describe("resolveThemeParts (R-062)", () => {
  test("no published parts resolves to nothing", async () => {
    expect(await resolveThemeParts(astro("/about"))).toEqual({
      header: null,
      footer: null,
      content: null,
      popups: [],
      floats: [],
      css: "",
      needsPopupsRuntime: false,
      needsFloatsRuntime: false,
      needsTabsRuntime: false,
      needsMenuRuntime: false,
      notFound: false,
    });
  });

  test("the newest matching header and footer win; invalid parts are skipped", async () => {
    themeEntries = [
      part("HEADOLD1", "header", [heading("head0001", "Old header")]),
      part("HEADNEW1", "header", [heading("head0002", "New header")], {
        updatedAt: "2026-09-02T00:00:00Z",
      }),
      part("FOOT0001", "footer", [heading("head0003", "Footer")]),
      part("BADCOND1", "header", [heading("head0004", "Bad")], {
        conditions: { rules: "nope" },
        updatedAt: "2026-09-03T00:00:00Z",
      }),
      part("BOGUS001", "bogus", [heading("head0005", "Bogus")]),
    ];
    const resolved = await resolveThemeParts(astro("/about"));
    expect(resolved.header?.id).toBe("HEADNEW1");
    expect(resolved.header?.title).toBe("Part HEADNEW1");
    // W-216: header and footer parts are the page's banner and contentinfo landmarks.
    expect(resolved.header?.html).toStartWith(
      '<header class="emvb-theme-header" data-emvb-theme-part="HEADNEW1">',
    );
    expect(resolved.header?.html).toEndWith("</header>");
    expect(resolved.header?.html).toContain("New header");
    expect(resolved.footer?.html).toStartWith('<footer class="emvb-theme-footer"');
    expect(resolved.footer?.html).toEndWith("</footer>");
    expect(resolved.footer?.html).toContain("Footer");
    expect(resolved.content).toBeNull();
    expect(resolved.popups).toEqual([]);
    expect(resolved.css).toBe([resolved.header?.css, resolved.footer?.css].join("\n"));
    expect(resolved.needsPopupsRuntime).toBe(false);
  });

  test("parts past the first page of the collection still take part (QA-8)", async () => {
    themeEntries = [
      ...Array.from({ length: 120 }, (_, i) =>
        part(`FOOT${String(i).padStart(4, "0")}`, "footer", [heading("head0001", `Footer ${i}`)]),
      ),
      part("HEADLAST", "header", [heading("head0002", "Last header")]),
    ];
    const resolved = await resolveThemeParts(astro("/about"));
    expect(resolved.header?.id).toBe("HEADLAST");
  });

  test("a collection that never runs out of pages is read only up to a cap", async () => {
    endlessCursor = true;
    themeEntries = [part("HEAD0001", "header", [heading("head0001", "Header")])];
    const resolved = await resolveThemeParts(astro("/about"));
    expect(resolved.header?.id).toBe("HEAD0001");
    const reads = collectionCalls.filter((c) => c === THEME_PARTS_COLLECTION).length;
    expect(reads).toBeGreaterThan(1);
    expect(reads).toBeLessThanOrEqual(20);
  });

  test("only published parts are read, 50 at a time", async () => {
    themeEntries = [part("HEAD0001", "header", [heading("head0001", "Header")])];
    await resolveThemeParts(astro("/about"));
    expect(themeFilters).toEqual([{ status: "published", limit: 50 }]);
  });

  test.each(["error", "throw"] as const)(
    "a page of parts that fails (%s) ends the read with the parts already read",
    async (how) => {
      themeEntries = Array.from({ length: 60 }, (_, i) =>
        part(`FOOT${String(i).padStart(4, "0")}`, "footer", [heading(`head${i}`, `Footer ${i}`)], {
          updatedAt: `2026-09-01T00:00:${String(i).padStart(2, "0")}Z`,
        }),
      );
      failAt = { cursor: 50, how };
      // The newest footer is on the failed page, so the newest of the first 50 wins.
      expect((await resolveThemeParts(astro("/about"))).footer?.id).toBe("FOOT0049");
      expect(themeFilters).toHaveLength(2);
    },
  );

  test("a part saved without conditions or triggers uses the defaults (entire site, no triggers)", async () => {
    themeEntries = [
      part("HEAD0001", "header", [heading("head0001", "Header")], { conditions: "" }),
      part("FOOT0001", "footer", [heading("head0002", "Footer")], { conditions: null }),
      part("POPUP001", "popup", [heading("head0003", "Sale")], { triggers: null }),
    ];
    const resolved = await resolveThemeParts(astro("/about"));
    expect([resolved.header?.id, resolved.footer?.id]).toEqual(["HEAD0001", "FOOT0001"]);
    expect(resolved.popups.map((p) => [p.id, p.triggers])).toEqual([
      ["POPUP001", defaultTriggers()],
    ]);
  });

  test("unreadable triggers hide a popup but not a header, which has no triggers", async () => {
    themeEntries = [
      part("HEAD0001", "header", [heading("head0001", "Header")], { triggers: "{not json" }),
    ];
    expect((await resolveThemeParts(astro("/about"))).header?.id).toBe("HEAD0001");
  });

  test("order comes from updatedAt, not from the order the collection returns", async () => {
    const at = (day: string) => ({ updatedAt: `2026-09-${day}T00:00:00Z` });
    themeEntries = [
      part("POPOLD01", "popup", [heading("head0001", "Old")], at("01")),
      part("HEADTIE1", "header", [heading("head0002", "Tie one")], at("05")),
      part("POPNEW01", "popup", [heading("head0003", "New")], at("03")),
      part("HEADTIE2", "header", [heading("head0004", "Tie two")], at("05")),
      part("POPMID01", "popup", [heading("head0005", "Mid")], at("02")),
      part("HEADOLD2", "header", [heading("head0006", "Older")], at("04")),
    ];
    const resolved = await resolveThemeParts(astro("/about"));
    expect(resolved.popups.map((p) => p.id)).toEqual(["POPNEW01", "POPMID01", "POPOLD01"]);
    expect(resolved.header?.id).toBe("HEADTIE1");
    themeEntries = themeEntries.toReversed();
    const reversed = await resolveThemeParts(astro("/about"));
    expect(reversed.popups.map((p) => p.id)).toEqual(["POPNEW01", "POPMID01", "POPOLD01"]);
    expect(reversed.header?.id).toBe("HEADTIE2");
  });

  test("W-302: updatedAt as EmDash's Date objects orders by time, not by weekday name", async () => {
    // EmDash gives templates `Date`s. "Sun Sep 06 2026" sorts before "Tue Sep 01 2026" as text.
    const at = (day: string) => ({ updatedAt: new Date(`2026-09-${day}T00:00:00Z`) });
    themeEntries = [
      part("HEADOLD1", "header", [heading("head0001", "Old")], at("01")),
      part("HEADNEW1", "header", [heading("head0002", "New")], at("06")),
      part("POPOLD01", "popup", [heading("head0003", "Old")], at("01")),
      part("POPNEW01", "popup", [heading("head0004", "New")], at("06")),
    ];
    const resolved = await resolveThemeParts(astro("/about"));
    expect(resolved.header?.id).toBe("HEADNEW1");
    expect(resolved.popups.map((p) => p.id)).toEqual(["POPNEW01", "POPOLD01"]);
  });

  test("a 404 part replaces the content on 404s only", async () => {
    themeEntries = [part("NOTF0001", "error_404", [heading("head0001", "Lost?")])];
    const ctx404 = themeContextFrom(new URL("http://site.test/missing"), { is404: true });
    const resolved = await resolveThemeParts(astro("/missing"), ctx404);
    expect(resolved.content?.partType).toBe("error_404");
    expect(resolved.content?.html).toContain("Lost?");
    expect((await resolveThemeParts(astro("/about"))).content).toBeNull();
  });

  test("popups with valid triggers render wrapped with chrome CSS; invalid triggers fail closed", async () => {
    themeEntries = [
      part("POPUP001", "popup", [heading("head0001", "Sale")]),
      part("POPUP002", "popup", [heading("head0002", "Broken")], { triggers: "{not json" }),
    ];
    const resolved = await resolveThemeParts(astro("/about"));
    expect(resolved.popups.map((p) => p.id)).toEqual(["POPUP001"]);
    expect(resolved.popups[0]?.html).toContain('data-emvb-popup="POPUP001"');
    expect(resolved.popups[0]?.html).toContain(
      '<div class="emvb-theme-popup" data-emvb-theme-part="POPUP001">',
    );
    expect(resolved.popups[0]?.triggers).toEqual(defaultTriggers());
    expect(resolved.css.endsWith(POPUP_CHROME_CSS)).toBe(true);
    expect(resolved.needsPopupsRuntime).toBe(true);
  });

  test("a synced section shows inside a float and a popup too (W-200)", async () => {
    const synced = {
      id: "sect0001",
      type: "section",
      props: { partId: "SECT0001" },
      children: [],
    } as unknown as LayoutNode;
    themeEntries = [
      part("SECT0001", "section", [heading("head0009", "Shared promo")]),
      part("FLOAT001", "float", [synced]),
      part("POPUP001", "popup", [{ ...synced, id: "sect0002" } as LayoutNode]),
    ];
    const resolved = await resolveThemeParts(astro("/about"));
    expect(resolved.floats[0]?.html).toContain("Shared promo");
    expect(resolved.popups[0]?.html).toContain("Shared promo");
  });

  test("a float pins with chrome and can be dismissed; bad settings are skipped", async () => {
    themeEntries = [
      part("FLOAT001", "float", [heading("head0001", "We ship Tuesday")], {
        title: "Tuesday notice",
        float: { schemaVersion: 1, edge: "bottom", dismiss: true },
      }),
      part("FLOAT002", "float", [heading("head0002", "Broken")], { float: "{not json" }),
    ];
    const resolved = await resolveThemeParts(astro("/about"));
    expect(resolved.floats.map((item) => item.id)).toEqual(["FLOAT001"]);
    expect(resolved.floats[0]?.html).toContain('data-emvb-float="FLOAT001"');
    expect(resolved.floats[0]?.html).toContain("emvb-float--bottom");
    expect(resolved.floats[0]?.html).toContain('aria-label="Tuesday notice"');
    expect(resolved.floats[0]?.html).toContain("data-emvb-float-dismiss");
    expect(resolved.floats[0]?.html).toContain("We ship Tuesday");
    expect(resolved.needsFloatsRuntime).toBe(true);
    expect(resolved.css).toContain(".emvb-float{");
  });

  test("a float gets the default surface unless its box paints a background (W-171)", async () => {
    const painted = layout(heading("head0002", "Red bar"));
    themeEntries = [
      part("FLOAT001", "float", [heading("head0001", "Plain note")]),
      part("FLOAT002", "float", [], {
        layout: { ...painted, root: { ...painted.root, style: { backgroundColor: "#b91c1c" } } },
      }),
    ];
    const resolved = await resolveThemeParts(astro("/about"));
    const surfaced = (id: string) =>
      resolved.floats.find((item) => item.id === id)?.html.includes("emvb-float--surface");
    expect([surfaced("FLOAT001"), surfaced("FLOAT002")]).toEqual([true, false]);
    expect(resolved.css).toContain(":where(.emvb-float--surface){background:#fff");
  });

  test("tabs in any winning part turn on the tabs runtime", async () => {
    const tabs: LayoutNode = {
      id: "tabs0001",
      type: "tabs",
      props: {},
      children: [{ id: "tabp0001", type: "tab-panel", props: { label: "One" }, children: [] }],
    } as LayoutNode;
    const header = part("HEAD0001", "header", [heading("head0001", "Plain")]);
    themeEntries = [header];
    expect((await resolveThemeParts(astro("/about"))).needsTabsRuntime).toBe(false);
    themeEntries = [header, part("FOOT0001", "footer", [tabs])];
    expect((await resolveThemeParts(astro("/about"))).needsTabsRuntime).toBe(true);
    themeEntries = [header, part("POPUP001", "popup", [tabs])];
    expect((await resolveThemeParts(astro("/about"))).needsTabsRuntime).toBe(true);
  });

  test("a single-post part fills post fields from the post at /posts/<slug>", async () => {
    postEntries = [{ id: "01POST", data: { id: "01POST", slug: "welcome", title: "Welcome!" } }];
    themeEntries = [
      part("SINGLE01", "single_post", [
        { id: "ptitle01", type: "post-title", props: { level: 1 } } as LayoutNode,
      ]),
    ];
    const resolved = await resolveThemeParts(
      astro("/posts/welcome"),
      themeContextFrom(new URL("http://site.test/posts/welcome"), {
        content: { collection: "posts", id: "", slug: "welcome" },
      }),
    );
    expect(resolved.content?.html).toContain("Welcome!");
  });

  test("an archive part repeats its loop item part once per post", async () => {
    postEntries = [
      { id: "01A", data: { id: "01A", slug: "a", title: "Alpha" } },
      { id: "01B", data: { id: "01B", slug: "b", title: "Beta" } },
    ];
    themeEntries = [
      part("ARCHIVE1", "archive", [
        { id: "loop0001", type: "loop", props: { itemPartId: "LOOPITEM" }, children: [] },
      ] as LayoutNode[]),
      part("LOOPITEM", "loop_item", [
        { id: "ptitle01", type: "post-title", props: { level: 3 } } as LayoutNode,
      ]),
    ];
    const resolved = await resolveThemeParts(
      astro("/posts"),
      themeContextFrom(new URL("http://site.test/posts")),
    );
    const html = resolved.content?.html ?? "";
    expect(html.match(/data-emvb-loop-item=/g)?.length).toBe(2);
    expect(html).toContain("Alpha");
    expect(html).toContain("Beta");
  });
});

describe("archive pagination (W-221)", () => {
  const posts = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `P${i + 1}`,
      data: { id: `P${i + 1}`, slug: `p${i + 1}`, title: `Post ${i + 1}` },
    }));
  const archive = (perPage?: number) => [
    part("ARCHIVE1", "archive", [
      {
        id: "loop0001",
        type: "loop",
        props: perPage ? { perPage } : {},
        children: [{ id: "ptitle01", type: "post-title", props: { level: 3 } }],
      },
    ] as LayoutNode[]),
  ];
  const at = (path: string) =>
    resolveThemeParts(astro(path), themeContextFrom(new URL(`http://site.test${path}`)));
  const count = (html = "") => html.match(/data-emvb-loop-item=/g)?.length ?? 0;

  test("the Loop's Posts per page sets the page size and /page/N the offset", async () => {
    postEntries = posts(7);
    themeEntries = archive(3);
    const page2 = await at("/posts/page/2");
    expect(postFilters.at(-1)).toMatchObject({ limit: 3, offset: 3 });
    expect(count(page2.content?.html)).toBe(3);
    expect(page2.content?.html).toContain("Post 4");
    expect(page2.notFound).toBe(false);
    expect(page2.canonicalPath).toBe("/posts/page/2");
    // W-229: hosts title the page "Posts – page 2".
    expect(page2.archiveTitle).toBe("Posts");
    expect(page2.archivePage).toBe(2);
    // W-263: the term's label, falling back to the slug when the term can't be read.
    expect((await at("/category/news/page/2")).archiveTitle).toBe("News");
    expect((await at("/tag/unknown-tag/page/2")).archiveTitle).toBe("unknown-tag");
    expect((await at("/category/broken/page/2")).archiveTitle).toBe("broken");
    const page3 = await at("/posts/page/3");
    expect(count(page3.content?.html)).toBe(1);
  });

  test("a page past the last one is not found; page 1 with no posts is", async () => {
    postEntries = posts(4);
    themeEntries = archive(2);
    expect((await at("/posts/page/3")).notFound).toBe(true);
    postEntries = [];
    const first = await at("/posts");
    expect(first.notFound).toBe(false);
    expect(first.canonicalPath).toBe("/posts");
  });

  test("page 1 has the bare canonical path, also when asked as /page/1", async () => {
    postEntries = posts(3);
    themeEntries = archive();
    expect((await at("/posts/page/1")).canonicalPath).toBe("/posts");
    expect(postFilters.at(-1)).toMatchObject({ limit: 20 });
    expect((await at("/category/news/page/2")).canonicalPath).toBe("/category/news/page/2");
  });

  test("a Pagination element in the archive part links the pages (W-222)", async () => {
    postEntries = posts(5);
    themeEntries = [
      part("ARCHIVE1", "archive", [
        {
          id: "loop0001",
          type: "loop",
          props: { perPage: 2 },
          children: [{ id: "ptitle01", type: "post-title", props: { level: 3 } }],
        },
        { id: "pagi0001", type: "pagination", props: {} },
      ] as LayoutNode[]),
    ];
    const html = (await at("/posts/page/2")).content?.html ?? "";
    expect(html).toContain('href="/posts" rel="prev"');
    expect(html).toContain('href="/posts/page/2" aria-current="page"');
    expect(html).toContain('href="/posts/page/3" rel="next"');
    const last = (await at("/posts/page/3")).content?.html ?? "";
    expect(last).not.toContain('rel="next"');
  });
});
