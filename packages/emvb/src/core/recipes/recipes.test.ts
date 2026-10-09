import { describe, expect, test } from "bun:test";
import { auditPage } from "../a11y/audit.ts";
import { addNodeNear, addSectionNear, withFreshIds } from "../arrange.ts";
import { spaceScale, typeScale, applyTokens } from "../design/tokens.ts";
import { renderPage } from "../render/index.ts";
import { DESIGN_SCHEMA_VERSION, emptyDesign, type DesignSystem } from "../schema/design.ts";
import { LAYOUT_SCHEMA_VERSION, type Layout, type LayoutNode } from "../schema/layout.ts";
import { validateLayout } from "../validate.ts";
import { recipeNode, SECTION_RECIPES, siteTokens } from "./index.ts";

const page = (children: LayoutNode[] = []): Layout => ({
  schemaVersion: LAYOUT_SCHEMA_VERSION,
  root: { id: "root0001", type: "container", props: {}, children } as Layout["root"],
});

const branded = (): DesignSystem => {
  let design: DesignSystem = {
    schemaVersion: DESIGN_SCHEMA_VERSION,
    variables: {
      colors: [
        { id: "brand", name: "Primary", value: "#1d4ed8" },
        { id: "ink", name: "Text", value: "#111827" },
        { id: "paper", name: "Surface", value: "#f8fafc" },
      ],
      fonts: [],
      fontSizes: [],
      spacings: [],
    },
    classes: [
      { id: "btn", name: "Button", style: { backgroundColor: { var: "brand" } } },
      { id: "card", name: "Card", style: { borderRadius: { value: 16, unit: "px" } } },
    ],
  };
  design = applyTokens(design, "fontSizes", typeScale({ base: 18, ratio: 1.25 }));
  return applyTokens(design, "spacings", spaceScale({ base: 16 }));
};

const json = (node: unknown) => JSON.stringify(node);
const seq = () => {
  let n = 0;
  return () => (n++ * 0.6180339) % 1;
};

describe("W-320 adaptive section recipes", () => {
  for (const design of [emptyDesign(), branded()]) {
    const kind = design.variables.colors.length ? "branded" : "plain";
    for (const recipe of SECTION_RECIPES) {
      test(`W-320 ${recipe.id} (${kind}) is valid, renders cleanly and passes the a11y audit`, () => {
        const node = recipeNode(recipe.id, design, page());
        if (!node) throw new Error("no node");
        const added = addNodeNear(page(), node, null);
        if (!added.ok) throw new Error(added.reason);
        const checked = validateLayout(added.layout);
        expect(checked.ok ? [] : checked.issues).toEqual([]);
        expect(renderPage(added.layout, design).warnings).toEqual([]);
        const errors = auditPage(added.layout, design).issues.filter(
          (i) => i.severity === "error" && i.rule !== "no-h1",
        );
        expect(errors).toEqual([]);
        expect(node.label).toBe(recipe.name);
      });
    }
  }

  test("W-320 recipes pick up the site's colours, scales and classes", () => {
    const t = siteTokens(branded());
    expect(t.accent).toEqual({ var: "brand" });
    expect(t.ink).toEqual({ var: "ink" });
    expect(t.surface).toEqual({ var: "paper" });
    expect(t.display).toEqual({ var: "fs-4xl", from: "fontSize" });
    expect(t.body).toEqual({ var: "fs-m", from: "fontSize" });
    expect(t.sectionSpace).toEqual({ var: "space-3xl", from: "spacing" });
    expect(t.buttonClass).toBe("btn");
    expect(t.cardClass).toBe("card");
    expect(t.used).toContain("Primary");
    expect(t.used).toContain(".Button");
    const hero = json(recipeNode("hero", branded(), page()));
    expect(hero).toContain('"classes":["btn"]');
    expect(hero).toContain('{"var":"fs-4xl","from":"fontSize"}');
    const features = json(recipeNode("features", branded(), page()));
    expect(features).toContain('"classes":["card"]');
  });

  test("W-320 without Site styles, plain values stand in", () => {
    const t = siteTokens(emptyDesign());
    expect(t.accent).toBeUndefined();
    expect(t.display).toEqual({ value: 48, unit: "px" });
    expect(t.used).toEqual([]);
    expect(json(recipeNode("hero", emptyDesign(), page()))).not.toContain('"var"');
  });

  test("W-320 text on the accent reads: white on dark, near-black on light", () => {
    const withAccent = (value: string): DesignSystem => ({
      ...emptyDesign(),
      variables: {
        colors: [{ id: "brand", name: "Brand", value }],
        fonts: [],
        fontSizes: [],
        spacings: [],
      },
    });
    expect(siteTokens(withAccent("#1d4ed8")).onAccent).toBe("#ffffff");
    expect(siteTokens(withAccent("#fde047")).onAccent).toBe("#111111");
  });

  test("W-320 the hero is the H1 only when the page has none", () => {
    const level = (node: LayoutNode | undefined) => json(node).match(/"level":(\d)/)?.[1];
    expect(level(recipeNode("hero", emptyDesign(), page()))).toBe("1");
    const withH1 = page([
      { id: "head0001", type: "heading", props: { text: "Title", level: 1 } } as LayoutNode,
    ]);
    expect(level(recipeNode("hero", emptyDesign(), withH1))).toBe("2");
  });

  test("W-320 two inserts never share ids and unknown recipes are nothing", () => {
    const random = seq();
    const first = recipeNode("faq", emptyDesign(), page(), random);
    if (!first) throw new Error("no node");
    const layout = page([first]);
    const again = withFreshIds(layout, first);
    const ids = (n: LayoutNode): string[] => [
      n.id,
      ...((n as { children?: LayoutNode[] }).children ?? []).flatMap(ids),
    ];
    const both = [...ids(first), ...ids(again)];
    expect(new Set(both).size).toBe(both.length);
    expect(recipeNode("nope", emptyDesign(), page())).toBeUndefined();
  });

  test("W-320 a recipe goes after the outermost Section, never inside one", () => {
    const inner = { id: "text0001", type: "text", props: { text: "x" } } as LayoutNode;
    const nested = {
      id: "sect0002",
      type: "layout-section",
      props: {},
      children: [inner],
    } as unknown as LayoutNode;
    const outer = {
      id: "sect0001",
      type: "layout-section",
      props: {},
      children: [nested],
    } as unknown as LayoutNode;
    const after = {
      id: "sect0003",
      type: "layout-section",
      props: {},
      children: [],
    } as unknown as LayoutNode;
    const layout = page([outer, after]);
    const node = recipeNode("cta", emptyDesign(), layout);
    if (!node) throw new Error("no node");
    const added = addSectionNear(layout, node, "text0001");
    if (!added.ok) throw new Error(added.reason);
    expect(added.parentId).toBe("root0001");
    const ids = (added.layout.root as { children: LayoutNode[] }).children.map((c) => c.id);
    expect(ids).toEqual(["sect0001", node.id, "sect0003"]);
    const none = addSectionNear(page([inner]), node, "text0001");
    expect(none.ok && none.parentId).toBe("root0001");
  });
});
