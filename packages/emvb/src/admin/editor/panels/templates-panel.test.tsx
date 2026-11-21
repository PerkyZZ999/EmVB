import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import {
  emptyDesign,
  SECTION_TEMPLATES,
  validateLayout,
  type Layout,
  type LayoutNode,
} from "../../../core/index.ts";
import { newElement, templateDragType, templateIdOf } from "../dnd/new-element.ts";
import { LeftPanel } from "./LeftPanel.tsx";
import { TemplatesPanel, templatePreviewDoc } from "./TemplatesPanel.tsx";
import { cleanup, mount } from "../../../../test/dom/mount.ts";

afterEach(async () => {
  await cleanup();
  sessionStorage.clear();
});

const layout: Layout = {
  schemaVersion: 18,
  root: { id: "root0001", type: "container", props: {}, children: [] },
};

const hero = SECTION_TEMPLATES.find((t) => t.id === "hero") ?? SECTION_TEMPLATES[0];

const left = (templates: boolean) => (
  <LeftPanel
    layout={layout}
    selectedId={null}
    onSelect={() => undefined}
    onAdd={() => undefined}
    {...(templates ? { onTemplate: () => undefined, design: emptyDesign() } : {})}
    onDuplicate={() => undefined}
    onMoveUp={() => undefined}
    onMoveDown={() => undefined}
    onDelete={() => undefined}
  />
);

const tabNamed = (name: string) =>
  [...document.querySelectorAll<HTMLElement>('[role="tab"]')].find(
    (el) => (el.textContent ?? "").trim() === name,
  );

describe("W-1068 starter templates in the Add panel", () => {
  test("W-1068 Add offers Elements | Templates, a labelled tab list, and remembers Templates", async () => {
    await mount(left(true));
    const list = document.querySelector('.emvb-add-switch [role="tablist"]');
    expect(list?.getAttribute("aria-label")).toBe("Add");
    expect(document.querySelector('[data-emvb-panel="add"]') !== null).toBe(true);
    const templates = tabNamed("Templates");
    if (!templates) throw new Error("Templates tab is missing");
    await act(async () => templates.click());
    expect(sessionStorage.getItem("emvb-add-view")).toBe("templates");
    expect(document.querySelector('[data-emvb-panel="templates"]') !== null).toBe(true);
    expect(document.querySelector('[data-emvb-panel="add"]')).toBeNull();
    // A new mount in the same session opens on Templates again.
    await mount(left(true));
    expect(document.querySelector('[data-emvb-panel="templates"]') !== null).toBe(true);
  });

  test("W-1068 without a template handler, Add stays the element list with no switch", async () => {
    sessionStorage.setItem("emvb-add-view", "templates");
    await mount(left(false));
    expect(document.querySelector(".emvb-add-switch")).toBeNull();
    expect(document.querySelector('[data-emvb-panel="add"]') !== null).toBe(true);
  });

  test("W-1068 every template is a keyboard button that inserts it, described by its text", async () => {
    const inserted: string[] = [];
    // Without IntersectionObserver every picture renders at once, so all frames are checked.
    const observer = globalThis.IntersectionObserver;
    Reflect.deleteProperty(globalThis, "IntersectionObserver");
    const root = await mount(
      <TemplatesPanel design={emptyDesign()} onInsert={(id) => inserted.push(id)} />,
    ).finally(() => {
      globalThis.IntersectionObserver = observer;
    });
    const buttons = [...root.querySelectorAll<HTMLButtonElement>("[data-emvb-template]")];
    expect(buttons.map((b) => b.dataset["emvbTemplate"])).toEqual(
      SECTION_TEMPLATES.map((t) => t.id),
    );
    for (const button of buttons) {
      expect(button.tagName).toBe("BUTTON");
      expect(button.type).toBe("button");
      expect(button.tabIndex).toBe(0);
      expect(button.getAttribute("draggable")).toBe("true");
      const described = button.getAttribute("aria-describedby") ?? "";
      expect(document.getElementById(described)?.textContent?.length ?? 0).toBeGreaterThan(0);
    }
    // The pictures are decoration: hidden from screen readers and out of the tab order.
    const previews = [...root.querySelectorAll(".emvb-template-preview")];
    expect(previews.length).toBe(SECTION_TEMPLATES.length);
    expect(previews.every((p) => p.getAttribute("aria-hidden") === "true")).toBe(true);
    const frames = [...root.querySelectorAll("iframe")];
    expect(frames.length).toBe(SECTION_TEMPLATES.length);
    for (const frame of frames) {
      expect(frame.getAttribute("tabindex")).toBe("-1");
      expect(frame.getAttribute("sandbox")).not.toContain("allow-scripts");
    }
    const pricing = root.querySelector<HTMLButtonElement>('[data-emvb-template="pricing"]');
    await act(async () => pricing?.click());
    expect(inserted).toEqual(["pricing"]);
  });

  test("W-1068 search narrows the templates; no match offers Clear search, which refocuses", async () => {
    const root = await mount(
      <TemplatesPanel design={emptyDesign()} onInsert={() => undefined} defaultQuery="pricing" />,
    );
    expect(root.querySelectorAll("[data-emvb-template]").length).toBe(1);
    const none = await mount(
      <TemplatesPanel design={emptyDesign()} onInsert={() => undefined} defaultQuery="zzzz" />,
    );
    expect(none.querySelector('[role="status"]')?.textContent).toContain("No templates match");
    const clear = [...none.querySelectorAll("button")].find(
      (b) => b.textContent === "Clear search",
    );
    await act(async () => clear?.click());
    expect(none.querySelectorAll("[data-emvb-template]").length).toBe(SECTION_TEMPLATES.length);
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Search templates");
  });

  test("W-1068 a template's drag type round-trips and drops as a valid section", () => {
    const type = templateDragType("faq");
    expect(templateIdOf(type)).toBe("faq");
    expect(templateIdOf("heading")).toBeNull();
    const node = newElement(type);
    if (!node) throw new Error("no node");
    expect(node.type).toBe("layout-section");
    const checked = validateLayout({
      ...layout,
      root: { ...layout.root, children: [node] } as LayoutNode,
    } as Layout);
    expect(checked.ok).toBe(true);
    expect(newElement(templateDragType("nope"))).toBeNull();
  });

  test("W-1068 the preview is pinned to the editor's scheme, with no links to follow", () => {
    if (!hero) throw new Error("no hero");
    const design = emptyDesign();
    const light = templatePreviewDoc(hero, design);
    expect(light).toContain('<html data-emvb-theme="light">');
    expect(light).toContain("color-scheme:light");
    expect(light).toContain("background:Canvas;color:CanvasText");
    expect(light).not.toContain("<script");
    expect(light).not.toMatch(/<a\b[^>]*href=/);
    const dark = templatePreviewDoc(hero, design, "dark");
    expect(dark).toContain('<html data-emvb-theme="dark">');
    expect(dark).toContain("color-scheme:dark");
    expect(templatePreviewDoc(hero, design, "dark")).toBe(dark);
  });
});
