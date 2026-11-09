import { describe, expect, test } from "bun:test";
import containerPage from "../../../../test/fixtures/elementor/container-page.json";
import headerTemplate from "../../../../test/fixtures/elementor/header-template.json";
import proWidgets from "../../../../test/fixtures/elementor/pro-widgets.json";
import sectionPage from "../../../../test/fixtures/elementor/section-page.json";
import siteKit from "../../../../test/fixtures/elementor/site-kit.json";
import { XSS_CORPUS } from "../../../../test/fixtures/xss.ts";
import { renderPage } from "../../render/index.ts";
import { emptyDesign } from "../../schema/design.ts";
import type { Layout, LayoutNode } from "../../schema/layout.ts";
import { validateLayout } from "../../validate.ts";
import { htmlToBlocks } from "./html.ts";
import {
  type ElementorImport,
  importElementor,
  MAX_IMPORT_CHARS,
  MAX_IMPORT_ELEMENTS,
} from "./index.ts";

const FIXTURES: Record<string, unknown> = {
  "container-page": containerPage,
  "section-page": sectionPage,
  "header-template": headerTemplate,
  "pro-widgets": proWidgets,
  "site-kit": siteKit,
};
/** A fixture as the text a person pastes or uploads. */
const fixture = (name: string) => JSON.stringify(FIXTURES[name]);

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" fill="currentColor"><path d="M0 0h10v10z"/></svg>';
const KNOWN_ICONS = new Set([
  "fa-solid:arrow-right",
  "fa-solid:bolt",
  "fa-solid:universal-access",
  "fa-regular:star",
  "fa-solid:phone",
  "fa-solid:envelope",
  "fa-brands:facebook",
  "fa-brands:instagram",
]);
const icon = (id: string) => (KNOWN_ICONS.has(id) ? SVG : undefined);

type Node = LayoutNode & {
  children?: Node[];
  style?: Record<string, unknown>;
  devices?: Record<string, Record<string, unknown>>;
};

function ok(result: ElementorImport) {
  if (!result.ok) throw new Error(result.error);
  return result;
}

const all = (node: Node): Node[] => [node, ...(node.children ?? []).flatMap(all)];
const nodes = (layout: Layout) => all(layout.root as Node);
const ofType = (layout: Layout, type: string) => nodes(layout).filter((n) => n.type === type);
const props = (n: Node | undefined) => (n?.props ?? {}) as Record<string, unknown>;
const notes = (result: { notes: { message: string }[] }) =>
  result.notes.map((n) => n.message).join("\n");

/** Element types in document order, for a compact shape check. */
const types = (layout: Layout) => nodes(layout).map((n) => n.type);

