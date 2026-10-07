import type { PaginationNode } from "../schema/layout.ts";
import type { ThemeDynamicData } from "../theme/dynamic.ts";
import { paginationItems, type ArchivePagination } from "../theme/pagination.ts";
import type { VNode } from "./vnode.ts";

/** What the editor canvas shows: page 2 of several, links going nowhere (W-222). */
const EDITOR_SAMPLE: ArchivePagination = { page: 2, hasMore: true, basePath: "/posts" };

const label = (text: string | undefined, fallback: string) => text?.trim() || fallback;

/**
 * Previous, page numbers and Next as plain links in a `nav` (W-222). No JS. Nothing on the page
 * when there is no archive page data or only one page; the editor shows a sample.
 */
export function renderPagination(
  node: PaginationNode,
  attrs: Record<string, string>,
  dynamic: ThemeDynamicData | undefined,
  mode: "editor" | "public",
): VNode | undefined {
  const editor = mode === "editor";
  const data = dynamic?.pagination ?? (editor ? EDITOR_SAMPLE : undefined);
  if (!data) return undefined;
  const items = paginationItems(data);
  if (items.length === 0) {
    if (!editor) return undefined;
    return {
      tag: "div",
      attrs: { ...attrs, "data-emvb-pagination-empty": "" },
      children: ["Pagination shows when the archive has more than one page."],
    };
  }
  const href = (path: string) => (editor ? "#" : path);
  const children: VNode[] = items.map((item): VNode => {
    switch (item.kind) {
      case "prev":
        return {
          tag: "a",
          attrs: { class: "emvb-pagination-prev", href: href(item.href), rel: "prev" },
          children: [label(node.props.prevText, "Previous")],
        };
      case "next":
        return {
          tag: "a",
          attrs: { class: "emvb-pagination-next", href: href(item.href), rel: "next" },
          children: [label(node.props.nextText, "Next")],
        };
      case "gap":
        return {
          tag: "span",
          attrs: { class: "emvb-pagination-gap", "aria-hidden": "true" },
          children: ["…"],
        };
      default:
        return {
          tag: "a",
          attrs: {
            class: "emvb-pagination-page",
            href: href(item.href),
            ...(item.current ? { "aria-current": "page" } : {}),
          },
          children: [String(item.n)],
        };
    }
  });
  return { tag: "nav", attrs: { ...attrs, "aria-label": "Pagination" }, children };
}
