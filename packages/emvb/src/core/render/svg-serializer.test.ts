import { describe, expect, spyOn, test } from "bun:test";
import { emptyDesign, validateLayout, type Layout } from "../index.ts";
import * as svgSanitizer from "../sanitize/svg.ts";
import { SVG_ATTRS, SVG_TAGS } from "../sanitize/svg.ts";
import { renderPage } from "./index.ts";
import { isAllowedAttr, isAllowedTag, serialize, type VNode } from "./vnode.ts";

const MASKED =
  '<svg viewBox="0 0 10 10"><defs><mask id="m"><rect width="10" height="10" fill="#fff"/></mask></defs><rect width="10" height="10" mask="url(#m)"/></svg>';

describe("SVG markup the sanitizer keeps also serializes (S-02)", () => {
  test("every tag and attribute the SVG sanitizer allows passes the serializer's allowlist", () => {
    expect([...SVG_TAGS].filter((tag) => !isAllowedTag(tag))).toEqual([]);
    expect([...SVG_ATTRS].filter((name) => !isAllowedAttr(name))).toEqual([]);
  });

  test("an SVG element with a mask renders, mask included", () => {
    const result = validateLayout({
      schemaVersion: 18,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          {
            id: "svg00001",
            type: "svg",
            props: { markup: MASKED, title: "x", decorative: false, size: 48 },
          },
        ],
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { html, warnings } = renderPage(result.layout, emptyDesign());
    expect(html).toContain('mask="url(#');
    expect(warnings.filter((w) => w.code === "refused-markup")).toEqual([]);
  });
});

describe("refused markup empties its element, not the page (S-02)", () => {
  const heading: VNode = { tag: "h2", attrs: {}, children: ["Kept"] };
  const broken: VNode = {
    tag: "span",
    attrs: {},
    children: [
      { tag: "svg", attrs: {}, children: [{ tag: "rect", attrs: { bad: "1" }, children: [] }] },
    ],
  };
  const page: VNode = { tag: "div", attrs: {}, children: [heading, broken] };
  const elements = new Set<VNode>([page, heading, broken]);

  test("without soft mode the serializer still throws", () => {
    expect(() => serialize(page)).toThrow('attribute "bad" is not allowed');
  });

  test("with soft mode only the element holding the refused name is left out", () => {
    const refused: string[] = [];
    const html = serialize(page, {
      isElement: (node) => elements.has(node),
      onRefused: (element, error) => refused.push(`${element.tag}: ${error.message}`),
    });
    expect(html).toBe("<div><h2>Kept</h2></div>");
    expect(refused).toEqual(['span: EmVB: attribute "bad" is not allowed']);
  });

  test("a refused name outside any element empties the whole tree, without throwing", () => {
    const refused: string[] = [];
    const html = serialize(
      { tag: "script", attrs: {}, children: [] },
      { isElement: () => false, onRefused: (element) => refused.push(element.tag) },
    );
    expect(html).toBe("");
    expect(refused).toEqual(["script"]);
  });
});

describe("a page with an element the serializer refuses (S-02)", () => {
  test("renders every other element and reports the refused one", () => {
    const spy = spyOn(svgSanitizer, "sanitizeSvgMarkup").mockImplementation(() => ({
      tag: "svg",
      attrs: { onload: "x" },
      children: [],
    }));
    try {
      const layout = {
        schemaVersion: 18,
        root: {
          id: "root0001",
          type: "container",
          props: {},
          children: [
            { id: "head0001", type: "heading", props: { text: "Still here", level: 2 } },
            {
              id: "svg00001",
              type: "svg",
              props: { markup: MASKED, title: "x", decorative: false, size: 48 },
            },
          ],
        },
      } as unknown as Layout;
      for (const mode of ["public", "editor"] as const) {
        const { html, warnings } = renderPage(layout, emptyDesign(), { mode });
        expect(html).toContain("Still here");
        expect(html).toContain("emvb-root");
        expect(html.includes("<svg")).toBe(false);
        expect(warnings.filter((w) => w.code === "refused-markup").map((w) => w.nodeId)).toEqual([
          "svg00001",
        ]);
      }
    } finally {
      spy.mockRestore();
    }
  });
});