describe("Elementor import: containers (W-945)", () => {
  const result = ok(importElementor(fixture("container-page"), { icon }));

  test("the result is a valid EmVB page with the template's title", () => {
    expect(validateLayout(result.layout).ok).toBe(true);
    expect(result.title).toBe("Container landing");
    expect(result.partType).toBeUndefined();
    expect(result.elements).toBe(24);
    expect(result.mapped).toBe(24);
  });

  test("a boxed container is a full-width box around a centred inner box", () => {
    const hero = result.layout.root.children?.[0] as Node;
    expect(hero.style).toMatchObject({
      minHeight: { value: 80, unit: "vh" },
      backgroundImage: "https://old.example/wp-content/uploads/2025/03/hero.jpg",
      backgroundSize: "cover",
      backgroundPosition: "center",
      overlay: { color: "#000000", opacity: 0.5 },
      paddingTop: { value: 80, unit: "px" },
      justifyContent: "center",
    });
    expect(hero.devices?.["mobile"]).toEqual({ minHeight: { value: 60, unit: "vh" } });
    expect(hero.htmlId).toBe("top");
    const inner = hero.children?.[0];
    expect(inner?.style).toMatchObject({
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      maxWidth: { value: 1140, unit: "px" },
      marginLeft: "auto",
      marginRight: "auto",
    });
  });

  test("a heading keeps its level, typography and per-device overrides", () => {
    const heading = ofType(result.layout, "heading")[0];
    expect(props(heading)).toEqual({ text: "Build pages visually", level: 1 });
    expect(heading?.style).toMatchObject({
      color: "#ffffff",
      fontFamily: '"Poppins", sans-serif',
      fontSize: { value: 56, unit: "px" },
      fontWeight: 700,
      lineHeight: 1.1,
      letterSpacing: { value: -1, unit: "px" },
      textAlign: "center",
    });
    expect(heading?.devices).toEqual({
      tablet: { fontSize: { value: 44, unit: "px" } },
      mobile: { fontSize: { value: 34, unit: "px" }, textAlign: "left" },
    });
    expect(result.fonts).toContain("Poppins");
  });

  test("a button keeps its link, icon, colours, hover and entrance", () => {
    const button = ofType(result.layout, "button")[0];
    expect(props(button)).toMatchObject({
      text: "Get started",
      href: "https://example.com/start",
      iconId: "fa-solid:arrow-right",
      iconSvg: SVG,
      iconPosition: "after",
    });
    expect(button?.style).toMatchObject({
      color: "#111111",
      backgroundColor: "#ffcc00",
      borderRadius: { value: 30, unit: "px" },
      paddingTop: { value: 15, unit: "px" },
      marginLeft: "auto",
      marginRight: "auto",
      motion: { entrance: { type: "fade-up", duration: 750, trigger: "view" } },
    });
    expect(button?.states).toEqual({ hover: { color: "#ffffff", backgroundColor: "#222222" } });
  });

  test("text editor line breaks stay line breaks", () => {
    expect(ofType(result.layout, "text").map((n) => props(n)["text"])).toContain(
      "Fast, accessible pages.\nNo code needed.",
    );
  });

  test("child containers in a row share the row; a set width wins; phones stack", () => {
    const band = result.layout.root.children?.[1] as Node | undefined;
    const row = band?.children?.[0];
    expect(row?.style).toMatchObject({
      flexDirection: "row",
      gap: { value: 30, unit: "px" },
      maxWidth: { value: 1200, unit: "px" },
    });
    expect(row?.devices).toEqual({ mobile: { flexDirection: "column" } });
    expect(row?.children?.map((c) => c.style?.["width"])).toEqual([
      { value: 100, unit: "%" },
      { value: 100, unit: "%" },
      { value: 40, unit: "%" },
    ]);
  });

  test("icon and image boxes keep media, title and description", () => {
    const [top, left] = ofType(result.layout, "icon").map((n) => props(n));
    expect(top).toMatchObject({ iconId: "fa-solid:bolt", decorative: true });
    expect(left).toMatchObject({ iconId: "fa-solid:universal-access" });
    expect(ofType(result.layout, "image").map((n) => props(n)["alt"])).toEqual(["Our team"]);
    expect(ofType(result.layout, "heading").map((n) => props(n)["text"])).toEqual(
      expect.arrayContaining(["Fast", "Accessible", "People"]),
    );
  });

  test("a grid container keeps its columns per device", () => {
    expect(props(ofType(result.layout, "grid")[0])).toEqual({
      columns: 4,
      columnsTablet: 2,
      columnsMobile: 1,
    });
  });

  test("nested tabs and accordions keep their titles and contents", () => {
    expect(ofType(result.layout, "tab-panel").map((n) => props(n)["label"])).toEqual([
      "Design",
      "Publish",
    ]);
    expect(ofType(result.layout, "accordion-item").map((n) => props(n)["summary"])).toEqual([
      "Is it free?",
    ]);
    expect(ofType(result.layout, "text").map((n) => props(n)["text"])).toEqual(
      expect.arrayContaining(["Design tab body", "Publish tab body", "Yes."]),
    );
  });

  test("the report says images still load from the old site and global colours are defaults", () => {
    const text = notes(result);
    expect(text).toContain("Images still load from their original address");
    expect(text).toContain("Global colours use Elementor's default kit");
  });
});

