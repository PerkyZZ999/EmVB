import { z } from "zod";
import {
  byteLength,
  defaultElement,
  findNode,
  MAX_LAYOUT_BYTES,
  nameKey,
  nestingIssues,
  recipeNode,
  SECTION_RECIPES,
  summarizeIssues,
  validateDesign,
  validateLayout,
  type DesignSystem,
  type ElementType,
  type Layout,
  type LayoutNode,
} from "../core/index.ts";
import { stableJson } from "../core/stable-json.ts";
import { addNode, moveNode, withFreshIds } from "../core/arrange.ts";
import { ELEMENT_DESCRIPTORS } from "../core/elements/index.ts";
import { nodeChildren, pageSlug, removeNode, starterLayout, updateNode } from "../core/tree-ops.ts";
import { isSafeFontStack } from "../core/sanitize/css.ts";
import { sanitizeMediaUrl } from "../core/sanitize/media-url.ts";
import { sanitizeHref } from "../core/sanitize/href.ts";
import { isSafeSvgMarkup } from "../core/sanitize/svg.ts";
import { clipText, MAX_DEPTH } from "../core/limits.ts";
import { McpToolError } from "./errors.ts";
import type { EmvbPorts } from "./ports.ts";
import { queued } from "./queue.ts";
import { nestsDeeperThan, resolveDesignRefs } from "./refs.ts";
import {
  findVariableUsages,
  findVariableUsagesInDesign,
  type VariableKind,
} from "../core/design/variables.ts";

export const PageId = z.string().min(1).max(128);
export const NodeIdInput = z.string().min(1).max(64);
export const Rev = z.string().min(1).max(256);

/** The editor's save checks, run here because plugin writes skip `content:beforeSave` (R1 P0b). */
function checkLayout(candidate: unknown): Layout {
  // Size first, so an oversized page reports TOO_LARGE rather than a generic INVALID_LAYOUT.
  const size = byteLength(candidate);
  if (size > MAX_LAYOUT_BYTES) {
    throw new McpToolError(
      "TOO_LARGE",
      `The page would be ${size} bytes; the limit is ${MAX_LAYOUT_BYTES}. Split it into smaller pages or remove content.`,
    );
  }
  const result = validateLayout(candidate);
  if (!result.ok) {
    throw new McpToolError(
      "INVALID_LAYOUT",
      `The layout is invalid. ${summarizeIssues(result.issues)}`,
      { issues: result.issues.slice(0, 10) },
    );
  }
  const misplaced = nestingIssues(result.layout, 3);
  if (misplaced.length > 0) {
    throw new McpToolError(
      "NESTING",
      `Elements are in the wrong place. ${misplaced.map((issue) => issue.message).join("; ")}`,
    );
  }
  const bytes = byteLength(result.layout);
  if (bytes > MAX_LAYOUT_BYTES) {
    throw new McpToolError(
      "TOO_LARGE",
      `The page would be ${bytes} bytes; the limit is ${MAX_LAYOUT_BYTES}.`,
    );
  }
  return result.layout;
}

type WriteResult = { pageId: string; rev: string; changed: string[]; summary: string };

export const WriteOutput = z.object({
  pageId: z.string(),
  rev: z.string(),
  changed: z.array(z.string()),
  summary: z.string(),
});

/**
 * Read → apply → validate → save with `_rev`, one write per page at a time (D-058). Without
 * `expectedRev`, a conflict re-reads and re-applies the operation once; with it, never.
 */
