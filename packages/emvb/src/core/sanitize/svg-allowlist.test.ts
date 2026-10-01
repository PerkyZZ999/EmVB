import { describe, expect, test } from "bun:test";
import type { VNode } from "../render/vnode.ts";
import { isSafeSvgMarkup, sanitizeSvgMarkup } from "./svg.ts";

// W-091: Stryker left svg.ts at 73%: most allowlisted tags and attributes, the pre-parse
// reject, the entity decoding, the href and url() anchors, comments, nesting and the size cap
// were unchecked. The lists are written out here on purpose.

const first = (markup: string): VNode | undefined => {
  const child = sanitizeSvgMarkup(markup)?.children[0];
  return typeof child === "object" ? child : undefined;
};

const TAGS = [
  "g",
  "path",
  "circle",
  "ellipse",
  "rect",
  "line",
  "polyline",
  "polygon",
  "title",
  "desc",
  "defs",
  "symbol",
  "use",
  "image",
  "lineargradient",
  "radialgradient",
  "stop",
  "clippath",
  "mask",
  "pattern",
  "marker",
  "text",
  "tspan",
];

const ATTRS = [
  "viewBox",
  "xmlns",
  "fill",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-dasharray",
  "stroke-opacity",
  "fill-opacity",
  "opacity",
  "d",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "width",
  "height",
  "points",
  "role",
  "aria-hidden",
  "aria-label",
  "focusable",
  "id",
  "preserveAspectRatio",
  "gradientUnits",
  "offset",
  "stop-color",
  "stop-opacity",
  "clipPathUnits",
  "maskUnits",
  "maskContentUnits",
  "patternUnits",
  "patternContentUnits",
  "markerUnits",
  "markerWidth",
  "markerHeight",
  "refX",
  "refY",
  "orient",
  "font-size",
  "font-family",
  "font-weight",
  "text-anchor",
  "dominant-baseline",
  "dx",
  "dy",
];

describe("SVG allowlists (W-091)", () => {
  test.each(TAGS)("<%s> is kept", (tag) => {
    expect(first(`<svg><${tag}/></svg>`)?.tag).toBe(tag);
  });

  test.each(ATTRS)("%s is kept", (name) => {
    expect(first(`<svg><path ${name}="1"/></svg>`)?.attrs).toEqual({ [name]: "1" });
  });

  test("transforms, fragment hrefs and url(#id) references are kept", () => {
    expect(
      first('<svg><g transform="scale(2)" clip-path="url(#c)" mask="none"/></svg>')?.attrs,
    ).toEqual({ transform: "scale(2)", "clip-path": "url(#c)", mask: "none" });
    expect(first('<svg><use href="#a" xlink:href="#b"/></svg>')?.attrs).toEqual({
      href: "#a",
      "xlink:href": "#b",
    });
    expect(first('<svg><pattern patternTransform="rotate(45)"/></svg>')?.attrs).toEqual({
      patternTransform: "rotate(45)",
    });
    expect(
      first('<svg><lineargradient gradientTransform="translate(1  2)"/></svg>')?.attrs,
    ).toEqual({ gradientTransform: "translate(1  2)" });
  });

  test("attributes may have spaces around =", () => {
    expect(first('<svg><path d = "M0 0" fill= "red"/></svg>')?.attrs).toEqual({
      d: "M0 0",
      fill: "red",
    });
  });

  test("entities are decoded, and a decoded < or > rejects the SVG", () => {
    expect(
      first('<svg><path aria-label="say &quot;hi&quot; &amp; it&#39;s"/></svg>')?.attrs,
    ).toEqual({ "aria-label": `say "hi" & it's` });
    expect(sanitizeSvgMarkup('<svg><path aria-label="&lt;b"/></svg>')).toBeUndefined();
    expect(sanitizeSvgMarkup('<svg><path aria-label="b&gt;"/></svg>')).toBeUndefined();
  });
});

describe("SVG rejects (W-091)", () => {
  test.each([
    ["data: in text", "<svg><title>data: uri</title></svg>"],
    ["javascript: in text", "<svg><desc>javascript: x</desc></svg>"],
    ["a handler-like text", "<svg><title>onclick  = 1</title></svg>"],
    ["a style attribute with spaces", '<svg><path style = "fill:red"/></svg>'],
    ["a remote xlink:href on use", '<svg><use xlink:href="https://x.test/s.svg#a"/></svg>'],
    ["a remote url() mask", '<svg><g mask="url(https://x.test/m)"/></svg>'],
    ["an href with a space", '<svg><use href="#a b"/></svg>'],
    ["a clip-path with a prefix", '<svg><g clip-path="xurl(#c)"/></svg>'],
    ["a clip-path with a suffix", '<svg><g clip-path="url(#c) url(#d)"/></svg>'],
    ["a trailing comma in a transform", '<svg><g transform="translate(1),"/></svg>'],
    ["mismatched nesting", "<svg><g></svg>"],
    ["a non-svg root", "<g><svg></svg></g>"],
    ["an unclosed comment", "<svg><!-- open </svg>"],
    ["an unclosed tag", '<svg viewBox="0 0 1 1"'],
  ])("%s", (_name, markup) => {
    expect(sanitizeSvgMarkup(markup)).toBeUndefined();
    expect(isSafeSvgMarkup(markup)).toBe(false);
  });

  test("a value that isn't a string is refused", () => {
    expect(sanitizeSvgMarkup(5 as unknown as string)).toBeUndefined();
  });
});

describe("SVG structure (W-091)", () => {
  test("comments are dropped and parsing carries on after them", () => {
    expect(sanitizeSvgMarkup("<svg><!-- a --><g/><!-- b --></svg>")?.children).toEqual([
      { tag: "g", attrs: {}, children: [] },
    ]);
  });

  test("whitespace-only text is dropped even inside text elements", () => {
    const text = first("<svg><text>  <tspan>a</tspan></text></svg>");
    expect(text?.children).toEqual([{ tag: "tspan", attrs: {}, children: ["a"] }]);
  });

  test("a valid SVG is safe to store", () => {
    expect(isSafeSvgMarkup('<svg viewBox="0 0 1 1"><path d="M0 0"/></svg>')).toBe(true);
  });

  test("markup is trimmed before the 32 768-character cap, which is inclusive", () => {
    const sized = (length: number) => {
      const shell = "<svg><title></title></svg>";
      return `<svg><title>${"a".repeat(length - shell.length)}</title></svg>`;
    };
    expect(sized(32_768)).toHaveLength(32_768);
    expect(isSafeSvgMarkup(sized(32_768))).toBe(true);
    expect(isSafeSvgMarkup(sized(32_769))).toBe(false);
    expect(isSafeSvgMarkup(`   ${sized(32_768)}\n\n`)).toBe(true);
  });
});
