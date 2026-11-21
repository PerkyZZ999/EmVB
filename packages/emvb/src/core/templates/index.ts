import { withFreshIds } from "../arrange.ts";
import { siteTokens, type RecipeTokens } from "../recipes/index.ts";
import type { DesignSystem } from "../schema/design.ts";
import { LAYOUT_SCHEMA_VERSION, type Layout, type LayoutNode } from "../schema/layout.ts";
import { nodeChildren } from "../tree-ops.ts";
import { PAGE_TEMPLATES, type PageTemplate } from "./pages.ts";
import { SECTION_TEMPLATES, type SectionTemplate } from "./sections.ts";
import type { TemplateData } from "./types.ts";

export { PAGE_TEMPLATES, SECTION_TEMPLATES, type PageTemplate, type SectionTemplate };

/** Neutral stand-ins when the site has no matching Site styles colour (W-1068). */
export const TEMPLATE_FALLBACKS = {
  accent: "#2563eb",
  onAccent: "#ffffff",
  /** Translucent grey: a tint on light and dark pages alike. */
  surface: "#8080801a",
  line: "#80808040",
} as const;

/** Style keys a site's button or card class takes over from the template's own look. */
const SKIN = new Set([
  "backgroundColor",
  "color",
  "borderWidth",
  "borderStyle",
  "borderColor",
  "borderRadius",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "fontWeight",
  "boxShadow",
]);

type Tokens = RecipeTokens & { line?: RecipeTokens["accent"] };

function templateTokens(design: DesignSystem): Tokens {
  const t: Tokens = siteTokens(design);
  const line = design.variables.colors.find((c) =>
    /\b(border|line|divider|outline)\b/.test(`${c.id} ${c.name}`.toLowerCase()),
  );
  if (line) t.line = { var: line.id };
  return t;
}

/** The value a `tpl-*` reference stands for, or undefined to leave the property unset. */
function tokenValue(name: string, t: Tokens): unknown {
  switch (name) {
    case "accent":
      return t.accent ?? TEMPLATE_FALLBACKS.accent;
    case "on-accent":
      return t.accent ? (t.onAccent ?? TEMPLATE_FALLBACKS.onAccent) : TEMPLATE_FALLBACKS.onAccent;
    case "ink":
      return t.ink;
    case "muted":
      return t.muted;
    case "surface":
      return t.surface ?? TEMPLATE_FALLBACKS.surface;
    case "line":
      return t.line ?? TEMPLATE_FALLBACKS.line;
    case "display":
    case "heading":
    case "subheading":
    case "body":
    case "small":
    case "gap":
    case "tight":
      return t[name];
    case "section":
      return t.sectionSpace;
    case "block":
      return t.blockSpace;
    default:
      return undefined;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function resolveValue(value: unknown, t: Tokens): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => resolveValue(item, t)).filter((item) => item !== undefined);
  }
  if (!isRecord(value)) return value;
  const ref = value["var"];
  if (typeof ref === "string" && ref.startsWith("tpl-")) return tokenValue(ref.slice(4), t);
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    const resolved = resolveValue(item, t);
    if (resolved !== undefined) out[key] = resolved;
  }
  return out;
}

const PLACEHOLDER_CLASSES = { "tpl-button": "buttonClass", "tpl-card": "cardClass" } as const;

/** Swaps `tpl-button` / `tpl-card` for the site's class; that class then owns the look. */
function withSiteClass(node: Record<string, unknown>, t: Tokens): Record<string, unknown> {
  const classes = Array.isArray(node["classes"]) ? (node["classes"] as string[]) : [];
  if (classes.length === 0) return node;
  const kept: string[] = [];
  let skinned = false;
  for (const cls of classes) {
    const key = PLACEHOLDER_CLASSES[cls as keyof typeof PLACEHOLDER_CLASSES];
    if (!key) {
      kept.push(cls);
      continue;
    }
    const site = t[key];
    if (site) {
      kept.push(site);
      skinned = true;
    }
  }
  const { classes: _classes, ...rest } = node;
  const out: Record<string, unknown> = kept.length > 0 ? { ...rest, classes: kept } : rest;
  if (skinned && isRecord(out["style"])) {
    const style = Object.fromEntries(
      Object.entries(out["style"]).filter(([key]) => !SKIN.has(key)),
    );
    if (Object.keys(style).length > 0) out["style"] = style;
    else delete out["style"];
  }
  return out;
}

