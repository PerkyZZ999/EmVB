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

mock.module("emdash", () => ({
  ...realEmDash,
  getEmDashCollection: async (collection: string) => {
    collectionCalls.push(collection);
    return { entries: collection === THEME_PARTS_COLLECTION ? themeEntries : postEntries };
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
  themeEntries = [];
  postEntries = [];
  collectionCalls.length = 0;
});

describe("resolveThemeParts (R-062)", () => {
  test("no published parts resolves to nothing", async () => {
    expect(await resolveThemeParts(astro("/about"))).toEqual({
      header: null,
      footer: null,
      content: null,
      popups: [],
      css: "",
      needsPopupsRuntime: false,
      needsTabsRuntime: false,
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
    expect(resolved.header?.html).toStartWith(
      '<div class="emvb-theme-header" data-emvb-theme-part="HEADNEW1">',
    );
    expect(resolved.header?.html).toContain("New header");
    expect(resolved.footer?.html).toContain("Footer");
    expect(resolved.content).toBeNull();
    expect(resolved.popups).toEqual([]);
    expect(resolved.css).toBe([resolved.header?.css, resolved.footer?.css].join("\n"));
    expect(resolved.needsPopupsRuntime).toBe(false);
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
