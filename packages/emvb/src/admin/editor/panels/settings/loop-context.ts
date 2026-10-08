import type { LayoutNode } from "../../../../core/index.ts";
import type { ThemePartType } from "../../../../core/theme/part-types.ts";

/**
 * Parts where a Loop can get posts: archive templates, and synced sections (which an archive
 * template may include). Hosts load archive posts only for an archive (W-221).
 */
const LOOP_PARTS: ReadonlySet<ThemePartType> = new Set(["archive", "section"]);

/**
 * W-271: a Loop or Pagination outside an archive template previews sample posts on the canvas,
 * but the live page gets no posts, so it renders nothing there. Undefined where it can work.
 */
export function loopContextNote(
  node: LayoutNode,
  partType: ThemePartType | undefined,
): string | undefined {
  if (partType && LOOP_PARTS.has(partType)) return undefined;
  if (node.type === "loop") {
    return "A Loop lists posts only in an Archive template. Here the editor shows sample posts, but the live page shows nothing. Build post lists in Theme Builder › Archive.";
  }
  if (node.type === "pagination") {
    return "Pagination shows only in an Archive template with more than one page. Here the live page shows nothing.";
  }
  return undefined;
}
