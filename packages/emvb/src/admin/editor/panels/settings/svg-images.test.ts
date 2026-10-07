import { describe, expect, test } from "bun:test";
import type { LayoutNode } from "../../../../core/index.ts";
import { svgImagesLeftOut, svgImagesNotice } from "./svg-images.ts";

const svg = (markup: unknown) =>
  ({ id: "svg00001", type: "svg", props: { markup } }) as unknown as LayoutNode;

describe("SVG markup field note (W-231)", () => {
  test("counts the external images the markup loses", () => {
    expect(
      svgImagesLeftOut(
        svg(
          '<svg><image href="https://a.example/1.png"/><image href="https://b.example/2.png"/></svg>',
        ),
      ),
    ).toBe(2);
    expect(svgImagesLeftOut(svg('<svg><image href="/_emdash/api/media/file/a.png"/></svg>'))).toBe(
      0,
    );
    expect(svgImagesLeftOut(svg(42))).toBe(0);
    expect(
      svgImagesLeftOut({ id: "t", type: "text", props: { text: "x" } } as unknown as LayoutNode),
    ).toBe(0);
  });

  test("the note names the count and what is allowed", () => {
    expect(svgImagesNotice(1)).toBe(
      "Left out 1 external image. An SVG can only show pictures from the media library or embedded PNG, JPEG, WebP or GIF data.",
    );
    expect(svgImagesNotice(3)).toContain("Left out 3 external images.");
  });
});