export async function mutatePage(
  ports: EmvbPorts,
  tool: string,
  pageId: string,
  expectedRev: string | undefined,
  apply: (layout: Layout) => { layout: Layout; changed: string[]; summary: string },
): Promise<WriteResult> {
  return queued(`page:${pageId}`, async () => {
    // The retry must read, write and log in order.
    /* oxlint-disable no-await-in-loop */
    for (let attempt = 0; ; attempt++) {
      const page = await ports.getPage(pageId);
      if (!page)
        throw new McpToolError("NOT_FOUND", `No EmVB page with id ${pageId}. Call list_pages.`);
      if (expectedRev !== undefined && page.rev !== expectedRev) {
        throw new McpToolError(
          "CONFLICT",
          "The page changed since you read it. Every write returns a new rev: pass that one to your next write. If someone else changed it, call get_layout again and retry.",
          { rev: page.rev },
        );
      }
      const current = validateLayout(page.layout);
      if (!current.ok) {
        throw new McpToolError(
          "INVALID_LAYOUT",
          "The stored layout can't be read. Repair it in the editor.",
        );
      }
      const next = apply(current.layout);
      refuseUnsafeImageSources(current.layout, next.layout);
      refuseUnsafeLinks(current.layout, next.layout);
      refuseUnsafeSvg(current.layout, next.layout);
      const layout = checkLayout(next.layout);
      // W-562: a write that changes nothing (an empty set, the same value, a move to its own
      // spot) saved a new version and rev anyway, cluttering the timeline and the agent log.
      if (stableJson(layout) === stableJson(current.layout)) {
        return { pageId, rev: page.rev, changed: [], summary: `Nothing changed (${tool})` };
      }
      try {
        const saved = await ports.savePage(pageId, { layout }, page.rev);
        await ports.log({
          target: "page",
          tool,
          pageId,
          rev: saved.rev,
          ...(saved.revisionId ? { revisionId: saved.revisionId } : {}),
          summary: next.summary,
        });
        return { pageId, rev: saved.rev, changed: next.changed, summary: next.summary };
      } catch (error) {
        const retry = error instanceof McpToolError && error.code === "CONFLICT";
        if (!retry || expectedRev !== undefined || attempt >= 1) throw error;
      }
    }
  });
}

const refused = (reason: string): never => {
  throw new McpToolError("REFUSED", reason);
};

/**
 * W-755: these checks run before the layout is validated, so a write that set `props` to null (or
 * a list) reached them as is and failed as an internal error instead of an invalid layout.
 */
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const propsOf = (node: LayoutNode): Record<string, unknown> =>
  isRecord(node.props) ? node.props : {};

/** Link props (the element's `href` fields) on each node, keyed by node and prop. */
function linkValues(root: LayoutNode): Map<string, string> {
  const found = new Map<string, string>();
  const walk = (node: LayoutNode) => {
    const fields = ELEMENT_DESCRIPTORS.find((d) => d.type === node.type)?.fields ?? [];
    const props = propsOf(node);
    for (const field of fields) {
      const value = props[field.key];
      if (field.kind === "href" && typeof value === "string")
        found.set(`${node.id}.${field.key}`, value);
    }
    for (const child of nodeChildren(node)) walk(child);
  };
  walk(root);
  return found;
}

/**
 * W-563: as W-499 for images, a `javascript:` (or other unsafe) link passed validation and the
 * page published the element without it, with nothing telling the agent. Links the write adds
 * or changes must pass the page's link check; ones already stored are left alone.
 */
function refuseUnsafeLinks(before: Layout, after: Layout) {
  const old = linkValues(before.root);
  for (const [key, href] of linkValues(after.root)) {
    if (href.trim() === "" || old.get(key) === href || sanitizeHref(href) !== undefined) continue;
    const [id, prop] = key.split(".");
    refused(
      `Element ${id} has the ${prop} ${JSON.stringify(clipText(href, 80))}, which pages can't link to. Use an https:// URL, a path on this site such as /pricing, #section, mailto: or tel:.`,
    );
  }
}

/** SVG markup props (an SVG element's `markup`, an icon's `iconSvg`), keyed by node and prop. */
function svgValues(root: LayoutNode): Map<string, string> {
  const found = new Map<string, string>();
  const walk = (node: LayoutNode) => {
    const props = propsOf(node);
    if (node.type === "svg" && typeof props["markup"] === "string")
      found.set(`${node.id}.markup`, props["markup"]);
    if (typeof props["iconSvg"] === "string") found.set(`${node.id}.iconSvg`, props["iconSvg"]);
    for (const child of nodeChildren(node)) walk(child);
  };
  walk(root);
  return found;
}

/**
 * W-566: SVG with an `onload` handler (or a script, foreignObject, style…) was stored as given and
 * the page then rendered nothing for it, with nothing telling the agent. Markup the write adds or
 * changes must pass the same check the renderer uses; ones already stored are left alone.
 */
