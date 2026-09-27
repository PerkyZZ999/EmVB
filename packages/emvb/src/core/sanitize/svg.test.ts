import { describe, expect, test } from "bun:test";
import { serialize } from "../render/vnode.ts";
import { isSafeSvgMarkup, sanitizeSvgMarkup } from "./svg.ts";

describe("sanitizeSvgMarkup (W-073)", () => {
  test("accepts a simple path/circle SVG", () => {
    const markup =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/></svg>';
    const tree = sanitizeSvgMarkup(markup);
    expect(tree?.tag).toBe("svg");
    expect(serialize(tree!)).toContain("<circle");
    expect(serialize(tree!)).toContain('d="M8 12h8"');
  });

  test("rejects script, handlers, use, and foreignObject", () => {
    const bad = [
      "<svg><script>alert(1)</script></svg>",
      '<svg><circle onclick="alert(1)" cx="1" cy="1" r="1"/></svg>',
      '<svg><use href="#x"/></svg>',
      "<svg><foreignObject></foreignObject></svg>",
      '<svg><a href="https://x.test">x</a></svg>',
      '<svg><image href="https://x.test/x.png"/></svg>',
    ];
    for (const markup of bad) {
      expect(sanitizeSvgMarkup(markup)).toBeUndefined();
      expect(isSafeSvgMarkup(markup)).toBe(false);
    }
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
