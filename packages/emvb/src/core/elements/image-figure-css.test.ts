import { describe, expect, test } from "bun:test";
import { emptyDesign, renderPage, type Layout } from "../index.ts";

describe("W-792 image figure CSS ships with the image", () => {
  test("a page with only a captioned, linked image gets the figure, caption and link rules", () => {
    const layout: Layout = {
      schemaVersion: 17,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          {
            id: "img00001",
            type: "image",
            props: { src: "/a.png", alt: "A", href: "/x", caption: "Caption" },
          },
        ],
      },
    };
    const { css, html } = renderPage(layout, emptyDesign());
    expect(html).toContain('class="emvb-figure"');
    expect(html).not.toContain("emvb-button");
    expect(css).toContain(".emvb-figure{margin:0}");
    expect(css).toContain(".emvb-figcaption{margin-top:0.35em}");
    expect(css).toContain(".emvb-image-link{display:contents}");
  });
});
