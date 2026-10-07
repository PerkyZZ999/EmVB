import type { LayoutNode } from "../../../../core/index.ts";
import type { ThemePartType } from "../../../../core/theme/part-types.ts";

/** Parts that show on, or repeat across, pages that already have their own H1 (W-208). */
const SHARED_PARTS: ReadonlySet<ThemePartType> = new Set([
  "header",
  "footer",
  "popup",
  "float",
  "section",
  "loop_item",
]);

/**
 * W-208: true for an H1 (a Heading, or a Post title, at level 1) in a header, footer, popup, float,
 * synced section or loop item. The page it lands on then has two H1s (or one per post), which
 * confuses screen readers and search engines.
 */
export function sharedPartH1(node: LayoutNode, partType: ThemePartType | undefined): boolean {
  if (!partType || !SHARED_PARTS.has(partType)) return false;
  const level = (node.props as { level?: number } | undefined)?.level;
  if (node.type === "heading") return level === 1;
  if (node.type === "post-title") return (level ?? 1) === 1;
  return false;
}
