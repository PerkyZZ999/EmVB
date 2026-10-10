import { describe, expect, test } from "bun:test";
import { validateLayout } from "../validate.ts";
import type { Layout, LayoutNode } from "../schema/layout.ts";
import { changedIds, diffSections, restoreSection } from "./diff.ts";

const h = (id: string, text: string) =>
  ({ id, type: "heading", props: { text, level: 2 } }) as LayoutNode;
const box = (id: string, children: LayoutNode[], label?: string) =>
  ({ id, type: "container", props: {}, children, ...(label ? { label } : {}) }) as LayoutNode;
const page = (...children: LayoutNode[]): Layout =>
  ({
    schemaVersion: 14,
    root: { id: "root0001", type: "container", props: {}, children },
  }) as Layout;

const older = page(
  box("hero0001", [h("head0001", "Old title")], "Hero"),
  box("feat0001", [h("head0002", "Features")]),
  box("cta00001", [h("head0003", "Buy")]),
);
const current = page(
  box("hero0001", [h("head0001", "New title")], "Hero"),
  box("new00001", [h("head0004", "Testimonials")]),
  box("feat0001", [h("head0002", "Features")]),
);

describe("version timeline (W-315)", () => {
  test("sections are compared by id: changed, added, unchanged and removed", () => {
    const changes = diffSections(older, current);
    expect(changes.map((c) => [c.id, c.kind, c.edits])).toEqual([
      ["hero0001", "changed", 1],
      ["new00001", "added", 0],
      ["feat0001", "same", 0],
      ["cta00001", "removed", 0],
    ]);
    expect(changes[0]?.label).toBe("Hero");
    expect(changedIds(changes)).toEqual({
      added: ["new00001"],
      removed: ["cta00001"],
      changed: ["hero0001"],
    });
  });

  test("a reordered section is moved, not changed", () => {
    const swapped = page(
      older.root.children[1] as LayoutNode,
      older.root.children[0] as LayoutNode,
      older.root.children[2] as LayoutNode,
    );
    expect(diffSections(older, swapped).map((c) => c.kind)).toEqual(["moved", "moved", "same"]);
  });

  test("restoring a changed section puts the old one back in its place, nothing else", () => {
    const result = restoreSection(current, older, "hero0001");
    if (!result.ok) throw new Error(result.reason);
    expect(result.layout.root.children.map((c) => c.id)).toEqual([
      "hero0001",
      "new00001",
      "feat0001",
    ]);
    expect(JSON.stringify(result.layout)).toContain("Old title");
    expect(JSON.stringify(result.layout)).toContain("Testimonials");
    expect(validateLayout(result.layout).ok).toBe(true);
  });

  test("a removed section comes back after the section that came before it", () => {
    const result = restoreSection(current, older, "cta00001");
    if (!result.ok) throw new Error(result.reason);
    expect(result.layout.root.children.map((c) => c.id)).toEqual([
      "hero0001",
      "new00001",
      "feat0001",
      "cta00001",
    ]);
  });

  test("ids now used elsewhere on the page are renewed, so the page stays valid", () => {
    // head0003 moved into the hero since that version.
    const moved = page(box("hero0001", [h("head0003", "Buy")]), box("feat0001", []));
    const result = restoreSection(moved, older, "cta00001");
    if (!result.ok) throw new Error(result.reason);
    expect(validateLayout(result.layout).ok).toBe(true);
    expect(result.layout.root.children.length).toBe(3);
    expect(restoreSection(current, older, "nope0001").ok).toBe(false);
  });
});
