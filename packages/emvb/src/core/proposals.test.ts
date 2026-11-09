import { describe, expect, test } from "bun:test";
import { emptyDesign } from "./schema/design.ts";
import { LAYOUT_SCHEMA_VERSION, type Layout } from "./schema/layout.ts";
import { applyProposal, readProposal, type Proposal, type ProposalBase } from "./proposals.ts";
import {
  MAX_PROPOSAL_BYTES,
  MAX_PROPOSAL_DEPTH,
  MAX_PROPOSAL_OPS,
  MAX_DEPTH,
  MAX_NODES,
} from "./limits.ts";
import { renderPage } from "./render/index.ts";

const heading = (id: string, text = id) => ({
  id,
  type: "heading" as const,
  props: { text, level: 2 },
});
const layout = (): Layout => ({
  schemaVersion: LAYOUT_SCHEMA_VERSION,
  root: {
    id: "root",
    type: "container",
    props: {},
    children: [
      { id: "box1", type: "container", props: {}, children: [heading("title")] },
      heading("remove"),
    ],
  },
});
const base = (): ProposalBase => ({
  layout: layout(),
  revision: "page-1",
  design: emptyDesign(),
  designRevision: null,
});
const proposal = (ops: Proposal["ops"]): Proposal => ({
  version: 1,
  target: { collection: "emvb_pages", id: "page-a" },
  baseRevision: "page-1",
  baseDesignRevision: null,
  ops,
});
const update = (set: Record<string, unknown>): Proposal["ops"][number] => ({
  kind: "update",
  id: "title",
  set,
});
const good = () => proposal([update({ props: { text: "Proposed" } })]);
const refused = (raw: unknown, b = base(), selected?: number[]) => {
  const result = applyProposal(b, raw, selected);
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("Expected refusal");
  return result;
};

