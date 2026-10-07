import { describe, expect, test } from "bun:test";
import { serialize } from "../render/vnode.ts";
import { isSafeSvgMarkup, sanitizeSvgMarkup } from "./svg.ts";

describe("sanitizeSvgMarkup (W-073 / W-079)", () => {
  test("accepts a simple path/circle SVG", () => {
    const markup =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/></svg>';
    const tree = sanitizeSvgMarkup(markup);
    expect(tree?.tag).toBe("svg");
    expect(tree).toBeTruthy();
    if (!tree) throw new Error("expected tree");
    expect(serialize(tree)).toContain("<circle");
    expect(serialize(tree)).toContain('d="M8 12h8"');
  });

  test("rejects script, handlers, foreignObject, style, and anchors", () => {
    const bad = [
      "<svg><script>alert(1)</script></svg>",
      '<svg><circle onclick="alert(1)" cx="1" cy="1" r="1"/></svg>',
      "<svg><foreignObject></foreignObject></svg>",
      '<svg><a href="https://x.test">x</a></svg>',
      '<svg><style>.x{fill:red}</style><circle cx="1" cy="1" r="1"/></svg>',
      '<svg><circle style="fill:red" cx="1" cy="1" r="1"/></svg>',
      '<svg><use href="https://evil.test/x.svg#icon"/></svg>',
      '<svg><image href="javascript:alert(1)"/></svg>',
      '<svg><image href="data:image/svg+xml;base64,PHN2Zy8+"/></svg>',
    ];
    for (const markup of bad) {
      expect(sanitizeSvgMarkup(markup)).toBeUndefined();
      expect(isSafeSvgMarkup(markup)).toBe(false);
    }
  });

  test("allows fragment use, safe image, and gradients", () => {
    const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <defs>
        <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="currentColor"/>
          <stop offset="100%" stop-color="transparent"/>
        </linearGradient>
        <symbol id="dot"><circle cx="2" cy="2" r="2" fill="url(#g1)"/></symbol>
      </defs>
      <use href="#dot" x="4" y="4"/>
      <image href="/media/icon.png" x="0" y="0" width="12" height="12"/>
      <text x="0" y="20" font-size="8">Hi</text>
    </svg>`;
    const tree = sanitizeSvgMarkup(markup);
    expect(tree).toBeTruthy();
    if (!tree) throw new Error("expected tree");
    const html = serialize(tree);
    expect(html).toContain("<use");
    expect(html).toContain('href="#dot"');
    expect(html).toContain("<image");
    expect(html).toContain('href="/media/icon.png"');
    expect(html).toContain("<lineargradient");
    expect(html).toContain("<text");
  });

  describe("transform attributes hold only well-formed transform functions (QA-4)", () => {
    const withTransform = (value: string) =>
      sanitizeSvgMarkup(
        `<svg><g transform="${value}"/><pattern patternTransform="${value}"/></svg>`,
      );
    test.each([
      "translate(1, 2) rotate(45)",
      "matrix(1 0 0 1 10 10)",
      "matrix(1,0,0,1,-2.5,.5)",
      "scale(2)",
      "scale(1 -1)",
      "rotate(45 5 5)",
      "skewX(-1.5e1)",
      "translate(10),skewY(3)",
    ])("keeps %p", (value) => {
      expect(withTransform(value)?.children).toHaveLength(2);
    });
    test.each([
      "expression(x)",
      "scale()",
      "rotate(a)",
      "translate(1,2",
      "rotate(1 2)",
      "matrix(1 0 0 1)",
      "scale(1 2 3)",
      "skewx(1)",
      "scale(1)x",
      "scale(1,)",
      "",
    ])("refuses %p", (value) => {
      expect(withTransform(value)).toBeUndefined();
    });
  });

  test("strips unknown attributes but keeps allowlisted ones", () => {
    const tree = sanitizeSvgMarkup(
      '<svg viewBox="0 0 10 10" class="evil" data-x="1"><rect x="0" y="0" width="10" height="10" fill="currentColor"/></svg>',
    );
    expect(tree?.attrs.viewBox).toBe("0 0 10 10");
    expect(tree?.attrs.class).toBeUndefined();
    expect(tree?.children[0]).toMatchObject({ tag: "rect" });
  });

  test("entities in text and attributes are decoded once, then escaped once (W-186)", () => {
    const tree = sanitizeSvgMarkup(
      '<svg viewBox="0 0 10 10"><text font-family="A &amp; B">Tom &amp; Jerry &lt;3 &#169; &#x2014; &bogus;</text></svg>',
    );
    if (!tree) throw new Error("expected tree");
    const text = tree.children[0];
    if (!text || typeof text === "string") throw new Error("expected text element");
    expect(text.attrs["font-family"]).toBe("A & B");
    expect(text.children[0]).toBe("Tom & Jerry <3 \u00a9 \u2014 &bogus;");
    const html = serialize(tree);
    expect(html).toContain("Tom &amp; Jerry &lt;3");
    expect(html).not.toContain("&amp;amp;");
    expect(html).not.toContain("&amp;lt;");
  });

  test("a decoded entity cannot sneak a javascript: or markup into an attribute (W-186)", () => {
    expect(
      isSafeSvgMarkup('<svg><image href="&#106;avascript:alert(1)" width="1" height="1"/></svg>'),
    ).toBe(false);
    expect(isSafeSvgMarkup('<svg><rect fill="&#x3c;x&#x3e;"/></svg>')).toBe(false);
  });
});
