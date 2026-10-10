import { describe, expect, test } from "bun:test";
import { defaultElement } from "../elements/index.ts";
import { emptyDesign } from "../schema/design.ts";
import type { Layout, LayoutNode } from "../schema/layout.ts";
import { SAMPLE_POST, type ThemePostFields } from "../theme/dynamic.ts";
import { renderPage } from "./index.ts";

// W-091: the tabs and loop renderers had loose `toContain` checks only (Stryker: 41% and 40%).

const design = emptyDesign();
const page = (...children: LayoutNode[]): Layout =>
  ({
    schemaVersion: 14,
    root: { id: "root0001", type: "container", props: {}, children },
  }) as Layout;
const panel = (id: string, label: string, children: LayoutNode[] = []) =>
  ({ id, type: "tab-panel", props: { label }, children }) as LayoutNode;
const tabsOf = (id: string, children: LayoutNode[]) =>
  ({ ...defaultElement("tabs", "tabs0001"), id, children }) as LayoutNode;
const parse = (html: string) => {
  const host = document.createElement("div");
  host.innerHTML = html;
  return host;
};

describe("renderTabs (W-091)", () => {
  test("two panels render the full radio, tab and panel markup, first tab selected", () => {
    const { html } = renderPage(
      page(tabsOf("tabs0001", [panel("tabp0001", "One"), panel("tabp0002", "Two")])),
      design,
    );
    const g = "emvb-tabs-tabs0001";
    expect(html).toBe(
      '<div class="emvb-root emvb-container"><div class="emvb-tabs">' +
        `<input type="radio" name="${g}" id="${g}-0" class="emvb-tab-input" checked="checked">` +
        `<input type="radio" name="${g}" id="${g}-1" class="emvb-tab-input">` +
        '<div class="emvb-tab-list" role="tablist" aria-orientation="horizontal">' +
        `<label class="emvb-tab-label" for="${g}-0" id="${g}-tab-0" role="tab" aria-selected="true" aria-controls="${g}-panel-0" tabindex="0">One</label>` +
        `<label class="emvb-tab-label" for="${g}-1" id="${g}-tab-1" role="tab" aria-selected="false" aria-controls="${g}-panel-1" tabindex="-1">Two</label>` +
        '</div><div class="emvb-tab-panels">' +
        `<div class="emvb-tab-panel" id="${g}-panel-0" role="tabpanel" aria-labelledby="${g}-tab-0"></div>` +
        `<div class="emvb-tab-panel" id="${g}-panel-1" role="tabpanel" aria-labelledby="${g}-tab-1"></div>` +
        "</div></div></div>",
    );
  });

  test("in the editor each panel carries its element id; on the public page none does", () => {
    const layout = page(tabsOf("tabs0001", [panel("tabp0001", "One"), panel("tabp0002", "Two")]));
    const editor = parse(renderPage(layout, design, { mode: "editor" }).html);
    const ids = [...editor.querySelectorAll(".emvb-tab-panel")].map((el) =>
      el.getAttribute("data-emvb-id"),
    );
    expect(ids).toEqual(["tabp0001", "tabp0002"]);
    const pub = parse(renderPage(layout, design).html);
    expect(pub.querySelectorAll(".emvb-tab-panel[data-emvb-id]").length).toBe(0);
    expect(pub.querySelectorAll(".emvb-tab-panel").length).toBe(2);
  });

  test("at most 12 panels render, and children that aren't panels are skipped", () => {
    const panels = Array.from({ length: 13 }, (_, i) =>
      panel(`tabp${String(i).padStart(4, "0")}`, `Tab ${i}`),
    );
    const stray = defaultElement("heading", "head0001");
    const dom = parse(renderPage(page(tabsOf("tabs0001", [stray, ...panels])), design).html);
    expect(dom.querySelectorAll(".emvb-tab-input").length).toBe(12);
    expect(dom.querySelectorAll(".emvb-tab-label").length).toBe(12);
    expect(dom.querySelectorAll(".emvb-tab-panel").length).toBe(12);
    expect(dom.querySelector(".emvb-tab-label")?.textContent).toBe("Tab 0");
    expect(dom.querySelector(".emvb-heading")).toBeNull();
  });

  test("a tabs element with an invalid id still gets one working radio group", () => {
    const dom = parse(renderPage(page(tabsOf("bad id!", [panel("tabp0001", "One")])), design).html);
    const input = dom.querySelector(".emvb-tab-input");
    expect(input?.getAttribute("name")).toBe("emvb-tabs-x");
    expect(input?.getAttribute("id")).toBe("emvb-tabs-x-0");
    expect(dom.querySelector(".emvb-tab-label")?.getAttribute("for")).toBe("emvb-tabs-x-0");
  });
});

