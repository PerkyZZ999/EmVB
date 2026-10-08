import { describe, expect, test } from "bun:test";

import { highlight } from "../../site/src/scripts/highlight.ts";

const stripTags = (html: string) => html.replace(/<[^>]+>/g, "");

describe("home page code highlighter (W-301)", () => {
  test("escapes source text so a sample can't inject markup", () => {
    const out = highlight('<a href="x" onclick="1">&</a>', "html");
    expect(out).not.toContain("<a ");
    expect(out).toContain("&lt;");
    expect(out).toContain("&quot;x&quot;");
    expect(out).toContain("&amp;");
    expect(highlight('{ "k": "<script>" }', "json")).not.toContain("<script>");
  });

  test("keeps the text as written, one .line span per line", () => {
    const code = '{\n  "type": "heading",\n  "level": 1\n}';
    const out = highlight(code, "json");
    expect(out.match(/<span class="line">/g)?.length).toBe(4);
    const decoded = stripTags(out).replace(/&quot;/g, '"');
    expect(decoded).toBe(code.replace(/\n/g, ""));
  });

  test("marks JSON keys, strings, numbers and punctuation", () => {
    const out = highlight('{ "level": 1, "type": "heading" }', "json");
    expect(out).toContain('<span class="tok-key">&quot;level&quot;</span>');
    expect(out).toContain('<span class="tok-number">1</span>');
    expect(out).toContain('<span class="tok-string">&quot;heading&quot;</span>');
    expect(out).toContain('<span class="tok-punct">{</span>');
  });

  test("marks HTML tags and attributes, and CSS selectors and properties", () => {
    const html = highlight('<h1 class="a">Hi</h1>', "html");
    expect(html).toContain('<span class="tok-tag">h1</span>');
    expect(html).toContain('<span class="tok-key">class</span>');
    expect(html).toContain('<span class="tok-string">&quot;a&quot;</span>');
    const css = highlight(".a{color:red}@media (max-width: 767px){}", "css");
    expect(css).toContain('<span class="tok-tag">.a</span>');
    expect(css).toContain('<span class="tok-key">color</span>');
    expect(css).toContain('<span class="tok-tag">@media</span>');
    expect(css).toContain('<span class="tok-number">767px</span>');
  });
});
