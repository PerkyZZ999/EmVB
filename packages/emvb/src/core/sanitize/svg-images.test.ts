import { describe, expect, test } from "bun:test";
import { droppedNotice, prepareElement } from "../clipboard.ts";
import { renderPage } from "../render/index.ts";
import { serialize } from "../render/vnode.ts";
import { emptyDesign } from "../schema/design.ts";
import type { Layout, LayoutNode } from "../schema/layout.ts";
import { isAllowedSvgImageHref, sanitizeSvgMarkup, sanitizeSvgReport } from "./svg.ts";

const MEDIA = "/_emdash/api/media/file/01ABCDEF.png";
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";
const svgWith = (href: string, attr = "href") =>
  `<svg viewBox="0 0 4 4"><image ${attr}="${href}" width="4" height="4"/><circle r="1"/></svg>`;

const svgNode = (markup: string): LayoutNode =>
  ({ id: "svg00001", type: "svg", props: { markup, title: "Logo", size: 48 } }) as LayoutNode;
const page = (children: LayoutNode[]): Layout =>
  ({
    schemaVersion: 14,
    root: { id: "root0001", type: "container", props: {}, children },
  }) as unknown as Layout;

describe("SVG <image> sources (W-231)", () => {
  test("media-library paths and embedded rasters are kept", () => {
    for (const href of [
      MEDIA,
      "/_emdash/api/media/file/2026/10/logo%20dark.webp",
      PNG,
      "data:image/jpeg;base64,/9j/4AAQ",
      "data:image/webp;base64,UklGRg==",
      "data:image/gif;base64,R0lGODlhAQABAAAAACw=",
    ]) {
      expect(isAllowedSvgImageHref(href)).toBe(true);
      for (const attr of ["href", "xlink:href"]) {
        const report = sanitizeSvgReport(svgWith(href, attr));
        expect(report.images).toBe(0);
        expect(serialize(report.tree ?? "")).toContain(`<image ${attr}="${href}"`);
      }
    }
  });

  test("any other image source drops the image, not the rest of the SVG", () => {
    for (const href of [
      "https://track.example/pixel.gif",
      "http://cdn.example/a.png",
      "//evil.example/a.png",
      "/media/a.png",
      "/_emdash/api/media/file/../../admin",
      "/_emdash/api/media/file/",
      "/_emdash/api/media/files/a.png",
      "a.png",
      "",
    ]) {
      expect(isAllowedSvgImageHref(href)).toBe(false);
      const report = sanitizeSvgReport(svgWith(href));
      expect(report.images).toBe(1);
      const html = serialize(report.tree ?? "");
      expect(html).not.toContain("<image");
      expect(html).toContain("<circle");
    }
  });

  test("an external image is dropped with its children, and each one is counted", () => {
    const report = sanitizeSvgReport(
      `<svg><g><image href="https://a.example/1.png"><title>x</title></image><rect width="1" height="1"/></g><image xlink:href="https://b.example/2.png"/><image href="${MEDIA}"/></svg>`,
    );
    expect(report.images).toBe(2);
    const html = serialize(report.tree ?? "");
    expect(html.match(/<image/g)?.length).toBe(1);
    expect(html).toContain("<rect");
    expect(html).not.toContain("<title");
  });

  test("an image with one good and one external href is still dropped", () => {
    const report = sanitizeSvgReport(
      `<svg><image href="${MEDIA}" xlink:href="https://x.example/a.png"/></svg>`,
    );
    expect(report.images).toBe(1);
    expect(serialize(report.tree ?? "")).not.toContain("<image");
  });

  test("other data: uses still refuse the whole SVG", () => {
    for (const markup of [
      svgWith("data:image/svg+xml;base64,PHN2Zy8+"),
      svgWith("data:text/html;base64,PHNjcmlwdD4="),
      svgWith("data:image/png,rawbytes"),
      svgWith("data:image/png;base64,abc<"),
      '<svg><path fill="url(data:image/png;base64,AAAA)" d="M0 0"/></svg>',
      `<svg><use href="${PNG}"/></svg>`,
      "<svg><title>data: uri</title></svg>",
    ])
      expect(sanitizeSvgMarkup(markup)).toBeUndefined();
  });

  test("render re-checks stored markup, so existing pages lose the external image", () => {
    const html = renderPage(
      page([svgNode(svgWith("https://track.example/p.gif"))]),
      emptyDesign(),
    ).html;
    expect(html).toContain("<svg");
    expect(html).toContain("<circle");
    expect(html).not.toContain("track.example");
    expect(renderPage(page([svgNode(svgWith(MEDIA))]), emptyDesign()).html).toContain(MEDIA);
  });

  test("paste keeps the SVG, stores it without the external image and says so", () => {
    const { node, dropped } = prepareElement(
      svgNode(svgWith("https://track.example/p.gif")),
      page([]),
      emptyDesign(),
    );
    const markup = (node.props as { markup: string }).markup;
    expect(markup).not.toContain("track.example");
    expect(markup).toContain("<circle");
    expect(dropped.images).toBe(1);
    expect(dropped.unsafe).toBe(0);
    expect(droppedNotice(dropped)).toBe("Left out 1 external image.");
    expect(droppedNotice({ classes: 0, variables: 0, htmlIds: 0, unsafe: 0, images: 2 })).toBe(
      "Left out 2 external images.",
    );
  });

  test("paste leaves allowed images and their markup untouched", () => {
    const original = svgNode(svgWith(MEDIA));
    const { node, dropped } = prepareElement(original, page([]), emptyDesign());
    expect((node.props as { markup: string }).markup).toBe(svgWith(MEDIA));
    expect(dropped.images ?? 0).toBe(0);
    expect(droppedNotice(dropped)).toBeNull();
  });
});
