import type { DesignSystem } from "../schema/design.ts";
import type { Layout, LayoutNode } from "../schema/layout.ts";
import { STYLE_STATES } from "../schema/state-names.ts";
import type { StyleProps, StyleStates } from "../schema/style.ts";
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

const matches = (value: unknown, id: string, kind: VariableKind | undefined) =>
  isVariableRef(value) && value.var === id && (kind === undefined || refMatchesKind(value, kind));

/** The box shadow's colour is the one ref nested inside a style value (W-088). */
const shadowColorMatches = (style: StyleProps, id: string, kind: VariableKind | undefined) =>
  matches(style.boxShadow?.color, id, kind);

function collectStyleUsages(
  style: StyleProps | undefined,
  id: string,
  kind: VariableKind | undefined,
  hit: (prop: string) => void,
): void {
  if (!style) return;
  for (const [prop, value] of Object.entries(style)) {
    if (matches(value, id, kind)) hit(prop);
  }
  if (shadowColorMatches(style, id, kind)) hit("boxShadow.color");
}

/** Style and state styles (W-089) together; a state usage is reported as `<state>.<prop>`. */
function collectAllUsages(
  owner: { style?: StyleProps; states?: StyleStates },
  id: string,
  kind: VariableKind | undefined,
  hit: (prop: string) => void,
): void {
  collectStyleUsages(owner.style, id, kind, hit);
  for (const state of STYLE_STATES) {
    collectStyleUsages(owner.states?.[state], id, kind, (prop) => hit(`${state}.${prop}`));
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
    collectAllUsages(node, id, kind, (prop) => {
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
  design: DesignSystem,
  id: string,
  kind?: VariableKind,
): VariableUsage[] {
  const usages: VariableUsage[] = [];
  for (const cls of design.classes ?? []) {
    collectAllUsages(cls, id, kind, (prop) => {
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
    if (!matches(value, id, kind)) continue;
    delete next[prop];
    changed = true;
  }
  if (style.boxShadow && shadowColorMatches(style, id, kind)) {
    const { color: _drop, ...shadow } = style.boxShadow;
    next["boxShadow"] = shadow;
    changed = true;
  }
  if (!changed) return style;
  return Object.keys(next).length === 0 ? undefined : (next as StyleProps);
}

/** The same for every state; a state left empty is dropped, and so is `states` itself. */
function stripRefsFromStates(
  states: StyleStates | undefined,
  id: string,
  kind: VariableKind | undefined,
): StyleStates | undefined {
  if (!states) return undefined;
  let changed = false;
  const next: StyleStates = {};
  for (const state of STYLE_STATES) {
    const style = states[state];
    if (!style) continue;
    const stripped = stripRefsFromStyle(style, id, kind);
    if (stripped !== style) changed = true;
    if (stripped) next[state] = stripped;
  }
  if (!changed) return states;
  return Object.keys(next).length === 0 ? undefined : next;
}

/** Style and states with the refs removed, keeping the same object when nothing changed. */
function stripOwner<T extends { style?: StyleProps; states?: StyleStates }>(
  owner: T,
  id: string,
  kind: VariableKind | undefined,
): T {
  const style = stripRefsFromStyle(owner.style, id, kind);
  const states = stripRefsFromStates(owner.states, id, kind);
  if (style === owner.style && states === owner.states) return owner;
  const next: T = { ...owner, style, states };
  if (style === undefined) delete next.style;
  if (states === undefined) delete next.states;
  return next;
}

/** Drop every `{ var: id }` style binding on the layout (fallback to defaults). Pure. */
export function clearVariableRefs(layout: Layout, id: string, kind?: VariableKind): Layout {
  let next = layout;
  const usages = findVariableUsages(layout, id, kind);
  // Deduplicate node ids — a node may reference the same var on several props.
  const nodeIds = [...new Set(usages.map((u) => u.nodeId))];
  for (const nodeId of nodeIds) {
    next = updateNode(next, nodeId, (node) => stripOwner(node, id, kind));
  }
  return next;
}

const KIND_TO_LIST = {
  color: "colors",
  font: "fonts",
  fontSize: "fontSizes",
  spacing: "spacings",
} as const;

/** Drop every binding to the variable on class styles; a class left with none keeps `{}`. */
function clearClassStyleRefs(
  classes: DesignSystem["classes"],
  id: string,
  kind: VariableKind,
): DesignSystem["classes"] {
  if (!classes) return classes;
  let changed = false;
  const next = classes.map((cls) => {
    const stripped = stripOwner(cls, id, kind);
    if (stripped === cls) return cls;
    changed = true;
    return { ...stripped, style: stripped.style ?? {} };
  });
  return changed ? next : classes;
}

/** Remove a variable from the design document and its bindings on class styles. Pure; does not touch layouts. */
export function removeVariable(design: DesignSystem, id: string, kind: VariableKind): DesignSystem {
  const key = KIND_TO_LIST[kind];
  const list = design.variables[key] ?? [];
  const filtered = list.filter((v) => v.id !== id);
  const classes = clearClassStyleRefs(design.classes, id, kind);
  if (filtered.length === list.length && classes === design.classes) return design;
  return {
    ...design,
    variables: {
      ...design.variables,
      [key]: filtered,
    },
    ...(classes ? { classes } : {}),
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
 * Delete a variable: remove it from the design, clear refs on class styles and on `layout`.
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
