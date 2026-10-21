import { expect, test } from "bun:test";
import { prepareElement } from "../clipboard.ts";
import { emptyDesign } from "../schema/design.ts";
import type { Layout, LayoutNode } from "../schema/layout.ts";
import { findNode } from "../tree-ops.ts";
import { clearVariableRefs, findVariableUsages } from "./variables.ts";

const box = {
  id: "box00001",
  type: "container",
  props: {},
  query: { min: 600, style: { color: { var: "brand" }, gap: { value: 8, unit: "px" } } },
  children: [],
} as unknown as LayoutNode;
const layout = {
  schemaVersion: 17,
  root: { id: "root0001", type: "container", props: {}, children: [box] },
} as Layout;

test("W-643: variables used in a container-query override are found, cleared and dropped on paste", () => {
  expect(findVariableUsages(layout, "brand", "color")).toEqual([
    { nodeId: "box00001", prop: "query.color" },
  ]);
  const cleared = findNode(clearVariableRefs(layout, "brand", "color"), "box00001");
  expect(cleared?.query).toEqual({ min: 600, style: { gap: { value: 8, unit: "px" } } });
  const empty = { ...layout, root: { ...layout.root, children: [] } } as Layout;
  const pasted = prepareElement(box, empty, emptyDesign());
  expect(pasted.dropped.variables).toBe(1);
  expect(pasted.node.query?.style).toEqual({ gap: { value: 8, unit: "px" } });
});
