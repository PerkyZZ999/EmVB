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

  test("strips unknown attributes but keeps allowlisted ones", () => {
    const tree = sanitizeSvgMarkup(
      '<svg viewBox="0 0 10 10" class="evil" data-x="1"><rect x="0" y="0" width="10" height="10" fill="currentColor"/></svg>',
    );
    expect(tree?.attrs.viewBox).toBe("0 0 10 10");
    expect(tree?.attrs.class).toBeUndefined();
    expect(tree?.children[0]).toMatchObject({ tag: "rect" });
  });
});
