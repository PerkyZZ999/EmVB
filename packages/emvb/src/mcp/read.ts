import { z } from "zod";
import {
  auditPage,
  BUNDLED_ICON_IDS,
  byteLength,
  defaultElement,
  ELEMENT_DESCRIPTORS,
  findNode,
  isParentNode,
  LAYOUT_SCHEMA_VERSION,
  SECTION_RECIPES,
  siteTokens,
  validateLayout,
  type DesignSystem,
  type ElementType,
  type Layout,
  type LayoutNode,
} from "../core/index.ts";
import { parentChildRefusal } from "../core/arrange.ts";
import { clipText } from "../core/limits.ts";
import { KNOWN_NODE_SCHEMAS } from "../core/schema/layout.ts";
import { requiredFieldIssues, requiredFieldIssueText } from "../core/forms/binding.ts";
import { isFormNode } from "../core/schema/layout.ts";
import { forEachNode, nodeChildren } from "../core/tree-ops.ts";
import { McpToolError } from "./errors.ts";
import type { EmvbPorts, PageRecord } from "./ports.ts";

/** A stored layout the tools can work on, or a NOT_FOUND / INVALID_LAYOUT error the agent can read. */
async function loadPage(
  ports: EmvbPorts,
  pageId: string,
): Promise<{
  page: PageRecord;
  layout: Layout;
}> {
  const page = await ports.getPage(pageId);
  if (!page)
    throw new McpToolError("NOT_FOUND", `No EmVB page with id ${pageId}. Call list_pages.`);
  const result = validateLayout(page.layout);
  if (!result.ok) {
    throw new McpToolError(
      "INVALID_LAYOUT",
      "The stored layout of this page can't be read. Open it in the editor to repair it.",
    );
  }
  return { page, layout: result.layout };
}

export type OutlineNode = { id: string; type: string; label?: string; children?: OutlineNode[] };

/** The tree without props or styles: cheap orientation for an agent (plan § 3 get_layout). */
function outlineOf(node: LayoutNode): OutlineNode {
  const kids = nodeChildren(node);
  const text = summaryText(node);
  return {
    id: node.id,
    type: node.type,
    ...(node.label || text ? { label: node.label ?? text } : {}),
    ...(kids.length > 0 ? { children: kids.map(outlineOf) } : {}),
  };
}

function summaryText(node: LayoutNode): string | undefined {
  const props = (node as { props?: Record<string, unknown> }).props ?? {};
  const text = typeof props["text"] === "string" ? props["text"] : undefined;
  if (!text) return undefined;
  return text.length > 60 ? `${clipText(text, 57)}…` : text;
}

function stats(layout: Layout) {
  let nodes = 0;
  let depth = 0;
  const walk = (node: LayoutNode, d: number) => {
    nodes += 1;
    depth = Math.max(depth, d);
    for (const child of nodeChildren(node)) walk(child, d + 1);
  };
  walk(layout.root, 1);
  return { nodes, depth, bytes: byteLength(layout) };
}

// ---------------------------------------------------------------- list_pages

export const ListPagesInput = z.strictObject({
  cursor: z.string().max(512).optional(),
  limit: z.number().int().min(1).max(50).optional(),
});
export const ListPagesOutput = z.object({
  pages: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      slug: z.string(),
      status: z.string(),
      hasDraft: z.boolean(),
      updatedAt: z.string(),
    }),
  ),
  nextCursor: z.string().optional(),
});

export async function listPages(ports: EmvbPorts, input: z.infer<typeof ListPagesInput>) {
  const result = await ports.listPages({
    limit: input.limit ?? 20,
    ...(input.cursor ? { cursor: input.cursor } : {}),
  });
  return { pages: result.pages, ...(result.nextCursor ? { nextCursor: result.nextCursor } : {}) };
}

// ---------------------------------------------------------------- get_layout

export const GetLayoutInput = z.strictObject({
  pageId: z.string().min(1).max(128),
  format: z.enum(["full", "outline"]).optional(),
  nodeId: z.string().min(1).max(64).optional(),
});
export const GetLayoutOutput = z.object({
  pageId: z.string(),
  rev: z.string(),
  schemaVersion: z.number(),
  title: z.string(),
  slug: z.string(),
  layout: z.unknown().optional(),
  outline: z.unknown().optional(),
  stats: z.object({ nodes: z.number(), depth: z.number(), bytes: z.number() }),
});

