import { describe, expect, test } from "bun:test";
import type { Fetcher } from "./api.ts";
import { loadSiteMenus, menuKey } from "./menus-api.ts";

// W-1026: an imported Elementor Nav Menu gets the links of the site menu with its name.

const item = (id: string, label: string, extra: Record<string, unknown> = {}) => ({
  id,
  parentId: null,
  sortOrder: 0,
  type: "custom",
  referenceCollection: null,
  referenceId: null,
  customUrl: null,
  label,
  target: null,
  ...extra,
});

function site(routes: Record<string, unknown>): { fetcher: Fetcher; calls: string[] } {
  const calls: string[] = [];
  const fetcher: Fetcher = async (path) => {
    calls.push(path);
    if (!(path in routes)) return Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
    return Response.json({ data: routes[path] });
  };
  return { fetcher, calls };
}

describe("site menus for imported Nav Menus (W-1026)", () => {
  test("a menu matches by its name or label written as a slug", () => {
    expect(menuKey("Main Menu")).toBe("main-menu");
    expect(menuKey("  Primary_Navigation! ")).toBe("primary-navigation");
  });

  test("custom links, page and post links and sub-items become nested links in order", async () => {
    const { fetcher, calls } = site({
      "/_emdash/api/menus": [{ name: "primary", label: "Main Menu" }],
      "/_emdash/api/menus/primary": {
        items: [
          item("i3", "Blog", {
            sortOrder: 2,
            type: "post",
            referenceCollection: "posts",
            referenceId: "P1",
          }),
          item("i1", "Home", { sortOrder: 0, customUrl: "/" }),
          item("i2", "About", {
            sortOrder: 1,
            type: "page",
            referenceCollection: "pages",
            referenceId: "A1",
          }),
          item("i4", "Team", { parentId: "i2", customUrl: "/about/team", target: "_blank" }),
          item("i5", "Gone", {
            sortOrder: 3,
            type: "page",
            referenceCollection: "pages",
            referenceId: "X",
          }),
        ],
      },
      "/_emdash/api/content/pages/A1": { item: { slug: "about-us" } },
      "/_emdash/api/content/posts/P1": { item: { slug: "hello" } },
    });
    const menus = await loadSiteMenus(fetcher, ["main-menu", "footer"]);
    expect([...menus.keys()]).toEqual(["main-menu"]);
    expect(menus.get("main-menu")).toEqual([
      { text: "Home", href: "/" },
      {
        text: "About",
        href: "/about-us",
        children: [{ text: "Team", href: "/about/team", newTab: true }],
      },
      { text: "Blog", href: "/posts/hello" },
      { text: "Gone" },
    ]);
    expect(calls.filter((c) => c.includes("/content/"))).toHaveLength(3);
  });

  test("nothing wanted asks nothing; an unreadable menu list finds nothing", async () => {
    const quiet = site({});
    expect((await loadSiteMenus(quiet.fetcher, [])).size).toBe(0);
    expect(quiet.calls).toEqual([]);
    const denied = site({});
    expect((await loadSiteMenus(denied.fetcher, ["main-menu"])).size).toBe(0);
  });
});
