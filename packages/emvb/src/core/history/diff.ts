import { withFreshIds } from "../arrange.ts";
import { MAX_NODES } from "../limits.ts";
import type { Layout, LayoutNode } from "../schema/layout.ts";
import { insertNode, nodeChildren, updateNode } from "../tree-ops.ts";

export type SectionChange = {
  id: string;
  type: string;
  label?: string;
  kind: "added" | "removed" | "changed" | "moved" | "same";
  /** Elements inside that differ (added, removed or edited), for changed sections. */
  edits: number;
};

/** A stable text of a node without its children, to tell edits from unchanged nodes. */
function own(node: LayoutNode): string {
  const { children: _children, ...rest } = node as LayoutNode & { children?: unknown };
  return JSON.stringify(rest);
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
  ...(node.label ? { label: node.label } : {}),
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

const count = (node: LayoutNode): number =>
  1 + nodeChildren(node).reduce((sum, child) => sum + count(child), 0);

/**
 * Puts one section of an older version back on the current page (W-315): it replaces the
 * current section with the same id, or, if it was removed, goes back near its old place. Ids
 * already used elsewhere on the page are renewed, so the page stays valid.
 */
export function restoreSection(
  current: Layout,
  older: Layout,
  sectionId: string,
): { ok: true; layout: Layout } | { ok: false; reason: string } {
  const oldIndex = older.root.children.findIndex((n) => n.id === sectionId);
  const section = older.root.children[oldIndex];
  if (!section) return { ok: false, reason: "That section isn't in this version." };
  const replacing = current.root.children.find((n) => n.id === sectionId);
  const elsewhere = new Set(index(current.root).keys());
  if (replacing) for (const id of index(replacing).keys()) elsewhere.delete(id);
  const clashes = [...index(section).keys()].some((id) => elsewhere.has(id));
  const incoming = clashes ? withFreshIds(current, section) : section;
  const size = count(current.root) - (replacing ? count(replacing) : 0) + count(incoming);
  if (size > MAX_NODES) return { ok: false, reason: "The page would have too many elements." };
  if (replacing && !clashes) {
    return { ok: true, layout: updateNode(current, sectionId, () => structuredClone(section)) };
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
