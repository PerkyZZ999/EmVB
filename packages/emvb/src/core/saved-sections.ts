import { addSectionNear, REASONS, withFreshIds, type Added, type Refusal } from "./arrange.ts";
import { prepareElement, prepareStyle, type Dropped } from "./clipboard.ts";
import { cleanClassName, MAX_CLASSES, nameKey } from "./design/classes.ts";
import { clipText, MAX_LAYOUT_BYTES } from "./limits.ts";
import { isRecord } from "./record.ts";
import { DESIGN_SCHEMA_VERSION, type DesignSystem } from "./schema/design.ts";
import { LAYOUT_SCHEMA_VERSION, type Layout, type LayoutNode } from "./schema/layout.ts";
import { findNode, newNodeId, nodeChildren, slugify } from "./tree-ops.ts";
import { byteLength, summarizeIssues, validateDesign, validateLayout } from "./validate.ts";

/**
 * Saved sections (W-874, D-060): a named copy of an element and its children, kept per site so it
 * can be inserted on any page. Each save carries a snapshot of the classes it uses, so it keeps
 * its look on insert. Old saves are upgraded when read, through the same layout and design
 * migrations as pages and site styles.
 */
const SAVED_SECTION_VERSION = 1;
export const SAVED_SECTION_NAME_MAX = 60;
export const MAX_SAVED_SECTIONS = 200;

type StyleClass = NonNullable<DesignSystem["classes"]>[number];

/** What storage holds for one saved section. */
export type SavedSectionRecord = {
  version: typeof SAVED_SECTION_VERSION;
  name: string;
  layout: Layout;
  designSchemaVersion: number;
  classes: StyleClass[];
  createdAt: string;
  updatedAt: string;
};

/** One saved section in a list (W-875). `damaged` rows can only be deleted. */
export type SavedSectionSummary = {
  id: string;
  name: string;
  updatedAt: string;
  classCount: number;
  damaged?: true;
};

/** A saved section after it has been read, checked and upgraded. */
export type SavedSection = {
  name: string;
  node: LayoutNode;
  classes: StyleClass[];
  createdAt: string;
  updatedAt: string;
};

export const SAVED_SECTION_REASONS = {
  name: "Give the section a name.",
  root: "Choose an element inside the page; the page itself can't be saved as a section.",
  missing: REASONS.missing,
  tooBig: "This section is too big to save.",
  damaged: "This saved section can't be read.",
  tooManyClasses: `Inserting this section would go over ${MAX_CLASSES} classes on this site.`,
} as const;

const refuse = (reason: string): Refusal => ({ ok: false, reason });
const WRAPPER_ID = "savedsection";

/** The name as stored: cleaned like a class name, at most 60 characters; "" when blank. */
export const savedSectionName = (raw: string): string =>
  clipText(cleanClassName(raw), SAVED_SECTION_NAME_MAX).trim();

/** A copy without A/B test arms: a saved copy is never part of the original's test (as W-629). */
function withoutVariants(node: LayoutNode): LayoutNode {
  const { variant: _variant, ...rest } = node as LayoutNode & { variant?: unknown };
  const kids = nodeChildren(node);
  if (kids.length === 0) return rest as LayoutNode;
  return { ...rest, children: kids.map(withoutVariants) } as LayoutNode;
}

function classIdsIn(node: LayoutNode, into = new Set<string>()): Set<string> {
  for (const id of node.classes ?? []) into.add(id);
  for (const child of nodeChildren(node)) classIdsIn(child, into);
  return into;
}

const wrap = (node: LayoutNode): Layout => ({
  schemaVersion: LAYOUT_SCHEMA_VERSION,
  root: { id: WRAPPER_ID, type: "container", props: {}, children: [node] },
});

/** The record storage holds for a section that has been read (an old save comes back upgraded). */
export const savedSectionRecord = (section: SavedSection): SavedSectionRecord => ({
  version: SAVED_SECTION_VERSION,
  name: section.name,
  layout: wrap(section.node),
  designSchemaVersion: DESIGN_SCHEMA_VERSION,
  classes: section.classes,
  createdAt: section.createdAt,
  updatedAt: section.updatedAt,
});

