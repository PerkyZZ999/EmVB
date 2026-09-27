import { describe, expect, test } from "bun:test";
import { container, heading, randomLayouts, s1Page } from "../../../test/fixtures/layouts.ts";
import { CSS_INJECTION_CORPUS, XSS_CORPUS } from "../../../test/fixtures/xss.ts";
import { emptyDesign, type DesignSystem } from "../schema/design.ts";
import type { Layout, LayoutNode } from "../schema/layout.ts";
import { renderPage } from "./index.ts";
import { serialize } from "./vnode.ts";

const design: DesignSystem = {
  schemaVersion: 1,
  variables: { colors: [{ id: "brand", name: "Brand", value: "#0055ff" }] },
};
const page = (...children: LayoutNode[]): Layout => ({
  schemaVersion: 1,
  root: container("root0001", children) as Layout["root"],
});
const parse = (html: string) => {
  const host = document.createElement("div");
  host.innerHTML = html;
  return host;
};

const countNodes = (node: LayoutNode): number =>
  1 + (node.type === "container" ? node.children.reduce((n, c) => n + countNodes(c), 0) : 0);

describe("markup", () => {
  test.each([1, 2, 3, 4, 5, 6])("heading level %i renders as the matching h1-h6 tag", (level) => {
    const { html } = renderPage(page(heading("head0001", "Title", level)), design);
    expect(parse(html).querySelector(".emvb-heading")?.tagName).toBe(`H${level}`);
  });

  test("the S1 page renders lean, semantic HTML", () => {
    expect(renderPage(s1Page(), design).html).toBe(
      '<div class="emvb-root emvb-container emvb-e-root0001"><h1 class="emvb-heading emvb-e-head0001">Welcome</h1></div>',
    );
  });

  test("editor mode adds data-emvb-id to every element, public mode none", () => {
    const layout = page(heading("head0001"), container("cont0001", [heading("head0002")]));
    const editor = parse(renderPage(layout, design, { mode: "editor" }).html);
    expect(
      [...editor.querySelectorAll("[data-emvb-id]")].map((el) => el.getAttribute("data-emvb-id")),
    ).toEqual(["root0001", "head0001", "cont0001", "head0002"]);
    expect(renderPage(layout, design).html).not.toContain("data-emvb");
  });

  test("property: exactly one element per node, nested exactly like the layout (R-031)", () => {
    for (const layout of randomLayouts(100, 7)) {
      const dom = parse(renderPage(layout, design, { mode: "editor" }).html);
      expect(dom.querySelectorAll("*").length).toBe(countNodes(layout.root));
      const check = (node: LayoutNode, parentId: string | undefined) => {
        const el = dom.querySelector(`[data-emvb-id="${node.id}"]`);
        expect(el?.parentElement?.getAttribute("data-emvb-id") ?? undefined).toBe(parentId);
        if (node.type === "container") for (const child of node.children) check(child, node.id);
      };
      check(layout.root, undefined);
    }
  });
});

describe("safe output (R-032)", () => {
  test.each(XSS_CORPUS)("heading text %p renders as inert text", (text) => {
    const { html } = renderPage(page(heading("head0001", text, 2)), design);
    const dom = parse(html);
    expect(dom.querySelectorAll("*").length).toBe(2);
    expect(dom.querySelector("h2")?.textContent).toBe(text);
    expect(html).not.toMatch(/<(?!\/?(?:div|h2)[ >])/);
  });

  test.each(CSS_INJECTION_CORPUS)(
    "colour %p never reaches the stylesheet, even when schema validation is skipped",
    (value) => {
      const unvalidated = page({
        ...heading("head0001"),
        style: { color: value },
      } as unknown as LayoutNode);
      const result = renderPage(unvalidated, design);
      expect(result.css).not.toContain(value);
      expect(result.css).not.toMatch(/url\(|expression\(|<\/style|@import/i);
      expect(result.html).not.toContain("emvb-e-head0001");
      expect(result.warnings).toContainEqual({
        nodeId: "head0001",
        code: "rejected-style",
        detail: "color",
      });
    },
  );

  test("unsafe design variable values are not emitted", () => {
    const bad = {
      schemaVersion: 1,
      variables: { colors: [{ id: "x", name: "X", value: "red;}body{x:y" }] },
    } as DesignSystem;
    expect(renderPage(page(), bad).css).not.toContain("body");
  });

  test("the serializer refuses tags and attributes outside the allowlist", () => {
    expect(() => serialize({ tag: "script", attrs: {}, children: [] })).toThrow("not allowed");
    expect(() => serialize({ tag: "div", attrs: { onclick: "x" }, children: [] })).toThrow(
      "not allowed",
    );
  });
});

describe("CSS", () => {
  test("a variable reference emits var(--emvb-c-<id>) with the definition on .emvb-root", () => {
    const { css } = renderPage(s1Page(), design);
    expect(css).toContain(".emvb-root{--emvb-c-brand:#0055ff}");
    expect(css).toContain(".emvb-e-head0001{color:var(--emvb-c-brand)}");
  });

  test("cascade order: variables, then base CSS, then local rules", () => {
    const { css } = renderPage(s1Page(), design);
    const at = (s: string) => css.indexOf(s);
    expect(at(".emvb-root{")).toBeLessThan(at(".emvb-container{"));
    expect(at(".emvb-heading{")).toBeLessThan(at(".emvb-e-root0001{"));
    expect(css).toContain(".emvb-e-root0001{flex-direction:column;gap:16px}");
  });

  test("base CSS is emitted only for the element types in use", () => {
    const empty = renderPage(page(), emptyDesign()).css;
    expect(empty).toContain(".emvb-container{");
    expect(empty).not.toContain(".emvb-heading");
    expect(empty).not.toContain(".emvb-root{");
  });

  test("an undefined variable is reported", () => {
    const layout = page({ ...heading("head0001"), style: { color: { var: "missing" } } });
    expect(renderPage(layout, design).warnings).toEqual([
      { nodeId: "head0001", code: "unknown-variable", detail: "missing" },
    ]);
  });
});

describe("robustness (R-033)", () => {
  const withUnknown = page(heading("head0001"), {
    id: "odd00001",
    type: "marquee",
    props: {},
  } as unknown as LayoutNode);

  test("unknown types render nothing publicly and the rest of the page still renders", () => {
    const result = renderPage(withUnknown, design);
    expect(result.html).toBe(
      '<div class="emvb-root emvb-container"><h1 class="emvb-heading">Hello</h1></div>',
    );
    expect(result.warnings).toEqual([
      { nodeId: "odd00001", code: "unknown-type", detail: "marquee" },
    ]);
  });

  test("unknown types show a placeholder in the editor", () => {
    const dom = parse(renderPage(withUnknown, design, { mode: "editor" }).html);
    expect(dom.querySelector('[data-emvb-id="odd00001"]')?.textContent).toBe(
      'Unknown element "marquee"',
    );
  });
});
