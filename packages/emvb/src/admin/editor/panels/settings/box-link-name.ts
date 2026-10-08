import { sanitizeHref, type LayoutNode } from "../../../../core/index.ts";
import { nodeChildren } from "../../../../core/tree-ops.ts";

/** Props whose text names a link for screen readers when the element sits inside it. */
const TEXT_PROPS = ["text", "label", "summary", "title", "alt"] as const;

/** Elements whose text comes from the post or another layout; assume they name the link. */
const DYNAMIC = new Set(["section", "loop"]);

const hasName = (node: LayoutNode): boolean => {
  if (DYNAMIC.has(node.type) || node.type.startsWith("post-")) return true;
  const attrs = (node as { attributes?: { name: string; value: string }[] }).attributes ?? [];
  if (
    attrs.some((a) => (a.name === "aria-label" || a.name === "aria-labelledby") && a.value.trim())
  ) {
    return true;
  }
  const props = (node.props ?? {}) as Record<string, unknown>;
  if (TEXT_PROPS.some((key) => typeof props[key] === "string" && props[key].trim() !== "")) {
    return true;
  }
  return nodeChildren(node).some(hasName);
};

/**
 * W-261: a box (Container, Div Block, Flexbox, Grid…) with a working Link but nothing inside that
 * names it: no text, no image alt, no icon title, no aria-label. It renders as an `<a>` that
 * screen readers announce only as "link" (axe `link-name`).
 */
export function unnamedBoxLink(node: LayoutNode): boolean {
  const href = (node.props as { href?: unknown } | undefined)?.href;
  if (typeof href !== "string" || !href.trim() || !sanitizeHref(href)) return false;
  if (!("children" in node)) return false;
  return !hasName(node);
}

export const UNNAMED_BOX_LINK_NOTE =
  "Nothing inside this box has text, so screen readers announce it only as “link”. Add text inside it, or an aria-label under Custom attributes.";
