import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import type { Layout, LayoutNode } from "../schema/layout.ts";
import { auditPage } from "./audit.ts";

const menu = (id: string, label?: string) =>
  ({
    id,
    type: "menu",
    props: { direction: "row", ...(label === undefined ? {} : { label }) },
    children: [
      {
        id: `${id.slice(0, 4)}item`,
        type: "menu-item",
        props: { text: "Home", href: "/" },
        children: [],
      },
    ],
  }) as unknown as LayoutNode;

const rules = (...menus: LayoutNode[]) =>
  auditPage(
    {
      schemaVersion: 17,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [{ id: "head0001", type: "heading", props: { text: "T", level: 1 } }, ...menus],
      },
    } as Layout,
    emptyDesign(),
  ).issues.map((i) => `${i.rule}:${i.nodeId}`);

describe("menus need different names (W-424)", () => {
  test("two unnamed menus, or the same name twice, warn on the second", () => {
    expect(rules(menu("menu0001"), menu("menb0002"))).toEqual(["landmark-name:menb0002"]);
    expect(rules(menu("menu0001", "Main"), menu("menb0002", " main "))).toEqual([
      "landmark-name:menb0002",
    ]);
  });
  test("different names are fine", () => {
    expect(rules(menu("menu0001", "Main"), menu("menb0002", "Footer"))).toEqual([]);
  });
});

describe("menus on different devices may share a name (W-445)", () => {
  test("a desktop menu and a mobile menu both called Menu don't warn", () => {
    const desk = { ...menu("menu0001"), hiddenOn: ["mobile"] } as unknown as LayoutNode;
    const mob = { ...menu("menb0002"), hiddenOn: ["desktop", "tablet"] } as unknown as LayoutNode;
    expect(rules(desk, mob)).toEqual([]);
  });
});
