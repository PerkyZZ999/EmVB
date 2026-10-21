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
    schemaVersion: 17,
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

describe("Restoring a section keeps CSS ids unique (W-517)", () => {
  test("a CSS id another section took since then is left off the restored one", () => {
    const old = page({
      ...box("cta00001", [{ ...h("head0003", "Buy"), htmlId: "buy" }]),
      htmlId: "pricing",
    });
    const now = page({ ...box("new00001", [h("head0004", "Plans")]), htmlId: "pricing" });
    const result = restoreSection(now, old, "cta00001");
    if (!result.ok) throw new Error(result.reason);
    expect(validateLayout(result.layout).ok).toBe(true);
    const restored = result.layout.root.children.find((n) => n.id === "cta00001");
    expect(restored?.htmlId).toBeUndefined();
    expect((restored as { children: LayoutNode[] }).children[0]?.htmlId).toBe("buy");
  });

  test("replacing a section keeps its own CSS id", () => {
    const old = page({ ...box("hero0001", [h("head0001", "Old")]), htmlId: "top" });
    const now = page({ ...box("hero0001", [h("head0001", "New")]), htmlId: "top" });
    const result = restoreSection(now, old, "hero0001");
    if (!result.ok) throw new Error(result.reason);
    expect(result.layout.root.children[0]?.htmlId).toBe("top");
  });
});

describe("Timeline diff ignores key order (W-518)", () => {
  test("the same section with keys in another order is unchanged", () => {
    const saved = page(box("sec00001", [{ ...h("head0001", "Hi"), style: { color: "#ff0000" } }]));
    const edited = page({
      children: [
        {
          style: { color: "#ff0000" },
          props: { level: 2, text: "Hi" },
          type: "heading",
          id: "head0001",
        },
      ],
      props: {},
      type: "container",
      id: "sec00001",
    } as unknown as LayoutNode);
    expect(diffSections(saved, edited).map((c) => [c.kind, c.edits])).toEqual([["same", 0]]);
  });
});

test("W-636: a restored copy of a section never adds a second copy of a live A/B arm", () => {
  const armA = { ...h("head0009", "Variant A"), variant: { test: "hero", arm: "a" } } as LayoutNode;
  const armB = { ...h("head0010", "Variant B"), variant: { test: "hero", arm: "b" } } as LayoutNode;
  const before = page(box("sect0001", [armA]), box("sect0002", [armB]));
  // Arm A was moved into the other section; then the old section is restored.
  const now = page(box("sect0002", [armA, armB]));
  const result = restoreSection(now, before, "sect0001");
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  const marked: string[] = [];
  const walk = (n: LayoutNode): void => {
    if (n.variant) marked.push(`${n.id}:${n.variant.arm}`);
    if ("children" in n && Array.isArray(n.children)) n.children.forEach(walk);
  };
  walk(result.layout.root);
  expect(marked.toSorted()).toEqual(["head0009:a", "head0010:b"]);
  // Restoring a section whose arm is gone keeps it in the test.
  const gone = page(box("sect0002", [armB]));
  const back = restoreSection(gone, before, "sect0001");
  expect(back.ok && JSON.stringify(back.layout)).toContain('"arm":"a"');
});
