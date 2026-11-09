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

const KNOWN = new Set<string>(KNOWN_ELEMENT_TYPES);
const MAX_NODES = 32;
const MAX_DEPTH = 8;

function coerce(
  value: unknown,
  depth: number,
  budget: { left: number },
  random: () => number,
): Record<string, unknown> | undefined {
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
  let children: Record<string, unknown>[] | undefined;
  if (Array.isArray(node.children)) {
    children = [];
    for (const child of node.children) {
      const ok = coerce(child, depth + 1, budget, random);
      if (ok) children.push(ok);
    }
  }
  // Drop style/attributes from extension output: only props + children of built-ins.
  // (Extensions style through the host element's own style on the wrapper.)
  return {
    id,
    type: node.type,
    props: { ...(node.props as Record<string, unknown>) },
    ...(children ? { children } : {}),
  };
}

/**
 * Normalize a render() return value to validated built-in nodes.
 * Illegal shapes, schema failures and empty output yield `[]` (caller shows the placeholder).
 */
export function safeExtensionOutput(
  raw: unknown,
  random: () => number = Math.random,
): LayoutNode[] {
  const budget = { left: MAX_NODES };
  const coerced: Record<string, unknown>[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const node = coerce(item, 0, budget, random);
      if (node) coerced.push(node);
    }
  } else {
    const one = coerce(raw, 0, budget, random);
    if (one) coerced.push(one);
  }
  if (coerced.length === 0) return [];

  const page = {
    schemaVersion: LAYOUT_SCHEMA_VERSION,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      children: coerced,
    },
  };
  const result = validateLayout(page);
  if (!result.ok) return [];
  return result.layout.root.children.slice();
}
