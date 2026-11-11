import { withFreshIds } from "../arrange.ts";
import { MAX_NODES } from "../limits.ts";
import { stableJson } from "../stable-json.ts";
import type { Layout, LayoutNode } from "../schema/layout.ts";
import { insertNode, nodeChildren, updateNode } from "../tree-ops.ts";

export type SectionChange = {
  id: string;
  type: string;
  label?: string;
  kind: "added" | "removed" | "changed" | "moved" | "same";
  /** Elements inside that differ (added, removed or edited), for changed sections. */
  edits: number;
  /** W-973: the page itself (its root's styles, classes and settings), not a section. */
  page?: true;
};

/**
 * A stable text of a node without its children, to tell edits from unchanged nodes. Key order
 * is ignored, so the same element saved and reloaded doesn't count as edited (W-518).
 */
function own(node: LayoutNode): string {
  const { children: _children, ...rest } = node as LayoutNode & { children?: unknown };
  return stableJson(rest);
}

function index(node: LayoutNode, into = new Map<string, LayoutNode>()): Map<string, LayoutNode> {
  into.set(node.id, node);
  for (const child of nodeChildren(node)) index(child, into);
  return into;
}

/** How many elements differ between two versions of a subtree. */
function editsBetween(before: LayoutNode, after: LayoutNode): number {
  const a = index(before);
  const b = index(after);
  let edits = 0;
  for (const [id, node] of a) {
    const other = b.get(id);
    if (!other) edits += 1;
    else if (own(node) !== own(other)) edits += 1;
    else if (
      nodeChildren(node)
        .map((c) => c.id)
        .join() !==
      nodeChildren(other)
        .map((c) => c.id)
        .join()
    )
      edits += 1;
  }
  for (const id of b.keys()) if (!a.has(id)) edits += 1;
  return edits;
}

const describe = (node: LayoutNode) => ({
  id: node.id,
  type: node.type,
  ...(node.editorLabel ? { label: node.editorLabel } : {}),
});

/**
 * What changed between an older version and the current page, section by section (W-315). A
 * section is a child of the page root. Sections only in the old version are "removed"; in
 * page order, with removed ones at their old position.
 */
export function diffSections(older: Layout, current: Layout): SectionChange[] {
  const before = older.root.children;
  const after = current.root.children;
  const beforeIds = new Map(before.map((node, i) => [node.id, i]));
  const afterIds = new Set(after.map((node) => node.id));
  const changes: SectionChange[] = [];
  // W-973: the page's own styles (the root's style, devices, states, classes…) are listed first;
  // a version that only changed those used to read as "no changes".
  if (older.root.id === current.root.id && own(older.root) !== own(current.root)) {
    changes.push({
      id: current.root.id,
      type: "container",
      label: "Page styles",
      kind: "changed",
      edits: 1,
      page: true,
    });
  }
  const removedAt = new Map<number, LayoutNode[]>();
  for (const [i, node] of before.entries()) {
    if (!afterIds.has(node.id)) removedAt.set(i, [...(removedAt.get(i) ?? []), node]);
  }
  const keptOrder = before.filter((n) => afterIds.has(n.id)).map((n) => n.id);
  const nowOrder = after.filter((n) => beforeIds.has(n.id)).map((n) => n.id);
  const flush = (upTo: number) => {
    for (const [at, nodes] of [...removedAt].filter(([pos]) => pos <= upTo)) {
      for (const node of nodes) changes.push({ ...describe(node), kind: "removed", edits: 0 });
      removedAt.delete(at);
    }
  };
  for (const node of after) {
    const old = beforeIds.get(node.id);
    if (old === undefined) {
      changes.push({ ...describe(node), kind: "added", edits: 0 });
      continue;
    }
    flush(old);
    const oldNode = before[old] as LayoutNode;
    const edits = editsBetween(oldNode, node);
    const moved = keptOrder.indexOf(node.id) !== nowOrder.indexOf(node.id);
    changes.push({
      ...describe(node),
      kind: edits > 0 ? "changed" : moved ? "moved" : "same",
      edits,
    });
  }
  flush(Number.POSITIVE_INFINITY);
  return changes;
}

