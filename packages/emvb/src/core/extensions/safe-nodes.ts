/**
 * Turn an extension render() result into built-in LayoutNodes EmVB will render (W-927).
 * Rejects raw HTML strings, unknown types, nested extension types, and oversized trees.
 * Surviving nodes are re-validated through EmVB's layout schema so props and styles
 * pass the same sanitizer as editor-saved content.
 */

import { LAYOUT_SCHEMA_VERSION, type LayoutNode } from "../schema/layout.ts";
import { KNOWN_ELEMENT_TYPES } from "../schema/layout.ts";
import { validateLayout } from "../validate.ts";
import { newNodeId } from "../tree-ops.ts";
import { isExtensionType } from "./namespace.ts";
import { filterExtensionClasses, filterExtensionVars, type ExtensionVarRule } from "./classes.ts";

/**
 * W-1086: the extension classes each validated output node keeps. Render output only: they ride
 * beside the node, never in it, so the stored layout schema and its validation are unchanged.
 */
const EXT_CLASSES = new WeakMap<object, readonly string[]>();
/** extensionApi 1.5: the same for `extVars`, the custom properties an output node keeps. */
const EXT_VARS = new WeakMap<object, Readonly<Record<string, string>>>();

/** The allowlisted extension classes of an output node (none for every other node). */
export function extensionClassesOf(node: object): readonly string[] | undefined {
  return EXT_CLASSES.get(node);
}

/** The custom properties an output node kept (none for every other node). */
export function extensionVarsOf(node: object): Readonly<Record<string, string>> | undefined {
  return EXT_VARS.get(node);
}
type Coerced = {
  node: Record<string, unknown>;
  classes: string[];
  vars: Record<string, string>;
  children?: Coerced[];
};

const KNOWN = new Set<string>(KNOWN_ELEMENT_TYPES);
const MAX_NODES = 32;
const MAX_DEPTH = 8;

function coerce(
  value: unknown,
  depth: number,
  budget: { left: number },
  random: () => number,
  allow: ReadonlySet<string> | undefined,
  varRule: ExtensionVarRule | undefined,
): Coerced | undefined {
  if (budget.left <= 0 || depth > MAX_DEPTH) return undefined;
  if (typeof value === "string") return undefined; // raw HTML / text — refused
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const node = value as Record<string, unknown>;
  if (typeof node.type !== "string" || !KNOWN.has(node.type) || isExtensionType(node.type)) {
    return undefined;
  }
  if (
    node.props !== undefined &&
    (typeof node.props !== "object" || node.props === null || Array.isArray(node.props))
  ) {
    return undefined;
  }
  budget.left -= 1;
  const id =
    typeof node.id === "string" && /^[A-Za-z0-9_-]{4,24}$/.test(node.id)
      ? node.id
      : newNodeId(random);
  let children: Coerced[] | undefined;
  if (Array.isArray(node.children)) {
    children = [];
    for (const child of node.children) {
      const ok = coerce(child, depth + 1, budget, random, allow, varRule);
      if (ok) children.push(ok);
    }
  }
  // Drop style/attributes from extension output: only props + children of built-ins.
  // (Extensions style through the host element's own style on the wrapper.)
  return {
    node: {
      id,
      type: node.type,
      props: { ...(node.props as Record<string, unknown>) },
      ...(children ? { children: children.map((c) => c.node) } : {}),
    },
    classes: filterExtensionClasses(node.extClasses, allow),
    vars: filterExtensionVars(node.extVars, varRule),
    ...(children ? { children } : {}),
  };
}

/** Pair each validated node with the classes its coerced twin kept (same tree shape). */
function attachClasses(validated: LayoutNode, coerced: Coerced): void {
  if (coerced.classes.length > 0) EXT_CLASSES.set(validated, coerced.classes);
  if (Object.keys(coerced.vars).length > 0) EXT_VARS.set(validated, coerced.vars);
  const kids = (validated as { children?: LayoutNode[] }).children;
  if (!Array.isArray(kids) || !coerced.children || kids.length !== coerced.children.length) return;
  kids.forEach((kid, i) => {
    const twin = coerced.children?.[i];
    if (twin) attachClasses(kid, twin);
  });
}

/**
 * W-1086: output nodes as plain JSON with their extension classes back in `extClasses`, for the
 * editor route; the admin runs them through `safeExtensionOutput` again with its allowlist.
 */
export function withExtensionClasses(nodes: readonly LayoutNode[]): unknown[] {
  const copy = (node: LayoutNode): Record<string, unknown> => {
    const classes = EXT_CLASSES.get(node);
    const vars = EXT_VARS.get(node);
    const kids = (node as { children?: LayoutNode[] }).children;
    return {
      ...node,
      ...(Array.isArray(kids) ? { children: kids.map(copy) } : {}),
      ...(classes ? { extClasses: [...classes] } : {}),
      ...(vars ? { extVars: { ...vars } } : {}),
    };
  };
  return nodes.map(copy);
}

/**
 * Normalize a render() return value to validated built-in nodes.
 * Illegal shapes, schema failures and empty output yield `[]` (caller shows the placeholder).
 */
export function safeExtensionOutput(
  raw: unknown,
  random: () => number = Math.random,
  /** W-1086: the extension's class allowlist; without one every `extClasses` entry drops. */
  allow?: ReadonlySet<string>,
  /** extensionApi 1.5: what `extVars` may set; without one every `extVars` entry drops. */
  varRule?: ExtensionVarRule,
): LayoutNode[] {
  const budget = { left: MAX_NODES };
  const coerced: Coerced[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const node = coerce(item, 0, budget, random, allow, varRule);
      if (node) coerced.push(node);
    }
  } else {
    const one = coerce(raw, 0, budget, random, allow, varRule);
    if (one) coerced.push(one);
  }
  if (coerced.length === 0) return [];

  const page = {
    schemaVersion: LAYOUT_SCHEMA_VERSION,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      children: coerced.map((c) => c.node),
    },
  };
  const result = validateLayout(page);
  if (!result.ok) return [];
  const out = result.layout.root.children.slice();
  if (out.length === coerced.length) {
    out.forEach((node, i) => {
      const twin = coerced[i];
      if (twin) attachClasses(node, twin);
    });
  }
  return out;
}
