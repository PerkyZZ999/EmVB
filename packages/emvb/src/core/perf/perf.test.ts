import { describe, expect, test } from "bun:test";
import { defaultElement } from "../elements/index.ts";
import { emptyDesign } from "../schema/design.ts";
import type { Layout, LayoutNode } from "../schema/layout.ts";
import { measurePage, PERF_BUDGETS } from "./meter.ts";
import { layoutScripts, nodeScript, typeMayAddScript } from "./scripts.ts";

const page = (...children: LayoutNode[]): Layout =>
  ({
    schemaVersion: 17,
    root: { id: "root0001", type: "container", props: {}, children },
  }) as Layout;
const heading = (id: string, text = "Hi") =>
  ({ id, type: "heading", props: { text, level: 2 } }) as LayoutNode;
const image = (id: string, extra: Record<string, unknown> = {}) =>
  ({ id, type: "image", props: { src: "/a.jpg", alt: "A", ...extra } }) as LayoutNode;
const box = (id: string, children: LayoutNode[]) =>
  ({ id, type: "container", props: {}, children }) as LayoutNode;

describe("zero-JS badges (W-311)", () => {
  test("plain content adds no script; forms, tabs and dropdown menus do", () => {
    expect(nodeScript(heading("head0001"))).toBeUndefined();
    expect(
      nodeScript({
        id: "form0001",
        type: "form",
        props: { formId: "" },
        children: [],
      } as LayoutNode),
    ).toBeUndefined();
    expect(
      nodeScript({
        id: "form0001",
        type: "form",
        props: { formId: "contact" },
        children: [],
      } as LayoutNode),
    ).toBe("forms");
    expect(
      nodeScript({ ...defaultElement("tabs", "tabs0001"), id: "tabs0001" } as LayoutNode),
    ).toBe("tabs");
    const item = {
      id: "mitm0001",
      type: "menu-item",
      props: { text: "A" },
      children: [],
    } as LayoutNode;
    expect(nodeScript(item)).toBeUndefined();
    expect(nodeScript({ ...item, children: [{ ...item, id: "mitm0002" }] } as LayoutNode)).toBe(
      "menu",
    );
    expect([typeMayAddScript("form"), typeMayAddScript("heading")]).toEqual([true, false]);
  });

  test("layoutScripts lists each script once, with every element that adds it", () => {
    const form = (id: string) =>
      ({ id, type: "form", props: { formId: "contact" }, children: [] }) as LayoutNode;
    const scripts = layoutScripts(page(form("form0001"), box("box00001", [form("form0002")])));
    expect([...scripts]).toEqual([["forms", ["form0001", "form0002"]]]);
    expect(layoutScripts(page(heading("head0001"))).size).toBe(0);
  });
});

