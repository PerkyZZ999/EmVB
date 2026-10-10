import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import * as realEmDash from "emdash";
import type { Layout, LayoutNode } from "../core/index.ts";

let active = false;
const calls: { collection: string; filter: unknown }[] = [];
const realGet = realEmDash.getEmDashCollection;
mock.module("emdash", () => ({
  ...realEmDash,
  getEmDashCollection: (...args: Parameters<typeof realEmDash.getEmDashCollection>) => {
    if (!active) return realGet(...args);
    calls.push({ collection: String(args[0]), filter: args[1] });
    return Promise.resolve({
      entries: [
        {
          id: "01TEAM",
          data: {
            id: "01TEAM",
            slug: "ana lee",
            title: "Ana",
            excerpt: "Default excerpt",
            role: "Designer",
            featured_image: { src: "https://cdn.test/featured.jpg" },
            photo: { src: "https://cdn.test/photo.jpg", alt: "Ana smiling" },
          },
        },
      ],
    });
  },
}));

const { bindingDataFor } = await import("./request-data.ts");
const { themePostFromEntry } = await import("./theme-posts.ts");

beforeAll(() => {
  active = true;
});
afterAll(() => {
  active = false;
});

const loop = (props: Record<string, unknown>): Layout =>
  ({
    schemaVersion: 14,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      children: [
        { id: "loop0001", type: "loop", props: { collection: "team", ...props }, children: [] },
      ] as LayoutNode[],
    },
  }) as Layout;

describe("Loop options (W-330)", () => {
  test("filters go to EmDash as `where`; link pattern, image and excerpt fields shape the entries", async () => {
    calls.length = 0;
    const data = await bindingDataFor(
      loop({
        permalink: "/people/{slug}",
        imageField: "photo",
        excerptField: "role",
        filter: "category=news; category=featured; team=design",
      }),
      new URL("https://site.test/"),
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]?.filter).toMatchObject({
      status: "published",
      where: { category: ["news", "featured"], team: "design" },
    });
    const [entry] = data.collections?.["loop0001"] ?? [];
    expect(entry?.permalink).toBe("/people/ana%20lee");
    expect(entry?.featuredImageUrl).toBe("https://cdn.test/photo.jpg");
    expect(entry?.featuredImageAlt).toBe("Ana smiling");
    expect(entry?.excerpt).toBe("Designer");
  });

  test("without options a Loop reads as before: no where, /collection/slug, featured image", async () => {
    calls.length = 0;
    const data = await bindingDataFor(loop({}), new URL("https://site.test/"));
    expect(calls[0]?.filter).not.toHaveProperty("where");
    const [entry] = data.collections?.["loop0001"] ?? [];
    expect(entry?.permalink).toBe("/team/ana lee");
    expect(entry?.featuredImageUrl).toBe("https://cdn.test/featured.jpg");
    expect(entry?.excerpt).toBe("Default excerpt");
  });

  test("an {id} pattern, and a missing image or excerpt field gives none", () => {
    const post = themePostFromEntry(
      { id: "01X", data: { id: "01X", slug: "x", title: "X" } },
      { permalinkPattern: "/p/{id}/{slug}", imageField: "photo", excerptField: "role" },
    );
    expect(post?.permalink).toBe("/p/01X/x");
    expect(post?.featuredImageUrl).toBeUndefined();
    expect(post?.excerpt).toBe("");
  });
});
