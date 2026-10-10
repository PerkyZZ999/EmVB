import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import type { Layout, LayoutNode } from "../schema/layout.ts";
import { validateLayout } from "../validate.ts";
import { SAMPLE_POST } from "../theme/dynamic.ts";
import { renderPage } from "./index.ts";

const design = emptyDesign();
const page = (props: Record<string, unknown> = {}): Layout =>
  ({
    schemaVersion: 14,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      children: [{ id: "pagi0001", type: "pagination", props } as LayoutNode],
    },
  }) as Layout;
const parse = (html: string) => {
  const host = document.createElement("div");
  host.innerHTML = html;
  return host;
};
const links = (host: HTMLElement) =>
  [...host.querySelectorAll("nav a")].map((a) => [
    a.textContent,
    a.getAttribute("href"),
    a.getAttribute("rel") ?? a.getAttribute("aria-current") ?? "",
  ]);

describe("Pagination element (W-222)", () => {
  test("a valid element with optional link texts", () => {
    expect(validateLayout(page({ prevText: "Newer", nextText: "Older" })).ok).toBe(true);
    expect(validateLayout(page({ prevText: "x".repeat(41) })).ok).toBe(false);
  });

  test("page 2 of an archive: Previous, numbers, Next as plain links in a nav", () => {
    const { html } = renderPage(page({ nextText: "Older" }), design, {
      dynamic: { pagination: { page: 2, hasMore: true, basePath: "/posts" } },
    });
    const host = parse(html);
    expect(host.querySelector("nav")?.getAttribute("aria-label")).toBe("Pagination");
    expect(links(host)).toEqual([
      ["Previous", "/posts", "prev"],
      ["1", "/posts", ""],
      ["2", "/posts/page/2", "page"],
      ["3", "/posts/page/3", ""],
      ["Older", "/posts/page/3", "next"],
    ]);
    expect(host.querySelector("script")).toBeNull();
  });

  test("one page or no archive data renders nothing on the page", () => {
    const one = renderPage(page(), design, {
      dynamic: { pagination: { page: 1, hasMore: false, basePath: "/posts" } },
    });
    expect(parse(one.html).querySelector("nav")).toBeNull();
    expect(one.html).not.toContain("emvb-pagination");
    expect(parse(renderPage(page(), design).html).querySelector("nav")).toBeNull();
  });

  test("the editor shows a sample whose links go nowhere", () => {
    const host = parse(renderPage(page(), design, { mode: "editor" }).html);
    const hrefs = [...host.querySelectorAll("nav a")].map((a) => a.getAttribute("href"));
    expect(hrefs.length).toBeGreaterThan(2);
    expect(new Set(hrefs)).toEqual(new Set(["#"]));
  });

  test("inside a Loop's item it renders nothing on the page and a hint in the editor (W-228)", () => {
    const inLoop = {
      schemaVersion: 14,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          {
            id: "loop0001",
            type: "loop",
            props: {},
            children: [{ id: "pagi0001", type: "pagination", props: {} }],
          },
        ],
      },
    } as unknown as Layout;
    const posts = [1, 2, 3].map((n) =>
      Object.assign({}, SAMPLE_POST, { id: `p${n}`, title: `P${n}` }),
    );
    const pub = renderPage(inLoop, design, {
      dynamic: { posts, pagination: { page: 2, hasMore: true, basePath: "/posts" } },
    });
    expect(parse(pub.html).querySelectorAll("nav")).toHaveLength(0);
    const editor = renderPage(inLoop, design, { mode: "editor" }).html;
    expect(editor).toContain("Put Pagination after the Loop");
  });
});