describe("Elementor import: legacy sections and core widgets (W-945)", () => {
  const result = ok(importElementor(fixture("section-page"), { icon }));

  test("a section is a band with a row of percentage columns that stack on phones", () => {
    const section = result.layout.root.children?.[0] as Node;
    expect(props(section)).toEqual({ tag: "header" });
    expect(section.style).toMatchObject({
      minHeight: { value: 400, unit: "px" },
      justifyContent: "center",
      gradient: {
        type: "linear",
        angle: 90,
        stops: [
          { color: "#ff0000", at: 0 },
          { color: "#0000ff", at: 100 },
        ],
      },
    });
    const row = section.children?.[0];
    expect(row?.style).toMatchObject({
      flexDirection: "row",
      maxWidth: { value: 1000, unit: "px" },
    });
    expect(row?.devices).toEqual({ mobile: { flexDirection: "column" } });
    const [first, second] = row?.children ?? [];
    expect(first?.style).toMatchObject({
      width: { value: 33.333, unit: "%" },
      paddingTop: { value: 20, unit: "px" },
    });
    expect(first?.devices).toEqual({ mobile: { width: { value: 100, unit: "%" } } });
    // The column's own padding replaces the section gap, as in Elementor.
    expect(second?.style).toMatchObject({
      paddingTop: { value: 5, unit: "px" },
      backgroundColor: "#00000080",
    });
  });

  test("every core widget becomes its EmVB element", () => {
    expect(types(result.layout)).toEqual([
      "container",
      "container",
      "container",
      "container",
      "heading",
      "container",
      "heading",
      "text",
      "list",
      "divider",
      "image",
      "video",
      "image",
      "container",
      "spacer",
      "divider",
      "icon",
      "container",
      "container",
      "icon",
      "link",
      "container",
      "icon",
      "link",
      "video",
      "container",
      "text",
      "text",
      "container",
      "text",
      "container",
      "container",
      "text",
      "container",
      "text",
      "image",
      "text",
      "text",
      "text",
      "container",
      "text",
      "text",
      "tabs",
      "tab-panel",
      "text",
      "tab-panel",
      "text",
      "accordion",
      "accordion-item",
      "text",
      "accordion-item",
      "text",
      "accordion",
      "accordion-item",
      "text",
      "container",
      "icon",
      "icon",
      "grid",
      "image",
      "image",
      "link",
      "container",
      "text",
    ]);
  });

  test("widget details survive: links, captions, sizes, anchors and phone links", () => {
    const heading = ofType(result.layout, "heading")[0];
    expect(props(heading)).toEqual({ text: "Legacy section", level: 2, href: "/about" });
    expect(heading?.style?.["fontSize"]).toEqual({ value: 29, unit: "px" });
    const photo = ofType(result.layout, "image").find((n) => props(n)["caption"]);
    expect(props(photo)).toMatchObject({
      alt: "Photo",
      caption: "A photo",
      href: "https://example.com/photo",
      newTab: true,
    });
    expect(photo?.style).toMatchObject({ width: { value: 80, unit: "%" }, marginRight: "auto" });
    expect(props(ofType(result.layout, "spacer")[0])).toEqual({
      height: { value: 30, unit: "px" },
    });
    expect(ofType(result.layout, "spacer")[0]?.devices).toEqual({
      mobile: { height: { value: 10, unit: "px" } },
    });
    expect(ofType(result.layout, "link").map((n) => props(n)["href"])).toEqual(
      expect.arrayContaining(["tel:+15550100199", "mailto:hi@example.com"]),
    );
    expect(nodes(result.layout).some((n) => n.htmlId === "contact")).toBe(true);
    expect(ofType(result.layout, "text").map((n) => props(n)["text"])).toEqual(
      expect.arrayContaining([
        "12500+",
        "Pages built",
        "Rated ★★★★☆ (4/5)",
        "Heads up",
        "From HTML",
      ]),
    );
    expect(props(ofType(result.layout, "accordion-item")[0])).toMatchObject({ open: true });
    expect(props(ofType(result.layout, "accordion-item")[2])).not.toHaveProperty("open");
  });

  test("the report names what was approximated or left out", () => {
    const text = notes(result);
    for (const expected of [
      "Counters show their final number",
      "Google Maps embeds became a link",
      'The shortcode [contact-form-7 id="5"] needs WordPress',
      "WordPress widgets weren't imported",
      "Left out: script",
      "Images without alt text got one from their file name",
    ]) {
      expect(text).toContain(expected);
    }
    expect(text).not.toContain("iframe");
    expect(result.notes.find((n) => n.message.includes("Custom HTML"))?.element).toBe("HTML");
  });
});