function refuseUnsafeSvg(before: Layout, after: Layout) {
  const old = svgValues(before.root);
  for (const [key, markup] of svgValues(after.root)) {
    if (markup.trim() === "" || old.get(key) === markup || isSafeSvgMarkup(markup)) continue;
    const [id, prop] = key.split(".");
    refused(
      `Element ${id} has ${prop} the page can't show. Use plain SVG: no scripts, event handlers such as onload, foreignObject, style blocks, links or external images.`,
    );
  }
}

/** Image sources (src and srcset widths) on a node, keyed for comparison. */
function imageSources(root: LayoutNode): Map<string, string[]> {
  const found = new Map<string, string[]>();
  const walk = (node: LayoutNode) => {
    if (node.type === "image") {
      const props = propsOf(node) as { src?: unknown; sources?: unknown };
      const list = typeof props.src === "string" ? [props.src] : [];
      if (Array.isArray(props.sources)) {
        for (const source of props.sources as { src?: unknown }[]) {
          if (typeof source?.src === "string") list.push(source.src);
        }
      }
      found.set(node.id, list);
    }
    for (const child of nodeChildren(node)) walk(child);
  };
  walk(root);
  return found;
}

/**
 * W-499: a `javascript:` or `data:` image source passed validation and published as a blank
 * placeholder (the renderer drops it), with nothing telling the agent why. Sources the write
 * adds or changes must be http(s) or a same-site path; ones already stored are left alone.
 */
function refuseUnsafeImageSources(before: Layout, after: Layout) {
  const old = imageSources(before.root);
  for (const [id, list] of imageSources(after.root)) {
    const kept = new Set(old.get(id) ?? []);
    for (const src of list) {
      if (src.trim() === "" || kept.has(src) || sanitizeMediaUrl(src)) continue;
      refused(
        `Image ${id} has the source ${JSON.stringify(src.slice(0, 80))}, which pages can't show. Use an https:// URL or a path on this site such as /_emdash/api/media/file/photo.jpg (upload in the EmDash media library first).`,
      );
    }
  }
}

const KNOWN_TYPES = new Set(ELEMENT_DESCRIPTORS.map((d) => d.type));

/** An element from the agent: its type's defaults, the given props and fields, fresh ids. */
const ElementSpec: z.ZodType<ElementSpecT> = z.lazy(() =>
  z.looseObject({
    type: z.string().min(1).max(64),
    props: z.record(z.string(), z.unknown()).optional(),
    children: z.array(ElementSpec).max(200).optional(),
  }),
);
type ElementSpecT = { type: string; props?: Record<string, unknown>; children?: ElementSpecT[] };

/**
 * W-652: the recursive spec is checked by recursion, so an element nested a few thousand levels
 * overflowed the stack while the input was validated and the call failed as an internal error.
 * Pages allow 24 levels of elements; anything past a generous bound is refused up front.
 */
const BoundedElementSpec = z.preprocess((value, ctx) => {
  if (nestsDeeperThan(value, MAX_DEPTH * 8)) {
    ctx.addIssue({
      code: "custom",
      message: `Elements can be nested at most ${MAX_DEPTH} levels deep.`,
      input: value,
    });
    return z.NEVER;
  }
  return value;
}, ElementSpec);

function buildNode(spec: ElementSpecT): LayoutNode {
  if (!KNOWN_TYPES.has(spec.type)) {
    refused(`Unknown element type ${spec.type}. Call list_element_types.`);
  }
  const { type, props, children, ...rest } = spec;
  delete (rest as { id?: unknown }).id;
  const base = defaultElement(type as ElementType, "new") as LayoutNode & {
    props?: Record<string, unknown>;
  };
  const node = { ...base, ...rest, props: { ...base.props, ...props } } as LayoutNode;
  if (children) (node as { children: LayoutNode[] }).children = children.map(buildNode);
  return node;
}

const arranged = (result: { ok: true; layout: Layout } | { ok: false; reason: string }): Layout =>
  result.ok ? result.layout : refused(result.reason);

// ---------------------------------------------------------------- create_page

