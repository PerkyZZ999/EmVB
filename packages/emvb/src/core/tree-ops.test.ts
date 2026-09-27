import { describe, expect, test } from "bun:test";
import { s1Page } from "../../test/fixtures/layouts.ts";
import {
  findNode,
  insertNode,
  newNodeId,
  nodeIdAtPath,
  removeNode,
  slugify,
  starterLayout,
  updateNode,
} from "./tree-ops.ts";
import { validateLayout } from "./validate.ts";

const twoHeadings = () => {
  const page = s1Page();
  page.root.children.push({ id: "head0002", type: "heading", props: { text: "Second", level: 2 } });
  return page;
};

describe("tree operations (A-07)", () => {
  test("updateNode changes only the target and never mutates the input", () => {
    const before = s1Page();
    const snapshot = structuredClone(before);
    const after = updateNode(before, "head0001", (node) =>
      node.type === "heading" ? { ...node, props: { ...node.props, text: "Changed" } } : node,
    );
    expect(before).toEqual(snapshot);
    expect(findNode(after, "head0001")).toMatchObject({ props: { text: "Changed", level: 1 } });
    expect(findNode(after, "root0001")).toMatchObject({ style: before.root.style });
  });

  test("removeNode reports the parent and index, and insertNode puts it back exactly", () => {
    const page = twoHeadings();
    const { layout, removed } = removeNode(page, "head0001");
    expect(removed).toMatchObject({ parentId: "root0001", index: 0, node: { id: "head0001" } });
    expect(layout.root.children.map((c) => c.id)).toEqual(["head0002"]);
    if (!removed) throw new Error("expected a removal");
    expect(insertNode(layout, removed.parentId, removed.index, removed.node)).toEqual(page);
  });

  test("the root can't be removed, and unknown ids change nothing", () => {
    const page = s1Page();
    expect(removeNode(page, "root0001")).toEqual({ layout: page });
    expect(removeNode(page, "nope0000")).toEqual({ layout: page });
    const node = { id: "head0009", type: "heading" as const, props: { text: "x", level: 3 } };
    expect(insertNode(page, "nope0000", 0, node)).toEqual(page);
  });

  test("insertNode clamps the index", () => {
    const page = s1Page();
    const node = { id: "head0009", type: "heading" as const, props: { text: "x", level: 3 } };
    expect(insertNode(page, "root0001", 99, node).root.children.map((c) => c.id)).toEqual([
      "head0001",
      "head0009",
    ]);
  });

  test.each([
    ["root.children[1].props.level", "head0002"],
    ["root.style.gap", "root0001"],
    ["root.children[7].props.text", "root0001"],
    ["layout", undefined],
  ])("nodeIdAtPath(%s) = %s", (path, id) => {
    expect(nodeIdAtPath(twoHeadings(), path)).toBe(id);
  });
});

describe("new pages", () => {
  test("the starter layout is valid and uses the title as its heading", () => {
    const layout = starterLayout("Pricing");
    expect(validateLayout(layout).ok).toBe(true);
    expect(layout.root.children[0]).toMatchObject({ type: "heading", props: { text: "Pricing" } });
    expect(layout.root.id).not.toBe(layout.root.children[0]?.id);
  });

  test("new ids match the id pattern", () => {
    for (let i = 0; i < 50; i++) expect(newNodeId()).toMatch(/^[a-z0-9]{8}$/);
  });

  test.each([
    ["Pricing", "pricing"],
    ["  Hello, World! ", "hello-world"],
    ["Café crème", "cafe-creme"],
    ["---", ""],
    ["a".repeat(100), "a".repeat(80)],
  ])("slugify(%p) = %p", (input, slug) => {
    expect(slugify(input)).toBe(slug);
  });
});
