import { describe, expect, test } from "bun:test";
import { auditPage } from "../a11y/audit.ts";
import { addNodeNear } from "../arrange.ts";
import { applyTokens, spaceScale, typeScale } from "../design/tokens.ts";
import { renderPage } from "../render/index.ts";
import { DESIGN_SCHEMA_VERSION, emptyDesign, type DesignSystem } from "../schema/design.ts";
import { LAYOUT_SCHEMA_VERSION, type Layout, type LayoutNode } from "../schema/layout.ts";
import { nodeChildren } from "../tree-ops.ts";
import { validateLayout } from "../validate.ts";
import {
  PAGE_TEMPLATES,
  resolveTemplateNode,
  SECTION_TEMPLATES,
  TEMPLATE_FALLBACKS,
  templatePageLayout,
  templateSectionNode,
} from "./index.ts";
import type { TemplateData } from "./types.ts";

const page = (children: LayoutNode[] = []): Layout => ({
  schemaVersion: LAYOUT_SCHEMA_VERSION,
  root: { id: "root0001", type: "container", props: {}, children } as Layout["root"],
});

/** A site with Site styles: named colours (with W-1067 dark values), scales, button and card. */
const branded = (): DesignSystem => {
  const design: DesignSystem = {
    schemaVersion: DESIGN_SCHEMA_VERSION,
    variables: {
      colors: [
        { id: "brand", name: "Primary", value: "#1d4ed8", dark: "#93c5fd" },
        { id: "on-brand", name: "On brand", value: "#ffffff", dark: "#0b1220" },
        { id: "ink", name: "Text", value: "#111827", dark: "#f3f4f6" },
        { id: "muted", name: "Muted", value: "#4b5563", dark: "#9ca3af" },
        { id: "paper", name: "Surface", value: "#f8fafc", dark: "#111827" },
        { id: "rule", name: "Border", value: "#e5e7eb", dark: "#374151" },
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
  return applyTokens(
    applyTokens(design, "fontSizes", typeScale({ base: 18, ratio: 1.25 })),
    "spacings",
    spaceScale({ base: 16 }),
  );
};

/** The branded site as a dark-scheme visitor sees it: every colour at its Dark mode value. */
const darkened = (design: DesignSystem): DesignSystem => ({
  ...design,
  variables: {
    ...design.variables,
    colors: design.variables.colors.map((c) => ({ ...c, value: c.dark ?? c.value })),
  },
});

const designs = [
  ["plain", emptyDesign()],
  ["branded", branded()],
  ["branded dark", darkened(branded())],
] as const;

const ids = (node: LayoutNode): string[] => [node.id, ...nodeChildren(node).flatMap(ids)];
const dataIds = (node: TemplateData): string[] => [
  node.id,
  ...(node.children ?? []).flatMap(dataIds),
];
const h1s = (node: LayoutNode): number =>
  (node.type === "heading" && (node.props as { level: number }).level === 1 ? 1 : 0) +
  nodeChildren(node).reduce((sum, child) => sum + h1s(child), 0);

function expectClean(layout: Layout, design: DesignSystem) {
  const checked = validateLayout(layout);
  expect(checked.ok ? [] : checked.issues).toEqual([]);
  expect(renderPage(layout, design).warnings).toEqual([]);
  const errors = auditPage(layout, design).issues.filter((i) => i.severity === "error");
  expect(errors).toEqual([]);
  expect(JSON.stringify(layout)).not.toContain("tpl-");
}

describe("W-1068 starter templates", () => {
  test("W-1068 the sections the plan asks for are all there, with names and descriptions", () => {
    const wanted = ["hero", "features", "pricing", "faq", "team", "testimonials", "cta"];
    for (const id of [...wanted, "contact", "footer"]) {
      expect(SECTION_TEMPLATES.some((t) => t.id === id)).toBe(true);
    }
    expect(PAGE_TEMPLATES.length).toBeGreaterThanOrEqual(2);
    for (const t of [...SECTION_TEMPLATES, ...PAGE_TEMPLATES]) {
      expect(t.name.trim().length).toBeGreaterThan(0);
      expect(t.description.trim().length).toBeGreaterThan(0);
    }
    expect(new Set(SECTION_TEMPLATES.map((t) => t.id)).size).toBe(SECTION_TEMPLATES.length);
  });

  for (const template of SECTION_TEMPLATES) {
    test(`W-1068 ${template.id} is static layout JSON with no media and unique ids`, () => {
      expect(JSON.parse(JSON.stringify(template.node))).toEqual(template.node);
      const raw = validateLayout(page([template.node as unknown as LayoutNode]));
      expect(raw.ok ? [] : raw.issues).toEqual([]);
      const all = dataIds(template.node);
      expect(new Set(all).size).toBe(all.length);
      const json = JSON.stringify(template.node);
      expect(json).not.toMatch(/"(src|url|poster|mediaId|backgroundImage|backgroundVideo)"/);
      expect(json).not.toContain('"image"');
    });

    for (const [kind, design] of designs) {
      test(`W-1068 ${template.id} (${kind}) is valid, renders without warnings and passes the a11y audit`, () => {
        const node = templateSectionNode(template.id, design, page());
        if (!node) throw new Error("no node");
        const added = addNodeNear(page(), node, null);
        if (!added.ok) throw new Error(added.reason);
        expectClean(added.layout, design);
        expect(node.editorLabel).toBe(template.name);
      });
    }
  }

  for (const template of PAGE_TEMPLATES) {
    for (const [kind, design] of designs) {
      test(`W-1068 page ${template.id} (${kind}) is valid, clean and has exactly one H1`, () => {
        const layout = templatePageLayout(template.id, design);
        if (!layout) throw new Error("no layout");
        expectClean(layout, design);
        // A whole page passes the accessibility check with no warnings either.
        expect(auditPage(layout, design).issues.map((i) => i.message)).toEqual([]);
        expect(h1s(layout.root)).toBe(1);
        expect(nodeChildren(layout.root).map((n) => n.editorLabel)).toEqual(
          template.sections.map((id) => SECTION_TEMPLATES.find((s) => s.id === id)?.name),
        );
        const all = ids(layout.root);
        expect(new Set(all).size).toBe(all.length);
      });
    }
  }

  test("W-1068 templates take the site's colours, scales and classes", () => {
    const hero = JSON.stringify(templateSectionNode("hero", branded(), page()));
    expect(hero).toContain('{"var":"fs-4xl","from":"fontSize"}');
    expect(hero).toContain('{"var":"space-3xl","from":"spacing"}');
    expect(hero).toContain('"backgroundColor":{"var":"paper"}');
    expect(hero).toContain('"classes":["btn"]');
    const cta = JSON.stringify(templateSectionNode("cta", branded(), page()));
    expect(cta).toContain('"backgroundColor":{"var":"brand"}');
    expect(cta).toContain('"color":{"var":"on-brand"}');
    const features = templateSectionNode("features", branded(), page());
    const box = JSON.stringify(features);
    expect(box).toContain('"classes":["card"]');
    // The site's card class owns the look: no inline border or background left on the box.
    expect(box).not.toContain('"borderColor"');
    expect(JSON.stringify(templateSectionNode("footer", branded(), page()))).toContain(
      '"borderColor":{"var":"rule"}',
    );
  });

  test("W-1068 without Site styles, neutral fallbacks that suit light and dark pages", () => {
    const plain = emptyDesign();
    const cta = JSON.stringify(templateSectionNode("cta", plain, page()));
    expect(cta).toContain(`"backgroundColor":"${TEMPLATE_FALLBACKS.accent}"`);
    expect(cta).toContain(`"color":"${TEMPLATE_FALLBACKS.onAccent}"`);
    const hero = JSON.stringify(templateSectionNode("hero", plain, page()));
    expect(hero).not.toContain('"var"');
    expect(hero).not.toContain('"classes"');
    expect(hero).toContain(`"backgroundColor":"${TEMPLATE_FALLBACKS.surface}"`);
    // No text colour is forced, so text keeps the page's own (light or dark) colour.
    const intro = SECTION_TEMPLATES.find((t) => t.id === "intro");
    if (!intro) throw new Error("no intro");
    const heading = JSON.stringify(resolveTemplateNode(intro, plain));
    expect(heading).not.toMatch(/"color":/);
  });

  test("W-1068 an inserted section gets new ids every time, never the template's", () => {
    let n = 0;
    const random = () => (n++ * 0.6180339) % 1;
    const first = templateSectionNode("faq", emptyDesign(), page(), { random });
    if (!first) throw new Error("no node");
    const layout = page([first]);
    const again = templateSectionNode("faq", emptyDesign(), layout, { random });
    if (!again) throw new Error("no node");
    const both = [...ids(first), ...ids(again)];
    expect(new Set(both).size).toBe(both.length);
    const template = SECTION_TEMPLATES.find((t) => t.id === "faq");
    const original = new Set(template ? dataIds(template.node) : []);
    expect(both.some((id) => original.has(id))).toBe(false);
    expect(templateSectionNode("nope", emptyDesign(), page())).toBeUndefined();
    expect(templatePageLayout("nope", emptyDesign())).toBeUndefined();
  });

  test("W-1068 the hero's H1 becomes an H2 on a page that already has one", () => {
    const withH1 = page([
      { id: "head0001", type: "heading", props: { text: "Title", level: 1 } } as LayoutNode,
    ]);
    const fresh = templateSectionNode("hero", emptyDesign(), page());
    const second = templateSectionNode("hero", emptyDesign(), withH1);
    if (!fresh || !second) throw new Error("no node");
    expect(h1s(fresh)).toBe(1);
    expect(h1s(second)).toBe(0);
    const inPart = templateSectionNode("hero", emptyDesign(), page(), { noH1: true });
    expect(inPart ? h1s(inPart) : -1).toBe(0);
  });
});
