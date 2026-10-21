import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import type { Layout, LayoutNode } from "../schema/layout.ts";
import { applyA11yFix, auditPage } from "./audit.ts";

const SQUARE = '<svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg>';
const page = (...children: LayoutNode[]): Layout => ({
  schemaVersion: 17,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [
      { id: "head0001", type: "heading", props: { text: "Title", level: 1 } },
      ...children,
    ],
  },
});
const svg = (id: string, props: Record<string, unknown>): LayoutNode =>
  ({ id, type: "svg", props: { markup: SQUARE, ...props } }) as LayoutNode;
const svgIssues = (layout: Layout) =>
  auditPage(layout, emptyDesign()).issues.filter((i) => i.nodeId.startsWith("svg"));

describe("W-786 an SVG needs a name unless decorative", () => {
  test("an untitled, non-decorative SVG is flagged and can be marked decorative", () => {
    const layout = page(svg("svg00001", {}));
    const [issue] = svgIssues(layout);
    expect(issue?.rule).toBe("image-alt");
    expect(issue?.message).toContain("SVG has no title");
    const fixed = issue ? applyA11yFix(layout, issue) : layout;
    expect(svgIssues(fixed)).toEqual([]);
  });

  test("a Title, a <title> in the markup, or decorative is enough", () => {
    const layout = page(
      svg("svg00002", { title: "Logo" }),
      svg("svg00003", { markup: '<svg viewBox="0 0 10 10"><title>Logo</title><rect/></svg>' }),
      svg("svg00004", { decorative: true }),
      svg("svg00005", { title: "   " }),
    );
    expect(svgIssues(layout).map((i) => i.nodeId)).toEqual(["svg00005"]);
  });
});
