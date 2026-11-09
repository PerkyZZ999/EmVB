import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { s1Page } from "../fixtures/layouts.ts";
import { createTestRuntime, ROLES, userWithRole } from "./runtime.ts";

// W-925: MCP tools take the 0.x names an older agent or skill still sends, and store 1.0 names.

let t: Awaited<ReturnType<typeof createTestRuntime>>;
beforeEach(async () => {
  t = await createTestRuntime();
  await t.agentSettings();
});
afterEach(async () => {
  await t.dispose();
});

type Node = Record<string, unknown> & { id: string; children?: Node[] };
const call = async <T = Record<string, unknown>>(tool: string, input: unknown) => {
  const result = (await t.mcp(tool, input, userWithRole(ROLES.editor))) as {
    success: boolean;
    data?: unknown;
    error?: unknown;
  };
  if (!result.success) throw new Error(JSON.stringify(result.error));
  return result.data as T;
};
const newPage = async () => {
  const created = (await t.savePage({ title: "Home", layout: s1Page() })) as {
    data: { item: { id: string } };
  };
  return created.data.item.id;
};
const nodeOf = async (pageId: string, id: string) => {
  const { layout } = await call<{ layout: { schemaVersion: number; root: Node } }>("get_layout", {
    pageId,
  });
  expect(layout.schemaVersion).toBe(18);
  const find = (node: Node): Node | undefined =>
    node.id === id ? node : (node.children ?? []).map(find).find(Boolean);
  return find(layout.root);
};
const fade = { type: "fade", duration: 400 };

describe("MCP accepts 0.x names (W-925)", () => {
  test("add_element upgrades section, label and flat motion", async () => {
    const pageId = await newPage();
    const out = await call<{ changed: string[] }>("add_element", {
      pageId,
      parentId: "root0001",
      element: {
        type: "section",
        props: {},
        label: "Band",
        style: { entrance: fade },
        children: [],
      },
    });
    const node = await nodeOf(pageId, out.changed[0] as string);
    expect(node).toMatchObject({
      type: "part-ref",
      editorLabel: "Band",
      style: { motion: { entrance: fade } },
    });
    expect(node && "label" in node).toBe(false);
  });

  test("update_element sets and unsets by old names", async () => {
    const pageId = await newPage();
    await call("update_element", {
      pageId,
      nodeId: "head0001",
      set: { label: "Hero", style: { entrance: fade } },
    });
    let node = await nodeOf(pageId, "head0001");
    expect(node).toMatchObject({ editorLabel: "Hero", style: { motion: { entrance: fade } } });
    expect((node?.style as Record<string, unknown> | undefined)?.["color"]).toEqual({
      var: "brand",
    });
    await call("update_element", {
      pageId,
      nodeId: "head0001",
      unset: ["label", "style.entrance"],
    });
    node = await nodeOf(pageId, "head0001");
    expect(node && "editorLabel" in node).toBe(false);
    expect(node?.style).toEqual({ color: { var: "brand" } });
  });
});
