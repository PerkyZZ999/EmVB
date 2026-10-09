import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import type { Layout, LayoutNode } from "../schema/layout.ts";
import { renderPage } from "../render/index.ts";
import { pageCountText, paginationItems } from "./pagination.ts";

const pager = (props: Record<string, unknown>) =>
  ({ id: "page0001", type: "pagination", props }) as LayoutNode;
const page = (...children: LayoutNode[]): Layout =>
  ({
    schemaVersion: 13,
    root: { id: "root0001", type: "container", props: {}, children },
  }) as Layout;

describe("Page N of M (W-309)", () => {
  test("with a known total the count reads Page N of M", () => {
    expect(
      pageCountText({ page: 2, hasMore: true, basePath: "/p", totalPages: 7 }, undefined),
    ).toBe("Page 2 of 7");
    expect(
      pageCountText({ page: 3, hasMore: false, basePath: "/p", totalPages: 3 }, "{page}/{total}"),
    ).toBe("3/3");
  });

  test("without a total (EmDash 1.2) it never shows a wrong count", () => {
    const p = { page: 4, hasMore: true, basePath: "/p" };
    expect(pageCountText(p, undefined)).toBe("Page 4");
    expect(pageCountText(p, "Seite {page} von {total}")).toBe("Seite 4");
    expect(pageCountText(p, "{page} / {total}")).toBe("4");
    expect(pageCountText(p, "You are on {page}")).toBe("You are on 4");
    // A total below the current page is not believed.
    expect(pageCountText({ ...p, totalPages: 2 }, undefined)).toBe("Page 4");
  });

  test("W-309 a template that starts with {total} still shows the page number", () => {
    const p = { page: 4, hasMore: true, basePath: "/p" };
    expect(pageCountText(p, "{total} pages · page {page}")).toBe("4");
    expect(pageCountText({ ...p, totalPages: 9 }, "{total} pages · page {page}")).toBe(
      "9 pages · page 4",
    );
  });

  test("a known total adds the last page and stops Next on it", () => {
    const items = paginationItems({ page: 1, hasMore: true, basePath: "/p", totalPages: 9 });
    expect(items.map((i) => (i.kind === "page" ? i.n : i.kind))).toEqual([
      1,
      2,
      3,
      "gap",
      9,
      "next",
    ]);
    const last = paginationItems({ page: 9, hasMore: false, basePath: "/p", totalPages: 9 });
    expect(last.map((i) => (i.kind === "page" ? i.n : i.kind))).toEqual([
      "prev",
      1,
      "gap",
      7,
      8,
      9,
    ]);
    expect(paginationItems({ page: 1, hasMore: false, basePath: "/p", totalPages: 1 })).toEqual([]);
  });

  test("the Pagination element shows the count only when asked", () => {
    const dynamic = { pagination: { page: 2, hasMore: true, basePath: "/posts" } };
    const on = renderPage(page(pager({ showCount: true })), emptyDesign(), { dynamic }).html;
    expect(on).toContain('<span class="emvb-pagination-count">Page 2</span>');
    const off = renderPage(page(pager({})), emptyDesign(), { dynamic }).html;
    expect(off).not.toContain("emvb-pagination-count");
  });
});
