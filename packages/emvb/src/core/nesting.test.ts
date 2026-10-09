import { describe, expect, test } from "bun:test";
import { defaultElement } from "./elements/index.ts";
import { nestingIssues } from "./nesting.ts";
import type { Layout, LayoutNode } from "./schema/layout.ts";

const page = (...children: LayoutNode[]): Layout =>
  ({
    schemaVersion: 13,
    root: { id: "root0001", type: "container", props: {}, children },
  }) as Layout;
const el = (type: string, id: string, children?: LayoutNode[]) =>
  ({
    ...(defaultElement(type as never, id) as object),
    id,
    ...(children ? { children } : {}),
  }) as LayoutNode;

describe("save-time nesting check (W-225)", () => {
  test("trees the editor builds pass", () => {
    const menu = el("menu", "menu0001", [
      el("menu-item", "mitm0001", [el("menu-item", "mitm0002")]),
    ]);
    const form = el("form", "form0001", [
      el("container", "cont0001", [el("text-input", "txin0001")]),
    ]);
    expect(nestingIssues(page(menu, form, el("heading", "head0001")))).toEqual([]);
  });

  test("an orphan menu item, a stray panel and a field outside a form are named", () => {
    const issues = nestingIssues(
      page(el("menu-item", "mitm0001"), el("tab-panel", "tabp0001"), el("text-input", "txin0001")),
    );
    expect(issues.map((i) => [i.path, i.message])).toEqual([
      ["root.children[0]", "Menu items can only go inside a Menu. (menu-item mitm0001)"],
      ["root.children[1]", "Tab panels can only go inside Tabs. (tab-panel tabp0001)"],
      ["root.children[2]", "Form fields must be placed inside a form. (text-input txin0001)"],
    ]);
  });

  test("wrong children of Tabs, Accordion and Menu, and a form in a form", () => {
    const issues = nestingIssues(
      page(
        el("tabs", "tabs0001", [el("heading", "head0001")]),
        el("accordion", "acco0001", [el("text", "text0001")]),
        el("menu", "menu0001", [el("link", "link0001")]),
        el("form", "form0001", [el("form", "form0002")]),
      ),
      10,
    );
    expect(issues.map((i) => i.message.split(" (")[0])).toEqual([
      "Tabs can only hold tab panels.",
      "An accordion can only hold accordion items.",
      "A menu can only hold menu items.",
      "A form can't go inside another form.",
    ]);
  });

  test("stops at the limit", () => {
    const strays = Array.from({ length: 8 }, (_, i) => el("menu-item", `mitm000${i}`));
    expect(nestingIssues(page(...strays), 3)).toHaveLength(3);
  });
});