describe("Elementor import: theme builder, Pro widgets and kits (W-945)", () => {
  test("a header template maps to a header theme part", () => {
    const result = ok(importElementor(fixture("header-template"), { icon }));
    expect(result.partType).toBe("header");
    expect(result.title).toBe("Main header");
    expect(types(result.layout)).toEqual(["container", "container", "container", "menu", "button"]);
    expect(result.layout.root.style).toMatchObject({ backgroundColor: "#fafafa" });
    expect(notes(result)).toContain('The WordPress menu "main-menu" isn\'t in the export');
    expect(notes(result)).toContain("The site logo comes from WordPress settings");
  });

  test("Pro widgets are rebuilt as well as EmVB can, and say so", () => {
    const result = ok(importElementor(fixture("pro-widgets"), { icon }));
    expect(result.partType).toBe("single_post");
    expect(props(ofType(result.layout, "post-title")[0])).toEqual({ level: 1 });
    expect(ofType(result.layout, "post-content")).toHaveLength(1);
    const form = ofType(result.layout, "form")[0];
    expect(props(form)).toEqual({ formId: "" });
    expect(form?.children?.map((c) => [c.type, props(c)["field"] ?? props(c)["label"]])).toEqual([
      ["text-input", "name"],
      ["text-input", "email"],
      ["textarea", "msg"],
      ["checkbox", "terms"],
      ["text-input", "field_6"],
      ["submit", "Send it"],
    ]);
    expect(ofType(result.layout, "text").map((n) => props(n)["text"])).toContain("€29 / month");
    expect(ofType(result.layout, "heading").map((n) => props(n)["text"])).toEqual(
      expect.arrayContaining(["Ready?", "Front", "Back", "We build pages fast", "Styled by CSS"]),
    );
    const styled = ofType(result.layout, "heading").find(
      (n) => props(n)["text"] === "Styled by CSS",
    );
    expect(styled?.style).toMatchObject({ color: "#123456", fontSize: { value: 30, unit: "px" } });
    const text = notes(result);
    expect(text).toContain('Dynamic tag "site-title" kept its fixed fallback value.');
    expect(text).toContain('Form field type "upload" was left out.');
    expect(text).toContain("Post lists and loops weren't imported");
    expect(text).toContain("Custom CSS properties left out: transform.");
  });

  test("a site kit gives exact global colours and fonts", () => {
    const kit = JSON.parse(fixture("site-kit")) as unknown;
    const result = ok(importElementor(fixture("header-template"), { icon, kit }));
    const button = ofType(result.layout, "button")[0];
    expect(button?.style).toMatchObject({
      backgroundColor: "#0000aa",
      fontFamily: '"Inter", sans-serif',
      fontWeight: 600,
    });
    expect(notes(result)).not.toContain("default kit");
  });

  test("with defaults off, unstyled widgets keep EmVB's own look", () => {
    const result = ok(importElementor(fixture("container-page"), { icon, defaults: false }));
    const grid = ofType(result.layout, "grid")[0];
    expect(grid?.children?.[0]?.style).toBeUndefined();
    expect(notes(result)).not.toContain("default kit");
  });
});

