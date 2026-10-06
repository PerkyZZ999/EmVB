import { describe, expect, test } from "bun:test";
import { emptyDesign, renderPage, validateLayout, type Layout, type LayoutNode } from "../index.ts";

const page = (children: LayoutNode[], rootLabel?: string): Layout => ({
  schemaVersion: 12,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children,
    ...(rootLabel ? { label: rootLabel } : {}),
  },
});

describe("node labels (W-157, D-045)", () => {
  test("any node, the root and an unknown one included, may carry a label", () => {
    const layout = page(
      [
        { id: "head0001", type: "heading", props: { text: "Hi", level: 1 }, label: "Hero title" },
        { id: "sect0001", type: "layout-section", props: {}, children: [], label: "Pricing band" },
        { id: "unkn0001", type: "future-thing", props: {}, label: "From later" } as LayoutNode,
      ],
      "Page",
    );
    expect(validateLayout(layout).ok).toBe(true);
  });

  test("an empty, blank or over-80-character label is refused", () => {
    const labelled = (label: string) =>
      validateLayout(
        page([{ id: "head0001", type: "heading", props: { text: "Hi", level: 1 }, label }]),
      ).ok;
    expect(labelled("")).toBe(false);
    expect(labelled("   ")).toBe(false);
    expect(labelled("x".repeat(81))).toBe(false);
    expect(labelled("x".repeat(80))).toBe(true);
  });

  test("a label never reaches the public page", () => {
    const { html } = renderPage(
      page([
        { id: "head0001", type: "heading", props: { text: "Hi", level: 1 }, label: "Secret name" },
      ]),
      emptyDesign(),
    );
    expect(html).not.toContain("Secret name");
  });
});
