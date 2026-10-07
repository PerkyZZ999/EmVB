import { isParentNode, type Layout, type LayoutNode } from "../schema/layout.ts";

/** Posts per archive page when the Loop has no "Posts per page" (the pre-pagination count). */
export const DEFAULT_PER_PAGE = 20;
/** Highest page number EmVB reads from `/page/N`; larger numbers are not archive pages. */
export const MAX_ARCHIVE_PAGE = 100_000;

/** Where an archive request sits: its page and whether a later page exists (W-221). */
export type ArchivePagination = {
  /** 1-based page number. */
  page: number;
  /** True when at least one more post exists after this page. */
  hasMore: boolean;
  /** The archive's own path without `/page/N`, e.g. `/posts` or `/category/news`. */
  basePath: string;
};

/** The URL path of page `n` of an archive; page 1 is the bare archive path (W-221). */
export function archivePagePath(basePath: string, n: number): string {
  const base = basePath.replace(/\/+$/, "") || "/";
  if (n <= 1) return base;
  return `${base === "/" ? "" : base}/page/${n}`;
}

/**
 * Splits `/posts/page/3` into the archive path and page. Null for anything that is not a
 * valid page suffix (`/page/0`, `/page/01`, `/page/abc`, a page past MAX_ARCHIVE_PAGE).
 * A path without `/page/N` is page 1.
 */
export function splitArchivePage(path: string): { basePath: string; page: number } | null {
  const match = /^(.*?)\/page\/([^/]+)$/.exec(path);
  if (!match) return { basePath: path, page: 1 };
  const raw = match[2] ?? "";
  if (!/^[1-9]\d{0,5}$/.test(raw)) return null;
  const page = Number(raw);
  if (page > MAX_ARCHIVE_PAGE) return null;
  return { basePath: match[1] || "/", page };
}

/** Posts per page from the first Loop in an archive layout, else DEFAULT_PER_PAGE (W-221). */
export function loopPerPage(layout: Layout): number {
  let found: number | undefined;
  const walk = (node: LayoutNode): void => {
    if (found !== undefined) return;
    if (node.type === "loop") {
      const perPage = (node.props as { perPage?: unknown }).perPage;
      found =
        typeof perPage === "number" && Number.isInteger(perPage) && perPage >= 1 && perPage <= 50
          ? perPage
          : DEFAULT_PER_PAGE;
      return;
    }
    if (isParentNode(node)) for (const child of node.children) walk(child);
  };
  walk(layout.root);
  return found ?? DEFAULT_PER_PAGE;
}

/**
 * A paged archive's title for `<title>` and headings: "Posts – page 2"; page 1 is the bare
 * title (W-229).
 */
export function archivePageTitle(title: string, page: number | undefined): string {
  return page !== undefined && page > 1 ? `${title} – page ${page}` : title;
}

/** One entry of a Pagination bar: a page link, the current page, or a gap (W-222). */
export type PaginationItem =
  | { kind: "prev" | "next"; href: string }
  | { kind: "page"; n: number; href: string; current: boolean }
  | { kind: "gap" };

/**
 * The links a Pagination element shows. Empty when there is only one page. EmDash gives no
 * total count, so the numbers run from 1 to one past the current page (when there is one),
 * with a gap after 1 when the current page is far in (W-222).
 */
export function paginationItems(p: ArchivePagination): PaginationItem[] {
  if (p.page <= 1 && !p.hasMore) return [];
  const items: PaginationItem[] = [];
  const page = (n: number): PaginationItem => ({
    kind: "page",
    n,
    href: archivePagePath(p.basePath, n),
    current: n === p.page,
  });
  if (p.page > 1) items.push({ kind: "prev", href: archivePagePath(p.basePath, p.page - 1) });
  const from = Math.max(1, p.page - 2);
  if (from > 1) items.push(page(1));
  if (from > 2) items.push({ kind: "gap" });
  for (let n = from; n <= p.page; n++) items.push(page(n));
  if (p.hasMore) {
    items.push(page(p.page + 1));
    items.push({ kind: "next", href: archivePagePath(p.basePath, p.page + 1) });
  }
  return items;
}
