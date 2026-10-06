import { describe, expect, test } from "bun:test";
import { emptyDesign, renderPage, serialize, type Layout, type LayoutNode } from "../index.ts";
import { XSS_CORPUS } from "../../../test/fixtures/xss.ts";
import { defaultElement, ELEMENTS } from "./index.ts";

const design = emptyDesign();
const parse = (html: string) => {
  document.body.innerHTML = html;
  return document;
};

const page = (child: LayoutNode): Layout => ({
  schemaVersion: 12,
  root: { id: "root0001", type: "container", props: {}, children: [child] },
});

describe("element renderers (W-016, R-011)", () => {
  test("heading default and maximal", () => {
    const def = defaultElement("heading", "head0001");
    expect(renderPage(page(def), design).html).toContain("<h2");
    const max = {
      ...def,
      props: { text: "Title", level: 1 as const },
      htmlId: "hero",
      style: { color: "#112233" },
    };
    const { html, css } = renderPage(page(max), design);
    expect(html).toBe(
      '<div class="emvb-root emvb-container"><h1 class="emvb-heading emvb-e-head0001" id="hero">Title</h1></div>',
    );
    expect(css).toContain(".emvb-e-head0001{color:#112233}");
    expect(html.match(/</g)?.length).toBe(html.match(/>/g)?.length);
  });

  test("spacer is a single aria-hidden div with height in CSS", () => {
    const node = defaultElement("spacer", "spac0001");
    const { html, css } = renderPage(page(node), design);
    const el = parse(html).querySelector(".emvb-spacer");
    expect(el?.tagName).toBe("DIV");
    expect(el?.getAttribute("aria-hidden")).toBe("true");
    expect(el?.children.length).toBe(0);
    expect(css).toContain(".emvb-e-spac0001{height:24px}");
  });

  test("divider is a single hr", () => {
    const { html } = renderPage(page(defaultElement("divider", "divd0001")), design);
    expect(html).toContain('<hr class="emvb-divider">');
    expect(html).not.toContain("</hr>");
  });

  test("text default p and advanced div", () => {
    expect(renderPage(page(defaultElement("text", "text0001")), design).html).toContain(
      "<p class=",
    );
    const div = {
      ...defaultElement("text", "text0002"),
      props: { text: "Hi", tag: "div" as const },
    };
    expect(renderPage(page(div), design).html).toContain('<div class="emvb-text">Hi</div>');
  });

  test("label is a span", () => {
    const { html } = renderPage(page(defaultElement("label", "labl0001")), design);
    expect(html).toContain('<span class="emvb-label">Label</span>');
  });

  test("link is an anchor; new tab adds rel", () => {
    const node = {
      ...defaultElement("link", "link0001"),
      props: { text: "Go", href: "https://example.com", newTab: true },
    };
    const { html } = renderPage(page(node), design);
    expect(html).toContain(
      '<a class="emvb-link" href="https://example.com" target="_blank" rel="noopener noreferrer">Go</a>',
    );
  });

  test("button without href is button; with href is anchor", () => {
    const plain = defaultElement("button", "btn00001");
    expect(renderPage(page(plain), design).html).toContain(
      '<button class="emvb-button" type="button">Button</button>',
    );
    const linked = {
      ...plain,
      props: { text: "Buy", href: "/buy", newTab: true },
    };
    expect(renderPage(page(linked), design).html).toContain(
      '<a class="emvb-button" href="/buy" target="_blank" rel="noopener noreferrer">Buy</a>',
    );
  });

  test("list is ul/ol with li items and no wrappers", () => {
    const ul = {
      ...defaultElement("list", "list0001"),
      props: { items: ["One", "Two"] },
    };
    const { html } = renderPage(page(ul), design);
    expect(html).toContain('<ul class="emvb-list"><li>One</li><li>Two</li></ul>');
    const ol = { ...ul, id: "list0002", props: { ordered: true, items: ["A"] } };
    expect(renderPage(page(ol), design).html).toContain("<ol class=");
  });

  test("container Advanced tag is allowlisted", () => {
    const section = {
      id: "root0001",
      type: "container" as const,
      props: { tag: "section" as const },
      children: [] as LayoutNode[],
    };
    expect(renderPage({ schemaVersion: 12, root: section }, design).html).toContain(
      '<section class="emvb-root emvb-container">',
    );
    // Defence in depth: a forged tag outside the allowlist falls back to div (never reaches serialize).
    const forged = {
      id: "root0001",
      type: "container" as const,
      props: { tag: "script" as "div" },
      children: [] as LayoutNode[],
    };
    const html = renderPage({ schemaVersion: 12, root: forged }, design).html;
    expect(html).toContain("<div class=");
    expect(html).not.toContain("<script");
  });

  test.each(["heading", "text", "label", "link", "button", "list"] as const)(
    "%s runs the XSS corpus through every text field",
    (type) => {
      for (const payload of XSS_CORPUS) {
        let node: LayoutNode;
        if (type === "list")
          node = { ...defaultElement("list", "x0000001"), props: { items: [payload] } };
        else if (type === "link")
          node = { ...defaultElement("link", "x0000001"), props: { text: payload, href: "/" } };
        else if (type === "button")
          node = { ...defaultElement("button", "x0000001"), props: { text: payload } };
        else if (type === "heading")
          node = { ...defaultElement("heading", "x0000001"), props: { text: payload, level: 2 } };
        else if (type === "text")
          node = { ...defaultElement("text", "x0000001"), props: { text: payload } };
        else node = { ...defaultElement("label", "x0000001"), props: { text: payload } };
        const html = renderPage(page(node), design).html;
        expect(html).not.toContain("<script>");
        expect(parse(html).querySelectorAll("script").length).toBe(0);
      }
    },
  );

  test.each([
    "javascript:alert(1)",
    "JAVASCRIPT:alert(1)",
    "data:text/html,x",
    '"><img src=x onerror=alert(1)>',
    "<script>alert(1)</script>",
  ])("link and button href refuse %p", (payload) => {
    const link = {
      ...defaultElement("link", "x0000001"),
      props: { text: "x", href: payload },
    };
    const html = renderPage(page(link), design).html;
    expect(html).not.toContain("javascript:");
    expect(html).toContain('href="#"');
  });

  test("every element has a descriptor with the same type key", () => {
    for (const type of Object.keys(ELEMENTS) as (keyof typeof ELEMENTS)[]) {
      const def = ELEMENTS[type];
      expect(def.descriptor.type).toBe(type);
      expect(def.descriptor.name.length).toBeGreaterThan(0);
      expect(def.defaults().type).toBe(type);
    }
  });

  test("canvas serialize equals public serialize for fixtures", () => {
    const fixtures: LayoutNode[] = [
      defaultElement("heading", "a0000001"),
      defaultElement("spacer", "a0000002"),
      defaultElement("divider", "a0000003"),
      defaultElement("text", "a0000004"),
      defaultElement("label", "a0000005"),
      defaultElement("link", "a0000006"),
      { ...defaultElement("button", "a0000007"), props: { text: "B", href: "/x" } },
      { ...defaultElement("list", "a0000008"), props: { ordered: true, items: ["1", "2"] } },
    ];
    for (const child of fixtures) {
      const publicHtml = renderPage(page(child), design).html;
      const editor = renderPage(page(child), design, { mode: "editor" });
      expect(serialize(editor.vnode).replace(/ data-emvb-id="[^"]*"/g, "")).toBe(publicHtml);
    }
  });
});

describe("image element (W-024, R-007, N-003)", () => {
  test("renders img with alt, dimensions, and lazy loading", () => {
    const node = {
      ...defaultElement("image", "img00001"),
      props: {
        src: "https://cdn.example/a.png",
        alt: "A photo",
        width: 640,
        height: 480,
      },
    };
    const { html } = renderPage(page(node), design);
    const el = parse(html).querySelector(".emvb-image");
    expect(el?.tagName).toBe("IMG");
    expect(el?.getAttribute("src")).toBe("https://cdn.example/a.png");
    expect(el?.getAttribute("alt")).toBe("A photo");
    expect(el?.getAttribute("width")).toBe("640");
    expect(el?.getAttribute("height")).toBe("480");
    expect(el?.getAttribute("loading")).toBe("lazy");
  });

  test("decorative images use empty alt and presentation role", () => {
    const node = {
      ...defaultElement("image", "img00002"),
      props: { src: "/uploads/x.jpg", alt: "should hide", decorative: true },
    };
    const { html } = renderPage(page(node), design);
    const el = parse(html).querySelector(".emvb-image");
    expect(el?.getAttribute("alt")).toBe("");
    expect(el?.getAttribute("role")).toBe("presentation");
  });

  test("unsafe src is not emitted as an img", () => {
    const node = {
      ...defaultElement("image", "img00003"),
      props: { src: "javascript:alert(1)", alt: "x" },
    };
    const { html } = renderPage(page(node), design);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("javascript:");
  });
});

describe("video element (W-026, R-013)", () => {
  test("YouTube URLs render privacy-enhanced iframes with title and lazy loading", () => {
    const node = {
      ...defaultElement("video", "vid00001"),
      props: {
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&autoplay=1",
        title: "Demo",
      },
    };
    const html = renderPage(page(node), design).html;
    expect(html).toContain("youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(html).not.toContain("autoplay");
    expect(html).toContain('title="Demo"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain("<iframe");
  });

  test("media-library files render as video controls without autoplay", () => {
    const node = {
      ...defaultElement("video", "vid00002"),
      props: { url: "/_emdash/api/media/file/01.mp4", title: "Clip" },
    };
    const html = renderPage(page(node), design).html;
    expect(html).toContain("<video");
    expect(html).toContain("controls");
    expect(html).not.toContain("autoplay");
    expect(html).toContain('preload="metadata"');
  });

  test("editor mode shows a static preview for YouTube instead of a live iframe", () => {
    const node = {
      ...defaultElement("video", "vid00004"),
      props: {
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        title: "Demo clip",
      },
    };
    const editor = renderPage(page(node), design, { mode: "editor" });
    expect(editor.html).toContain("data-emvb-video-preview");
    expect(editor.html).toContain("Demo clip — plays on the published page");
    expect(editor.html).not.toContain("<iframe");
    expect(editor.html).not.toContain("youtube-nocookie");

    const pub = renderPage(page(node), design);
    expect(pub.html).toContain("youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(pub.html).toContain("<iframe");
  });

  test("non-allowlisted URLs render a missing placeholder", () => {
    const bad = {
      ...defaultElement("video", "vid00003"),
      props: { url: "https://evil.example/watch?v=abc", title: "Nope" },
    };
    expect(renderPage(page(bad), design).html).toContain("emvb-video-missing");
  });
});

describe("div-block and flexbox (W-072)", () => {
  test("div-block emits display:block base and wraps children", () => {
    const node = defaultElement("div-block", "divb0001");
    node.children = [defaultElement("heading", "head0001")];
    const layout: Layout = {
      schemaVersion: 12,
      root: { ...defaultElement("container", "root0001"), children: [node] },
    };
    const { html, css } = renderPage(layout, design);
    expect(css).toContain(".emvb-div-block{display:block");
    expect(html).toContain("emvb-div-block");
    expect(html).toContain("emvb-heading");
  });

  test("flexbox defaults to row wrap with gap and keeps container column", () => {
    const node = defaultElement("flexbox", "flex0001");
    const layout: Layout = {
      schemaVersion: 12,
      root: { ...defaultElement("container", "root0001"), children: [node] },
    };
    const { css, html } = renderPage(layout, design);
    expect(css).toContain(".emvb-flexbox{display:flex;flex-direction:row");
    expect(css).toContain(".emvb-container{display:flex;flex-direction:column");
    expect(html).toContain("emvb-flexbox");
    expect(node.style?.flexDirection).toBe("row");
  });
});

describe("svg element (W-073)", () => {
  test("renders inline sanitized SVG", () => {
    const node = defaultElement("svg", "svg00001");
    const layout: Layout = {
      schemaVersion: 12,
      root: { ...defaultElement("container", "root0001"), children: [node] },
    };
    const { html } = renderPage(layout, design);
    expect(html).toContain("<svg");
    expect(html).toContain("viewBox");
    expect(html).not.toContain("<script");
  });

  test("unsafe markup becomes a missing placeholder", () => {
    const node = defaultElement("svg", "svg00002");
    node.props.markup = "<svg><script>alert(1)</script></svg>";
    const layout: Layout = {
      schemaVersion: 12,
      root: { ...defaultElement("container", "root0001"), children: [node] },
    };
    const { html } = renderPage(layout, design);
    expect(html).toContain("emvb-svg-missing");
    expect(html).not.toContain("<script");
  });
});

describe("tabs (W-074)", () => {
  test("renders CSS-only radios, labels, and panels", () => {
    const tabs = defaultElement("tabs", "tabs0001");
    tabs.children = [
      {
        id: "tabp0001",
        type: "tab-panel",
        props: { label: "One" },
        children: [defaultElement("heading", "head0001")],
      },
      {
        id: "tabp0002",
        type: "tab-panel",
        props: { label: "Two" },
        children: [defaultElement("text", "text0001")],
      },
    ];
    const layout: Layout = {
      schemaVersion: 12,
      root: { ...defaultElement("container", "root0001"), children: [tabs] },
    };
    const { html, css } = renderPage(layout, design);
    expect(html).toContain('type="radio"');
    expect(html).toContain('role="tablist"');
    expect(html).toContain('role="tabpanel"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain("One");
    expect(html).toContain("Two");
    expect(css).toContain(":has(> .emvb-tab-input:nth-of-type(1):checked)");
    expect(html).not.toContain("<script");
  });

  test("needsTabsRuntime when tabs are present", () => {
    const tabs = defaultElement("tabs", "tabs0001");
    tabs.children = [
      {
        id: "tabp0001",
        type: "tab-panel",
        props: { label: "One" },
        children: [defaultElement("heading", "head0001")],
      },
    ];
    const layout: Layout = {
      schemaVersion: 12,
      root: { ...defaultElement("container", "root0001"), children: [tabs] },
    };
    expect(renderPage(layout, design).needsTabsRuntime).toBe(true);
    expect(
      renderPage(
        {
          schemaVersion: 12,
          root: { ...defaultElement("container", "root0001"), children: [] },
        },
        design,
      ).needsTabsRuntime,
    ).toBe(false);
  });
});

describe("editor video preview labels (W-091)", () => {
  const preview = (url: string, title?: string) => {
    const node = {
      ...defaultElement("video", "vid00009"),
      props: title === undefined ? { url } : { url, title },
    };
    const html = renderPage(page(node), design, { mode: "editor" }).html;
    return parse(html).querySelector("[data-emvb-video-preview]");
  };

  test("a YouTube video without a title is labelled YouTube video", () => {
    const el = preview("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "   ");
    expect(el?.getAttribute("data-emvb-video-preview")).toBe("youtube");
    expect(el?.textContent).toBe("YouTube video — plays on the published page");
  });

  test("a Vimeo video without a title is labelled Vimeo video", () => {
    const el = preview("https://vimeo.com/76979871");
    expect(el?.getAttribute("data-emvb-video-preview")).toBe("vimeo");
    expect(el?.textContent).toBe("Vimeo video — plays on the published page");
  });

  test("the title is trimmed and the element keeps its own class", () => {
    const el = preview("https://vimeo.com/76979871", "  Launch  ");
    expect(el?.textContent).toBe("Launch — plays on the published page");
    expect(el?.getAttribute("class")).toBe("emvb-video emvb-video-preview");
  });
});
