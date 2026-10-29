import type { PaginationNode } from "../schema/layout.ts";
import type { ThemeDynamicData } from "../theme/dynamic.ts";
import {
  lastPagePath,
  pageCountText,
  paginationItems,
  type ArchivePagination,
} from "../theme/pagination.ts";
import type { VNode } from "./vnode.ts";

/** What the editor canvas shows: page 2 of several, links going nowhere (W-222). */
const EDITOR_SAMPLE: ArchivePagination = { page: 2, hasMore: true, basePath: "/posts" };

const label = (text: string | undefined, fallback: string) => text?.trim() || fallback;

/**
 * W-433: Previous/Next set to just an arrow ("←", "»") was read as "left arrow" or nothing; such
 * texts get the plain name as an aria-label.
 */
const nameIfSymbols = (text: string, name: string): Record<string, string> =>
  /[\p{L}\p{N}]/u.test(text) ? {} : { "aria-label": name };

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
  // Inside a Loop's item it would repeat once per post; it goes after the Loop (W-228).
  if (dynamic?.inLoopItem) {
    if (!editor) return undefined;
    return {
      tag: "div",
      attrs: { ...attrs, "data-emvb-pagination-empty": "" },
      children: ["Put Pagination after the Loop, not inside its item."],
    };
  }
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
          attrs: {
            class: "emvb-pagination-prev",
            href: href(item.href),
            rel: "prev",
            ...nameIfSymbols(
              label(node.props.prevText, "Previous"),
              label(node.props.prevLabel, "Previous page"),
            ),
          },
          children: [label(node.props.prevText, "Previous")],
        };
      case "next":
        return {
          tag: "a",
          attrs: {
            class: "emvb-pagination-next",
            href: href(item.href),
            rel: "next",
            ...nameIfSymbols(
              label(node.props.nextText, "Next"),
              label(node.props.nextLabel, "Next page"),
            ),
          },
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
            // W-426: a bare "2" says nothing out of context; screen readers hear "Page 2".
            // W-689: in the site's language when "Page number name" is set.
            "aria-label": label(node.props.pageLabel, "Page {page}").replaceAll(
              "{page}",
              String(item.n),
            ),
            ...(item.current ? { "aria-current": "page" } : {}),
          },
          children: [String(item.n)],
        };
    }
  });
  // W-916: the editor sample has no total, so its Last link goes nowhere like the others.
  const last = editor ? "#" : lastPagePath(data);
  if (node.props.showLast && last) {
    const text = label(node.props.lastText, "Last");
    children.push({
      tag: "a",
      attrs: {
        class: "emvb-pagination-last",
        href: last,
        ...nameIfSymbols(text, label(node.props.lastLabel, "Last page")),
      },
      children: [text],
    });
  }
  if (node.props.showCount) {
    // W-309: "Page N of M", or "Page N" while the host has no total.
    children.unshift({
      tag: "span",
      attrs: { class: "emvb-pagination-count" },
      children: [pageCountText(data, node.props.countText)],
    });
  }
  return {
    tag: "nav",
    attrs: { ...attrs, "aria-label": label(node.props.navLabel, "Pagination") },
    children,
  };
}
