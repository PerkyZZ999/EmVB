import { describe, expect, test } from "bun:test";
import type { VNode } from "../render/vnode.ts";
import { scopeIds } from "./scope-ids.ts";

const el = (
  tag: string,
  attrs: Record<string, string> = {},
  ...children: (VNode | string)[]
): VNode => ({
  tag,
  attrs,
  children,
});

/** The render context's `uniqueId` with a header-style suffix, as `ctx.uniqueId` builds it. */
function uniqueIds(suffix = "") {
  const counts = new Map<string, number>();
  return (base: string) => {
    const n = (counts.get(base) ?? 0) + 1;
    counts.set(base, n);
    return `${base}${n === 1 ? "" : `-r${n}`}${suffix}`;
  };
}

const dialog = () =>
  el(
    "div",
    {},
    el("button", { popovertarget: "box", "aria-controls": "box" }, "Open"),
    el("dialog", { id: "box", "aria-labelledby": "title" }, el("h2", { id: "title" }, "Hi")),
    el("label", { for: "field" }, "Name"),
    el("input", { id: "field", type: "text" }),
    el("a", { href: "#title" }, "Jump"),
  );

describe("scopeIds", () => {
  test("renames owned ids and rewrites every reference with the same mapping", () => {
    const out = scopeIds(dialog(), uniqueIds());
    const [button, box, label, input, link] = out.children as VNode[];
    expect(button?.attrs).toEqual({ popovertarget: "ext-box", "aria-controls": "ext-box" });
    expect(box?.attrs).toEqual({ id: "ext-box", "aria-labelledby": "ext-title" });
    expect(((box as VNode).children[0] as VNode).attrs.id).toBe("ext-title");
    expect(label?.attrs.for).toBe("ext-field");
    expect(input?.attrs).toEqual({ id: "ext-field", type: "text" });
    expect(link?.attrs.href).toBe("#ext-title");
  });

  test("two copies of one element get different ids, and each keeps its own references", () => {
    const uniqueId = uniqueIds();
    const first = scopeIds(dialog(), uniqueId);
    const second = scopeIds(dialog(), uniqueId);
    const idsOf = (root: VNode): string[] => {
      const found: string[] = [];
      const visit = (n: VNode) => {
        if (n.attrs.id) found.push(n.attrs.id);
        n.children.forEach((c) => typeof c !== "string" && visit(c));
      };
      visit(root);
      return found;
    };
    expect(idsOf(first)).toEqual(["ext-box", "ext-title", "ext-field"]);
    expect(idsOf(second)).toEqual(["ext-box-r2", "ext-title-r2", "ext-field-r2"]);
    expect((second.children[0] as VNode).attrs.popovertarget).toBe("ext-box-r2");
    expect((second.children[4] as VNode).attrs.href).toBe("#ext-title-r2");
  });

  test("a copy in a header or popup takes the render's suffix", () => {
    const out = scopeIds(dialog(), uniqueIds("-hd"));
    expect((out.children[1] as VNode).attrs.id).toBe("ext-box-hd");
    expect((out.children[0] as VNode).attrs.popovertarget).toBe("ext-box-hd");
  });

  test("a reference to an id the element does not own is dropped", () => {
    const out = scopeIds(
      el(
        "div",
        {},
        el("label", { for: "elsewhere" }, "x"),
        el("button", { popovertarget: "elsewhere", "aria-controls": "elsewhere" }, "y"),
        el("a", { href: "#pricing" }, "z"),
        el("p", { id: "mine", "aria-labelledby": "mine elsewhere" }, "w"),
      ),
      uniqueIds(),
    );
    const [label, button, link, p] = out.children as VNode[];
    expect(label?.attrs).toEqual({});
    expect(button?.attrs).toEqual({});
    expect(link?.attrs).toEqual({});
    expect(p?.attrs).toEqual({ id: "ext-mine", "aria-labelledby": "ext-mine" });
  });

  test("ids that start with emvb, shadow a browser global, or are not plain ids are dropped with their references", () => {
    const out = scopeIds(
      el(
        "div",
        {},
        el("p", { id: "emvb-root" }),
        el("p", { id: "location" }),
        el("p", { id: "name" }),
        el("p", { id: "1bad" }),
        el("p", { id: 'a"b' }),
        el("label", { for: "location" }),
        el("a", { href: "#emvb-root" }),
      ),
      uniqueIds(),
    );
    const kids = out.children as VNode[];
    kids.forEach((kid) => expect(kid.attrs).toEqual({}));
  });

  test("SVG paint references (url(#id)) follow the renamed id, and a foreign one is dropped", () => {
    const svg = el(
      "svg",
      {},
      el("defs", {}, el("linearGradient", { id: "grad" }), el("clipPath", { id: "clip" })),
      el("rect", { fill: "url(#grad)", "clip-path": "url(#clip)", stroke: "url(#outside)" }),
      el("rect", { fill: "red", mask: "url( #clip )" }),
    );
    const out = scopeIds(svg, uniqueIds());
    const [, rect, plain] = out.children as VNode[];
    expect(rect?.attrs).toEqual({ fill: "url(#ext-grad)", "clip-path": "url(#ext-clip)" });
    expect(plain?.attrs).toEqual({ fill: "red", mask: "url(#ext-clip)" });
  });

  test("aria-activedescendant and aria-flowto are references too", () => {
    const out = scopeIds(
      el(
        "div",
        { "aria-activedescendant": "opt", "aria-flowto": "opt other" },
        el("li", { id: "opt" }),
      ),
      uniqueIds(),
    );
    expect(out.attrs).toEqual({ "aria-activedescendant": "ext-opt", "aria-flowto": "ext-opt" });
  });

  test("an id that ends like a generated repeat (-r2) is dropped, so two copies never collide", () => {
    const copy = () => el("div", {}, el("p", { id: "a" }), el("p", { id: "a-r2" }));
    const uniqueId = uniqueIds();
    const ids = [copy(), copy()].flatMap((root) =>
      (scopeIds(root, uniqueId).children as VNode[]).map((c) => c.attrs.id),
    );
    expect(ids).toEqual(["ext-a", undefined, "ext-a-r2", undefined]);
  });

  test("a repeated id inside one element is kept once", () => {
    const out = scopeIds(el("div", {}, el("p", { id: "a" }), el("p", { id: "a" })), uniqueIds());
    expect((out.children[0] as VNode).attrs.id).toBe("ext-a");
    expect((out.children[1] as VNode).attrs).toEqual({});
  });

  test("other attributes, other URLs and text are untouched, and the input is not changed", () => {
    const input = el(
      "div",
      { class: "daisy-card" },
      el("a", { href: "https://example.com/#top", title: "t" }, "Link"),
      "plain text",
      el("img", { src: "https://example.com/a.png", alt: "" }),
    );
    const before = JSON.stringify(input);
    const out = scopeIds(input, uniqueIds());
    expect(JSON.stringify(out)).toBe(before);
    expect(JSON.stringify(input)).toBe(before);
    expect(out).not.toBe(input);
  });

  test("uniqueId runs once per owned id, in document order, and not at all without ids", () => {
    const calls: string[] = [];
    scopeIds(dialog(), (base) => (calls.push(base), base));
    expect(calls).toEqual(["ext-box", "ext-title", "ext-field"]);
    const none: string[] = [];
    scopeIds(el("div", {}, el("p")), (base) => (none.push(base), base));
    expect(none).toEqual([]);
  });
});
