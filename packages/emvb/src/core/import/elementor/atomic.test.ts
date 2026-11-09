import { describe, expect, test } from "bun:test";
import atomicPage from "../../../../test/fixtures/elementor/atomic-page.json";
import { renderPage } from "../../render/index.ts";
import { emptyDesign } from "../../schema/design.ts";
import type { Layout, LayoutNode } from "../../schema/layout.ts";
import { nestingIssues } from "../../nesting.ts";
import { validateLayout } from "../../validate.ts";
import { declarations, decodeRawCss, finishBorders } from "./css.ts";
import { importElementor } from "./index.ts";

type Node = LayoutNode & {
  children?: Node[];
  style?: Record<string, unknown>;
  devices?: Record<string, Record<string, unknown>>;
  states?: Record<string, Record<string, unknown>>;
};

const result = (() => {
  const imported = importElementor(JSON.stringify(atomicPage));
  if (!imported.ok) throw new Error(imported.error);
  return imported;
})();
const all = (n: Node): Node[] => [n, ...(n.children ?? []).flatMap(all)];
const nodes = (layout: Layout) => all(layout.root as Node);
const find = (pred: (n: Node) => boolean) => nodes(result.layout).find(pred);
const props = (n: Node | undefined) => (n?.props ?? {}) as Record<string, unknown>;
const byLabel = (label: string) => find((n) => n.editorLabel === label);
const notes = () => result.notes.map((n) => n.message).join("\n");