describe("Elementor import: what people paste (W-945)", () => {
  const heading = { id: "h", elType: "widget", widgetType: "heading", settings: { title: "Hi" } };

  test.each([
    ["_elementor_data array", JSON.stringify([heading])],
    ["one copied element", JSON.stringify(heading)],
    [
      "_elementor_data as a JSON string",
      JSON.stringify({ _elementor_data: JSON.stringify([heading]) }),
    ],
    [
      "template export",
      JSON.stringify({ version: "0.4", title: "T", type: "page", content: [heading] }),
    ],
  ])("accepts %s", (_name, input) => {
    expect(
      ofType(ok(importElementor(input)).layout, "heading").map((n) => props(n)["text"]),
    ).toEqual(["Hi"]);
  });

  test.each([
    ["not JSON", "{oops", "isn't valid JSON"],
    ["a WordPress XML export", '<?xml version="1.0"?><rss/>', "WordPress XML export"],
    ["a site kit", fixture("site-kit"), "This is a site kit"],
    ["something else", JSON.stringify({ hello: "world" }), "No Elementor content was found"],
    ["an empty export", JSON.stringify([]), "no elements"],
    [
      "only things EmVB can't import",
      JSON.stringify([{ elType: "widget", widgetType: "sidebar", settings: {} }]),
      "Nothing in this export could be imported",
    ],
  ])("refuses %s with a clear message", (_name, input, message) => {
    const result = importElementor(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(message);
  });

  test("an unknown third-party widget keeps its text, image and button", () => {
    const result = ok(
      importElementor([
        {
          id: "x",
          elType: "widget",
          widgetType: "ekit-fancy-box",
          settings: {
            title: "Fancy",
            description: "<p>Addon text</p>",
            image: { url: "https://cdn.example/x.png", alt: "X" },
            btn_text: "More",
            btn_link: "https://example.com/more",
            title_color: "#ff0000",
          },
        },
        { id: "y", elType: "widget", widgetType: "jet-blank", settings: { show_arrows: "yes" } },
      ]),
    );
    expect(types(result.layout)).toEqual([
      "container",
      "container",
      "heading",
      "text",
      "image",
      "button",
    ]);
    expect(props(ofType(result.layout, "button")[0])).toMatchObject({
      text: "More",
      href: "https://example.com/more",
    });
    const text = notes(result);
    expect(text).toContain('Widget "ekit-fancy-box" isn\'t known to EmVB');
    expect(text).toContain('Widget "jet-blank" has no EmVB match');
  });

  test("Elementor 4 atomic elements keep their content", () => {
    const result = ok(
      importElementor([
        {
          id: "f",
          elType: "e-flexbox",
          settings: {},
          elements: [
            {
              id: "h",
              elType: "widget",
              widgetType: "e-heading",
              settings: {
                title: { $$type: "string", value: "Atomic" },
                tag: { $$type: "string", value: "h3" },
              },
            },
            {
              id: "p",
              elType: "widget",
              widgetType: "e-paragraph",
              settings: { paragraph: { $$type: "string", value: "Body" } },
            },
          ],
        },
      ]),
    );
    expect(ofType(result.layout, "heading").map((n) => props(n))).toEqual([
      { text: "Atomic", level: 3 },
    ]);
    expect(ofType(result.layout, "text").map((n) => props(n)["text"])).toEqual(["Body"]);
  });
});

describe("Elementor import: hostile and oversized input (W-945)", () => {
  /** Every place a person's text or URL lands. */
  const hostile = (payload: string) => [
    {
      id: "c",
      elType: "container",
      settings: {
        _element_id: payload,
        custom_css: `selector { color: ${payload}; }`,
        background_background: "classic",
        background_image: { url: payload },
      },
      elements: [
        {
          id: "h",
          elType: "widget",
          widgetType: "heading",
          settings: { title: payload, link: { url: payload } },
        },
        { id: "t", elType: "widget", widgetType: "text-editor", settings: { editor: payload } },
        { id: "x", elType: "widget", widgetType: "html", settings: { html: payload } },
        {
          id: "b",
          elType: "widget",
          widgetType: "button",
          settings: { text: payload, link: { url: "javascript:alert(1)" } },
        },
        {
          id: "i",
          elType: "widget",
          widgetType: "image",
          settings: { image: { url: payload, alt: payload } },
        },
        {
          id: "l",
          elType: "widget",
          widgetType: "icon-list",
          settings: { icon_list: [{ text: payload, link: { url: payload } }] },
        },
        {
          id: "a",
          elType: "widget",
          widgetType: "accordion",
          settings: { tabs: [{ tab_title: payload, tab_content: payload }] },
        },
        {
          id: "u",
          elType: "widget",
          widgetType: "unknown-addon",
          settings: { title: payload, description: payload },
        },
      ],
    },
  ];

  test.each(XSS_CORPUS)("%p renders as inert text wherever it lands", (payload) => {
    const result = ok(importElementor(hostile(payload)));
    expect(validateLayout(result.layout).ok).toBe(true);
    const { html, css } = renderPage(result.layout, emptyDesign()) as {
      html: string;
      css?: string;
    };
    expect(html).not.toMatch(/<script|<iframe|<svg|<img[^>]*onerror|\son[a-z]+=|javascript:/i);
    if (css) expect(css).not.toMatch(/<\/style|javascript:|expression\(/i);
    expect(JSON.stringify(result.layout)).not.toMatch(/javascript:/i);
  });

  test("a file over 8 MB is refused before parsing", () => {
    const result = importElementor(" ".repeat(MAX_IMPORT_CHARS + 1));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("larger than 8 MB");
  });

  test("a page with too many elements keeps the first ones and says so", () => {
    const many = Array.from({ length: MAX_IMPORT_ELEMENTS + 50 }, (_, i) => ({
      id: `s${i}`,
      elType: "widget",
      widgetType: "spacer",
      settings: {},
    }));
    const result = ok(importElementor(many));
    expect(validateLayout(result.layout).ok).toBe(true);
    expect(ofType(result.layout, "spacer").length).toBeLessThan(MAX_IMPORT_ELEMENTS);
    expect(notes(result)).toContain("the rest was left out");
  });

  test("very deep nesting is cut, not crashed on", () => {
    let element: Record<string, unknown> = {
      id: "leaf",
      elType: "widget",
      widgetType: "heading",
      settings: { title: "Deep" },
    };
    for (let i = 0; i < 200; i++)
      element = {
        id: `c${i}`,
        elType: "container",
        settings: { content_width: "full" },
        elements: [element],
      };
    const result = ok(importElementor([element]));
    expect(validateLayout(result.layout).ok).toBe(true);
    expect(notes(result)).toContain("nested deeper than EmVB allows");
  });

  test("W-949: an Elementor 3 gradient overlay becomes a gradient overlay", () => {
    const result = ok(
      importElementor([
        {
          id: "c",
          elType: "container",
          settings: {
            content_width: "full",
            background_background: "classic",
            background_image: { url: "https://cdn.example/hero.jpg" },
            background_overlay_background: "gradient",
            background_overlay_color: "#000000",
            background_overlay_color_b: "rgba(0,0,0,0)",
            background_overlay_gradient_angle: { unit: "deg", size: 90 },
            background_overlay_opacity: { size: 0.8 },
          },
          elements: [],
        },
      ]),
    );
    const [box] = (result.layout.root.children ?? []) as Node[];
    expect(box?.style?.["overlay"]).toEqual({
      gradient: {
        type: "linear",
        angle: 90,
        stops: [
          { color: "#000000", at: 0 },
          { color: "#00000000", at: 100 },
        ],
      },
      opacity: 0.8,
    });
  });

  test("long text is split, never cut", () => {
    const long = `${"word ".repeat(1000)}end`;
    const result = ok(
      importElementor([
        {
          id: "t",
          elType: "widget",
          widgetType: "text-editor",
          settings: { editor: `<p>${long}</p>` },
        },
      ]),
    );
    const texts = ofType(result.layout, "text").map((n) => String(props(n)["text"]));
    expect(texts.length).toBeGreaterThan(1);
    expect(texts.join(" ")).toBe(long);
  });

  test("bad values in settings are dropped, not passed on", () => {
    const result = ok(
      importElementor([
        {
          id: "c",
          elType: "container",
          settings: {
            content_width: "full",
            background_background: "classic",
            background_color: "red;}body{background:red",
            padding: { unit: "px", top: "-5", right: "1e9", bottom: "abc", left: "12" },
            min_height: { unit: "furlong", size: 3 },
            _element_id: "has space",
            typography_font_family: "x;}",
          },
          elements: [
            {
              id: "h",
              elType: "widget",
              widgetType: "heading",
              settings: {
                title: "Ok",
                typography_typography: "custom",
                typography_font_family: 'Evil"; } body { x',
                title_color: "expression(alert(1))",
              },
            },
          ],
        },
      ]),
    );
    const [box] = result.layout.root.children ?? [];
    expect((box as Node).style).toEqual({
      flexDirection: "column",
      gap: { value: 20, unit: "px" },
      paddingLeft: { value: 12, unit: "px" },
    });
    expect((box as Node).htmlId).toBeUndefined();
    const heading = ofType(result.layout, "heading")[0];
    // Custom typography with an unusable family sets no font; a bad colour sets no colour.
    expect(heading?.style ?? {}).not.toHaveProperty("fontFamily");
    expect(heading?.style ?? {}).not.toHaveProperty("color");
  });
});

describe("Elementor HTML to blocks (W-945)", () => {
  const keep = (url: string) => (/^https?:\/\//.test(url) ? url : undefined);

  test("blocks, lists, rules, images and video embeds in order", () => {
    const { blocks, flattened, dropped } = htmlToBlocks(
      '<h2>Title</h2><p>One <b>bold</b><br/>two</p><ul><li>A</li><li>B<ul><li>B1</li></ul></li></ul><hr><img src="https://x.test/a.png" alt="A"><iframe src="https://player.vimeo.com/video/123"></iframe><p><a href="https://x.test">Only a link</a></p><table><tr><td>c1</td><td>c2</td></tr></table>',
      keep,
      keep,
    );
    expect(blocks).toEqual([
      { kind: "heading", level: 2, text: "Title" },
      { kind: "text", text: "One bold\ntwo" },
      { kind: "list", ordered: false, items: ["A", "B", "B1"] },
      { kind: "divider" },
      { kind: "image", src: "https://x.test/a.png", alt: "A" },
      { kind: "video", url: "https://vimeo.com/123" },
      { kind: "link", text: "Only a link", href: "https://x.test" },
      { kind: "text", text: "c1 c2" },
    ]);
    expect(flattened).toBe(true);
    expect(dropped).toEqual(["table (its cells are kept as paragraphs)"]);
  });

  test("entities decode once and source line breaks are spaces", () => {
    const { blocks } = htmlToBlocks(
      "<p>a&amp;b &lt;tag&gt; &#169; &#x1F600;\n next &bogus;</p>",
      keep,
      keep,
    );
    expect(blocks).toEqual([{ kind: "text", text: "a&b <tag> © 😀 next &bogus;" }]);
  });
});
