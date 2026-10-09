import { describe, expect, test } from "bun:test";
import { defaultElement } from "../elements/index.ts";
import { emptyDesign } from "../schema/design.ts";
import type { Layout, LayoutNode } from "../schema/layout.ts";
import { measurePage, PERF_BUDGETS } from "./meter.ts";
import { layoutScripts, nodeScript, typeMayAddScript } from "./scripts.ts";

const page = (...children: LayoutNode[]): Layout =>
  ({
    schemaVersion: 13,
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
});
