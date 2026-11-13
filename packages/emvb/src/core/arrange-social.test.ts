import { describe, expect, test } from "bun:test";
import { canDrop, moveNode, REASONS } from "./arrange.ts";
import { defaultElement } from "./index.ts";
import { MAX_GALLERY_IMAGES, MAX_SOCIAL_LINKS } from "./limits.ts";
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