describe("renderLoop (W-091)", () => {
  const title = { id: "ptitle04", type: "post-title", props: { level: 2 } } as LayoutNode;
  const loop = (props: Record<string, unknown>, children: LayoutNode[] = [title]) =>
    ({ id: "loop0001", type: "loop", props, children }) as LayoutNode;
  const posts: ThemePostFields[] = [
    { ...SAMPLE_POST, id: "a", title: "Alpha" },
    { ...SAMPLE_POST, id: "b", title: "Beta" },
  ];
  const itemLayout: Layout = page({
    id: "ptitle05",
    type: "post-title",
    props: { level: 3 },
  } as LayoutNode);

  test("each post is one loop item holding only the item's elements", () => {
    const { html } = renderPage(page(loop({})), design, { dynamic: { posts } });
    expect(html).toBe(
      '<div class="emvb-root emvb-container"><div class="emvb-loop">' +
        '<div class="emvb-loop-item" data-emvb-loop-item="a"><h2 class="emvb-post-title">Alpha</h2></div>' +
        '<div class="emvb-loop-item" data-emvb-loop-item="b"><h2 class="emvb-post-title">Beta</h2></div>' +
        "</div></div>",
    );
  });

  test("an empty loop in the editor explains how to design the item", () => {
    const editor = renderPage(page(loop({}, [])), design, { mode: "editor" }).html;
    expect(editor).toContain("data-emvb-loop-empty");
    expect(editor).toContain("Choose a Loop Item, or add elements here to design the item.");
    expect(renderPage(page(loop({}, [])), design).html).not.toContain("emvb-loop");
  });

  test("a public loop with no posts renders nothing, not an editor placeholder", () => {
    const { html } = renderPage(page(loop({})), design, { dynamic: { posts: [] } });
    expect(html).toBe('<div class="emvb-root emvb-container"></div>');
  });

  test("the item part id is trimmed before it picks the loop-item template", () => {
    const { html } = renderPage(page(loop({ itemPartId: "  item-1 " })), design, {
      dynamic: { posts, loopTemplates: { "item-1": itemLayout } },
    });
    expect(parse(html).querySelectorAll("h3.emvb-post-title").length).toBe(2);
    expect(parse(html).querySelector("h2")).toBeNull();
  });

  test("an item part id with no templates falls back to the loop's own children", () => {
    const withPosts = renderPage(page(loop({ itemPartId: "item-1" })), design, {
      dynamic: { posts },
    });
    expect(parse(withPosts.html).querySelectorAll("h2.emvb-post-title").length).toBe(2);
    const editor = renderPage(page(loop({ itemPartId: "item-1" })), design, { mode: "editor" });
    expect(parse(editor.html).querySelector(".emvb-loop-item h2")?.textContent).toBe(
      SAMPLE_POST.title,
    );
  });
});

describe("one element rendered twice keeps its HTML ids unique (W-249)", () => {
  const tabs = tabsOf("tabs0001", [panel("tabp0001", "One"), panel("tabp0002", "Two")]);
  const field = {
    id: "field001",
    type: "text-input",
    props: { field: "email", label: "Email" },
  } as LayoutNode;
  const form = {
    id: "form0001",
    type: "form",
    props: { formId: "f1" },
    children: [field],
  } as LayoutNode;
  const twice = (part: Layout) =>
    renderPage(
      page(
        { id: "sec00001", type: "section", props: { partId: "p1" }, children: [] } as LayoutNode,
        { id: "sec00002", type: "section", props: { partId: "p1" }, children: [] } as LayoutNode,
      ),
      design,
      { dynamic: { sectionTemplates: { p1: part } } },
    ).html;
  const duplicateIds = (dom: HTMLElement) => {
    const ids = [...dom.querySelectorAll("[id]")].map((el) => el.id);
    return ids.filter((id, i) => ids.indexOf(id) !== i);
  };
  const resolves = (dom: HTMLElement, attr: string) =>
    [...dom.querySelectorAll(`[${attr}]`)].every((el) =>
      (el.getAttribute(attr) ?? "").split(" ").every((ref) => dom.querySelector(`#${ref}`)),
    );

  test("a synced section with Tabs placed twice: two radio groups, labels point at their own copy", () => {
    const dom = parse(twice(page(tabs)));
    expect(duplicateIds(dom)).toEqual([]);
    const [first, second] = [...dom.querySelectorAll(".emvb-tabs")];
    const names = (el: Element | undefined) =>
      [...(el?.querySelectorAll(".emvb-tab-input") ?? [])].map((i) => i.getAttribute("name"));
    expect(names(first)).toEqual(["emvb-tabs-tabs0001", "emvb-tabs-tabs0001"]);
    expect(names(second)).toEqual(["emvb-tabs-tabs0001-r2", "emvb-tabs-tabs0001-r2"]);
    const label = second?.querySelector(".emvb-tab-label");
    expect(second?.querySelector(`#${label?.getAttribute("for")}`)).not.toBeNull();
    for (const attr of ["for", "aria-controls", "aria-labelledby"]) {
      expect(resolves(dom, attr)).toBe(true);
    }
  });

  test("a synced section with a form placed twice: each label focuses its own input", () => {
    const dom = parse(twice(page(form)));
    expect(duplicateIds(dom)).toEqual([]);
    const forms = [...dom.querySelectorAll("form")];
    expect(forms).toHaveLength(2);
    for (const f of forms) {
      for (const label of f.querySelectorAll("label[for]")) {
        expect(f.querySelector(`#${label.getAttribute("for")}`)).not.toBeNull();
      }
    }
    expect(forms[1]?.querySelector(".ec-form-input")?.getAttribute("id")).toBe(
      "emvb-field-field001-r2",
    );
    expect(forms[1]?.querySelector(".ec-form-input")?.getAttribute("name")).toBe("email");
  });

  test("Tabs inside a loop item get one radio group per post", () => {
    const posts: ThemePostFields[] = [
      { ...SAMPLE_POST, id: "a", title: "Alpha" },
      { ...SAMPLE_POST, id: "b", title: "Beta" },
    ];
    const loop = { id: "loop0001", type: "loop", props: {}, children: [tabs] } as LayoutNode;
    const dom = parse(renderPage(page(loop), design, { dynamic: { posts } }).html);
    expect(duplicateIds(dom)).toEqual([]);
    const groups = new Set(
      [...dom.querySelectorAll(".emvb-tab-input")].map((i) => i.getAttribute("name")),
    );
    expect(groups.size).toBe(2);
  });
});
