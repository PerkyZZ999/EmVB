import { describe, expect, test } from "bun:test";
import { canDrop, moveNode, REASONS } from "./arrange.ts";
import { defaultElement } from "./index.ts";
import {
  MAX_CAROUSEL_SLIDES,
  MAX_GALLERY_IMAGES,
  MAX_PRICE_ITEMS,
  MAX_SHARE_LINKS,
  MAX_SOCIAL_LINKS,
} from "./limits.ts";
import { nestingIssues } from "./nesting.ts";
import type { Layout, LayoutNode } from "./schema/layout.ts";

// W-1024: Social icons hold Social links only, at most 20; a link lives only in Social icons.
const links = (n: number): LayoutNode[] =>
  Array.from({ length: n }, (_, i) =>
    defaultElement("social-link", `sl${String(i).padStart(6, "0")}`),
  );
const layoutWith = (children: LayoutNode[]): Layout => ({
  schemaVersion: 18,
  root: { id: "root0001", type: "container", props: {}, children },
});

describe("Social icons arrange rules (W-1024)", () => {
  test("a link drops only into Social icons, which take nothing else", () => {
    const layout = layoutWith([{ ...defaultElement("social-icons", "soci0001"), children: [] }]);
    const link = defaultElement("social-link", "new00001");
    const heading = defaultElement("heading", "head0001");
    expect(canDrop(layout, { kind: "new", node: link }, "soci0001").ok).toBe(true);
    expect(canDrop(layout, { kind: "new", node: heading }, "soci0001")).toEqual({
      ok: false,
      reason: REASONS.onlySocialLinks,
    });
    expect(canDrop(layout, { kind: "new", node: link }, "root0001")).toEqual({
      ok: false,
      reason: REASONS.linkOutsideSocial,
    });
  });

  test("a full Social icons refuses a 21st link, but its own links still reorder", () => {
    const layout = layoutWith([
      { ...defaultElement("social-icons", "soci0001"), children: links(MAX_SOCIAL_LINKS) },
    ]);
    expect(
      canDrop(layout, { kind: "new", node: defaultElement("social-link", "new00001") }, "soci0001"),
    ).toEqual({ ok: false, reason: REASONS.tooManySocialLinks });
    expect(moveNode(layout, "sl000000", "soci0001", MAX_SOCIAL_LINKS).ok).toBe(true);
  });

  test("a saved page with a stray Social link is reported", () => {
    const stray = layoutWith([defaultElement("social-link", "sl000001")]);
    expect(nestingIssues(stray).map((issue) => issue.message)).toEqual([
      `${REASONS.linkOutsideSocial} (social-link sl000001)`,
    ]);
  });
});

describe("Gallery arrange rules (W-1019)", () => {
  test("a full Gallery refuses a 61st picture; pictures drop only into a gallery", () => {
    const pictures = Array.from({ length: MAX_GALLERY_IMAGES }, (_, i) =>
      defaultElement("gallery-image", `pc${String(i).padStart(6, "0")}`),
    );
    const layout = layoutWith([{ ...defaultElement("gallery", "gall0001"), children: pictures }]);
    const picture = defaultElement("gallery-image", "new00001");
    expect(canDrop(layout, { kind: "new", node: picture }, "gall0001")).toEqual({
      ok: false,
      reason: REASONS.tooManyGalleryImages,
    });
    expect(canDrop(layout, { kind: "new", node: picture }, "root0001")).toEqual({
      ok: false,
      reason: REASONS.imageOutsideGallery,
    });
    expect(moveNode(layout, "pc000000", "gall0001", MAX_GALLERY_IMAGES).ok).toBe(true);
  });
});

describe("Carousel arrange rules (W-1018)", () => {
  test("a full Carousel refuses a 21st slide; any element drops into a slide", () => {
    const slides = Array.from({ length: MAX_CAROUSEL_SLIDES }, (_, i) =>
      defaultElement("carousel-slide", `cs${String(i).padStart(6, "0")}`),
    );
    const layout = layoutWith([{ ...defaultElement("carousel", "caro0001"), children: slides }]);
    expect(
      canDrop(
        layout,
        { kind: "new", node: defaultElement("carousel-slide", "new00001") },
        "caro0001",
      ),
    ).toEqual({ ok: false, reason: REASONS.tooManySlides });
    expect(
      canDrop(layout, { kind: "new", node: defaultElement("heading", "head0001") }, "cs000000").ok,
    ).toBe(true);
    expect(moveNode(layout, "cs000000", "caro0001", MAX_CAROUSEL_SLIDES).ok).toBe(true);
  });
});

describe("Price list arrange rules (W-1043)", () => {
  test("a full Price list refuses a 51st item; items drop only into a price list, which takes nothing else", () => {
    const items = Array.from({ length: MAX_PRICE_ITEMS }, (_, i) =>
      defaultElement("price-list-item", `pi${String(i).padStart(6, "0")}`),
    );
    const layout = layoutWith([{ ...defaultElement("price-list", "plst0001"), children: items }]);
    const item = defaultElement("price-list-item", "new00001");
    expect(canDrop(layout, { kind: "new", node: item }, "plst0001")).toEqual({
      ok: false,
      reason: REASONS.tooManyPriceItems,
    });
    expect(canDrop(layout, { kind: "new", node: item }, "root0001")).toEqual({
      ok: false,
      reason: REASONS.itemOutsidePriceList,
    });
    expect(
      canDrop(layout, { kind: "new", node: defaultElement("heading", "head0001") }, "plst0001"),
    ).toEqual({ ok: false, reason: REASONS.onlyPriceItems });
    expect(moveNode(layout, "pi000000", "plst0001", MAX_PRICE_ITEMS).ok).toBe(true);
  });
});

describe("Share buttons arrange rules (W-1047)", () => {
  test("a full Share buttons refuses a 13th link; share links drop only into Share buttons", () => {
    const shareLinks = Array.from({ length: MAX_SHARE_LINKS }, (_, i) =>
      defaultElement("share-link", `sh${String(i).padStart(6, "0")}`),
    );
    const layout = layoutWith([
      { ...defaultElement("share-buttons", "shar0001"), children: shareLinks },
    ]);
    const link = defaultElement("share-link", "new00001");
    expect(canDrop(layout, { kind: "new", node: link }, "shar0001")).toEqual({
      ok: false,
      reason: REASONS.tooManyShareLinks,
    });
    expect(canDrop(layout, { kind: "new", node: link }, "root0001")).toEqual({
      ok: false,
      reason: REASONS.shareOutsideButtons,
    });
    expect(
      canDrop(layout, { kind: "new", node: defaultElement("heading", "head0001") }, "shar0001"),
    ).toEqual({ ok: false, reason: REASONS.onlyShareLinks });
  });
});
