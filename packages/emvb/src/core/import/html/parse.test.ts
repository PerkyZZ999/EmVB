import { describe, expect, test } from "bun:test";
import { decodeHtml, type HtmlNode, MAX_PARSE_DEPTH, MAX_PARSE_NODES, parseHtml } from "./parse.ts";

/** The tree as compact text: `tag[child child]`, `"text"`, `wp:name{attrs}[...]`. */
function show(list: readonly HtmlNode[]): string {
  return list
    .map((n) => {
      if (n.kind === "text") return JSON.stringify(n.text);
      const head =
        n.kind === "element"
          ? n.tag
          : `wp:${n.name}${Object.keys(n.attrs).length > 0 ? JSON.stringify(n.attrs) : ""}`;
      return n.children.length > 0 ? `${head}[${show(n.children)}]` : head;
    })
    .join(" ");
}

describe("W-1074: the HTML reader", () => {
  test("WordPress block comments become blocks with their JSON attributes", () => {
    const parsed = parseHtml(
      '<!-- wp:group {"layout":{"type":"flex"}} --><div><!-- wp:paragraph --><p>Hi</p><!-- /wp:paragraph --><!-- wp:separator /--></div><!-- /wp:group -->',
    );
    expect(parsed.blocks).toBe(true);
    expect(show(parsed.nodes)).toBe(
      'wp:core/group{"layout":{"type":"flex"}}[div[wp:core/paragraph[p["Hi"]] wp:core/separator]]',
    );
  });

  test("plugin blocks keep their namespace; unreadable attributes are ignored", () => {
    const parsed = parseHtml('<!-- wp:acme/box {"a":} --><p>x</p><!-- /wp:acme/box -->');
    expect(show(parsed.nodes)).toBe('wp:acme/box[p["x"]]');
  });

  test("a block's end closes the HTML left open inside it", () => {
    const parsed = parseHtml("<!-- wp:paragraph --><p><b>bold<!-- /wp:paragraph --><p>after</p>");
    expect(show(parsed.nodes)).toBe('wp:core/paragraph[p[b["bold"]]] p["after"]');
  });

  test("implied ends: paragraphs, list items, cells and headings", () => {
    const parsed = parseHtml(
      "<p>one<p>two<div>box</div><ul><li>a<li>b</ul><table><tr><td>1<td>2<tr><td>3</table><h2>x<h3>y",
    );
    expect(show(parsed.nodes)).toBe(
      'p["one"] p["two"] div["box"] ul[li["a"] li["b"]] table[tr[td["1"] td["2"]] tr[td["3"]]] h2["x"] h3["y"]',
    );
  });

  test("void elements, stray end tags and a slash on a non-void element", () => {
    const parsed = parseHtml('<p>a<br>b</span></p></p><img src="x.png"><a href=/about/>About</a>');
    expect(show(parsed.nodes)).toBe('p["a" br "b"] img a["About"]');
  });

  test("scripts, styles, SVG and the title are not markup; the title is kept", () => {
    const parsed = parseHtml(
      "<title>My &amp; page</title><script>if (a < b) document.write('<p>x</p>')</script><style>p{}</style><svg><script>alert(1)</script></svg><p>ok</p>",
    );
    expect(parsed.title).toBe("My & page");
    expect(show(parsed.nodes)).toBe('p["ok"]');
    expect(parsed.dropped.toSorted()).toEqual(["inline SVG drawings", "scripts", "styles"]);
  });

  test("an iframe keeps its attributes but never its content", () => {
    const parsed = parseHtml('<iframe src="https://x.example" srcdoc="<b>"><p>inside</p></iframe>');
    expect(show(parsed.nodes)).toBe("iframe");
    const frame = parsed.nodes[0];
    expect(frame?.kind === "element" ? frame.attrs["srcdoc"] : undefined).toBe("<b>");
  });

  test("references decode as a browser reads them, so a hidden scheme shows", () => {
    expect(decodeHtml("&#106avascript&colon;alert(1)")).toBe("javascript:alert(1)");
    expect(decodeHtml("java&#x09;script&#58;x")).toBe("java\tscript:x");
    expect(decodeHtml("a &amp; b &unknown; &lt;")).toBe("a & b &unknown; <");
    const parsed = parseHtml('<a href="&#x6A;avascript&#x3A;alert(1)">x</a>');
    const link = parsed.nodes[0];
    expect(link?.kind === "element" ? link.attrs["href"] : undefined).toBe("javascript:alert(1)");
  });

  test("a tag that never ends is dropped, like a browser does", () => {
    expect(show(parseHtml('<p>ok</p><a href="x').nodes)).toBe('p["ok"]');
  });

  test("nesting deeper than the reader keeps is flattened, not crashed on", () => {
    const deep = `${"<div>".repeat(5000)}deep${"</div>".repeat(5000)}`;
    const parsed = parseHtml(deep);
    expect(parsed.flattened).toBe(true);
    let depth = 0;
    let node = parsed.nodes[0];
    while (node && node.kind !== "text") {
      depth++;
      node = node.children.find((c) => c.kind === "text") ?? node.children.at(-1);
    }
    expect(depth).toBeLessThanOrEqual(MAX_PARSE_DEPTH);
    expect(node?.kind === "text" ? node.text : "").toBe("deep");
  });

  test("more nodes than the reader keeps: the rest is cut and said so", () => {
    const parsed = parseHtml("<p>x</p>".repeat(MAX_PARSE_NODES));
    expect(parsed.cut).toBe(true);
  });

  test("many unterminated tags read in linear time", () => {
    const started = performance.now();
    parseHtml(`${'<a "'.repeat(200_000)}`);
    parseHtml("<".repeat(1_000_000));
    expect(performance.now() - started).toBeLessThan(3000);
  });
});
