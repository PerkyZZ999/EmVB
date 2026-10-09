import { describe, expect, test } from "bun:test";
import { DESIGN_SCHEMA_VERSION, type DesignSystem } from "../schema/design.ts";
import type { LayoutNode } from "../schema/layout.ts";
import { defaultTagFor, inheritedStyle, styleLayers, traceStyle } from "./trace.ts";

const design: DesignSystem = {
  schemaVersion: DESIGN_SCHEMA_VERSION,
  variables: { colors: [], fonts: [], fontSizes: [], spacings: [] },
  defaults: { h2: { color: "#111111", fontWeight: 700 }, p: { color: "#222222" } },
  classes: [
    {
      id: "first",
      name: "First",
      style: { color: "#aa0000", opacity: 0.9 },
      devices: { mobile: { opacity: 0.5 } },
      states: { hover: { color: "#ff0000" } },
    },
    { id: "second", name: "Second", style: { color: "#00aa00" } },
    { id: "unused", name: "Unused", style: { color: "#0000ff" } },
  ],
};

const heading = (extra: Partial<LayoutNode> = {}) =>
  ({
    id: "head0001",
    type: "heading",
    props: { text: "Hi", level: 2 },
    // Written in the opposite order to the site list: list order must still win (W-318).
    classes: ["second", "first"],
    ...extra,
  }) as LayoutNode;

describe("W-318 style inheritance trace", () => {
  test("W-318 tag defaults per element type", () => {
    expect(defaultTagFor(heading())).toBe("h2");
    expect(defaultTagFor({ ...heading(), props: { text: "x", level: 9 } } as LayoutNode)).toBe(
      "h6",
    );
    expect(defaultTagFor({ id: "t", type: "text", props: { text: "x" } } as LayoutNode)).toBe("p");
    expect(
      defaultTagFor({ id: "t", type: "text", props: { text: "x", tag: "div" } } as LayoutNode),
    ).toBeUndefined();
    expect(
      defaultTagFor({ id: "b", type: "button", props: { text: "x", href: "/a" } } as LayoutNode),
    ).toBe("a");
    expect(
      defaultTagFor({ id: "b", type: "button", props: { text: "x", href: " " } } as LayoutNode),
    ).toBe("button");
    expect(defaultTagFor({ id: "s", type: "section", props: {} } as LayoutNode)).toBeUndefined();
  });

  test("W-318 default < classes in site order < element", () => {
    const trace = traceStyle(heading({ style: { fontWeight: 400 } }), design);
    expect(trace["color"]?.winner).toMatchObject({ kind: "class", label: ".Second" });
    expect(trace["color"]?.overridden.map((s) => s.label)).toEqual([".First", "Site default (H2)"]);
    expect(trace["fontWeight"]?.winner).toMatchObject({ kind: "local", value: 400 });
    expect(trace["fontWeight"]?.overridden[0]?.kind).toBe("default");
    expect(trace["opacity"]?.winner.value).toBe(0.9);
  });

  test("W-318 unapplied classes never show", () => {
    const labels = styleLayers(heading(), design).map((l) => l.source.label);
    expect(labels).not.toContain(".Unused");
  });

  test("W-318 device layers apply only on narrower screens", () => {
    expect(traceStyle(heading(), design, "tablet")["opacity"]?.winner.value).toBe(0.9);
    const mobile = traceStyle(heading(), design, "mobile")["opacity"];
    expect(mobile?.winner).toMatchObject({ label: ".First", layer: "Mobile", value: 0.5 });
  });

  test("W-318 state layers win over normal styles", () => {
    const node = heading({ style: { color: "#000000" }, states: { hover: { opacity: 0.1 } } });
    const trace = traceStyle(node, design, "desktop", "hover");
    expect(trace["color"]?.winner).toMatchObject({ label: ".First", layer: "Hover" });
    expect(trace["opacity"]?.winner).toMatchObject({ kind: "local", layer: "Hover" });
  });

  test("W-318 inherited values leave out the layer being edited", () => {
    const node = heading({
      style: { color: "#000000" },
      devices: { tablet: { color: "#123456" }, mobile: { color: "#654321" } },
    });
    expect(inheritedStyle(node, design, "desktop", "normal")).toEqual({
      color: "#00aa00",
      fontWeight: 700,
      opacity: 0.9,
    });
    expect(inheritedStyle(node, design, "mobile", "normal")).toMatchObject({
      color: "#123456",
      opacity: 0.5,
    });
    expect(inheritedStyle(node, design, "desktop", "hover")["color"]).toBe("#ff0000");
  });

  test("W-318 a plain element with no design inherits nothing", () => {
    const bare = { id: "s", type: "section", props: {}, children: [] } as unknown as LayoutNode;
    expect(traceStyle(bare, { ...design, defaults: undefined })).toEqual({});
    expect(inheritedStyle(bare, design, "desktop", "normal")).toEqual({});
  });
});