export const CreatePageInput = z.strictObject({
  title: z.string().trim().min(1).max(200),
  recipes: z
    .array(z.enum(SECTION_RECIPES.map((r) => r.id) as [string, ...string[]]))
    .max(12)
    .optional(),
});
export const CreatePageOutput = z.object({ pageId: z.string(), slug: z.string(), rev: z.string() });

/** The first heading inside `node`, depth first. */
const firstHeading = (node: LayoutNode): LayoutNode | undefined =>
  node.type === "heading"
    ? node
    : ("children" in node && Array.isArray(node.children) ? node.children : [])
        .map(firstHeading)
        .find(Boolean);

/** The hero's first heading becomes the page's h1 with the page title as its text. */
function promoteHeroHeading(layout: Layout, title: string): Layout {
  const hero = layout.root.children?.[0];
  const heading = hero ? firstHeading(hero) : undefined;
  if (!heading) return layout;
  return updateNode(
    layout,
    heading.id,
    (node) =>
      ({
        ...node,
        props: { ...(node.props as Record<string, unknown>), text: title, level: 1 },
      }) as LayoutNode,
  );
}

/** Whether any page already has this slug, paging past the first 50 (W-537, at most 1000). */
async function slugTaken(ports: EmvbPorts, slug: string): Promise<boolean> {
  let cursor: string | undefined;
  for (let i = 0; i < 20; i++) {
    // oxlint-disable-next-line no-await-in-loop -- cursor paging is sequential
    const batch = await ports.listPages({ limit: 50, ...(cursor ? { cursor } : {}) });
    if (batch.pages.some((page) => page.slug === slug)) return true;
    if (!batch.nextCursor) return false;
    cursor = batch.nextCursor;
  }
  return false;
}

export async function createPage(ports: EmvbPorts, input: z.infer<typeof CreatePageInput>) {
  // EmDash derives the slug from the title; refuse a title whose slug is already taken.
  const slug = pageSlug(input.title);
  if (!slug) refused("Give the page a title with letters or digits.");
  const { design } = await ports.getDesign();
  let layout = starterLayout(input.title);
  const recipes = input.recipes ?? [];
  if (recipes.length > 0) {
    // W-474: sections sit edge to edge, and a hero first carries the page's one h1 itself
    // instead of a bare title heading above it.
    layout = {
      ...layout,
      root: { ...layout.root, style: { ...layout.root.style, gap: { value: 0, unit: "px" } } },
    };
    if (recipes[0] === "hero") layout = { ...layout, root: { ...layout.root, children: [] } };
  }
  for (const id of recipes) {
    const node = recipeNode(id, design, layout);
    if (node)
      layout = arranged(
        addNode(layout, withFreshIds(layout, node), {
          parentId: layout.root.id,
          index: Number.MAX_SAFE_INTEGER,
        }),
      );
  }
  if (recipes[0] === "hero") layout = promoteHeroHeading(layout, input.title);
  const checked = checkLayout(layout);
  if (await slugTaken(ports, slug)) {
    throw new McpToolError("REFUSED", `The slug "${slug}" is taken. Choose another title.`);
  }
  const created = await ports.createPage({ title: input.title, layout: checked });
  await ports.log({
    target: "page",
    tool: "create_page",
    pageId: created.id,
    rev: created.rev,
    summary: `Created page "${input.title}"`,
  });
  return { pageId: created.id, slug: created.slug || slug, rev: created.rev };
}

// ---------------------------------------------------------------- add / move / update / remove

export const AddElementInput = z.strictObject({
  pageId: PageId,
  parentId: NodeIdInput,
  index: z.number().int().min(0).optional(),
  element: BoundedElementSpec,
  expectedRev: Rev.optional(),
});

export async function addElement(ports: EmvbPorts, input: z.infer<typeof AddElementInput>) {
  const element = resolveDesignRefs(input.element, (await ports.getDesign()).design);
  return mutatePage(ports, "add_element", input.pageId, input.expectedRev, (layout) => {
    if (!findNode(layout, input.parentId)) {
      refused(
        `No element with id ${input.parentId} on this page to add into. Call get_layout for the ids.`,
      );
    }
    const node = withFreshIds(layout, buildNode(element));
    const next = arranged(
      addNode(layout, node, {
        parentId: input.parentId,
        index: input.index ?? Number.MAX_SAFE_INTEGER,
      }),
    );
    return { layout: next, changed: [node.id], summary: `Added ${node.type} ${node.id}` };
  });
}