describe("proposals v1 (W-928)", () => {
  test("all ordered ops equal the intended layout and design without mutating the base", () => {
    const b = base();
    const before = structuredClone(b);
    const ops: Proposal["ops"] = [
      { kind: "insert", parentId: "root", index: 1, node: heading("new1") },
      { kind: "move", id: "new1", parentId: "box1", index: 1 },
      update({
        props: { text: "Changed" },
        editorLabel: "Page heading",
        style: { motion: { entrance: { type: "fade", duration: 500 } } },
      }),
      { kind: "delete", id: "remove" },
      {
        kind: "class",
        id: "card",
        value: { id: "card", name: "Card", style: { color: "#ff0000" } },
      },
      {
        kind: "variable",
        group: "colors",
        id: "brand",
        value: { id: "brand", name: "Brand", value: "#123456" },
      },
    ];
    // The fixture also exercises replacing/removing styles and variables in order.
    ops.push({
      kind: "class",
      id: "card",
      value: { id: "card", name: "Card", style: { color: "#00ff00" } },
    });
    const result = applyProposal(b, proposal(ops));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    const intended = layout();
    intended.root.children = [
      {
        id: "box1",
        type: "container",
        props: {},
        children: [
          {
            ...heading("title", "Changed"),
            editorLabel: "Page heading",
            style: { motion: { entrance: { type: "fade", duration: 500 } } },
          },
          heading("new1"),
        ],
      },
    ];
    expect(result.layout).toEqual(intended);
    expect(result.design).toEqual({
      ...emptyDesign(),
      classes: [{ id: "card", name: "Card", style: { color: "#00ff00" } }],
      variables: {
        ...emptyDesign().variables,
        colors: [{ id: "brand", name: "Brand", value: "#123456" }],
      },
    });
    expect(b).toEqual(before);
    const deleted = applyProposal(
      { ...b, layout: result.layout, design: result.design },
      proposal([
        { kind: "class", id: "card", value: null },
        { kind: "variable", group: "colors", id: "brand", value: null },
      ]),
    );
    expect(deleted.ok && deleted.design).toEqual(emptyDesign());
  });

  test("selected ops retain original order and rejected ops never leak; dependencies refuse atomically", () => {
    const b = base();
    const p = proposal([
      update({ props: { text: "First" } }),
      update({ props: { text: "Rejected" } }),
      update({ props: { text: "Last" } }),
    ]);
    const selected = applyProposal(b, p, [2, 0]);
    expect(selected.ok && selected.layout.root.children[0]).toEqual({
      id: "box1",
      type: "container",
      props: {},
      children: [heading("title", "Last")],
    });
    expect(applyProposal(b, p, []).ok).toBe(true);
    expect(refused(p, b, [0, 0]).reason).toContain("indexes");
    expect(refused(p, b, [99]).reason).toContain("indexes");
    const dependent = proposal([
      { kind: "insert", parentId: "root", index: 0, node: heading("new1") },
      { kind: "update", id: "new1", set: { props: { text: "Later" } } },
    ]);
    expect(refused(dependent, b, [1]).opIndex).toBe(1);
    expect(b.layout).toEqual(layout());
  });

  test("stale page and style bases carry both revisions and an explicit rebase hint", () => {
    const stale = refused({ ...good(), baseRevision: "page-old" });
    expect(stale).toMatchObject({
      code: "STALE_BASE",
      expectedRevision: "page-old",
      currentRevision: "page-1",
    });
    expect(stale.reason).toContain("Rebase:");
    const p = proposal([{ kind: "class", id: "a", value: { id: "a", name: "A", style: {} } }]);
    expect(refused(p, { ...base(), designRevision: "styles-2" })).toMatchObject({
      code: "STALE_BASE",
      expectedRevision: null,
      currentRevision: "styles-2",
    });
    expect(applyProposal({ ...base(), designRevision: "styles-2" }, good()).ok).toBe(true);
  });

  test("invalid node props and frozen identity edits are refused even when a later op would hide them", () => {
    for (const set of [
      { props: { level: 99 } },
      { id: "renamed" },
      { type: "script" },
      { children: [] },
      { label: "legacy" },
      { props: null },
      { style: { width: { value: -1, unit: "px" } } },
    ]) {
      const result = refused(proposal([update(set), { kind: "delete", id: "title" }]));
      expect(result.opIndex).toBe(0);
    }
    expect(
      applyProposal(
        base(),
        proposal([
          { kind: "insert", parentId: "root", index: 0, node: heading("proposal-wrapper") },
        ]),
      ).ok,
    ).toBe(true);
    const invalid = proposal([
      {
        kind: "insert",
        parentId: "root",
        index: 0,
        node: { ...heading("bad"), props: { level: 100 } },
      },
    ]);
    expect(refused(invalid).opIndex).toBe(0);
    expect(
      refused(
        proposal([
          {
            kind: "insert",
            parentId: "root",
            index: 0,
            node: { id: "bad1", type: "script", props: {} },
          },
        ]),
      ).reason,
    ).toContain("Unknown");
  });

  test("missing ids, duplicate ids, illegal nesting, cycles and the root are refused without partial results", () => {
    const badOps: Proposal["ops"][number][] = [
      { kind: "delete", id: "missing" },
      { kind: "delete", id: "root" },
      { kind: "move", id: "box1", parentId: "box1", index: 0 },
      { kind: "move", id: "missing", parentId: "root", index: 0 },
      { kind: "insert", parentId: "missing", index: 0, node: heading("new1") },
      { kind: "insert", parentId: "root", index: 100, node: heading("new1") },
      { kind: "insert", parentId: "root", index: 0, node: heading("title") },
      {
        kind: "insert",
        parentId: "root",
        index: 0,
        node: { id: "tab1", type: "tab-panel", props: { title: "Tab" }, children: [] },
      },
    ];
    const b = base();
    for (const op of badOps)
      expect(refused(proposal([update({ props: { text: "Uncommitted" } }), op]), b).opIndex).toBe(
        1,
      );
    expect(b.layout).toEqual(layout());
  });

  test("proposal count, byte, JSON nesting and resulting node/depth budgets are enforced", () => {
    expect(
      readProposal(proposal(Array.from({ length: MAX_PROPOSAL_OPS + 1 }, () => update({})))).ok,
    ).toBe(false);
    expect(
      readProposal(proposal([update({ props: { text: "x".repeat(MAX_PROPOSAL_BYTES) } })])).ok,
    ).toBe(false);
    let deep: unknown = "x";
    for (let i = 0; i < MAX_PROPOSAL_DEPTH + 1; i++) deep = { nested: deep };
    expect(readProposal(proposal([update({ extra: deep })])).ok).toBe(false);
    const big = layout();
    big.root.children = Array.from({ length: MAX_NODES - 1 }, (_, i) => heading(`node${i}`));
    expect(
      refused(proposal([{ kind: "insert", parentId: "root", index: 0, node: heading("extra") }]), {
        ...base(),
        layout: big,
      }).reason,
    ).toContain("2000");
    const nested = layout();
    let parent = nested.root;
    for (let i = 1; i < MAX_DEPTH; i++) {
      const child = { id: `container${i}`, type: "container" as const, props: {}, children: [] };
      parent.children = [child];
      parent = child;
    }
    expect(
      refused(
        proposal([{ kind: "insert", parentId: parent.id, index: 0, node: heading("extra") }]),
        { ...base(), layout: nested },
      ).reason,
    ).toContain("24");
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    for (const raw of [
      cycle,
      undefined,
      BigInt(1),
      { ...good(), version: 2 },
      JSON.parse('{"__proto__":{}}'),
    ])
      expect(readProposal(raw).ok).toBe(false);
  });

  test("links, media, SVG, CSS and font injection use existing sanitizer allowlists", () => {
    const bad: Proposal["ops"][number][] = [
      update({ props: { href: "javascript:alert(1)" } }),
      update({ style: { fontFamily: "serif; color:red" } }),
      update({ style: { entrance: { type: "fade" } } }),
      {
        kind: "insert",
        parentId: "root",
        index: 0,
        node: { id: "image", type: "image", props: { src: "data:text/html,evil", alt: "" } },
      },
      {
        kind: "insert",
        parentId: "root",
        index: 0,
        node: { id: "svg1", type: "svg", props: { markup: '<svg onload="alert(1)"></svg>' } },
      },
      {
        kind: "variable",
        group: "fonts",
        id: "font",
        value: { id: "font", name: "Font", value: "serif; color:red" },
      },
    ];
    for (const op of bad) expect(refused(proposal([op])).opIndex).toBe(0);
    const safe = applyProposal(
      base(),
      proposal([update({ props: { text: "<script>alert(1)</script>", href: "/safe" } })]),
    );
    expect(safe.ok).toBe(true);
    if (safe.ok) {
      const rendered = renderPage(safe.layout, safe.design);
      expect(rendered.html).not.toContain("<script>");
      expect(rendered.html).toContain("&lt;script&gt;");
    }
  });

  test("class and variable edits share design validation, id and unique clean-name checks", () => {
    const bad: Proposal["ops"][number][] = [
      { kind: "class", id: "x", value: { id: "y", name: "X", style: {} } },
      { kind: "class", id: "x", value: { id: "x", name: "  ", style: {} } },
      {
        kind: "class",
        id: "x",
        value: { id: "x", name: "X", style: { color: "red;display:none" } },
      },
      {
        kind: "variable",
        group: "colors",
        id: "x",
        value: { id: "x", name: "X", value: "not-a-color" },
      },
      { kind: "variable", group: "spacings", id: "x", value: null },
    ];
    for (const op of bad) expect(refused(proposal([op])).opIndex).toBe(0);
    const duplicate = proposal([
      { kind: "class", id: "a", value: { id: "a", name: "Card", style: {} } },
      { kind: "class", id: "b", value: { id: "b", name: "card", style: {} } },
    ]);
    expect(refused(duplicate).reason).toContain("already in use");
  });
});
