import { describe, expect, test } from "bun:test";
import { serialize, type VNode } from "./vnode.ts";

// The output allowlist must carry the inert HTML that provider markup uses, and nothing that can run
// script or restyle the page. Tags and attributes below are inert; `style` and `popovertarget`
// are allowed only in the narrow forms providers use.
const el = (
  tag: string,
  attrs: Record<string, string> = {},
  children: (VNode | string)[] = [],
): VNode => ({
  tag,
  attrs,
  children,
});

describe("allowlist carries inert markup that providers use", () => {
  test.each([
    [
      "table",
      el("table", {}, [el("thead", {}, [el("tr", {}, [el("th", { scope: "col" }, ["Name"])])])]),
    ],
    ["table body", el("table", {}, [el("tbody", {}, [el("tr", {}, [el("td", {}, ["Cell"])])])])],
    ["kbd", el("kbd", {}, ["Ctrl"])],
    ["pre", el("pre", {}, ["code"])],
    ["dialog", el("dialog", { id: "m1" }, ["Body"])],
    ["textarea rows", el("textarea", { rows: "4", name: "field" })],
    [
      "select selected option",
      el("select", { name: "pick" }, [el("option", { value: "a", selected: "" }, ["A"])]),
    ],
    ["file input accept", el("input", { type: "file", accept: "image/*" })],
    ["input inputmode", el("input", { type: "text", inputmode: "numeric" })],
    ["th scope", el("th", { scope: "row" }, ["Row"])],
    ["popover target", el("button", { popovertarget: "menu-1" }, ["Open"])],
    ["popover", el("div", { popover: "auto", id: "menu-1" }, ["Menu"])],
    ["table caption", el("table", {}, [el("caption", {}, ["Sales"])])],
  ])("%s serializes", (_name, node) => {
    expect(() => serialize(node)).not.toThrow();
  });
});

describe("the boundary stays closed", () => {
  test.each([
    // `style` is refused by name (W-091); countdown and radial progress wait on a decision.
    ["style with a declaration", el("span", { style: "--value:42" })],
    ["popover target with markup", el("button", { popovertarget: '"><script>' })],
    ["popover target with spaces", el("button", { popovertarget: "a b" })],
    ["popover with a script-like value", el("div", { popover: "auto onclick" })],
    ["unknown attribute", el("div", { onclick: "alert(1)" })],
    ["script tag", el("script", {}, ["alert(1)"])],
  ])("%s is refused", (_name, node) => {
    expect(() => serialize(node)).toThrow();
  });
});