describe("Elementor 4 atomic import (W-945)", () => {
  test("the page is valid and the save hook would accept it", () => {
    expect(validateLayout(result.layout).ok).toBe(true);
    expect(nestingIssues(result.layout)).toEqual([]);
    expect(result.title).toBe("Atomic sample");
    expect(result.fonts).toEqual(["Inter"]);
  });

  test("global classes and variables become the element's style, per device", () => {
    const hero = byLabel("Hero");
    expect(hero?.type).toBe("container");
    expect(props(hero)).toEqual({ tag: "section" });
    expect(hero?.style).toMatchObject({
      flexDirection: "column",
      minHeight: { value: 500, unit: "px" },
      color: "#f5f5f5",
      backgroundColor: "#102030",
      backgroundImage: "https://old.example/hero.webp",
      // Elementor's base padding for a Flexbox.
      paddingTop: { value: 10, unit: "px" },
    });
    expect(hero?.devices).toEqual({ mobile: { minHeight: { value: 360, unit: "px" } } });
  });

  test("a gradient drawn over an image becomes a gradient overlay (W-949)", () => {
    expect(byLabel("Hero")?.style?.["overlay"]).toEqual({
      gradient: {
        type: "linear",
        angle: 90,
        stops: [
          { color: "#102030", at: 0 },
          { color: "#10203080", at: 50 },
          { color: "#10203000", at: 100 },
        ],
      },
    });
    expect(byLabel("Hero")?.style).not.toHaveProperty("gradient");
    expect(notes()).not.toContain("gradient over an image");
  });

  test("W-955: fluid sizes stay fluid from their small to their large value; laptop folds into tablet", () => {
    const title = byLabel("Hero title");
    expect(props(title)).toEqual({ text: "Fast pages, no code.", level: 1 });
    expect(title?.style).toEqual({
      fontFamily: '"Inter", sans-serif',
      fontSize: { fluid: { min: 32, max: 56 } },
      fontWeight: 800,
      lineHeight: 1.1,
    });
    expect(title?.devices).toEqual({
      tablet: { letterSpacing: { value: -1, unit: "px" } },
      mobile: { textAlign: "center" },
    });
    const { css } = renderPage(result.layout, emptyDesign());
    expect(css).toContain("font-size:clamp(2rem, 1.413rem + 2.6087vw, 3.5rem)");
    expect(notes()).toContain("Laptop and extra breakpoints were folded into Tablet and Mobile.");
  });

  test("a capped wrapper width keeps its maximum and its side gutters on narrow screens", () => {
    const wrap = byLabel("Hero wrapper");
    expect(wrap?.type).toBe("div-block");
    expect(wrap?.style).toMatchObject({
      width: { value: 100, unit: "%" },
      maxWidth: { value: 1180, unit: "px" },
    });
    const gutters = {
      width: "auto",
      marginLeft: { value: 24, unit: "px" },
      marginRight: { value: 24, unit: "px" },
    };
    expect(wrap?.devices?.["tablet"]).toMatchObject(gutters);
    expect(wrap?.devices?.["mobile"]).toMatchObject(gutters);
  });

  test("a button keeps its colours, hover, transition and decoded custom CSS", () => {
    const button = find((n) => n.type === "button");
    expect(props(button)).toEqual({ text: "Get a quote →" });
    expect(button?.style).toMatchObject({
      backgroundColor: "#ffba08",
      color: "#111111",
      borderRadius: { value: 10, unit: "px" },
      // custom_css `font-weight: 750; border-bottom: 3px solid #aa7700;`
      fontWeight: 800,
      borderStyle: "solid",
      borderColor: "#aa7700",
      borderBottomWidth: { value: 3, unit: "px" },
      borderTopWidth: { value: 0, unit: "px" },
      borderLeftWidth: { value: 0, unit: "px" },
      motion: { transition: { property: "all", duration: 200, easing: "ease" } },
    });
    expect(button?.states).toEqual({ hover: { backgroundColor: "#ffd000" } });
    expect(notes()).toContain("Links to WordPress pages or dynamic values were left out");
  });

  test("text keeps its link, and display none on a device hides it there", () => {
    expect(props(find((n) => n.type === "link"))).toEqual({
      text: "Read the guide.",
      href: "https://example.com/guide",
      newTab: true,
    });
    expect(find((n) => props(n)["text"] === "Desktop only")?.hiddenOn).toEqual(["mobile"]);
  });

  test("a grid keeps its tracks per device and a full-row child spans them all", () => {
    const grid = find((n) => n.type === "grid");
    expect(props(grid)).toEqual({
      columns: 4,
      columnsTablet: 2,
      columnsMobile: 1,
      columnTracks: ["20%", "1fr", "1fr", "1fr"],
      columnTracksTablet: ["1fr", "1fr"],
      columnTracksMobile: ["1fr"],
    });
    const wide = grid?.children?.[4];
    expect(wide?.style?.["gridColumnSpan"]).toBe(4);
    expect(wide?.devices).toEqual({ tablet: { gridColumnSpan: 2 }, mobile: { gridColumnSpan: 1 } });
  });

  test("images keep their address; SVG icons become decorative images at Elementor's size", () => {
    expect(props(find((n) => props(n)["src"] === "https://old.example/team-photo.jpg"))).toEqual({
      src: "https://old.example/team-photo.jpg",
      alt: "Team photo",
    });
    const icon = find((n) => props(n)["src"] === "https://old.example/icon.svg");
    expect(props(icon)).toMatchObject({ decorative: true });
    expect(icon?.style).toEqual({
      width: { value: 65, unit: "px" },
      height: { value: 65, unit: "px" },
    });
  });

  test("an accordion keeps its titles and opens the first item when Elementor does", () => {
    expect(props(find((n) => n.type === "accordion-item"))).toEqual({
      summary: "Is it free?",
      open: true,
    });
  });

  test("form fields take their label by input id or from the label beside them", () => {
    const form = find((n) => n.type === "form");
    const fields = all(form as Node).filter((n) =>
      ["text-input", "checkbox", "select", "submit"].includes(n.type),
    );
    expect(fields.map((n) => [n.type, props(n)])).toEqual([
      ["text-input", { field: "name", label: "Name *", placeholder: "Ada" }],
      ["checkbox", { field: "topics", label: "Topic A" }],
      ["select", { field: "plan" }],
      ["submit", { label: "Send" }],
    ]);
    // Elementor's own messages are left to the forms plugin; labels never show twice.
    expect(
      all(form as Node).some(
        (n) => props(n)["text"] === "Thanks!" || props(n)["text"] === "Name *",
      ),
    ).toBe(false);
  });

  test("the imported page renders", () => {
    const { html, css } = renderPage(result.layout, emptyDesign());
    expect(html).toContain("Fast pages, no code.");
    expect(css).toContain("linear-gradient");
    expect(html).not.toMatch(/<script/i);
  });
});

