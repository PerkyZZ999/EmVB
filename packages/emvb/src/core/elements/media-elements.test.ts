import { describe, expect, test } from "bun:test";
import { emptyDesign, renderPage, type Layout, type LayoutNode } from "../index.ts";
import { defaultElement } from "./index.ts";

// W-091: Stryker left the SVG, icon and image renderers' accessibility and size branches, and
// every "missing" fallback class, unchecked (elements/index.ts 76%).

const design = emptyDesign();
const render = (node: LayoutNode) => {
  const layout: Layout = {
    schemaVersion: 4,
    root: { id: "root0001", type: "container", props: {}, children: [node] },
  };
  const host = document.createElement("div");
  host.innerHTML = renderPage(layout, design).html;
  const el = host.querySelector(".emvb-root > *");
  if (!el) throw new Error("nothing rendered");
  return el;
};
const attrs = (el: Element | null | undefined) =>
  Object.fromEntries([...(el?.attributes ?? [])].map((a) => [a.name, a.value]));
const svgNode = (props: Record<string, unknown>) =>
  ({ ...defaultElement("svg", "svg00001"), props }) as LayoutNode;
const iconNode = (props: Record<string, unknown>) =>
  ({ ...defaultElement("icon", "icon0001"), props }) as LayoutNode;
const imageNode = (props: Record<string, unknown>) =>
  ({ ...defaultElement("image", "img00001"), props }) as LayoutNode;

describe("SVG element (W-091)", () => {
  test("a decorative SVG is hidden, 48 px by default, and filled with currentColor", () => {
    const el = render(
      svgNode({ markup: '<svg viewBox="0 0 1 1"><path d="M0 0"/></svg>', decorative: true }),
    );
    expect(attrs(el.querySelector("svg"))).toEqual({
      viewBox: "0 0 1 1",
      xmlns: "http://www.w3.org/2000/svg",
      width: "48",
      height: "48",
      focusable: "false",
      fill: "currentColor",
      "aria-hidden": "true",
    });
  });

  test("a titled SVG is an img with its label, its own size, xmlns and colours", () => {
    const el = render(
      svgNode({
        markup: '<svg xmlns="http://www.w3.org/2000/svg" stroke="red"><path d="M0 0"/></svg>',
        title: "Logo",
        size: 32,
      }),
    );
    expect(attrs(el.querySelector("svg"))).toEqual({
      xmlns: "http://www.w3.org/2000/svg",
      stroke: "red",
      width: "32",
      height: "32",
      focusable: "false",
      role: "img",
      "aria-label": "Logo",
    });
    expect(el.querySelector("svg path")?.getAttribute("d")).toBe("M0 0");
  });

  test("an untitled, non-decorative SVG is an img without a label, keeping its fill", () => {
    const el = render(svgNode({ markup: '<svg fill="blue"><path d="M0 0"/></svg>' }));
    const svg = el.querySelector("svg");
    expect([
      svg?.getAttribute("role"),
      svg?.hasAttribute("aria-label"),
      svg?.getAttribute("fill"),
    ]).toEqual(["img", false, "blue"]);
  });

  test("unsafe markup renders an empty hidden placeholder", () => {
    const el = render(svgNode({ markup: "<svg><script>x</script></svg>" }));
    expect(el.outerHTML).toBe('<span class="emvb-svg emvb-svg-missing" aria-hidden="true"></span>');
  });
});

describe("icon element (W-091)", () => {
  test("an icon is 24 px by default, an img labelled by its title", () => {
    const svg = render(iconNode({ iconId: "star", title: "Star" })).querySelector("svg");
    expect([svg?.getAttribute("width"), svg?.getAttribute("height")]).toEqual(["24", "24"]);
    expect([svg?.getAttribute("role"), svg?.getAttribute("aria-label")]).toEqual(["img", "Star"]);
    expect(svg?.hasAttribute("aria-hidden")).toBe(false);
    expect(svg?.children.length).toBeGreaterThan(0);
    expect(svg?.firstElementChild?.attributes.length).toBeGreaterThan(0);
  });

  test("a decorative icon at 16 px is hidden and has no role", () => {
    const svg = render(iconNode({ iconId: "star", decorative: true, size: 16 })).querySelector(
      "svg",
    );
    expect([
      svg?.getAttribute("width"),
      svg?.getAttribute("aria-hidden"),
      svg?.hasAttribute("role"),
    ]).toEqual(["16", "true", false]);
  });

  test("an unknown icon renders an empty hidden placeholder", () => {
    expect(render(iconNode({ iconId: "no-such-icon", title: "X" })).outerHTML).toBe(
      '<span class="emvb-icon emvb-icon-missing" aria-hidden="true"></span>',
    );
  });
});

describe("image and video fallbacks (W-091)", () => {
  test("a decorative image has empty alt and role presentation; sizes only when set", () => {
    const deco = render(imageNode({ src: "/a.png", alt: "Ignored", decorative: true }));
    expect(attrs(deco)).toEqual({
      class: "emvb-image",
      src: "/a.png",
      alt: "",
      loading: "lazy",
      decoding: "async",
      role: "presentation",
    });
    const sized = render(imageNode({ src: "/a.png", alt: "A", width: 640, height: 480 }));
    expect(attrs(sized)).toEqual({
      class: "emvb-image",
      src: "/a.png",
      alt: "A",
      loading: "lazy",
      decoding: "async",
      width: "640",
      height: "480",
    });
  });

  test("an image or video without a usable source renders an empty placeholder", () => {
    expect(render(imageNode({ src: "javascript:x", alt: "A" })).outerHTML).toBe(
      '<span class="emvb-image emvb-image-missing"></span>',
    );
    const video = {
      ...defaultElement("video", "vid00001"),
      props: { url: "ftp://x/y" },
    } as LayoutNode;
    expect(render(video).outerHTML).toBe(
      '<span class="emvb-video emvb-video-missing" aria-hidden="true"></span>',
    );
  });
});

describe("dynamic element defaults (W-091)", () => {
  test("a new Post Title is an h1 and a new Post Image isn't decorative", () => {
    expect(defaultElement("post-title", "ptit0001").props).toEqual({ level: 1 });
    expect(defaultElement("post-image", "pimg0001").props).toEqual({ decorative: false });
  });
});