describe("performance meter (W-310)", () => {
  test("a plain page is zero-JS and under every budget", () => {
    const report = measurePage(page(heading("head0001")), emptyDesign());
    expect(report.bytes.js).toBe(0);
    expect(report.over).toEqual([]);
    expect(report.bytes.html).toBeGreaterThan(0);
    expect(report.bytes.css).toBeGreaterThan(0);
  });

  test("image weight follows width and height, and the heaviest section comes first", () => {
    const report = measurePage(
      page(
        box("box00001", [heading("head0001")]),
        box("box00002", [image("imag0001", { width: 4000, height: 3000, priority: true })]),
      ),
      emptyDesign(),
    );
    expect(report.bytes.images).toBe(3_000_000);
    expect(report.over).toEqual(["images"]);
    expect(report.sections[0]?.id).toBe("box00002");
    expect(report.sections[0]?.images).toBe(1);
    expect(report.warnings.some((w) => w.startsWith("IMAGES is"))).toBe(true);
    expect(PERF_BUDGETS.images).toBeLessThan(report.bytes.images);
  });

  test("an image without a size is guessed; a hero image not marked Priority is flagged", () => {
    const report = measurePage(page(box("box00001", [image("imag0001")])), emptyDesign());
    expect(report.bytes.images).toBe(120_000);
    expect(report.warnings.some((w) => w.includes("Priority"))).toBe(true);
  });

  test("video embeds are counted and warned about; a form's script is weighed", () => {
    const video = {
      id: "vid00001",
      type: "video",
      props: { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", title: "V" },
    } as LayoutNode;
    const form = {
      id: "form0001",
      type: "form",
      props: { formId: "contact" },
      children: [],
    } as LayoutNode;
    const report = measurePage(page(video, form), emptyDesign());
    expect(report.embeds).toBe(1);
    expect(report.warnings.some((w) => w.includes("video embed"))).toBe(true);
    expect(report.scripts.map((s) => s.script)).toEqual(["forms"]);
    expect(report.bytes.js).toBeGreaterThan(0);
  });

  test("a library video or a video with no URL is not a third-party embed (W-508)", () => {
    const video = (id: string, url: string) =>
      ({ id, type: "video", props: { url, title: "V" } }) as LayoutNode;
    const report = measurePage(
      page(video("vid00001", "/_emdash/api/media/file/clip.mp4"), video("vid00002", "")),
      emptyDesign(),
    );
    expect(report.embeds).toBe(0);
    expect(report.warnings.some((w) => w.includes("video embed"))).toBe(false);
  });
});

test("W-574: an empty image in the first section isn't flagged as a late hero image", () => {
  const empty = image("imge0001", { src: "  " });
  const flagged = (layout: Layout) =>
    measurePage(layout, emptyDesign()).warnings.some((w) => w.includes("Priority"));
  expect(flagged(page(box("box00001", [empty])))).toBe(false);
  // The first image that renders is the one checked.
  expect(flagged(page(box("box00001", [empty, image("imge0002")])))).toBe(true);
  expect(flagged(page(box("box00001", [empty, image("imge0002", { priority: true })])))).toBe(
    false,
  );
});

test("W-635: a background image from a class counts once per element using it", () => {
  const design = {
    ...emptyDesign(),
    classes: [
      { id: "hero-bg", name: "hero-bg", style: { backgroundImage: "url(/bg.jpg)" } },
      { id: "plain", name: "plain", style: {} },
    ],
  } as ReturnType<typeof emptyDesign>;
  const styled = { ...box("box00001", []), classes: ["plain", "hero-bg"] } as LayoutNode;
  const report = measurePage(page(styled), design);
  expect(report.imageCount).toBe(1);
  expect(report.bytes.images).toBeGreaterThan(0);
  const unstyled = { ...box("box00002", []), classes: ["plain"] } as LayoutNode;
  expect(measurePage(page(unstyled), design).imageCount).toBe(0);
});

test("W-645: a background image in a container-query override counts", () => {
  const styled = {
    ...box("box00001", []),
    query: { min: 600, style: { backgroundImage: "url(/wide.jpg)" } },
  } as LayoutNode;
  expect(measurePage(page(styled), emptyDesign()).imageCount).toBe(1);
});

describe("W-671: parts the canvas loaded are weighed", () => {
  test("an image inside a synced section or Loop Item part counts", () => {
    const wrap = (children: unknown[]) =>
      ({
        schemaVersion: 17,
        root: { id: "root0001", type: "container", props: {}, children },
      }) as unknown as Layout;
    const withParts = wrap([
      { id: "sec00001", type: "section", props: { partId: "hero" }, children: [] },
      { id: "loop0001", type: "loop", props: { itemPartId: "card" }, children: [] },
    ]);
    const hero = wrap([
      { id: "img00001", type: "image", props: { src: "/hero.jpg", alt: "Hero" } },
    ]);
    const card = wrap([{ id: "img00002", type: "image", props: { src: "/c.jpg", alt: "Card" } }]);
    expect(measurePage(withParts, emptyDesign()).imageCount).toBe(0);
    const report = measurePage(withParts, emptyDesign(), {
      sectionTemplates: { hero },
      loopTemplates: { card },
    });
    expect(report.imageCount).toBe(2);
    expect(report.sections.find((s) => s.id === "sec00001")?.images).toBe(1);
  });

  test("W-674: a part id with stray spaces is found, like the renderer does", () => {
    const wrap = (children: unknown[]) =>
      ({
        schemaVersion: 17,
        root: { id: "root0001", type: "container", props: {}, children },
      }) as unknown as Layout;
    const withParts = wrap([
      { id: "sec00001", type: "section", props: { partId: " hero " }, children: [] },
    ]);
    const hero = wrap([
      { id: "img00001", type: "image", props: { src: "/hero.jpg", alt: "Hero" } },
    ]);
    expect(measurePage(withParts, emptyDesign(), { sectionTemplates: { hero } }).imageCount).toBe(
      1,
    );
  });
});