export const MoveElementInput = z.strictObject({
  pageId: PageId,
  nodeId: NodeIdInput,
  parentId: NodeIdInput,
  index: z.number().int().min(0),
  expectedRev: Rev.optional(),
});

export const moveElement = (ports: EmvbPorts, input: z.infer<typeof MoveElementInput>) =>
  mutatePage(ports, "move_element", input.pageId, input.expectedRev, (layout) => {
    for (const id of [input.nodeId, input.parentId]) {
      if (!findNode(layout, id))
        refused(`No element with id ${id} on this page. Call get_layout for the ids.`);
    }
    return {
      layout: arranged(moveNode(layout, input.nodeId, input.parentId, input.index)),
      changed: [input.nodeId],
      summary: `Moved ${input.nodeId}`,
    };
  });

const SETTABLE = [
  "props",
  "style",
  "states",
  "devices",
  "attributes",
  "hiddenOn",
  "classes",
  "htmlId",
  "label",
  "bind",
  "audience",
  "dir",
  "container",
  "query",
] as const;

export const UpdateElementInput = z.strictObject({
  pageId: PageId,
  nodeId: NodeIdInput,
  set: z
    .strictObject(Object.fromEntries(SETTABLE.map((key) => [key, z.unknown().optional()])))
    .optional(),
  unset: z
    .array(z.string().regex(/^[a-zA-Z]+(\.[a-zA-Z0-9_-]+)?$/))
    .max(50)
    .optional(),
  expectedRev: Rev.optional(),
});

/**
 * W-510: a new `src` merged into an image's props kept the old picture's extra sizes (the
 * browser went on showing the old picture from srcset), its image-editor record and its media
 * id and size. As the editor's picker does (W-422, W-425, W-482), they go unless the same
 * write sets them.
 */
function dropOldPictureProps(
  before: Record<string, unknown>,
  setProps: Record<string, unknown>,
  copy: Record<string, unknown>,
) {
  if (typeof setProps.src !== "string" || setProps.src === before.src) return;
  const props = copy.props;
  if (!isRecord(props)) return;
  for (const key of ["sources", "edit", "mediaId"]) {
    if (!(key in setProps)) delete props[key];
  }
  if (before.mediaId !== undefined && !("mediaId" in setProps)) {
    if (!("width" in setProps)) delete props.width;
    if (!("height" in setProps)) delete props.height;
  }
}

export async function updateElement(ports: EmvbPorts, input: z.infer<typeof UpdateElementInput>) {
  const set = resolveDesignRefs(input.set ?? {}, (await ports.getDesign()).design);
  return mutatePage(ports, "update_element", input.pageId, input.expectedRev, (layout) => {
    if (!findNode(layout, input.nodeId))
      refused(`No element with id ${input.nodeId} on this page.`);
    const next = updateNode(layout, input.nodeId, (node) => {
      const copy = structuredClone(node) as Record<string, unknown>;
      for (const [key, value] of Object.entries(set)) {
        if (value === undefined) continue;
        // Objects merge one level deep, like the editor's panels; anything else replaces.
        copy[key] = isRecord(value) && isRecord(copy[key]) ? { ...copy[key], ...value } : value;
      }
      if (node.type === "image" && isRecord(set.props)) {
        dropOldPictureProps(node.props as Record<string, unknown>, set.props, copy);
      }
      for (const path of input.unset ?? []) {
        const [top, sub] = path.split(".") as [string, string | undefined];
        if (top === "id" || top === "type" || top === "children") continue;
        if (sub === undefined) delete copy[top];
        else if (isRecord(copy[top])) delete copy[top][sub];
      }
      return copy as LayoutNode;
    });
    return { layout: next, changed: [input.nodeId], summary: `Updated ${input.nodeId}` };
  });
}

export const RemoveElementInput = z.strictObject({
  pageId: PageId,
  nodeId: NodeIdInput,
  expectedRev: Rev.optional(),
});

