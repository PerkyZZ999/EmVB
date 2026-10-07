import type { DesignSystem } from "../schema/design.ts";
import type { Layout, LayoutNode } from "../schema/layout.ts";
import { cleanClassName } from "./classes.ts";
import { STYLE_STATES } from "../schema/state-names.ts";
import type { DeviceStyles, StyleProps, StyleStates } from "../schema/style.ts";
import { nodeChildren, slugify, updateNode } from "../tree-ops.ts";

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

/** Nested colour refs: the box shadow (W-088), and gradient stops and the overlay (W-094). */
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
  style.gradient?.stops.forEach((stop, index) => {
    if (matches(stop.color, id, kind)) hit(`gradient.stops.${index}`);
  });
  if (matches(style.overlay?.color, id, kind)) hit("overlay.color");
}

const RESPONSIVE = ["tablet", "mobile"] as const;

/** Style, state styles and device overrides. A nested usage is `<state|device>.<prop>`. */
function collectAllUsages(
  owner: { style?: StyleProps; states?: StyleStates; devices?: DeviceStyles },
  id: string,
  kind: VariableKind | undefined,
  hit: (prop: string) => void,
): void {
  collectStyleUsages(owner.style, id, kind, hit);
  for (const state of STYLE_STATES) {
    collectStyleUsages(owner.states?.[state], id, kind, (prop) => hit(`${state}.${prop}`));
  }
  for (const device of RESPONSIVE) {
    collectStyleUsages(owner.devices?.[device], id, kind, (prop) => hit(`${device}.${prop}`));
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
  if (style.gradient?.stops.some((stop) => matches(stop.color, id, kind))) {
    delete next["gradient"];
    changed = true;
  }
  if (style.overlay && matches(style.overlay.color, id, kind)) {
    delete next["overlay"];
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

function stripRefsFromDevices(
  devices: DeviceStyles | undefined,
  id: string,
  kind: VariableKind | undefined,
): DeviceStyles | undefined {
  if (!devices) return undefined;
  let changed = false;
  const next: DeviceStyles = { ...devices };
  for (const device of RESPONSIVE) {
    const style = stripRefsFromStyle(devices[device], id, kind);
    if (style === devices[device]) continue;
    changed = true;
    if (style) next[device] = style;
    else delete next[device];
  }
  if (!changed) return devices;
  return next.tablet || next.mobile ? next : undefined;
}

/** Style, states and device overrides with the refs removed. Same object when nothing changed. */
function stripOwner<T extends { style?: StyleProps; states?: StyleStates; devices?: DeviceStyles }>(
  owner: T,
  id: string,
  kind: VariableKind | undefined,
): T {
  const style = stripRefsFromStyle(owner.style, id, kind);
  const states = stripRefsFromStates(owner.states, id, kind);
  const devices = stripRefsFromDevices(owner.devices, id, kind);
  if (style === owner.style && states === owner.states && devices === owner.devices) return owner;
  const next: T = { ...owner, style, states, devices };
  if (style === undefined) delete next.style;
  if (states === undefined) delete next.states;
  if (devices === undefined) delete next.devices;
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

/** Most variables of each kind a site may have; the design schema refuses more (W-219). */
export const MAX_VARIABLES = { color: 200, font: 50, fontSize: 50, spacing: 100 } as const;

/** True when a site already has the most variables of `kind` allowed (W-219). */
export function variableListFull(design: DesignSystem, kind: VariableKind): boolean {
  return (design.variables[KIND_TO_LIST[kind]] ?? []).length >= MAX_VARIABLES[kind];
}

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

/** A copy of a variable, with a new id and the name "… copy". The source is unchanged. Pure. */
export function duplicateVariable(
  design: DesignSystem,
  id: string,
  kind: VariableKind,
): DesignSystem {
  const key = KIND_TO_LIST[kind];
  const list = design.variables[key] ?? [];
  const source = list.find((entry) => entry.id === id);
  // A copy past the cap, or a name past 60 characters, would fail to save (W-219).
  if (!source || variableListFull(design, kind)) return design;
  const name = `${source.name.slice(0, 55).trim()} copy`;
  const base = slugify(name).slice(0, 34) || kind;
  const taken = new Set(list.map((entry) => entry.id));
  let nextId = base;
  for (let n = 2; taken.has(nextId); n++) nextId = `${base}-${n}`.slice(0, 40);
  const copy = Object.assign({}, source, {
    id: nextId,
    name,
    value: typeof source.value === "object" ? structuredClone(source.value) : source.value,
  });
  return {
    ...design,
    variables: { ...design.variables, [key]: [...list, copy] },
  };
}

/** Rename is name-only; variable ids stay stable (slug at create time). */
export function renameVariable(
  design: DesignSystem,
  id: string,
  kind: VariableKind,
  name: string,
): DesignSystem {
  const trimmed = cleanClassName(name);
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
