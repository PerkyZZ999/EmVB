import type { Layout, LayoutNode } from "../../../../core/index.ts";
import { nodeChildren } from "../../../../core/tree-ops.ts";

/** Same rules as the layout schema and the renderer (W-105, R-032), checked while typing (W-189). */
const HTML_ID = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const ATTR_NAME = /^(?:data|aria)-[a-z][a-z0-9-]{0,40}$/;
export const MAX_ATTR_VALUE = 200;

export type AttributeRow = { name: string; value: string };

/** CSS ids on `layout` other than the one on `exceptId`. */
function otherHtmlIds(layout: Layout | null, exceptId: string): Set<string> {
  const ids = new Set<string>();
  const walk = (node: LayoutNode) => {
    if (node.id !== exceptId && node.htmlId) ids.add(node.htmlId);
    for (const child of nodeChildren(node)) walk(child);
  };
  if (layout) walk(layout.root);
  return ids;
}

/** Why a CSS id can't be saved, or null when it can (empty clears it). */
export function htmlIdError(value: string, layout: Layout | null, nodeId: string): string | null {
  if (value === "") return null;
  if (!HTML_ID.test(value)) {
    return "Start with a letter; use letters, digits, - and _ only (up to 64).";
  }
  if (otherHtmlIds(layout, nodeId).has(value)) return "Another element already uses this CSS id.";
  return null;
}

/** A just-added row nobody has typed in yet: not saved, and not flagged. */
const isFreshRow = (row: AttributeRow) => row.name === "data-" && row.value === "";

/** Each row's error (null when it can be saved), in row order. */
export function attributeErrors(rows: readonly AttributeRow[]): (string | null)[] {
  const seen = new Set<string>();
  return rows.map((row) => {
    if (isFreshRow(row)) return null;
    let error: string | null = null;
    if (!ATTR_NAME.test(row.name)) {
      error = "Use data-* or aria-*, then a lowercase letter, digits or -.";
    } else if (row.name.startsWith("data-emvb")) {
      error = "data-emvb-* is reserved for the editor.";
    } else if (seen.has(row.name)) {
      error = "This name is already used on this element.";
    } else if (row.value.length > MAX_ATTR_VALUE) {
      error = `Values are at most ${MAX_ATTR_VALUE} characters.`;
    } else if ([...row.value].some((char) => char.charCodeAt(0) < 32)) {
      error = "Values can't hold line breaks or control characters.";
    }
    seen.add(row.name);
    return error;
  });
}

/** The rows that may be stored: never one the schema would refuse, so the page stays savable. */
export function savableAttributes(rows: readonly AttributeRow[]): AttributeRow[] | undefined {
  const errors = attributeErrors(rows);
  const kept = rows.filter((row, i) => !isFreshRow(row) && errors[i] === null);
  return kept.length > 0 ? kept : undefined;
}
