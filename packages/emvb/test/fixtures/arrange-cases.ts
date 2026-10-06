import {
  canDrop,
  moveDown,
  moveIn,
  moveOut,
  moveUp,
  REASONS,
  type Arranged,
  type DragSource,
} from "../../src/core/arrange.ts";
import { defaultElement } from "../../src/core/elements/index.ts";
import { MAX_DEPTH, MAX_NODES } from "../../src/core/limits.ts";
import { KNOWN_ELEMENT_TYPES, type Layout, type LayoutNode } from "../../src/core/schema/layout.ts";
import { nodeChildren } from "../../src/core/tree-ops.ts";

const el = (type: (typeof KNOWN_ELEMENT_TYPES)[number], id: string, children?: LayoutNode[]) =>
  ({
    ...(defaultElement(type, id) as LayoutNode),
    ...(children ? { children } : {}),
  }) as LayoutNode;

function chain(depth: number): LayoutNode {
  let node = el("container", `deep${String(depth).padStart(4, "0")}`, []);
  for (let d = depth - 1; d >= 1; d--)
    node = el("container", `deep${String(d).padStart(4, "0")}`, [node]);
  return node;
}

const page = (children: LayoutNode[]): Layout => ({
  schemaVersion: 12,
  root: { id: "root0001", type: "container", props: {}, children },
});

const layout = page([
  el("container", "box00001", [el("heading", "head0001")]),
  el("div-block", "div00001", [el("flexbox", "flex0001", [el("text", "text0001")])]),
  el("form", "form0001", [
    el("text-input", "inp00001"),
    el("container", "fbox0001", [el("textarea", "area0001")]),
  ]),
  el("loop", "loop0001", [el("post-title", "ptit0001")]),
  el("tabs", "tabs0001", [el("tab-panel", "tabp0001", [el("text", "text0002")])]),
  {
    id: "unkn0001",
    type: "future-widget",
    props: {},
    children: [el("heading", "head0002")],
  } as never,
  // root is depth 1, so the chain's last container sits at MAX_DEPTH - 1.
  chain(MAX_DEPTH - 2),
]);

const ids = (node: LayoutNode): string[] => [node.id, ...nodeChildren(node).flatMap(ids)];

const reasonKey = new Map<string, string>(Object.entries(REASONS).map(([k, v]) => [v, k]));

const outcome = (l: Layout, source: DragSource, target: string) => {
  const result = canDrop(l, source, target);
  return result.ok ? "ok" : (reasonKey.get(result.reason) ?? result.reason);
};

const newSources: [string, LayoutNode][] = [
  ...KNOWN_ELEMENT_TYPES.map((type) => [type, el(type, "new00001")] as [string, LayoutNode]),
  ["container+child", el("container", "new00001", [el("heading", "new00002")])],
  ["form+field", el("form", "new00001", [el("text-input", "new00002")])],
  ["tabs+panel", el("tabs", "new00001", [el("tab-panel", "new00002")])],
];

/** Every drag source against every drop target, as `source -> target: outcome`. */
export function dropTable(): Record<string, string> {
  const table: Record<string, string> = {};
  const targets = [...ids(layout.root), "gone0001"];
  for (const target of targets) {
    for (const id of targets)
      table[`existing ${id} -> ${target}`] = outcome(layout, { kind: "existing", id }, target);
    for (const [name, node] of newSources)
      table[`new ${name} -> ${target}`] = outcome(layout, { kind: "new", node }, target);
  }
  // One page one element below the limit and one at it (the root counts).
  for (const [label, count] of [
    ["near-full", MAX_NODES - 2],
    ["full", MAX_NODES - 1],
  ] as const) {
    const crowded = page(
      Array.from({ length: count }, (_, i) => el("heading", `many${String(i).padStart(4, "0")}`)),
    );
    for (const [name, node] of newSources.filter(
      ([n]) => n === "heading" || n === "container+child",
    ))
      table[`${label} new ${name} -> root0001`] = outcome(
        crowded,
        { kind: "new", node },
        "root0001",
      );
    table[`${label} existing many0000 -> root0001`] = outcome(
      crowded,
      { kind: "existing", id: "many0000" },
      "root0001",
    );
  }
  return table;
}

/** Where `id` sits in `l`, as `parent[index]`. */
function placeOf(l: Layout, id: string): string {
  const find = (node: LayoutNode): string | undefined => {
    const children = nodeChildren(node);
    const at = children.findIndex((child) => child.id === id);
    if (at !== -1) return `${node.id}[${at}]`;
    for (const child of children) {
      const found = find(child);
      if (found) return found;
    }
    return undefined;
  };
  return find(l.root) ?? "nowhere";
}

const MOVES = { up: moveUp, down: moveDown, in: moveIn, out: moveOut };

/** Every element through Alt+↑/↓/→/←, as the element's new place or the refusal. */
export function moveTable(): Record<string, string> {
  const table: Record<string, string> = {};
  for (const id of [...ids(layout.root), "gone0001"]) {
    for (const [name, move] of Object.entries(MOVES)) {
      const result: Arranged = move(layout, id);
      table[`${name} ${id}`] = result.ok
        ? `${result.selected} -> ${placeOf(result.layout, id)}`
        : (reasonKey.get(result.reason) ?? result.reason);
    }
  }
  return table;
}