export const removeElement = (ports: EmvbPorts, input: z.infer<typeof RemoveElementInput>) =>
  mutatePage(ports, "remove_element", input.pageId, input.expectedRev, (layout) => {
    if (layout.root.id === input.nodeId) refused("The page root can't be removed.");
    const { layout: next, removed } = removeNode(layout, input.nodeId);
    if (!removed) refused(`No element with id ${input.nodeId} on this page.`);
    return {
      layout: next,
      changed: [input.nodeId],
      summary: `Removed ${removed?.node.type} ${input.nodeId}`,
    };
  });

// ---------------------------------------------------------------- apply_section_recipe

export const ApplyRecipeInput = z.strictObject({
  pageId: PageId,
  recipeId: z.enum(SECTION_RECIPES.map((r) => r.id) as [string, ...string[]]),
  parentId: NodeIdInput.optional(),
  index: z.number().int().min(0).optional(),
  expectedRev: Rev.optional(),
});

export async function applySectionRecipe(
  ports: EmvbPorts,
  input: z.infer<typeof ApplyRecipeInput>,
) {
  const { design } = await ports.getDesign();
  return mutatePage(ports, "apply_section_recipe", input.pageId, input.expectedRev, (layout) => {
    const built = recipeNode(input.recipeId, design, layout);
    if (!built) return refused(`Unknown recipe ${input.recipeId}.`);
    const node = withFreshIds(layout, built);
    const next = arranged(
      addNode(layout, node, {
        parentId: input.parentId ?? layout.root.id,
        index: input.index ?? Number.MAX_SAFE_INTEGER,
      }),
    );
    return {
      layout: next,
      changed: [node.id],
      summary: `Added the ${input.recipeId} section ${node.id}`,
    };
  });
}

// ---------------------------------------------------------------- restore_version

export const RestoreVersionInput = z.strictObject({
  pageId: PageId,
  revisionId: z.string().min(1).max(128),
  expectedRev: Rev.optional(),
});

export async function restoreVersion(ports: EmvbPorts, input: z.infer<typeof RestoreVersionInput>) {
  const data = await ports.getRevisionData(input.pageId, input.revisionId);
  if (!data)
    throw new McpToolError(
      "NOT_FOUND",
      `No version ${input.revisionId} of this page. Call list_versions.`,
    );
  let raw = data["layout"];
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw) as unknown;
    } catch {
      raw = undefined;
    }
  }
  const restored = checkLayout(raw);
  return mutatePage(ports, "restore_version", input.pageId, input.expectedRev, () => ({
    layout: restored,
    changed: [restored.root.id],
    summary: `Restored version ${input.revisionId}`,
  }));
}

// ---------------------------------------------------------------- update_site_styles

const VARIABLE_KINDS = ["colors", "fonts", "fontSizes", "spacings"] as const;
type Item = { id: string } & Record<string, unknown>;
const Items = z.array(z.looseObject({ id: z.string().min(1).max(64) })).max(100);

export const UpdateSiteStylesInput = z.strictObject({
  variables: z
    .strictObject(Object.fromEntries(VARIABLE_KINDS.map((k) => [k, Items.optional()])))
    .optional(),
  removeVariables: z
    .array(z.strictObject({ kind: z.enum(VARIABLE_KINDS), id: z.string().min(1).max(64) }))
    .max(100)
    .optional(),
  classes: Items.optional(),
  removeClasses: z.array(z.string().min(1).max(64)).max(100).optional(),
  defaults: z.record(z.string(), z.unknown()).optional(),
  direction: z.enum(["ltr", "rtl", "auto"]).optional(),
  /** Remove variables or classes even when pages or classes still use them (references fall back). */
  force: z.boolean().optional(),
  expectedRevision: z.string().max(256).nullable().optional(),
});
export const UpdateSiteStylesOutput = z.object({ revision: z.string(), summary: z.string() });

const KIND_OF: Record<(typeof VARIABLE_KINDS)[number], VariableKind> = {
  colors: "color",
  fonts: "font",
  fontSizes: "fontSize",
  spacings: "spacing",
};

