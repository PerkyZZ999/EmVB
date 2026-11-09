import { applyProposal, type Proposal, type ProposalRefusal } from "../../core/proposals.ts";
import type { DesignSystem } from "../../core/schema/design.ts";
import type { Layout, LayoutNode } from "../../core/schema/layout.ts";
import { findNode, forEachNode } from "../../core/tree-ops.ts";
import { ELEMENT_NAMES } from "./element-chrome.ts";

/**
 * W-930 co-design review, as pure functions over the editor's own state. Accepting runs the same
 * `applyProposal` the server checked with, on the page as it is in the editor now (unsaved edits
 * included), so nothing an agent sent reaches the page without passing every save-time check.
 */

export type Op = Proposal["ops"][number];
export type OpGroup = "added" | "changed" | "moved" | "removed" | "styles";
export const GROUP_LABELS: Record<OpGroup, string> = {
  added: "Added",
  changed: "Changed",
  moved: "Moved",
  removed: "Removed",
  styles: "Site styles",
};
export const GROUP_ORDER: readonly OpGroup[] = ["added", "changed", "moved", "removed", "styles"];

/** What the editor knows about its page and styles, as a proposal base. */
export type EditorBase = {
  rev: string | null;
  layout: Layout | null;
  design: DesignSystem;
  /** The style draft's revision, or the published one when there is no draft (as the server). */
  designRevision: string | null;
};

export const groupOf = (op: Op): OpGroup =>
  op.kind === "insert"
    ? "added"
    : op.kind === "update"
      ? "changed"
      : op.kind === "move"
        ? "moved"
        : op.kind === "delete"
          ? "removed"
          : "styles";

const nameOf = (node: { type?: unknown } | undefined | null): string =>
  (typeof node?.type === "string" && ELEMENT_NAMES[node.type]) ||
  (typeof node?.type === "string" ? node.type : "Element");

const textOf = (node: unknown): string | undefined => {
  const props = (node as { props?: Record<string, unknown> } | null)?.props;
  const text = props?.["text"] ?? props?.["label"];
  if (typeof text !== "string" || !text.trim()) return undefined;
  const plain = text.trim().replace(/\s+/g, " ");
  return plain.length > 48 ? `${plain.slice(0, 47)}…` : plain;
};

const quoted = (text: string | undefined) => (text ? ` “${text}”` : "");

/** One line a person can read: what the change does, to which element. Agent text is quoted. */
export function describeOp(op: Op, layout: Layout | null): string {
  const target = (id: string) => (layout ? findNode(layout, id) : null);
  switch (op.kind) {
    case "insert": {
      const parent = target(op.parentId);
      return `Add ${nameOf(op.node)}${quoted(textOf(op.node))} to ${nameOf(parent)}`;
    }
    case "update": {
      const node = target(op.id);
      const fields = Object.keys(op.set).join(", ");
      const text = textOf({ props: op.set["props"] });
      return text
        ? `Change ${nameOf(node)} text to${quoted(text)}`
        : `Change ${nameOf(node)}${quoted(textOf(node))}: ${fields}`;
    }
    case "move": {
      const node = target(op.id);
      return `Move ${nameOf(node)}${quoted(textOf(node))} into ${nameOf(target(op.parentId))}`;
    }
    case "delete": {
      const node = target(op.id);
      return `Remove ${nameOf(node)}${quoted(textOf(node))}`;
    }
    case "class":
      return op.value === null
        ? `Remove class ${op.id}`
        : `Set class “${String(op.value["name"] ?? op.id)}”`;
    case "variable":
      return op.value === null
        ? `Remove ${op.group} variable ${op.id}`
        : `Set ${op.group} variable “${String(op.value["name"] ?? op.id)}”`;
  }
}

const baseOf = (editor: EditorBase) => ({
  revision: editor.rev ?? "",
  layout: editor.layout,
  design: editor.design,
  designRevision: editor.designRevision,
});

/**
 * The page and styles with the selected changes applied, or why they can't be. Never mutates the
 * editor's state; the caller dispatches the result as one undoable edit.
 */
export function acceptOps(
  editor: EditorBase,
  proposal: Proposal,
  selected: readonly number[],
): { ok: true; layout: Layout; design: DesignSystem; designChanged: boolean } | ProposalRefusal {
  const applied = applyProposal(
    baseOf(editor),
    proposal,
    [...selected].toSorted((a, b) => a - b),
  );
  if (!applied.ok) return applied;
  const designChanged = selected.some((i) => groupOf(proposal.ops[i] as Op) === "styles");
  return { ...applied, designChanged };
}

export type Ghost = {
  layout: Layout;
  added: Set<string>;
  changed: Set<string>;
  removed: Set<string>;
};

const idsOf = (layout: Layout): Set<string> => {
  const ids = new Set<string>();
  forEachNode(layout.root as LayoutNode, (node) => ids.add(node.id));
  return ids;
};

/**
 * W-930 ghost preview of pending changes: the layout with every pending insert, update and move
 * applied, and removals kept in place so they can be shown struck through. A new layout object;
 * the editor's own layout is never touched. Null when the pending changes don't apply.
 */
export function ghostOf(
  editor: EditorBase,
  proposal: Proposal,
  pending: readonly number[],
): Ghost | null {
  if (!editor.layout) return null;
  const shown = pending.filter((i) => {
    const op = proposal.ops[i];
    return op && op.kind !== "delete" && groupOf(op) !== "styles";
  });
  const before = idsOf(editor.layout);
  const applied =
    shown.length === 0
      ? { ok: true as const, layout: structuredClone(editor.layout) }
      : applyProposal(baseOf(editor), proposal, shown);
  if (!applied.ok) return null;
  const added = new Set([...idsOf(applied.layout)].filter((id) => !before.has(id)));
  const changed = new Set<string>();
  const removed = new Set<string>();
  for (const i of pending) {
    const op = proposal.ops[i];
    if (op?.kind === "update" || op?.kind === "move") changed.add(op.id);
    if (op?.kind === "delete") removed.add(op.id);
  }
  return { layout: applied.layout, added, changed, removed };
}

/** Canvas CSS that marks the ghost: added = blue outline, changed = dashed, removed = struck. */
const ghostSelector = (ids: Set<string>) =>
  [...ids].map((id) => `[data-emvb-id="${id.replace(/[^A-Za-z0-9_-]/g, "")}"]`).join(",");

export function ghostCss(ghost: Ghost): string {
  const sel = ghostSelector;
  const rules: string[] = [];
  if (ghost.added.size)
    rules.push(`${sel(ghost.added)}{outline:2px solid #2563eb;outline-offset:2px}`);
  if (ghost.changed.size)
    rules.push(`${sel(ghost.changed)}{outline:2px dashed #2563eb;outline-offset:2px}`);
  if (ghost.removed.size)
    rules.push(
      `${sel(ghost.removed)}{outline:2px dashed #dc2626;outline-offset:2px;opacity:.5;text-decoration:line-through}`,
    );
  return rules.join("\n");
}