export async function getLayout(ports: EmvbPorts, input: z.infer<typeof GetLayoutInput>) {
  const { page, layout } = await loadPage(ports, input.pageId);
  const node = input.nodeId ? findNode(layout, input.nodeId) : layout.root;
  if (!node)
    throw new McpToolError("NOT_FOUND", `No element with id ${input.nodeId} on this page.`);
  const base = {
    pageId: page.id,
    rev: page.rev,
    schemaVersion: LAYOUT_SCHEMA_VERSION,
    title: page.title,
    slug: page.slug,
    stats: stats(layout),
  };
  if (input.format === "outline") return { ...base, outline: outlineOf(node) };
  return { ...base, layout: input.nodeId ? node : layout };
}

// ---------------------------------------------------------------- list_element_types

const SCHEMAS = new Map(
  KNOWN_NODE_SCHEMAS.map((schema) => [
    (schema.shape.type as unknown as { value: string }).value,
    schema.shape.props,
  ]),
);

const sample = (type: string): LayoutNode =>
  Object.assign({}, defaultElement(type as ElementType, "sample"), { id: "sample" }) as LayoutNode;

/** Which parent types accept `type`, by the same rule drag-and-drop and save use (W-354). */
function allowedParents(type: string): string[] {
  const child = sample(type);
  return ELEMENT_DESCRIPTORS.map((d) => d.type).filter((parentType) => {
    const parent = sample(parentType);
    if (!isParentNode(parent)) return false;
    return parentChildRefusal(parent, child, parentType === "form") === undefined;
  });
}

export const ListElementTypesInput = z.strictObject({ type: z.string().max(64).optional() });
export const ListElementTypesOutput = z.object({
  elements: z.array(
    z.object({
      type: z.string(),
      name: z.string(),
      group: z.string(),
      container: z.boolean(),
      allowedParents: z.array(z.string()),
      props: z.unknown(),
      example: z.unknown(),
      notes: z.string().optional(),
    }),
  ),
});

/**
 * W-474: what an agent can't learn from the props schema alone, found in the live skill run.
 * Icon ids, where form and loop ids come from, and which types belong together.
 */
const ELEMENT_NOTES: Record<string, string> = {
  icon: `iconId is one of the bundled icons: ${BUNDLED_ICON_IDS.join(", ")}. Colour it with style.color; size is in px. Set decorative: true next to a text label, or give it a title.`,
  button: `iconId takes the same bundled icon ids as the icon element (${BUNDLED_ICON_IDS.slice(0, 6).join(", ")}, …). Style buttons with a site class (see get_site_styles classes) rather than per-button styles.`,
  form: "formId is the id of a form made in the EmDash admin under Forms; there is no tool to list or create forms, so ask the person for it. An unbound form (empty formId) shows only in the editor, not on the live page. Each field's field prop must match a field name in that form; add a submit last.",
  loop: "A collection Loop needs collection (a collection slug such as posts); ask the person which one if unsure. The children are the item template (post-title, post-image, post-excerpt, post-link, post-date), plus an optional loop-empty shown when there are no entries.",
  tabs: "Holds only tab-panel children; each tab-panel's label is its tab. Put content inside the panels.",
  accordion:
    "Holds only accordion-item children; summary is the visible question, the children are the answer. Set open: true on at most one item.",
  "layout-section":
    "Use one per page band. props.contentWidth caps the inner width (for example 1200 px) while the background spans the screen.",
};

export function listElementTypes(input: z.infer<typeof ListElementTypesInput>) {
  const descriptors = input.type
    ? ELEMENT_DESCRIPTORS.filter((d) => d.type === input.type)
    : ELEMENT_DESCRIPTORS;
  if (input.type && descriptors.length === 0) {
    throw new McpToolError("NOT_FOUND", `Unknown element type ${input.type}.`);
  }
  return {
    elements: descriptors.map((d) => {
      const props = SCHEMAS.get(d.type);
      const example = sample(d.type);
      const entry: Record<string, unknown> = {
        type: d.type,
        name: d.name,
        group: d.group,
        container: isParentNode(example),
        allowedParents: allowedParents(d.type),
        props: props ? z.toJSONSchema(props, { unrepresentable: "any" }) : {},
        example: { type: example.type, props: (example as { props?: unknown }).props ?? {} },
      };
      if (ELEMENT_NOTES[d.type]) entry["notes"] = ELEMENT_NOTES[d.type];
      return entry;
    }),
  };
}

// ---------------------------------------------------------------- get_site_styles

export const GetSiteStylesInput = z.strictObject({});
export const GetSiteStylesOutput = z.object({
  revision: z.string().nullable(),
  publishedRevision: z.string().nullable(),
  unpublished: z.boolean(),
  design: z.unknown(),
  tokens: z.unknown(),
});

export async function getSiteStyles(ports: EmvbPorts) {
  const state = await ports.getDesign();
  return { ...state, tokens: siteTokens(state.design) };
}

