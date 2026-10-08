import { describe, expect, test } from "bun:test";
import { emptyDesign, renderPage, type Layout, type LayoutNode } from "../index.ts";

const design = emptyDesign();
const page = (child: LayoutNode): Layout => ({
  schemaVersion: 12,
  root: { id: "root0001", type: "container", props: {}, children: [child] },
});
const image = (props: Record<string, unknown>): LayoutNode =>
  ({
    id: "img00001",
    type: "image",
    props: { src: "https://example.com/a.jpg", alt: "A dog", ...props },
  }) as LayoutNode;

describe("W-269 images keep their natural size in a stretching container", () => {
  test("an image without a width attribute is fit-content, in :where() so styles win", () => {
    const { css, html } = renderPage(page(image({})), design);
    expect(css).toContain(":where(img.emvb-image:not([width])){width:fit-content}");
    expect(html).toMatch(/<img class="emvb-image"[^>]*>/);
    expect(html).not.toMatch(/<img[^>]* width=/);
  });

  test("Width (px) renders the width attribute, which the rule leaves alone", () => {
    const { html } = renderPage(page(image({ width: 320 })), design);
    expect(html).toMatch(/<img[^>]* width="320"/);
  });

  test("the missing-image placeholder isn't an img, so the rule doesn't shrink it", () => {
    const { html, css } = renderPage(page(image({ src: "" })), design);
    expect(html).toContain("emvb-image-missing");
    expect(css).not.toMatch(/:where\(\.emvb-image[^)]*\)\{width:fit-content/);
  });
});