function resolveData(data: TemplateData, t: Tokens, demoteH1: boolean): LayoutNode {
  const { children, ...rest } = data;
  let node = withSiteClass(resolveValue(rest, t) as Record<string, unknown>, t);
  if (demoteH1 && node["type"] === "heading" && isRecord(node["props"])) {
    if (node["props"]["level"] === 1) node = { ...node, props: { ...node["props"], level: 2 } };
  }
  if (children) node["children"] = children.map((child) => resolveData(child, t, demoteH1));
  return node as LayoutNode;
}

function hasH1(node: LayoutNode): boolean {
  if (node.type === "heading" || node.type === "post-title") {
    if ((node.props as { level?: number }).level === 1) return true;
  }
  return nodeChildren(node).some(hasH1);
}

/**
 * A starter template's node with the site's styles filled in (W-1068). Its H1 becomes an H2 when
 * `hasPageH1` says the page already has one. Ids are the template's own: give it fresh ones.
 */
export function resolveTemplateNode(
  template: SectionTemplate,
  design: DesignSystem,
  hasPageH1 = false,
): LayoutNode {
  const node = resolveData(template.node, templateTokens(design), hasPageH1);
  return { ...node, editorLabel: template.name } as LayoutNode;
}

export const sectionTemplate = (id: string): SectionTemplate | undefined =>
  SECTION_TEMPLATES.find((template) => template.id === id);

export const pageTemplate = (id: string): PageTemplate | undefined =>
  PAGE_TEMPLATES.find((template) => template.id === id);

/**
 * A starter section ready to insert into `layout` (W-1068): the site's styles, at most one H1 on
 * the page, and ids that are new and unused on `layout` (the paste and duplicate path). `noH1`
 * keeps every heading at H2 or below, for parts that land on pages with their own H1.
 */
export function templateSectionNode(
  id: string,
  design: DesignSystem,
  layout: Layout | null,
  opts: { random?: () => number; noH1?: boolean } = {},
): LayoutNode | undefined {
  const template = sectionTemplate(id);
  if (!template) return undefined;
  const demote = opts.noH1 === true || (layout ? hasH1(layout.root) : false);
  const node = resolveTemplateNode(template, design, demote);
  return withFreshIds(layout ?? emptyPage(), node, opts.random);
}

const emptyPage = (): Layout => ({
  schemaVersion: LAYOUT_SCHEMA_VERSION,
  root: { id: "tplroot0", type: "container", props: {}, children: [] },
});

/** A new page's layout from a page template (W-1068): its sections in order, one H1, fresh ids. */
export function templatePageLayout(
  id: string,
  design: DesignSystem,
  random: () => number = Math.random,
): Layout | undefined {
  const page = pageTemplate(id);
  if (!page) return undefined;
  const children: LayoutNode[] = [];
  let h1 = false;
  for (const sectionId of page.sections) {
    const template = sectionTemplate(sectionId);
    if (!template) continue;
    const node = resolveTemplateNode(template, design, h1);
    h1 ||= hasH1(node);
    children.push(node);
  }
  const root = withFreshIds(
    emptyPage(),
    {
      id: "tplroot1",
      type: "container",
      props: {},
      style: { flexDirection: "column" },
      children,
    } as LayoutNode,
    random,
  );
  return { schemaVersion: LAYOUT_SCHEMA_VERSION, root } as Layout;
}