// ---------------------------------------------------------------- list_section_recipes

export const ListRecipesInput = z.strictObject({});
export const ListRecipesOutput = z.object({
  recipes: z.array(z.object({ id: z.string(), name: z.string(), description: z.string() })),
});

export const listSectionRecipes = () => ({
  recipes: SECTION_RECIPES.map((r) => ({ id: r.id, name: r.name, description: r.description })),
});

// ---------------------------------------------------------------- describe_page

const TEXT_TYPES = new Set(["heading", "text", "label", "link", "button", "list"]);

function textOf(node: LayoutNode): string {
  const props = (node as { props?: Record<string, unknown> }).props ?? {};
  if (Array.isArray(props["items"])) return props["items"].join(" · ");
  return typeof props["text"] === "string" ? props["text"] : "";
}

function collect(node: LayoutNode, out: { text: string[]; headings: string[]; media: number }) {
  if (node.type === "heading") {
    const level = (node as { props: { level: number } }).props.level;
    out.headings.push(`H${level} ${textOf(node)}`);
  }
  if (TEXT_TYPES.has(node.type)) out.text.push(textOf(node));
  if (node.type === "image" || node.type === "video") out.media += 1;
  for (const child of nodeChildren(node)) collect(child, out);
}

export const DescribePageInput = z.strictObject({ pageId: z.string().min(1).max(128) });
export const DescribePageOutput = z.object({
  pageId: z.string(),
  title: z.string(),
  summary: z.string(),
  sections: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      label: z.string().optional(),
      headings: z.array(z.string()),
      excerpt: z.string(),
      media: z.number(),
    }),
  ),
  headingOutline: z.array(z.string()),
  /** W-500: things that make content vanish without an error, such as hidden on every device. */
  warnings: z.array(z.object({ nodeId: z.string(), message: z.string() })).optional(),
  wordCount: z.number(),
  images: z
    .array(z.object({ id: z.string(), alt: z.string(), src: z.string(), decorative: z.boolean() }))
    .optional(),
});

/** W-474: a review needs the alt texts next to what the images are, which only get_layout had. */
function imagesOf(root: LayoutNode) {
  const found: { id: string; alt: string; src: string; decorative: boolean }[] = [];
  const walk = (node: LayoutNode) => {
    if (node.type === "image" && found.length < 50) {
      const props = node.props as { alt?: unknown; src?: unknown; decorative?: unknown };
      found.push({
        id: node.id,
        alt: typeof props.alt === "string" ? clip(props.alt, 300) : "",
        src: typeof props.src === "string" ? clip(props.src, 300) : "",
        decorative: props.decorative === true,
      });
    }
    for (const child of nodeChildren(node)) walk(child);
  };
  walk(root);
  return found;
}

/** W-500: elements hidden on desktop, tablet and mobile never show; the agent should know. */
function hiddenEverywhere(root: LayoutNode) {
  const warnings: { nodeId: string; message: string }[] = [];
  const walk = (node: LayoutNode) => {
    const hidden = new Set((node as { hiddenOn?: string[] }).hiddenOn ?? []);
    if (hidden.has("desktop") && hidden.has("tablet") && hidden.has("mobile")) {
      warnings.push({
        nodeId: node.id,
        message:
          node.id === root.id
            ? "The whole page is hidden on every device, so visitors see an empty page. Unset hiddenOn on the root."
            : `${node.label ?? node.type} ${node.id} is hidden on every device, so it and everything inside it never show. Unset hiddenOn, or remove it.`,
      });
      return;
    }
    for (const child of nodeChildren(node)) walk(child);
  };
  walk(root);
  return warnings.slice(0, 50);
}

/**
 * W-511: required form fields visitors can't fill (missing from the form, or hidden on a device),
 * so the form can't be sent there. Needs the forms plugin's definitions; none without them.
 */
async function requiredFieldWarnings(ports: EmvbPorts, root: LayoutNode) {
  const forms: LayoutNode[] = [];
  forEachNode(root, (node) => {
    if (isFormNode(node) && node.props.formId.trim() && forms.length < 20) forms.push(node);
  });
  if (forms.length === 0 || !ports.formFields) return [];
  let fields: ReadonlyMap<string, readonly { name: string; label: string; required: boolean }[]>;
  try {
    fields = await ports.formFields([
      ...new Set(forms.map((form) => (form.props as { formId: string }).formId.trim())),
    ]);
  } catch {
    return [];
  }
  const warnings: { nodeId: string; message: string }[] = [];
  for (const form of forms) {
    const defined = fields.get((form.props as { formId: string }).formId.trim());
    if (!defined) continue;
    for (const issue of requiredFieldIssues(form, defined)) {
      warnings.push({
        nodeId: issue.kind === "missing" ? issue.formNodeId : issue.nodeId,
        message:
          issue.kind === "hidden"
            ? `${requiredFieldIssueText(issue)} (Unset hiddenOn on ${issue.nodeId} or the box around it.)`
            : issue.kind === "audience"
              ? `${requiredFieldIssueText(issue)} (Unset audience or variant on ${issue.nodeId} or the box around it.)`
              : `${requiredFieldIssueText(issue)} (Form ${issue.formNodeId}, field name ${issue.field}.)`,
      });
    }
  }
  return warnings;
}