/** `node` without the CSS ids that `taken` already holds, so a restored section never repeats one. */
function withoutTakenHtmlIds(node: LayoutNode, taken: Set<string>): LayoutNode {
  const kids = nodeChildren(node);
  const { htmlId, ...rest } = node;
  const keep = htmlId && !taken.has(htmlId) ? { htmlId } : {};
  const out = { ...rest, ...keep } as LayoutNode;
  if (kids.length === 0) return out;
  return { ...out, children: kids.map((child) => withoutTakenHtmlIds(child, taken)) } as LayoutNode;
}

const htmlIdsOf = (node: LayoutNode, skip?: LayoutNode): Set<string> => {
  const ids = new Set<string>();
  const walk = (n: LayoutNode) => {
    if (n === skip) return;
    if (n.htmlId) ids.add(n.htmlId);
    for (const child of nodeChildren(n)) walk(child);
  };
  walk(node);
  return ids;
};

const count = (node: LayoutNode): number =>
  1 + nodeChildren(node).reduce((sum, child) => sum + count(child), 0);

/**
 * Puts one section of an older version back on the current page (W-315): it replaces the
 * current section with the same id, or, if it was removed, goes back near its old place. Ids
 * already used elsewhere on the page are renewed, so the page stays valid.
 */
/** `node` with the A/B mark removed from every element whose id is in `live` (W-636). */
function withoutCopiedArms(node: LayoutNode, live: ReadonlySet<string>): LayoutNode {
  let next = node;
  if (node.variant && live.has(node.id)) {
    next = { ...node };
    delete next.variant;
  }
  const kids = nodeChildren(next);
  if (kids.length === 0) return next;
  return {
    ...next,
    children: kids.map((child) => withoutCopiedArms(child, live)),
  } as LayoutNode;
}

export function restoreSection(
  current: Layout,
  older: Layout,
  sectionId: string,
): { ok: true; layout: Layout } | { ok: false; reason: string } {
  // W-973: the page's own styles come back without touching its sections.
  if (sectionId === older.root.id && sectionId === current.root.id) {
    const { children: _old, ...settings } = older.root;
    return {
      ok: true,
      layout: {
        ...current,
        root: { ...structuredClone(settings), children: current.root.children },
      },
    };
  }
  const oldIndex = older.root.children.findIndex((n) => n.id === sectionId);
  const section = older.root.children[oldIndex];
  if (!section) return { ok: false, reason: "That section isn't in this version." };
  const replacing = current.root.children.find((n) => n.id === sectionId);
  const elsewhere = new Set(index(current.root).keys());
  if (replacing) for (const id of index(replacing).keys()) elsewhere.delete(id);
  const clashes = [...index(section).keys()].some((id) => elsewhere.has(id));
  // CSS ids another section took since then stay there: a repeat made the page fail to save (W-517).
  const takenHtml = htmlIdsOf(current.root, replacing);
  // An element still on the page elsewhere comes back as a copy, and a copy is never part of an
  // A/B test (W-629/W-632): it would add a second copy of a live arm (W-636).
  const fresh = clashes ? withFreshIds(current, withoutCopiedArms(section, elsewhere)) : section;
  const incoming = withoutTakenHtmlIds(fresh, takenHtml);
  const size = count(current.root) - (replacing ? count(replacing) : 0) + count(incoming);
  if (size > MAX_NODES) return { ok: false, reason: "The page would have too many elements." };
  if (replacing && !clashes) {
    return { ok: true, layout: updateNode(current, sectionId, () => structuredClone(incoming)) };
  }
  // Removed (or renewed): after the nearest earlier section that is still on the page.
  const before = new Set(older.root.children.slice(0, oldIndex).map((n) => n.id));
  let at = 0;
  for (const [i, node] of current.root.children.entries()) if (before.has(node.id)) at = i + 1;
  if (replacing) {
    at = current.root.children.indexOf(replacing);
    const without = {
      ...current,
      root: { ...current.root, children: current.root.children.filter((n) => n !== replacing) },
    };
    return {
      ok: true,
      layout: insertNode(without, current.root.id, at, structuredClone(incoming)),
    };
  }
  return { ok: true, layout: insertNode(current, current.root.id, at, structuredClone(incoming)) };
}

/** The ids each kind of change covers, for outlining a diff on a rendered page (W-315). */
export function changedIds(
  changes: SectionChange[],
): Record<"added" | "removed" | "changed", string[]> {
  const out = { added: [] as string[], removed: [] as string[], changed: [] as string[] };
  for (const c of changes) {
    if (c.kind === "added" || c.kind === "removed" || c.kind === "changed") out[c.kind].push(c.id);
  }
  return out;
}
