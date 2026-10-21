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
  /**
   * How many pages there are, when the host knows (W-309). EmDash 1.2's public collection query
   * gives no total, so its hosts leave this out and "Page N of M" shows "Page N".
   */
  totalPages?: number;
};

/** A usable total page count, or undefined (W-309). */
function knownTotal(p: ArchivePagination): number | undefined {
  const total = p.totalPages;
  return typeof total === "number" && Number.isInteger(total) && total >= p.page && total >= 1
    ? Math.min(total, MAX_ARCHIVE_PAGE)
    : undefined;
}

/**
 * What leads into the total, dropped with it while the total is unknown: "of", "/" and the like.
 * W-702: more languages ("z", "av", "od", "共"…) and a separator before them ("2, of"); "Strona 2 z"
 * and "第 2 页，共" were left dangling.
 */
const TOTAL_LEAD_IN =
  /\s*[,，、·|/–—-]?\s*(?:(?<!\p{L})(?:of|from|out of|sur|de|da|do|von|di|van|av|af|z|ze|od|iš|из|з)|共|中)?\s*[,，、·|/–—-]?\s*$/iu;

/**
 * The "Page N of M" text (W-309). `{page}` and `{total}` are filled in; without a known total
 * the text stops before ` of {total}` (or drops `{total}`), so it never shows a wrong count.
 */
export function pageCountText(p: ArchivePagination, template: string | undefined): string {
  const text = template?.trim() || "Page {page} of {total}";
  const total = knownTotal(p);
  if (total !== undefined) {
    return text.replaceAll("{page}", String(p.page)).replaceAll("{total}", String(total));
  }
  const cut = text.indexOf("{total}");
  const before = cut === -1 ? text : text.slice(0, cut).replace(TOTAL_LEAD_IN, "");
  // A template that starts with {total} ("{total} pages · page {page}") keeps at least the number.
  return before.replaceAll("{page}", String(p.page)).trim() || String(p.page);
}

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

/** The paged archive title wording when the host passes none (W-229). */
const PAGED_TITLE = "{title} – page {page}";

/**
 * A paged archive's title for `<title>` and headings: "Posts – page 2"; page 1 is the bare
 * title (W-229). W-529: `template` sets the wording in the site's language, with `{title}` and
 * `{page}` filled in like the Pagination element's "Page {page} of {total}"; one without
 * `{page}` would give every page the same title, so it falls back to the default.
 */
export function archivePageTitle(
  title: string,
  page: number | undefined,
  template?: string,
): string {
  if (page === undefined || page <= 1) return title;
  const wording = template?.trim().includes("{page}") ? template.trim() : PAGED_TITLE;
  // One pass with a function: `$&` in a title is not a replacement pattern, and a "{page}" in
  // the title stays as written (W-552).
  return wording.replace(/\{(title|page)\}/g, (_, key: string) =>
    key === "title" ? title : String(page),
  );
}

/** One entry of a Pagination bar: a page link, the current page, or a gap (W-222). */
export type PaginationItem =
  | { kind: "prev" | "next"; href: string }
  | { kind: "page"; n: number; href: string; current: boolean }
  | { kind: "gap" };

const pageItem =
  (p: ArchivePagination) =>
  (n: number): PaginationItem => ({
    kind: "page",
    n,
    href: archivePagePath(p.basePath, n),
    current: n === p.page,
  });

/** Previous, then page 1 and a gap (or page 2) before the window that starts at `from`. */
function leadingItems(p: ArchivePagination, from: number): PaginationItem[] {
  const page = pageItem(p);
  const items: PaginationItem[] = [];
  if (p.page > 1) items.push({ kind: "prev", href: archivePagePath(p.basePath, p.page - 1) });
  if (from > 1) items.push(page(1));
  // W-600: "1 … 3" hides just page 2; show it instead of a gap.
  if (from === 3) items.push(page(2));
  if (from > 3) items.push({ kind: "gap" });
  return items;
}

/**
 * The links a Pagination element shows. Empty when there is only one page. EmDash gives no
 * total count, so the numbers run from 1 to one past the current page (when there is one),
 * with a gap after 1 when the current page is far in (W-222).
 */
export function paginationItems(p: ArchivePagination): PaginationItem[] {
  const total = knownTotal(p);
  if (total !== undefined) return totalItems(p, total);
  if (p.page <= 1 && !p.hasMore) return [];
  const page = pageItem(p);
  const from = Math.max(1, p.page - 2);
  const items = leadingItems(p, from);
  for (let n = from; n <= p.page; n++) items.push(page(n));
  if (p.hasMore) {
    items.push(page(p.page + 1));
    items.push({ kind: "next", href: archivePagePath(p.basePath, p.page + 1) });
  }
  return items;
}

/** With a known total (W-309): 1, a window around the current page, and the last page. */
function totalItems(p: ArchivePagination, total: number): PaginationItem[] {
  if (total <= 1) return [];
  const page = pageItem(p);
  const from = Math.max(1, p.page - 2);
  const items = leadingItems(p, from);
  const to = Math.min(total, p.page + 2);
  for (let n = from; n <= to; n++) items.push(page(n));
  if (to === total - 2) items.push(page(total - 1));
  if (to < total - 2) items.push({ kind: "gap" });
  if (to < total) items.push(page(total));
  if (p.page < total) items.push({ kind: "next", href: archivePagePath(p.basePath, p.page + 1) });
  return items;
}

/** A text prop of the first Pagination element in an archive layout, if set (W-529, W-532). */
function paginationText(layout: Layout, key: "titleText" | "archiveTitle"): string | undefined {
  let found: string | undefined;
  const walk = (node: LayoutNode): void => {
    if (found !== undefined) return;
    if (node.type === "pagination") {
      const text = (node.props as Record<string, unknown>)[key];
      found = typeof text === "string" && text.trim() ? text.trim() : "";
      return;
    }
    if (isParentNode(node)) for (const child of node.children) walk(child);
  };
  walk(layout.root);
  return found || undefined;
}

/** The first Pagination element's "Page title text" in an archive layout, if set (W-529). */
export const paginationTitleText = (layout: Layout) => paginationText(layout, "titleText");

/** The first Pagination element's "Posts archive title" (replaces "Posts"), if set (W-532). */
export const paginationArchiveTitle = (layout: Layout) => paginationText(layout, "archiveTitle");