/** Every EmVB page's title and layout, for the in-use guards (at most 1000 pages). */
async function allLayouts(ports: EmvbPorts): Promise<{ title: string; layout: Layout }[]> {
  const pages: { id: string; title: string }[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 20; i++) {
    // oxlint-disable-next-line no-await-in-loop -- cursor paging is sequential
    const batch = await ports.listPages({ limit: 50, ...(cursor ? { cursor } : {}) });
    pages.push(...batch.pages);
    if (!batch.nextCursor) break;
    cursor = batch.nextCursor;
  }
  const records = await Promise.all(pages.map((page) => ports.getPage(page.id)));
  const out: { title: string; layout: Layout }[] = [];
  records.forEach((record, i) => {
    const layout = record ? validateLayout(record.layout) : null;
    if (layout?.ok) out.push({ title: pages[i]?.title ?? "", layout: layout.layout });
  });
  return out;
}

/** Where a variable is still used: class ids and page titles (W-458 in-use guard). */
function variableUses(
  layouts: { title: string; layout: Layout }[],
  design: DesignSystem,
  id: string,
  kind: VariableKind,
): string[] {
  const where = findVariableUsagesInDesign(design, id, kind).map((u) => `class ${u.classId}`);
  for (const { title, layout } of layouts) {
    if (findVariableUsages(layout, id, kind).length > 0) where.push(`page "${title}"`);
  }
  return where;
}

/** W-504: pages whose elements still carry a class (removing it silently unstyled them). */
function classUses(layouts: { title: string; layout: Layout }[], id: string): string[] {
  const uses = (node: LayoutNode): boolean =>
    (node.classes ?? []).includes(id) || nodeChildren(node).some(uses);
  return layouts.filter(({ layout }) => uses(layout.root)).map(({ title }) => `page "${title}"`);
}

const upsert = (list: Item[] | undefined, items: Item[]): Item[] => {
  const next = [...(list ?? [])];
  for (const item of items) {
    const at = next.findIndex((existing) => existing.id === item.id);
    if (at === -1) next.push(item);
    else next[at] = { ...next[at], ...item };
  }
  return next;
};

