import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import type { Layout, LayoutNode } from "../schema/layout.ts";
import { auditPage } from "./audit.ts";

const page = (...children: LayoutNode[]): Layout => ({
  schemaVersion: 16,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [{ id: "head0001", type: "heading", props: { text: "T", level: 1 } }, ...children],
  },
});
const icon = (id: string, extra: Partial<LayoutNode>): LayoutNode =>
  ({ id, type: "icon", props: { iconId: "star", title: "Star" }, ...extra }) as LayoutNode;
const motion = (layout: Layout) =>
  auditPage(layout, emptyDesign())
    .issues.filter((i) => i.rule === "motion")
    .map((i) => i.nodeId);

describe("W-791 an endlessly looping icon is flagged", () => {
  test("spin or pulse, on the element or a device, is a warning; none or no animation isn't", () => {
    const layout = page(
      icon("icon0001", { style: { iconAnimation: { type: "spin", duration: 1000 } } }),
      icon("icon0002", {
        devices: { mobile: { iconAnimation: { type: "pulse", duration: 800 } } },
      }),
      icon("icon0003", { style: { iconAnimation: { type: "none" } } }),
      icon("icon0004", {}),
    );
    expect(motion(layout)).toEqual(["icon0001", "icon0002"]);
    const issue = auditPage(layout, emptyDesign()).issues.find((i) => i.rule === "motion");
    expect(issue?.severity).toBe("warning");
    expect(issue?.message).toContain("can't pause it");
  });
});