describe("Elementor 4 edge cases (W-945)", () => {
  const S = (value: unknown) => ({ $$type: "string", value });
  const widget = (id: string, widgetType: string, settings: Record<string, unknown>) => ({
    id,
    elType: "widget",
    widgetType,
    settings,
    elements: [],
  });

  test("a form inside a form, which the save hook refuses, is pruned and reported", () => {
    const inner = {
      id: "inner",
      elType: "e-form",
      settings: {},
      elements: [widget("f2", "e-form-input", { _cssid: S("b") })],
    };
    const imported = importElementor([
      {
        id: "outer",
        elType: "e-form",
        settings: {},
        elements: [widget("f1", "e-form-input", { _cssid: S("a") }), inner],
      },
    ]);
    if (!imported.ok) throw new Error(imported.error);
    expect(nestingIssues(imported.layout)).toEqual([]);
    const forms = nodes(imported.layout).filter((n) => n.type === "form");
    expect(forms).toHaveLength(1);
    expect(imported.notes.map((n) => n.message).join("\n")).toContain(
      "An element EmVB couldn't use was left out",
    );
  });

  test("hostile links, text and images stay inert", () => {
    const bad = "javascript:alert(1)";
    const link = { $$type: "link", value: { destination: { $$type: "url", value: bad } } };
    const imported = importElementor([
      {
        id: "box",
        elType: "e-div-block",
        settings: { tag: S("a"), link },
        elements: [
          widget("h", "e-heading", {
            title: {
              $$type: "html",
              value: "<script>alert(1)</script><img src=x onerror=alert(1)>",
            },
            link,
          }),
          widget("p", "e-paragraph", { paragraph: S("x"), link }),
          widget("b", "e-button", { text: S("<b>go</b>"), link }),
          widget("i", "e-image", {
            image: {
              $$type: "image",
              value: {
                src: { $$type: "image-src", value: { url: { $$type: "url", value: bad } } },
              },
            },
          }),
        ],
      },
    ]);
    if (!imported.ok) throw new Error(imported.error);
    expect(JSON.stringify(imported.layout)).not.toMatch(/javascript:|<script|onerror/i);
    const { html } = renderPage(imported.layout, emptyDesign());
    expect(html).not.toMatch(/<script|<img|javascript:|\son[a-z]+=/i);
  });
});