/** Writes the style draft only; publishing site styles is a separate, gated tool (D-055). */
export async function updateSiteStyles(
  ports: EmvbPorts,
  input: z.infer<typeof UpdateSiteStylesInput>,
) {
  return queued("styles", async () => {
    const state = await ports.getDesign();
    if (input.expectedRevision !== undefined && input.expectedRevision !== state.revision) {
      throw new McpToolError(
        "CONFLICT",
        "Site styles changed since you read them. Call get_site_styles again.",
      );
    }
    const draft = structuredClone(state.design) as unknown as Record<string, unknown> & {
      variables: Record<string, Item[] | undefined>;
      classes?: Item[];
      defaults?: Record<string, unknown>;
    };
    const changes: string[] = [];
    // W-547: a font stack the site CSS can't carry was saved, then dropped from the page.
    for (const font of (input.variables?.fonts ?? []) as { id?: unknown; value?: unknown }[]) {
      if (typeof font.value === "string" && !isSafeFontStack(font.value)) {
        throw new McpToolError(
          "INVALID_INPUT",
          `Font ${String(font.id)}: "${font.value.slice(0, 60)}" can't be used in the site CSS. Use names of letters, digits, spaces, - and _, quoted or not, separated by commas.`,
        );
      }
    }
    for (const kind of VARIABLE_KINDS) {
      const items = input.variables?.[kind] as Item[] | undefined;
      if (items?.length) {
        draft.variables[kind] = upsert(draft.variables[kind], items);
        changes.push(`${items.length} ${kind}`);
      }
    }
    // W-564: removing an id the styles don't have "succeeded" with a removed summary.
    const unknown = [
      ...(input.removeVariables ?? [])
        .filter(({ kind, id }) => !(draft.variables[kind] ?? []).some((v) => v.id === id))
        .map(({ kind, id }) => `${kind} ${id}`),
      ...(input.removeClasses ?? [])
        .filter((id) => !(draft.classes ?? []).some((c) => c.id === id))
        .map((id) => `class ${id}`),
    ];
    if (unknown.length > 0) {
      throw new McpToolError(
        "NOT_FOUND",
        `Nothing to remove for ${unknown.join(", ")}. Call get_site_styles for the ids.`,
      );
    }
    if (!input.force && (input.removeVariables?.length || input.removeClasses?.length)) {
      const layouts = await allLayouts(ports);
      const inUse = [
        ...(input.removeVariables ?? []).map(({ kind, id }) => ({
          id,
          where: variableUses(layouts, state.design, id, KIND_OF[kind]),
        })),
        ...(input.removeClasses ?? []).map((id) => ({ id, where: classUses(layouts, id) })),
      ];
      const blocked = inUse.filter((u) => u.where.length > 0);
      if (blocked.length > 0) {
        throw new McpToolError(
          "REFUSED",
          `Still in use: ${blocked.map((u) => `${u.id} (${u.where.slice(0, 5).join(", ")})`).join("; ")}. Replace those references first, or pass force: true.`,
        );
      }
    }
    for (const { kind, id } of input.removeVariables ?? []) {
      draft.variables[kind] = (draft.variables[kind] ?? []).filter((v) => v.id !== id);
      changes.push(`removed ${kind} ${id}`);
    }
    // Refs in new classes and tag defaults resolve against the variables after this change.
    const withVars = { ...state.design, variables: draft.variables } as unknown as DesignSystem;
    if (input.classes?.length) {
      draft.classes = upsert(draft.classes, resolveDesignRefs(input.classes, withVars) as Item[]);
      changes.push(`${input.classes.length} classes`);
    }
    if (input.removeClasses?.length) {
      draft.classes = (draft.classes ?? []).filter((c) => !input.removeClasses?.includes(c.id));
      changes.push(`removed ${input.removeClasses.length} classes`);
    }
    if (input.defaults) {
      // Per tag, like update_element's style: { h1: { color } } keeps h1's other properties.
      const merged: Record<string, unknown> = { ...draft.defaults };
      for (const [tag, style] of Object.entries(resolveDesignRefs(input.defaults, withVars))) {
        merged[tag] =
          isRecord(style) && isRecord(merged[tag]) ? { ...merged[tag], ...style } : style;
      }
      draft.defaults = merged;
      changes.push("tag defaults");
    }
    if (input.direction) {
      draft["direction"] = input.direction;
      changes.push(`direction ${input.direction}`);
    }
    // W-573: the editor keeps class names, and variable names within a kind, unique (W-277,
    // W-278); an agent's new or renamed one can't take another's name either.
    const clash = (list: Item[] | undefined, touched: unknown[] | undefined, what: string) => {
      const ids = new Set((touched ?? []).map((item) => (item as { id?: unknown }).id));
      const seen = new Map<string, Item>();
      for (const item of list ?? []) {
        const name = (item as { name?: unknown }).name;
        if (typeof name !== "string") continue;
        const key = nameKey(name);
        const other = seen.get(key);
        if (other && (ids.has(item.id) || ids.has(other.id))) {
          const taken = String((other as { name?: unknown }).name);
          throw new McpToolError(
            "INVALID_INPUT",
            `${what} ${item.id} and ${other.id} would both be named "${taken}". Pick another name.`,
          );
        }
        if (!other) seen.set(key, item);
      }
    };
    clash(draft.classes, input.classes, "Classes");
    for (const kind of VARIABLE_KINDS) {
      clash(draft.variables[kind], input.variables?.[kind], `Variables (${kind})`);
    }
    if (changes.length === 0) refused("Nothing to change.");
    const result = validateDesign(draft);
    if (!result.ok) {
      throw new McpToolError(
        "INVALID_INPUT",
        `The site styles would be invalid. ${summarizeIssues(result.issues)}`,
      );
    }
    // W-564: the same values again save no new draft revision.
    if (stableJson(result.design) === stableJson(state.design) && state.revision) {
      return { revision: state.revision, summary: "Nothing changed in the site styles draft" };
    }
    const saved = await ports.saveDesign(result.design as DesignSystem, state.revision);
    const summary = `Site styles draft: ${changes.join(", ")}`;
    await ports.log({ target: "styles", tool: "update_site_styles", summary });
    return { revision: saved.revision, summary };
  });
}
