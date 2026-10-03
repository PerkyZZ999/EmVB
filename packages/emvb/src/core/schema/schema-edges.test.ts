import { describe, expect, test } from "bun:test";
import {
  isDivBlockNode,
  isFlexboxNode,
  isHeadingNode,
  isTabPanelNode,
  isUnknownNode,
  validateDesign,
  validateLayout,
  type LayoutNode,
} from "../index.ts";

// W-091: survivors in schema/design.ts (77%) and schema/layout.ts (79%): regex anchors and
// lengths, the length-variable units, the icon and image refinements, the node-shape guard
// and the exported type guards.

const design = (variables: Record<string, unknown>) => ({ schemaVersion: 9, variables });
const colorOk = (id: string, value: string) =>
  validateDesign(design({ colors: [{ id, name: "C", value }] })).ok;
const page = (child: unknown) => ({
  schemaVersion: 9,
  root: { id: "root0001", type: "container", props: {}, children: [child] },
});
const issues = (child: unknown) => {
  const result = validateLayout(page(child));
  return result.ok ? [] : result.issues;
};

describe("design variables (W-091)", () => {
  test("variable ids must be lowercase letters, digits or - all the way through", () => {
    expect(colorOk("brand-2", "#ffffff")).toBe(true);
    expect(colorOk("brand!", "#ffffff")).toBe(false);
    expect(colorOk("brand blue", "#ffffff")).toBe(false);
  });

  test("colour values are 3, 4, 6 or 8 hex digits after #, and nothing else", () => {
    expect(["#fff", "#ffff", "#ffffff", "#ffffffff"].map((v) => colorOk("c", v))).toEqual([
      true,
      true,
      true,
      true,
    ]);
    expect(
      ["#f", "#ff", "#fffff", "x#fff", "#fffz", "#ffffffffff"].map((v) => colorOk("c", v)),
    ).toEqual([false, false, false, false, false, false]);
  });

  test.each(["px", "rem", "em", "%"])("font sizes and spacings accept %s", (unit) => {
    const length = { id: "s", name: "S", value: { value: 1, unit } };
    expect(validateDesign(design({ colors: [], fontSizes: [length], spacings: [length] })).ok).toBe(
      true,
    );
  });
});

describe("layout node refinements and shape guard (W-091)", () => {
  test("an icon needs a title unless decorative", () => {
    expect(issues({ id: "icon0001", type: "icon", props: { iconId: "star" } })).toEqual([
      {
        path: "root.children[0].props.title",
        code: "custom",
        message: "Title is required unless the icon is marked decorative.",
      },
    ]);
    expect(
      issues({ id: "icon0001", type: "icon", props: { iconId: "star", title: "" } }),
    ).toHaveLength(1);
    expect(
      issues({ id: "icon0001", type: "icon", props: { iconId: "star", title: "Star" } }),
    ).toEqual([]);
    expect(
      issues({ id: "icon0001", type: "icon", props: { iconId: "star", decorative: true } }),
    ).toEqual([]);
  });

  test("an image's missing alt is reported on props.alt", () => {
    expect(issues({ id: "img00001", type: "image", props: { src: "/a.png", alt: "" } })).toEqual([
      {
        path: "root.children[0].props.alt",
        code: "custom",
        message: "Alt text is required unless the image is marked decorative.",
      },
    ]);
  });

  test("a type that isn't text is described as what it is, not as the node (W-092)", () => {
    const message = (type: unknown) => issues({ id: "abcd0001", type, props: {} })[0]?.message;
    expect([message(5), message(null), message(undefined), message(["heading"])]).toEqual([
      "Invalid input: expected string, received number",
      "Invalid input: expected string, received null",
      "Invalid input: expected string, received undefined",
      "Invalid input: expected string, received array",
    ]);
  });

  test("a child that isn't an object, or whose type isn't a string, is an invalid_type issue", () => {
    expect(issues("text").map(({ path, code }) => ({ path, code }))).toEqual([
      { path: "root.children[0]", code: "invalid_type" },
    ]);
    expect(issues([1]).map(({ path, code }) => ({ path, code }))).toEqual([
      { path: "root.children[0]", code: "invalid_type" },
    ]);
    expect(issues(null).map(({ path, code }) => ({ path, code }))).toEqual([
      { path: "root.children[0]", code: "invalid_type" },
    ]);
    expect(
      issues({ id: "abcd0001", type: 5, props: {} }).map(({ path, code }) => ({ path, code })),
    ).toEqual([{ path: "root.children[0].type", code: "invalid_type" }]);
  });
});

describe("type guards (W-091)", () => {
  const node = (type: string) => ({ id: "node0001", type, props: {}, children: [] }) as LayoutNode;

  test("each guard matches its own type only", () => {
    const types = ["div-block", "flexbox", "heading", "tab-panel", "container", "carousel"];
    const table = types.map((type) => [
      type,
      isDivBlockNode(node(type)),
      isFlexboxNode(node(type)),
      isHeadingNode(node(type)),
      isTabPanelNode(node(type)),
      isUnknownNode(node(type)),
    ]);
    expect(table).toEqual([
      ["div-block", true, false, false, false, false],
      ["flexbox", false, true, false, false, false],
      ["heading", false, false, true, false, false],
      ["tab-panel", false, false, false, true, false],
      ["container", false, false, false, false, false],
      ["carousel", false, false, false, false, true],
    ]);
  });
});
