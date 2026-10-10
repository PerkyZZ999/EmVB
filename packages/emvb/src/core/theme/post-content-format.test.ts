import { describe, expect, test } from "bun:test";
import { serialize } from "../render/vnode.ts";
import { portableTextToVNodes } from "./dynamic.ts";

const html = (blocks: unknown[]) =>
  portableTextToVNodes(blocks)
    .map((n) => serialize(n))
    .join("");
const span = (text: string, marks: string[] = []) => ({ _type: "span", text, marks });
const block = (children: unknown[], extra: Record<string, unknown> = {}) => ({
  _type: "block",
  style: "normal",
  children,
  markDefs: [],
  ...extra,
});

describe("Post Content keeps safe formatting (W-328)", () => {
  test("bold, italic, code, underline and strike-through", () => {
    expect(
      html([
        block([
          span("A "),
          span("bold", ["strong"]),
          span(" and "),
          span("both", ["strong", "em"]),
          span(" "),
          span("x()", ["code"]),
          span("u", ["underline"]),
          span("s", ["strike-through"]),
        ]),
      ]),
    ).toBe(
      "<p>A <strong>bold</strong> and <strong><em>both</em></strong> <code>x()</code><u>u</u><s>s</s></p>",
    );
  });

  test("links keep a safe href; unsafe ones and unknown marks leave plain text", () => {
    const markDefs = [
      { _type: "link", _key: "ok", href: "https://example.com/a?b=1&c=2" },
      { _type: "link", _key: "rel", href: "/about" },
      { _type: "link", _key: "bad", href: "javascript:alert(1)" },
      { _type: "link", _key: "proto", href: "//evil.example" },
    ];
    expect(
      html([
        block(
          [
            span("site", ["ok"]),
            span(" "),
            span("about", ["rel", "strong"]),
            span(" "),
            span("x", ["bad"]),
            span(" "),
            span("y", ["proto"]),
            span(" "),
            span("z", ["unknownmark"]),
          ],
          { markDefs },
        ),
      ]),
    ).toBe(
      '<p><a href="https://example.com/a?b=1&amp;c=2">site</a> <a href="/about"><strong>about</strong></a> x y z</p>',
    );
  });

  test("headings h1–h6, block quotes and line breaks", () => {
    expect(
      html([
        block([span("Title")], { style: "h2" }),
        block([span("Small")], { style: "h6" }),
        block([span("Said")], { style: "blockquote" }),
        block([span("one\ntwo")]),
        block([span("odd")], { style: "weird" }),
      ]),
    ).toBe("<h2>Title</h2><h6>Small</h6><blockquote>Said</blockquote><p>one<br>two</p><p>odd</p>");
  });

  test("bulleted and numbered lists, nested by level", () => {
    const item = (text: string, listItem: string, level = 1) =>
      block([span(text)], { listItem, level });
    expect(
      html([
        item("a", "bullet"),
        item("a1", "number", 2),
        item("a2", "number", 2),
        item("b", "bullet"),
        block([span("after")]),
        item("n", "number"),
      ]),
    ).toBe(
      "<ul><li>a<ol><li>a1</li><li>a2</li></ol></li><li>b</li></ul><p>after</p><ol><li>n</li></ol>",
    );
  });

  test("no raw HTML: text is escaped, and custom blocks, images and embeds are left out", () => {
    expect(
      html([
        block([span('<iframe src="x"></iframe><script>alert(1)</script>')]),
        { _type: "image", asset: { url: "https://x/y.png" } },
        { _type: "embed", html: "<iframe src=//evil></iframe>" },
        { _type: "htmlBlock", html: "<b>raw</b>" },
        block([{ _type: "inlineHtml", text: "<b>x</b>", html: "<b>x</b>" }, span("kept")]),
      ]),
    ).toBe(
      '<p>&lt;iframe src="x"&gt;&lt;/iframe&gt;&lt;script&gt;alert(1)&lt;/script&gt;</p><p>kept</p>',
    );
  });
});
