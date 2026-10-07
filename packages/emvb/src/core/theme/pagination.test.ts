import { describe, expect, test } from "bun:test";
import {
  archivePagePath,
  archivePageTitle,
  DEFAULT_PER_PAGE,
  loopPerPage,
  paginationItems,
  splitArchivePage,
  type Layout,
} from "../index.ts";

const withLoop = (props: Record<string, unknown>): Layout =>
  ({
    schemaVersion: 1,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      children: [{ id: "loop0001", type: "loop", props, children: [] }],
    },
  }) as unknown as Layout;

describe("archive page paths (W-221)", () => {
  test("page 1 is the bare archive path", () => {
    expect(archivePagePath("/posts", 1)).toBe("/posts");
    expect(archivePagePath("/posts/", 3)).toBe("/posts/page/3");
    expect(archivePagePath("/category/news", 2)).toBe("/category/news/page/2");
  });
  test("only plain page numbers split off", () => {
    expect(splitArchivePage("/posts")).toEqual({ basePath: "/posts", page: 1 });
    expect(splitArchivePage("/posts/page/12")).toEqual({ basePath: "/posts", page: 12 });
    for (const bad of ["/posts/page/0", "/posts/page/01", "/posts/page/x", "/posts/page/9999999"])
      expect(splitArchivePage(bad)).toBeNull();
  });
  test("posts per page comes from the first Loop, else the default", () => {
    expect(loopPerPage(withLoop({ perPage: 5 }))).toBe(5);
    expect(loopPerPage(withLoop({}))).toBe(DEFAULT_PER_PAGE);
    expect(loopPerPage(withLoop({ perPage: 500 }))).toBe(DEFAULT_PER_PAGE);
  });
});

describe("pagination items (W-221)", () => {
  test("one page shows nothing", () => {
    expect(paginationItems({ page: 1, hasMore: false, basePath: "/posts" })).toEqual([]);
  });
  test("first page of many: numbers and Next, no Previous", () => {
    const items = paginationItems({ page: 1, hasMore: true, basePath: "/posts" });
    expect(items.map((i) => i.kind)).toEqual(["page", "page", "next"]);
    expect(items[0]).toMatchObject({ n: 1, href: "/posts", current: true });
    expect(items[2]).toEqual({ kind: "next", href: "/posts/page/2" });
  });
  test("last page: Previous, no Next; a gap after 1 far in", () => {
    const items = paginationItems({ page: 6, hasMore: false, basePath: "/tag/a" });
    expect(items[0]).toEqual({ kind: "prev", href: "/tag/a/page/5" });
    expect(items.map((i) => (i.kind === "page" ? i.n : i.kind))).toEqual([
      "prev",
      1,
      "gap",
      4,
      5,
      6,
    ]);
  });
});

test("a paged archive title reads 'Posts – page 2'; page 1 is bare (W-229)", () => {
  expect(archivePageTitle("Posts", 2)).toBe("Posts – page 2");
  expect(archivePageTitle("Posts", 1)).toBe("Posts");
  expect(archivePageTitle("news", undefined)).toBe("news");
});