describe("Elementor CSS text (W-945)", () => {
  test("variant custom CSS decodes from base64 UTF-8", () => {
    expect(decodeRawCss(btoa("line-height: normal;"))).toBe("line-height: normal;");
    expect(decodeRawCss("not base64!")).toBeUndefined();
    expect(decodeRawCss(42)).toBeUndefined();
  });

  test("declarations map what EmVB has and list the rest", () => {
    const { style, unmapped } = declarations(
      "font-weight: 750; line-height: normal; place-items: center; overflow-x: auto; gap: 8px 12px; transform: scale(2); font-family: 'Inter', sans-serif",
    );
    expect(style).toEqual({
      fontWeight: 800,
      lineHeight: 1.2,
      alignItems: "center",
      overflowX: "auto",
      gap: { value: 12, unit: "px" },
      fontFamily: '"Inter", sans-serif',
    });
    expect(unmapped).toEqual(["transform"]);
  });

  test("W-954: flex item settings map from CSS, including the flex shorthand", () => {
    expect(declarations("flex: 1 1 auto; align-self: start; order: -2").style).toEqual({
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: "auto",
      alignSelf: "flex-start",
      order: -2,
    });
    expect(declarations("flex: 1").style).toEqual({
      flexGrow: 1,
      flexBasis: { value: 0, unit: "%" },
    });
    expect(declarations("flex: none").style).toEqual({
      flexGrow: 0,
      flexShrink: 0,
      flexBasis: "auto",
    });
  });

  test("W-954: an Elementor 4 flex prop, align-self and order become flex item keys", () => {
    const imported = importElementor({
      content: [
        {
          id: "x",
          elType: "e-div-block",
          settings: { classes: { $$type: "classes", value: ["g-x"] } },
          elements: [],
        },
      ],
      global_classes: {
        items: {
          "g-x": {
            id: "g-x",
            variants: [
              {
                meta: { breakpoint: "desktop", state: null },
                props: {
                  flex: {
                    $$type: "flex",
                    value: {
                      flexGrow: { $$type: "number", value: 1 },
                      flexShrink: { $$type: "number", value: 0 },
                    },
                  },
                  "align-self": { $$type: "string", value: "flex-start" },
                  order: { $$type: "number", value: 2 },
                },
              },
            ],
          },
        },
        order: ["g-x"],
      },
    });
    if (!imported.ok) throw new Error(imported.error);
    const [x] = (imported.layout.root as Node).children ?? [];
    expect(x?.style).toMatchObject({
      flexGrow: 1,
      flexShrink: 0,
      alignSelf: "flex-start",
      order: 2,
    });
    expect(imported.notes.map((n) => n.message).join("\n")).not.toContain("flex");
  });

  test("W-957: italic, wrapping, long words, object position and one overflow axis map exactly", () => {
    const { style, unmapped } = declarations(
      "font-style: oblique; white-space: nowrap; word-wrap: break-word; object-position: 50% 0%; overflow-y: hidden",
    );
    expect(style).toEqual({
      fontStyle: "italic",
      whiteSpace: "nowrap",
      overflowWrap: "break-word",
      objectPosition: "top",
      overflowY: "hidden",
    });
    expect(unmapped).toEqual([]);
  });

  test("W-953: an Elementor 4 hover move becomes a hover lift", () => {
    const move = (y: number) => ({
      $$type: "transform",
      value: {
        "transform-functions": {
          $$type: "transform-functions",
          value: [
            {
              $$type: "transform-move",
              value: {
                x: { $$type: "size", value: { size: 0, unit: "px" } },
                y: { $$type: "size", value: { size: y, unit: "px" } },
                z: { $$type: "size", value: { size: 0, unit: "px" } },
              },
            },
            {
              $$type: "transform-rotate",
              value: { z: { $$type: "size", value: { size: 0.5, unit: "turn" } } },
            },
          ],
        },
      },
    });
    const imported = importElementor({
      content: [
        {
          id: "card",
          elType: "e-div-block",
          settings: { classes: { $$type: "classes", value: ["g-card"] } },
          elements: [],
        },
      ],
      global_classes: {
        items: {
          "g-card": {
            id: "g-card",
            variants: [
              { meta: { breakpoint: "desktop", state: "hover" }, props: { transform: move(-4) } },
            ],
          },
        },
        order: ["g-card"],
      },
    });
    if (!imported.ok) throw new Error(imported.error);
    const [card] = (imported.layout.root as Node).children ?? [];
    expect(card?.states).toEqual({ hover: { transform: { y: -4, rotate: 180 } } });
  });

  test("W-957: an Elementor 4 backdrop blur becomes a backdrop filter", () => {
    const blur = {
      $$type: "backdrop-filter",
      value: [
        {
          $$type: "css-filter-func",
          value: {
            func: { $$type: "string", value: "blur" },
            args: {
              $$type: "blur",
              value: { size: { $$type: "size", value: { size: 9, unit: "px" } } },
            },
          },
        },
      ],
    };
    const imported = importElementor({
      content: [
        {
          id: "glass",
          elType: "e-div-block",
          settings: { classes: { $$type: "classes", value: ["g-glass"] } },
          elements: [],
        },
      ],
      global_classes: {
        items: {
          "g-glass": {
            id: "g-glass",
            variants: [
              {
                meta: { breakpoint: "desktop", state: null },
                props: {
                  "backdrop-filter": blur,
                  "font-style": { $$type: "string", value: "italic" },
                },
              },
            ],
          },
        },
        order: ["g-glass"],
      },
    });
    if (!imported.ok) throw new Error(imported.error);
    const [glass] = (imported.layout.root as Node).children ?? [];
    expect(glass?.style).toMatchObject({ backdropFilter: { blur: 9 }, fontStyle: "italic" });
    expect(imported.notes.map((n) => n.message).join("\n")).not.toContain("backdrop-filter");
  });

  test("a side's border draws only that side", () => {
    const { style } = declarations("border-bottom-style: solid; border-bottom-color: #ccc");
    finishBorders(style);
    expect(style).toEqual({
      borderStyle: "solid",
      borderColor: "#ccc",
      borderTopWidth: { value: 0, unit: "px" },
      borderRightWidth: { value: 0, unit: "px" },
      borderLeftWidth: { value: 0, unit: "px" },
    });
  });

  test("hostile CSS values never pass", () => {
    const { style } = declarations(
      "color: red;}body{background:red; background: url(javascript:alert(1)); font-family: x;}<script>",
    );
    expect(JSON.stringify(style)).not.toMatch(/javascript|script|url\(/);
  });
});

describe("SVG files become recolourable icons (W-951)", () => {
  const PHONE =
    '<?xml version="1.0"?>\n<!-- icon --><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><circle cx="24" cy="24" r="21" fill="none" stroke="currentColor"/></svg>';
  const svgElement = (value: Record<string, unknown>, link?: string) => ({
    content: [
      {
        id: "svg1",
        elType: "e-svg",
        settings: {
          classes: { $$type: "classes", value: ["e-svg1"] },
          svg: { $$type: "svg-src", value },
          ...(link
            ? {
                link: {
                  $$type: "link",
                  value: { destination: { $$type: "url", value: link } },
                },
              }
            : {}),
        },
        styles: {
          "e-svg1": {
            id: "e-svg1",
            variants: [
              {
                meta: { breakpoint: "desktop", state: null },
                props: {
                  width: { $$type: "size", value: { size: 48, unit: "px" } },
                  height: { $$type: "size", value: { size: 48, unit: "px" } },
                },
              },
            ],
          },
        },
        elements: [],
      },
    ],
  });
  const withId = (extra: Record<string, unknown> = {}, link?: string) =>
    svgElement(
      {
        id: { $$type: "image-attachment-id", value: 35 },
        url: { $$type: "url", value: "https://old.example/wp-content/uploads/icone-telephone.svg" },
        ...extra,
      },
      link,
    );
  const first = (imported: ReturnType<typeof importElementor>) => {
    if (!imported.ok) throw new Error(imported.error);
    return ((imported.layout.root as Node).children ?? [])[0];
  };

  test("with the file's markup an SVG is an inline icon at its size that CSS colour reaches", () => {
    const seen: string[] = [];
    const imported = importElementor(withId(), {
      svg: (url) => {
        seen.push(url);
        return PHONE;
      },
    });
    const icon = first(imported);
    expect(seen).toEqual(["https://old.example/wp-content/uploads/icone-telephone.svg"]);
    expect(icon?.type).toBe("icon");
    expect(props(icon)).toMatchObject({
      iconId: "file:icone-telephone",
      decorative: true,
      size: 48,
    });
    expect(String(props(icon)["iconSvg"])).toStartWith("<svg");
    if (!imported.ok) throw new Error(imported.error);
    expect(imported.svgFiles).toEqual([]);
    expect(validateLayout(imported.layout).ok).toBe(true);
    const { html } = renderPage(imported.layout, emptyDesign());
    expect(html).toContain('stroke="currentColor"');
    expect(html).not.toContain("<img");
  });

  test("a linked SVG icon is named and keeps its link", () => {
    const icon = first(importElementor(withId({}, "tel:+15555550100"), { svg: () => PHONE }));
    expect(props(icon)).toMatchObject({ href: "tel:+15555550100", title: "Icone telephone" });
    expect(props(icon)).not.toHaveProperty("decorative");
  });

  test("without markup the file stays an image and is listed for the dialog to fetch", () => {
    const imported = importElementor(withId());
    expect(first(imported)?.type).toBe("image");
    if (!imported.ok) throw new Error(imported.error);
    expect(imported.svgFiles).toEqual([
      "https://old.example/wp-content/uploads/icone-telephone.svg",
    ]);
    expect(imported.notes.map((n) => n.message).join("\n")).toContain(
      "add the .svg files in the import dialog",
    );
  });

  test("an SVG named only by its WordPress media id becomes an empty icon at its size", () => {
    const s = svgElement({ id: { $$type: "image-attachment-id", value: 35 } });
    const imported = importElementor(s);
    const icon = first(imported);
    expect(icon?.type).toBe("icon");
    expect(props(icon)).toEqual({ iconId: "wp-media:35", decorative: true, size: 48 });
    if (!imported.ok) throw new Error(imported.error);
    expect(imported.notes.map((n) => n.message).join("\n")).toContain("Icon → My uploads");
    expect(validateLayout(imported.layout).ok).toBe(true);
  });

  test.each([
    ['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'],
    ['<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>'],
    ["not an svg"],
    [`<svg xmlns="http://www.w3.org/2000/svg"><path d="${"M0 0".repeat(9000)}"/></svg>`],
  ])("markup the sanitizer refuses, or too large, stays an image: %#", (markup) => {
    const imported = importElementor(withId(), { svg: () => markup });
    expect(first(imported)?.type).toBe("image");
    if (!imported.ok) throw new Error(imported.error);
    expect(JSON.stringify(imported.layout)).not.toMatch(/alert|onload/);
    expect(imported.notes.map((n) => n.message).join("\n")).toContain("stays an image");
  });
});
