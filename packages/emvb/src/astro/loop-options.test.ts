import { describe, expect, test } from "bun:test";
import type { Layout, LayoutNode } from "../core/index.ts";
import type { ContentPort } from "./content-port.ts";
import { bindingDataFor } from "./request-data.ts";
import { themePostFromEntry } from "./theme-posts.ts";

const calls: { collection: string; filter: unknown }[] = [];
const content = {
  decodeSlug: (value: string | undefined) => value,
  getEntry: async () => ({ entry: null }),
  getCollection: async (collection: string, filter: unknown) => {
    calls.push({ collection, filter });
    return {
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
    };
  },
  getTerm: async () => null,
  getSiteSettings: async () => ({}),
  pluginHandler: () => async () => ({}),
} as unknown as ContentPort;

const loop = (props: Record<string, unknown>): Layout =>
  ({
    schemaVersion: 17,
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
      undefined,
      [],
      {},
      content,
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
    const data = await bindingDataFor(
      loop({}),
      new URL("https://site.test/"),
      undefined,
      [],
      {},
      content,
    );
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
