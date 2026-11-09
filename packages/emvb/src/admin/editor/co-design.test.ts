import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../../core/schema/design.ts";
import { LAYOUT_SCHEMA_VERSION, type Layout } from "../../core/schema/layout.ts";
import type { Proposal } from "../../core/proposals.ts";
import { acceptOps, describeOp, ghostCss, ghostOf, groupOf, type EditorBase } from "./co-design.ts";

const layout = (): Layout =>
  ({
    schemaVersion: LAYOUT_SCHEMA_VERSION,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      children: [
        { id: "head0001", type: "heading", props: { text: "Before", level: 1 } },
        { id: "text0001", type: "text", props: { text: "Old text" } },
      ],
    },
  }) as Layout;
const editor = (): EditorBase => ({
  rev: "rev-1",
  layout: layout(),
  design: emptyDesign(),
  designRevision: null,
});
const proposal = (): Proposal => ({
  version: 1,
  target: { collection: "emvb_pages", id: "page" },
  baseRevision: "rev-1",
  baseDesignRevision: null,
  ops: [
    { kind: "update", id: "head0001", set: { props: { text: "After" } } },
    {
      kind: "insert",
      parentId: "root0001",
      index: 2,
      node: { id: "text0002", type: "text", props: { text: "New" } },
    },
    { kind: "delete", id: "text0001" },
  ],
});
const texts = (l: Layout) =>
  (l.root as { children: { props: { text: string } }[] }).children.map((c) => c.props.text);

describe("co-design review (W-930)", () => {
  test("ops are grouped and described in plain words, agent text quoted", () => {
    const p = proposal();
    expect(p.ops.map(groupOf)).toEqual(["changed", "added", "removed"]);
    expect(describeOp(p.ops[0] as never, layout())).toBe("Change Heading text to “After”");
    expect(describeOp(p.ops[1] as never, layout())).toBe("Add Text “New” to Container");
    expect(describeOp(p.ops[2] as never, layout())).toBe("Remove Text “Old text”");
  });

  test("accepting some changes applies only those, on the editor's layout, without mutating it", () => {
    const base = editor();
    const before = structuredClone(base.layout);
    const result = acceptOps(base, proposal(), [2, 0]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(texts(result.layout)).toEqual(["After"]);
    expect(result.designChanged).toBe(false);
    expect(base.layout).toEqual(before);
  });

  test("a proposal for an earlier page revision is refused as stale", () => {
    const result = acceptOps({ ...editor(), rev: "rev-2" }, proposal(), [0]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("STALE_BASE");
  });

  test("an accepted change that no longer fits the page is refused with the change's index", () => {
    const base = editor();
    base.layout = { ...layout(), root: { ...layout().root, children: [] } } as Layout;
    const result = acceptOps(base, proposal(), [0]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.opIndex).toBe(0);
  });

  test("the ghost shows pending changes and keeps removals, and never touches the editor's layout", () => {
    const base = editor();
    const before = structuredClone(base.layout);
    const ghost = ghostOf(base, proposal(), [0, 1, 2]);
    if (!ghost) throw new Error("no ghost");
    expect(texts(ghost.layout)).toEqual(["After", "Old text", "New"]);
    expect([...ghost.added]).toEqual(["text0002"]);
    expect([...ghost.changed]).toEqual(["head0001"]);
    expect([...ghost.removed]).toEqual(["text0001"]);
    expect(base.layout).toEqual(before);
    expect(ghost.layout).not.toBe(base.layout);
  });

  test("ghost CSS selects only safe ids", () => {
    const css = ghostCss({
      layout: layout(),
      added: new Set(['x"]{} body{display:none']),
      changed: new Set(),
      removed: new Set(["text0001"]),
    });
    expect(css).not.toContain('"]{}');
    expect(css).toContain('[data-emvb-id="text0001"]');
  });
});
