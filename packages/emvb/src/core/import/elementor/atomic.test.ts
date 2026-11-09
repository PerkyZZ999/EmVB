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

  test("a gradient drawn over an image becomes an even overlay, and says so", () => {
    expect(byLabel("Hero")?.style?.["overlay"]).toEqual({ color: "#102030", opacity: 0.5 });
    expect(byLabel("Hero")?.style).not.toHaveProperty("gradient");
    expect(notes()).toContain("gradient over an image (shown as an even overlay)");
  });

  test("fluid sizes take their large value, phones their small one; laptop folds into tablet", () => {
    const title = byLabel("Hero title");
    expect(props(title)).toEqual({ text: "Fast pages, no code.", level: 1 });
    expect(title?.style).toEqual({
      fontFamily: '"Inter", sans-serif',
      fontSize: { value: 56, unit: "px" },
      fontWeight: 800,
      lineHeight: 1.1,
    });
    expect(title?.devices).toEqual({
      tablet: { letterSpacing: { value: -1, unit: "px" } },
      mobile: { fontSize: { value: 32, unit: "px" }, textAlign: "center" },
    });
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
      overflow: "auto",
      gap: { value: 12, unit: "px" },
      fontFamily: '"Inter", sans-serif',
    });
    expect(unmapped).toEqual(["transform"]);
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
