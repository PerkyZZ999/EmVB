import { describe, expect, test } from "bun:test";
import { DESIGN_SCHEMA_VERSION, emptyDesign, type DesignSystem } from "../schema/design.ts";
import { LAYOUT_SCHEMA_VERSION, type Layout } from "../schema/layout.ts";
import { decodeSharedPage, encodeSharedPage, sharedFromHash, shareUrl } from "./link.ts";

const layout: Layout = {
  schemaVersion: LAYOUT_SCHEMA_VERSION,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [{ id: "head0001", type: "heading", props: { text: "Héllo ✓", level: 1 } }],
  },
} as Layout;

const design: DesignSystem = {
  schemaVersion: DESIGN_SCHEMA_VERSION,
  variables: {
    colors: [{ id: "brand", name: "Brand", value: "#1d4ed8" }],
    fonts: [],
    fontSizes: [],
    spacings: [],
  },
};

async function packRaw(json: string): Promise<string> {
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return `1.${btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")}`;
}

describe("W-321 shareable playground links", () => {
  test("W-321 a page and its styles survive the round trip, unicode included", async () => {
    const encoded = await encodeSharedPage({ title: "Landing", layout, design });
    expect(encoded).toMatch(/^1\.[A-Za-z0-9_-]+$/);
    const read = await decodeSharedPage(encoded);
    expect(read).toEqual({ ok: true, page: { title: "Landing", layout, design } });
  });

  test("W-321 the page rides in the hash, never the query", async () => {
    const encoded = await encodeSharedPage({ title: "x", layout });
    const url = new URL(shareUrl(encoded));
    expect(url.origin + url.pathname).toBe("https://emvb.dev/playground/");
    expect(url.search).toBe("");
    expect(sharedFromHash(url.hash)).toBe(encoded);
    expect(sharedFromHash("#other=1")).toBeNull();
    expect(sharedFromHash("")).toBeNull();
  });

  test("W-321 without styles, only the page travels", async () => {
    const read = await decodeSharedPage(await encodeSharedPage({ title: " ", layout }));
    expect(read.ok && read.page.design).toBeUndefined();
    expect(read.ok && read.page.title).toBe("Shared page");
  });

  test("W-321 damaged, cut or foreign links are refused", async () => {
    const good = await encodeSharedPage({ title: "x", layout });
    expect((await decodeSharedPage("")).ok).toBe(false);
    expect(await decodeSharedPage(good.slice(0, good.length / 2))).toMatchObject({
      ok: false,
      reason: "unreadable",
    });
    expect(await decodeSharedPage(`2.${good.slice(2)}`)).toMatchObject({ reason: "unreadable" });
    expect(await decodeSharedPage("1.not*base64")).toMatchObject({ reason: "unreadable" });
    expect(await decodeSharedPage(`1.${"A".repeat(200_001)}`)).toMatchObject({
      reason: "too-long",
    });
    expect(await decodeSharedPage(await packRaw("[1,2"))).toMatchObject({ reason: "unreadable" });
  });

  test("W-321 the page is checked like a saved one", async () => {
    const bad = await packRaw(
      JSON.stringify({ t: "x", l: { schemaVersion: 13, root: { id: "x", type: "nope" } } }),
    );
    expect(await decodeSharedPage(bad)).toMatchObject({ ok: false, reason: "invalid" });
    const xss = await packRaw(
      JSON.stringify({
        t: "x",
        l: layout,
        d: {
          ...emptyDesign(),
          variables: {
            colors: [{ id: "a", name: "A", value: "red;}</style>" }],
            fonts: [],
            fontSizes: [],
            spacings: [],
          },
        },
      }),
    );
    expect(await decodeSharedPage(xss)).toMatchObject({ ok: false, reason: "invalid" });
  });

  test("W-321 a small link can't unpack into something huge", async () => {
    const bomb = await packRaw(JSON.stringify({ t: "x".repeat(2_000_000), l: layout }));
    expect(bomb.length).toBeLessThan(10_000);
    expect(await decodeSharedPage(bomb)).toMatchObject({ ok: false, reason: "unreadable" });
  });
});