/** A record for `nodeId` with the classes it uses, or why it can't be saved. */
export function snapshotSection(
  layout: Layout,
  nodeId: string,
  design: DesignSystem,
  rawName: string,
  now: string,
): { ok: true; record: SavedSectionRecord } | Refusal {
  const name = savedSectionName(rawName);
  if (!name) return refuse(SAVED_SECTION_REASONS.name);
  if (nodeId === layout.root.id) return refuse(SAVED_SECTION_REASONS.root);
  const found = findNode(layout, nodeId);
  if (!found) return refuse(SAVED_SECTION_REASONS.missing);
  const node = withoutVariants(structuredClone(found));
  const used = classIdsIn(node);
  const classes = (design.classes ?? [])
    .filter((c) => used.has(c.id))
    .map((c) => structuredClone(c));
  const record: SavedSectionRecord = {
    version: SAVED_SECTION_VERSION,
    name,
    layout: wrap(node),
    designSchemaVersion: DESIGN_SCHEMA_VERSION,
    classes,
    createdAt: now,
    updatedAt: now,
  };
  if (byteLength(record) > MAX_LAYOUT_BYTES) return refuse(SAVED_SECTION_REASONS.tooBig);
  const checked = validateLayout(record.layout);
  if (!checked.ok) return refuse(summarizeIssues(checked.issues));
  return { ok: true, record };
}

/**
 * A stored record, checked and upgraded: the layout through the layout migrations, the classes
 * through the design migrations. Anything that doesn't pass is refused, never half-used.
 */
export function readSavedSection(raw: unknown): { ok: true; section: SavedSection } | Refusal {
  if (!isRecord(raw) || raw["version"] !== SAVED_SECTION_VERSION) {
    return refuse(SAVED_SECTION_REASONS.damaged);
  }
  const name = typeof raw["name"] === "string" ? savedSectionName(raw["name"]) : "";
  const createdAt = typeof raw["createdAt"] === "string" ? raw["createdAt"] : "";
  const updatedAt = typeof raw["updatedAt"] === "string" ? raw["updatedAt"] : createdAt;
  if (!name || !createdAt) return refuse(SAVED_SECTION_REASONS.damaged);
  const layout = validateLayout(raw["layout"]);
  if (!layout.ok) return refuse(SAVED_SECTION_REASONS.damaged);
  const node = layout.layout.root.children[0];
  if (!node || layout.layout.root.children.length !== 1) {
    return refuse(SAVED_SECTION_REASONS.damaged);
  }
  const version = raw["designSchemaVersion"];
  const design = validateDesign({
    schemaVersion: typeof version === "number" ? version : DESIGN_SCHEMA_VERSION,
    variables: { colors: [] },
    classes: Array.isArray(raw["classes"]) ? raw["classes"] : [],
  });
  if (!design.ok) return refuse(SAVED_SECTION_REASONS.damaged);
  return {
    ok: true,
    section: { name, node, classes: design.design.classes ?? [], createdAt, updatedAt },
  };
}

/** A class's look, in one comparable form (key order doesn't matter). */
function lookOf(cls: StyleClass): string {
  const sorted = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(sorted)
      : isRecord(value)
        ? Object.fromEntries(
            Object.keys(value)
              .toSorted()
              .map((key) => [key, sorted(value[key])]),
          )
        : value;
  const { id: _id, name: _name, ...look } = cls;
  return JSON.stringify(sorted(look));
}

export type ClassMerge = {
  design: DesignSystem;
  /** Saved class id → the id it has on this site. */
  ids: Map<string, string>;
  added: string[];
  reused: string[];
  renamed: { from: string; to: string }[];
};

/**
 * Brings a saved section's classes onto this site (D-060). Never changes a class that is already
 * here: a class with the same id or name and the same look is reused; one whose look differs is
 * added as a copy with a numbered name ("Card 2") and a new id; a missing one is added.
 */
