import type { DesignSystem } from "../schema/design.ts";
import type { Layout, LayoutNode } from "../schema/layout.ts";
import type { StyleProps } from "../schema/style.ts";
import { nodeChildren, updateNode } from "../tree-ops.ts";

export type VariableKind = "color" | "font" | "fontSize" | "spacing";

/** Where a design variable is referenced from a layout (or, later, a class style). */
export type VariableUsage = {
  nodeId: string;
  prop: string;
  /** Present when the ref lives on a design class style (W-030). */
  classId?: string;
};

type VariableRefLike = { var: string; from?: VariableKind };

const isVariableRef = (value: unknown): value is VariableRefLike =>
  typeof value === "object" &&
  value !== null &&
  "var" in value &&
  typeof (value as { var: unknown }).var === "string";

/** Colour refs omit `from` (legacy); length/font refs set it (W-028). */
export function refMatchesKind(ref: VariableRefLike, kind: VariableKind): boolean {
  if (kind === "color") return ref.from === undefined || ref.from === "color";
  return ref.from === kind;
}

function collectStyleUsages(
  style: StyleProps | undefined,
  id: string,
  kind: VariableKind | undefined,
  hit: (prop: string) => void,
): void {
  if (!style) return;
  for (const [prop, value] of Object.entries(style)) {
    if (!isVariableRef(value)) continue;
    if (value.var !== id) continue;
    if (kind !== undefined && !refMatchesKind(value, kind)) continue;
    hit(prop);
  }
}

function walkNodes(node: LayoutNode, visit: (node: LayoutNode) => void): void {
  visit(node);
  for (const child of nodeChildren(node)) walkNodes(child, visit);
}

/** Find every style property on `layout` that references variable `id` (optionally of `kind`). */
export function findVariableUsages(
  layout: Layout,
  id: string,
  kind?: VariableKind,
): VariableUsage[] {
  const usages: VariableUsage[] = [];
  walkNodes(layout.root, (node) => {
    collectStyleUsages(node.style, id, kind, (prop) => {
      usages.push({ nodeId: node.id, prop });
    });
  });
  return usages;
}

/**
 * Usages on design class styles (W-030). Safe no-op until `classes` exist on the design.
 * Keeps the W-029 API ready for the Site styles delete dialog.
 */
export function findVariableUsagesInDesign(
  design: DesignSystem & { classes?: ReadonlyArray<{ id: string; style?: StyleProps }> },
  id: string,
  kind?: VariableKind,
): VariableUsage[] {
  const usages: VariableUsage[] = [];
  for (const cls of design.classes ?? []) {
    collectStyleUsages(cls.style, id, kind, (prop) => {
      usages.push({ nodeId: "", prop, classId: cls.id });
    });
  }
  return usages;
}

function stripRefsFromStyle(
  style: StyleProps | undefined,
  id: string,
  kind: VariableKind | undefined,
): StyleProps | undefined {
  if (!style) return undefined;
  let changed = false;
  const next: Record<string, unknown> = { ...style };
  for (const [prop, value] of Object.entries(style)) {
    if (!isVariableRef(value)) continue;
    if (value.var !== id) continue;
    if (kind !== undefined && !refMatchesKind(value, kind)) continue;
    delete next[prop];
    changed = true;
  }
  if (!changed) return style;
  return Object.keys(next).length === 0 ? undefined : (next as StyleProps);
}

/** Drop every `{ var: id }` style binding on the layout (fallback to defaults). Pure. */
export function clearVariableRefs(layout: Layout, id: string, kind?: VariableKind): Layout {
  let next = layout;
  const usages = findVariableUsages(layout, id, kind);
  // Deduplicate node ids — a node may reference the same var on several props.
  const nodeIds = [...new Set(usages.map((u) => u.nodeId))];
  for (const nodeId of nodeIds) {
    next = updateNode(next, nodeId, (node) => {
      const style = stripRefsFromStyle(node.style, id, kind);
      if (style === node.style) return node;
      if (style === undefined) {
        const { style: _drop, ...rest } = node;
        return rest as LayoutNode;
      }
      return { ...node, style };
    });
  }
  return next;
}

const KIND_TO_LIST = {
  color: "colors",
  font: "fonts",
  fontSize: "fontSizes",
  spacing: "spacings",
} as const;

/** Remove a variable from the design document (name/id lists). Pure; does not touch layouts. */
export function removeVariable(design: DesignSystem, id: string, kind: VariableKind): DesignSystem {
  const key = KIND_TO_LIST[kind];
  const list = design.variables[key] ?? [];
  const filtered = list.filter((v) => v.id !== id);
  if (filtered.length === list.length) return design;
  return {
    ...design,
    variables: {
      ...design.variables,
      [key]: filtered,
    },
  };
}

/** Rename is name-only; variable ids stay stable (slug at create time). */
export function renameVariable(
  design: DesignSystem,
  id: string,
  kind: VariableKind,
  name: string,
): DesignSystem {
  const trimmed = name.trim();
  if (!trimmed) return design;
  const key = KIND_TO_LIST[kind];
  const list = design.variables[key] ?? [];
  let changed = false;
  const next = list.map((v) => {
    if (v.id !== id || v.name === trimmed) return v;
    changed = true;
    return Object.assign({}, v, { name: trimmed });
  });
  if (!changed) return design;
  return {
    ...design,
    variables: {
      ...design.variables,
      [key]: next,
    },
  };
}

/**
 * Delete a variable: remove it from the design and clear refs on `layout`.
 * Callers that need a confirmation dialog should run `findVariableUsages` first.
 */
export function deleteVariable(
  design: DesignSystem,
  layout: Layout,
  id: string,
  kind: VariableKind,
): { design: DesignSystem; layout: Layout } {
  return {
    design: removeVariable(design, id, kind),
    layout: clearVariableRefs(layout, id, kind),
  };
}
