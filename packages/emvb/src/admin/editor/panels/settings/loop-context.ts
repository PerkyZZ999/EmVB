import type { Layout, LayoutNode } from "../../../../core/index.ts";
import type { ThemePartType } from "../../../../core/theme/part-types.ts";
import { someNode } from "../../../../core/tree-ops.ts";

/**
 * Parts where a Loop can get posts: archive templates, and synced sections (which an archive
 * template may include). Hosts load archive posts only for an archive (W-221).
 */
const LOOP_PARTS: ReadonlySet<ThemePartType> = new Set(["archive", "section"]);

/** A Loop that lists a collection of its own (W-308) rather than the archive's posts. */
const collectionOf = (node: LayoutNode): string | undefined => {
  const collection = node.type === "loop" ? node.props.collection : undefined;
  return typeof collection === "string" && collection ? collection : undefined;
};

/**
 * W-1090 (#31): an archive's Pagination pages through the archive's posts, which only a Loop
 * without a collection lists. True when the archive has Loops and all of them list a collection.
 */
const onlyCollectionLoops = (layout: Layout): boolean =>
  someNode(layout.root, (n) => collectionOf(n) !== undefined) &&
  !someNode(layout.root, (n) => n.type === "loop" && collectionOf(n) === undefined);

/**
 * W-271: a Loop or Pagination outside an archive template previews sample posts on the canvas,
 * but the live page gets no posts, so it renders nothing there. W-1090 (#31): in an archive
 * template, a Loop with a collection lists the same entries on every archive page. Undefined
 * where it works as it looks.
 */
export function loopContextNote(
  node: LayoutNode,
  partType: ThemePartType | undefined,
  layout?: Layout | null,
): string | undefined {
  if (partType === "archive" && collectionOf(node)) {
    return "This Loop lists its own collection, so it shows the same entries on every page of the archive and ignores the archive's category or tag. To list the archive's posts page by page, leave Collection empty.";
  }
  if (
    partType === "archive" &&
    node.type === "pagination" &&
    layout &&
    onlyCollectionLoops(layout)
  ) {
    return "Pagination pages through the archive's posts, but the Loop here lists its own collection, so every page would show the same entries. To page through the archive, leave its Collection empty.";
  }
  if (partType && LOOP_PARTS.has(partType)) return undefined;
  // W-308: a collection Loop lists its entries on any page.
  if (collectionOf(node)) return undefined;
  if (node.type === "loop") {
    return "A Loop lists posts only in an Archive template. Here the editor shows sample posts, but the live page shows nothing. Build post lists in Theme Builder › Archive, or pick a Collection to list its entries here.";
  }
  if (node.type === "pagination") {
    return "Pagination shows only in an Archive template with more than one page. Here the live page shows nothing.";
  }
  return undefined;
}
