import type { Layout, LayoutNode } from "../../src/core/index.ts";

export const heading = (id: string, text = "Hello", level = 1): LayoutNode => ({
  id,
  type: "heading",
  props: { text, level },
});

export const container = (id: string, children: LayoutNode[] = []): LayoutNode => ({
  id,
  type: "container",
  props: {},
  children,
});

/** The S1 page: one container holding one heading, with a colour variable on the heading. */
export const s1Page = (): Layout => ({
  schemaVersion: 3,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    style: { flexDirection: "column", gap: { value: 16, unit: "px" } },
    children: [{ ...heading("head0001", "Welcome", 1), style: { color: { var: "brand" } } }],
  },
});

/** A valid layout whose JSON is exactly `bytes` long (UTF-8), built from headings of `char`. */
export function layoutOfBytes(bytes: number, char = "x"): Layout {
  const charBytes = new TextEncoder().encode(char).length;
  const children: LayoutNode[] = [];
  const doc: Layout = {
    schemaVersion: 3,
    root: { id: "root0001", type: "container", props: {}, children },
  };
  const size = () => new TextEncoder().encode(JSON.stringify(doc)).length;
  let i = 0;
  while (size() < bytes) {
    const remaining = bytes - size();
    const id = `h${String(i++).padStart(7, "0")}`;
    const overhead =
      new TextEncoder().encode(JSON.stringify(heading(id, "", 2))).length +
      (children.length > 0 ? 1 : 0);
    const room = Math.floor((remaining - overhead) / charBytes);
    if (room < 1) throw new Error(`can't hit ${bytes} bytes exactly with "${char}"`);
    children.push(heading(id, char.repeat(Math.min(room, 2000)), 2));
  }
  if (size() !== bytes) throw new Error(`built ${size()} bytes, wanted ${bytes}`);
  return doc;
}

export function nested(depth: number): Layout {
  let node: LayoutNode = heading("leaf0001");
  for (let d = depth - 1; d >= 1; d--) node = container(`c${String(d).padStart(7, "0")}`, [node]);
  return { schemaVersion: 3, root: node as Layout["root"] };
}

/** Deterministic pseudo-random layouts (mulberry32) for property-style tests. */
export function randomLayouts(count: number, seed = 1): Layout[] {
  let state = seed;
  const rand = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let next = 0;
  const id = () => `n${String(next++).padStart(7, "0")}`;
  const build = (depth: number): LayoutNode => {
    if (depth >= 5 || rand() < 0.5)
      return heading(id(), "é🙂x".repeat(1 + Math.floor(rand() * 5)), 1 + Math.floor(rand() * 6));
    const node = container(
      id(),
      Array.from({ length: Math.floor(rand() * 4) }, () => build(depth + 1)),
    );
    if (rand() < 0.5)
      node.style = { flexDirection: "row", gap: { value: Math.floor(rand() * 64), unit: "px" } };
    return node;
  };
  return Array.from({ length: count }, () => {
    next = 0;
    return {
      schemaVersion: 3,
      root: container("root0001", [build(1), build(1)]) as Layout["root"],
    };
  });
}
