import { describe, expect, test } from "bun:test";
import { createVariantB, endAbTest } from "../arrange.ts";
import { emptyDesign } from "../schema/design.ts";
import { Layout as LayoutSchema, type Layout, type LayoutNode } from "../schema/layout.ts";
import { renderPage } from "../render/index.ts";
import { findNode } from "../tree-ops.ts";
import { collectAbTests, pickArm, variantShows } from "./variants.ts";

const heading = (id: string, text: string, variant?: LayoutNode["variant"]) =>
  ({
    id,
    type: "heading",
    props: { text, level: 2 },
    ...(variant ? { variant } : {}),
  }) as LayoutNode;
const page = (...children: LayoutNode[]): Layout =>
  ({
    schemaVersion: 13,
    root: { id: "root0001", type: "container", props: {}, children },
  }) as Layout;
const ab = page(
  heading("head0001", "Hello A", { test: "hero", arm: "a" }),
  heading("head0002", "Hello B", { test: "hero", arm: "b", split: 20 }),
);
let seed = 0;
const random = () => ((seed = (seed * 9301 + 49297) % 233280), seed / 233280);

describe("edge A/B variants (W-312)", () => {
  test("the schema takes a test name, an arm and a 1–99 split, and nothing else", () => {
    expect(LayoutSchema.safeParse(ab).success).toBe(true);
    for (const variant of [
      { test: "Hero!", arm: "a" },
      { test: "hero", arm: "c" },
      { test: "hero", arm: "b", split: 100 },
      { test: "hero", arm: "b", extra: 1 },
    ]) {
      expect(LayoutSchema.safeParse(page(heading("head0001", "x", variant as never))).success).toBe(
        false,
      );
    }
  });

  test("the public page renders only the visitor's arm, and arm A without a decision", () => {
    const html = (arms?: Record<string, "a" | "b">) =>
      renderPage(ab, emptyDesign(), arms ? { dynamic: { abArms: arms } } : {}).html;
    expect(html({ hero: "b" })).toContain("Hello B");
    expect(html({ hero: "b" })).not.toContain("Hello A");
    expect(html()).toContain("Hello A");
    expect(html()).not.toContain("Hello B");
  });

  test("the editor shows every arm, marked", () => {
    const { html } = renderPage(ab, emptyDesign(), { mode: "editor" });
    expect(html).toContain("Hello A");
    expect(html).toContain("Hello B");
    expect(html).toContain('data-emvb-variant="hero · B"');
  });

  test("tests are collected with B's split; a cookie keeps the arm, a bad one is re-picked", () => {
    expect(collectAbTests(ab)).toEqual([{ test: "hero", split: 20 }]);
    const t = { test: "hero", split: 20 };
    expect(pickArm(t, "b", 0.99)).toEqual({ arm: "b", fresh: false });
    expect(pickArm(t, "zzz", 0.1)).toEqual({ arm: "b", fresh: true });
    expect(pickArm(t, undefined, 0.5)).toEqual({ arm: "a", fresh: true });
    expect(variantShows(heading("x0000001", "x"), {})).toBe(true);
  });

  test("Create variant B marks the element A and adds a selected copy as B; ending keeps one", () => {
    const start = page(heading("head0001", "Hello"));
    const made = createVariantB(start, "head0001", random);
    if (!made.ok) throw new Error(made.reason);
    const [a, b] = made.layout.root.children;
    expect(a?.variant).toEqual({ test: "test-head0001", arm: "a" });
    expect(b?.variant).toEqual({ test: "test-head0001", arm: "b" });
    expect(made.selected).toBe(b?.id ?? "");
    expect(LayoutSchema.safeParse(made.layout).success).toBe(true);
    expect(createVariantB(made.layout, "head0001").ok).toBe(false);
    const ended = endAbTest(made.layout, made.selected);
    if (!ended.ok) throw new Error(ended.reason);
    expect(ended.layout.root.children.length).toBe(1);
    expect(findNode(ended.layout, made.selected)?.variant).toBeUndefined();
    expect(findNode(ended.layout, "head0001")).toBeUndefined();
  });
});