const clip = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

export async function describePage(ports: EmvbPorts, input: z.infer<typeof DescribePageInput>) {
  const { page, layout } = await loadPage(ports, input.pageId);
  const top = nodeChildren(layout.root);
  const all = { text: [] as string[], headings: [] as string[], media: 0 };
  collect(layout.root, all);
  const sections = top.map((node) => {
    const part = { text: [] as string[], headings: [] as string[], media: 0 };
    collect(node, part);
    const section: {
      id: string;
      type: string;
      label?: string;
      headings: string[];
      excerpt: string;
      media: number;
    } = {
      id: node.id,
      type: node.type,
      headings: part.headings,
      excerpt: clip(part.text.join(" "), 240),
      media: part.media,
    };
    if (node.label) section.label = node.label;
    return section;
  });
  const wordCount = all.text.join(" ").split(/\s+/).filter(Boolean).length;
  const warnings = [
    ...hiddenEverywhere(layout.root),
    ...(await requiredFieldWarnings(ports, layout.root)),
  ].slice(0, 50);
  const summary = clip(
    `"${page.title}" (/${page.slug}, ${page.status}${page.hasDraft ? ", unpublished changes" : ""}): ` +
      `${sections.length} top-level section${sections.length === 1 ? "" : "s"}, ` +
      `${all.headings.length} heading${all.headings.length === 1 ? "" : "s"}, ${all.media} image or video, ` +
      `${wordCount} words.`,
    1200,
  );
  return {
    pageId: page.id,
    title: page.title,
    summary,
    sections,
    headingOutline: all.headings,
    wordCount,
    images: imagesOf(layout.root),
    ...(warnings.length ? { warnings } : {}),
  };
}

// ---------------------------------------------------------------- get_accessibility_findings

export const A11yInput = z.strictObject({ pageId: z.string().min(1).max(128) });
export const A11yOutput = z.object({
  pageId: z.string(),
  score: z.number(),
  findings: z.array(
    z.object({
      rule: z.string(),
      severity: z.enum(["error", "warning"]),
      nodeId: z.string(),
      message: z.string(),
      fix: z.unknown().optional(),
    }),
  ),
});

export async function accessibilityFindings(ports: EmvbPorts, input: z.infer<typeof A11yInput>) {
  const { page, layout } = await loadPage(ports, input.pageId);
  const { design } = await ports.getDesign();
  const report = auditPage(layout, design as DesignSystem);
  return {
    pageId: page.id,
    score: report.score,
    findings: report.issues.map((issue) => {
      const finding: {
        rule: string;
        severity: "error" | "warning";
        nodeId: string;
        message: string;
        fix?: unknown;
      } = {
        rule: issue.rule,
        severity: issue.severity,
        nodeId: issue.nodeId,
        message: issue.message,
      };
      if (issue.fix) finding.fix = issue.fix;
      return finding;
    }),
  };
}

// ---------------------------------------------------------------- list_versions

export const ListVersionsInput = z.strictObject({
  pageId: z.string().min(1).max(128),
  limit: z.number().int().min(1).max(50).optional(),
});
export const ListVersionsOutput = z.object({
  versions: z.array(
    z.object({ revisionId: z.string(), at: z.string(), authorId: z.string().nullable() }),
  ),
});

/**
 * W-805: EmDash stores revision times as SQLite UTC text ("2026-10-21 03:17:01") with no zone, so
 * an agent read them as local time. Hand them out as ISO 8601 UTC instead.
 */
const utcIso = (at: string) =>
  /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(at) ? `${at.replace(" ", "T")}Z` : at;

export async function listVersions(ports: EmvbPorts, input: z.infer<typeof ListVersionsInput>) {
  const page = await ports.getPage(input.pageId);
  if (!page) throw new McpToolError("NOT_FOUND", `No EmVB page with id ${input.pageId}.`);
  const revisions = await ports.listRevisions(input.pageId, input.limit ?? 20);
  return {
    versions: revisions.map((r) => ({
      revisionId: r.id,
      at: utcIso(r.createdAt),
      authorId: r.authorId,
    })),
  };
}