export function mergeSectionClasses(
  design: DesignSystem,
  incoming: readonly StyleClass[],
): ClassMerge | Refusal {
  const classes = [...(design.classes ?? [])];
  const merge: ClassMerge = { design, ids: new Map(), added: [], reused: [], renamed: [] };
  for (const raw of incoming) {
    // A ref to a colour or size this site doesn't have is dropped, like on paste.
    const { style } = prepareStyle(raw, design);
    const cls: StyleClass = { id: raw.id, name: raw.name, style: style.style ?? {} };
    if (style.states) cls.states = style.states;
    if (style.devices) cls.devices = style.devices;
    if (style.hiddenOn) cls.hiddenOn = style.hiddenOn;
    const look = lookOf(cls);
    const same = classes.find(
      (c) => (c.id === cls.id || nameKey(c.name) === nameKey(cls.name)) && lookOf(c) === look,
    );
    if (same) {
      merge.ids.set(raw.id, same.id);
      merge.reused.push(same.name);
      continue;
    }
    if (classes.length >= MAX_CLASSES) return refuse(SAVED_SECTION_REASONS.tooManyClasses);
    const names = new Set(classes.map((c) => nameKey(c.name)));
    let name = cls.name;
    for (let n = 2; names.has(nameKey(name)); n++) {
      name = `${clipText(cls.name, 54).trim()} ${n}`;
    }
    const ids = new Set(classes.map((c) => c.id));
    const base = ids.has(cls.id)
      ? slugify(name).slice(0, 34).replace(/-+$/, "") || "class"
      : cls.id;
    let id = base;
    for (let n = 2; ids.has(id); n++) id = `${base}-${n}`.slice(0, 40);
    classes.push({ ...cls, id, name });
    merge.ids.set(raw.id, id);
    if (name === cls.name) merge.added.push(name);
    else merge.renamed.push({ from: cls.name, to: name });
  }
  merge.design = { ...design, classes };
  return merge;
}

function withClassIds(node: LayoutNode, ids: ReadonlyMap<string, string>): LayoutNode {
  const kids = nodeChildren(node);
  const next = { ...node } as LayoutNode;
  if (node.classes) next.classes = node.classes.map((id) => ids.get(id) ?? id);
  if (kids.length > 0) {
    (next as { children: LayoutNode[] }).children = kids.map((kid) => withClassIds(kid, ids));
  }
  return next;
}

export type PreparedSection = {
  node: LayoutNode;
  design: DesignSystem;
  merge: ClassMerge;
  dropped: Dropped;
};

/**
 * The node to insert for a saved section on `layout`, and the site styles with its classes:
 * classes merged as above, then the same checks as a paste (new ids, CSS ids already on the page
 * dropped, links, images and SVGs sanitized).
 */
export function prepareSavedSection(
  section: SavedSection,
  layout: Layout,
  design: DesignSystem,
  random: () => number = Math.random,
  /** A merge already applied to `design` (its classes are saved): reused, not merged again. */
  merged?: ClassMerge,
): ({ ok: true } & PreparedSection) | Refusal {
  const merge = merged ?? mergeSectionClasses(design, section.classes);
  if ("ok" in merge) return merge;
  const remapped = withClassIds(section.node, merge.ids);
  const { node, dropped } = prepareElement(remapped, layout, merge.design, random);
  return { ok: true, node, design: merge.design, merge, dropped };
}

/** Prepares and adds a saved section near the selection, like a section recipe (W-320). */
export function insertSavedSection(
  section: SavedSection,
  layout: Layout,
  design: DesignSystem,
  selectedId: string | null,
  random: () => number = Math.random,
): ({ design: DesignSystem; merge: ClassMerge; dropped: Dropped } & Added) | Refusal {
  const prepared = prepareSavedSection(section, layout, design, random);
  if (!prepared.ok) return prepared;
  const added = addSectionNear(layout, prepared.node, selectedId);
  if (!added.ok) return added;
  return { ...added, design: prepared.design, merge: prepared.merge, dropped: prepared.dropped };
}

/** "Classes: 1 added, 1 renamed (Card → Card 2)" for the notice, or null when nothing changed. */
export function classMergeNotice(merge: ClassMerge): string | null {
  const parts: string[] = [];
  if (merge.added.length > 0) parts.push(`${merge.added.length} added`);
  if (merge.renamed.length > 0) {
    const list = merge.renamed.map(({ from, to }) => `${from} → ${to}`).join(", ");
    parts.push(`${merge.renamed.length} added as a copy (${list})`);
  }
  return parts.length > 0 ? `Classes: ${parts.join("; ")}.` : null;
}

/**
 * The layout of a new Section theme part for a synced section (W-876, W-098): a copy of the
 * element with fresh ids and no A/B arms. Null for the page itself or an unknown id.
 */
export function syncedPartLayout(
  layout: Layout,
  nodeId: string,
  random: () => number = Math.random,
): Layout | null {
  const found = nodeId === layout.root.id ? undefined : findNode(layout, nodeId);
  if (!found) return null;
  return {
    schemaVersion: LAYOUT_SCHEMA_VERSION,
    root: {
      id: newNodeId(random),
      type: "container",
      props: {},
      children: [withFreshIds(layout, withoutVariants(found), random)],
    },
  };
}
