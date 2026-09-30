import { describe, expect, test } from "bun:test";
import { emptyDesign, renderPage, validateLayout, defaultElement } from "../index.ts";
import {
  collectLoopItemPartIds,
  portableTextToVNodes,
  SAMPLE_POST,
  type ThemePostFields,
} from "./dynamic.ts";
import type { Layout } from "../schema/layout.ts";

const design = emptyDesign();

const page = (...children: Layout["root"]["children"]): Layout => ({
  schemaVersion: 3,
  root: { id: "root0001", type: "container", props: {}, children },
});

describe("portableTextToVNodes", () => {
  test("plain string becomes a paragraph", () => {
    expect(portableTextToVNodes("Hello")).toEqual([{ tag: "p", attrs: {}, children: ["Hello"] }]);
  });

  test("portable text blocks become escaped structure tags", () => {
    const blocks = [
      {
        _type: "block",
        style: "normal",
        children: [{ _type: "span", text: "Hello <world>" }],
      },
      {
        _type: "block",
        style: "h2",
        children: [{ _type: "span", text: "Next" }],
      },
    ];
    expect(portableTextToVNodes(blocks)).toEqual([
      { tag: "p", attrs: {}, children: ["Hello <world>"] },
      { tag: "h2", attrs: {}, children: ["Next"] },
    ]);
  });
});

describe("dynamic post elements", () => {
  const post: ThemePostFields = {
    id: "01POST",
    slug: "welcome",
    title: "Welcome <b>",
    excerpt: "Short & sweet",
    content: [
      {
        _type: "block",
        style: "normal",
        children: [{ _type: "span", text: "Body <script>" }],
      },
    ],
    featuredImageUrl: "https://example.com/hero.jpg",
    featuredImageAlt: "Hero",
    permalink: "/posts/welcome",
  };

  test("public render substitutes title, excerpt, content, image, link", () => {
    const layout = page(
      { id: "ptitle01", type: "post-title", props: { level: 1 } },
      { id: "pexcrp01", type: "post-excerpt", props: {} },
      { id: "pconte01", type: "post-content", props: {} },
      { id: "pimage01", type: "post-image", props: {} },
      { id: "plink001", type: "post-link", props: {} },
    );
    const validated = validateLayout(layout);
    expect(validated.ok).toBe(true);
    const { html } = renderPage(validated.ok ? validated.layout : layout, design, {
      dynamic: { post },
    });
    expect(html).toContain("<h1");
    expect(html).toContain("Welcome &lt;b&gt;");
    expect(html).toContain("Short &amp; sweet");
    expect(html).toContain("Body &lt;script&gt;");
    expect(html).toContain('src="https://example.com/hero.jpg"');
    expect(html).toContain('href="/posts/welcome"');
    expect(html).not.toContain("<script>");
  });

  test("public omits dynamic leaves without post data", () => {
    const layout = page({ id: "ptitle02", type: "post-title", props: { level: 2 } });
    const { html } = renderPage(layout, design);
    expect(html).not.toContain("Post Title");
    expect(html).not.toContain("emvb-post-title");
  });

  test("editor shows sample placeholders without post data", () => {
    const layout = page({ id: "ptitle03", type: "post-title", props: { level: 2 } });
    const { html } = renderPage(layout, design, { mode: "editor" });
    expect(html).toContain(SAMPLE_POST.title);
  });
});

describe("loop element", () => {
  test("repeats inline children for each post", () => {
    const layout = page({
      id: "loop0001",
      type: "loop",
      props: {},
      children: [
        { id: "ptitle04", type: "post-title", props: { level: 2 } },
        { id: "plink002", type: "post-link", props: { text: "Read" } },
      ],
    });
    const posts: ThemePostFields[] = [
      { ...SAMPLE_POST, id: "a", slug: "a", title: "Alpha", permalink: "/posts/a" },
      { ...SAMPLE_POST, id: "b", slug: "b", title: "Beta", permalink: "/posts/b" },
    ];
    const { html } = renderPage(layout, design, { dynamic: { posts } });
    expect(html).toContain("Alpha");
    expect(html).toContain("Beta");
    expect(html).toContain('data-emvb-loop-item="a"');
    expect(html).toContain('href="/posts/b"');
    expect(html).toContain("Read");
  });

  test("uses loopTemplates when itemPartId is set", () => {
    const itemLayout: Layout = {
      schemaVersion: 3,
      root: {
        id: "rootitem",
        type: "container",
        props: {},
        children: [{ id: "ptitle05", type: "post-title", props: { level: 3 } }],
      },
    };
    const layout = page({
      id: "loop0002",
      type: "loop",
      props: { itemPartId: "item-1" },
      children: [],
    });
    const { html } = renderPage(layout, design, {
      dynamic: {
        posts: [{ ...SAMPLE_POST, id: "c", title: "From Item", permalink: "/posts/c" }],
        loopTemplates: { "item-1": itemLayout },
      },
    });
    expect(html).toContain("<h3");
    expect(html).toContain("From Item");
  });

  test("collectLoopItemPartIds walks nested loops", () => {
    const layout = page({
      id: "loop0003",
      type: "loop",
      props: { itemPartId: "  abc  " },
      children: [defaultElement("heading", "head0001")],
    });
    expect(collectLoopItemPartIds(layout)).toEqual(["abc"]);
  });
});

test("portableTextToVNodes over styles, block types and span shapes matches the snapshot (W-086 L9)", () => {
  const styles = [
    undefined,
    "normal",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "H1",
    "blockquote",
    2,
    null,
  ];
  const spans = [
    [{ _type: "span", text: "One" }],
    [
      { _type: "span", text: "  Two " },
      { _type: "span", text: "& <three>" },
    ],
    [{ text: "" }, { text: "   " }],
    [null, 3, "x", { text: 4 }, { text: "kept" }, ["nested"]],
    "not-an-array",
    [],
  ];
  const types = ["block", "image", undefined];
  const blocks: unknown[] = [];
  for (const style of styles)
    for (const children of spans)
      for (const type of types) blocks.push({ _type: type, style, children });
  blocks.push(null, 7, "loose", [], { _type: "block" });
  const inputs: unknown[] = [blocks, "", "  plain  ", 42, null, { _type: "block" }, [], undefined];
  expect(inputs.map((input) => portableTextToVNodes(input))).toMatchSnapshot();
});
