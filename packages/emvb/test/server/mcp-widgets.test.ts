import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { s1Page } from "../fixtures/layouts.ts";
import { createTestRuntime, ROLES, userWithRole } from "./runtime.ts";

// PLAN_1.2 part D: agents list, add and change the 1.2 widgets like any element.

let t: Awaited<ReturnType<typeof createTestRuntime>>;
beforeEach(async () => {
  t = await createTestRuntime();
  await t.agentSettings();
});
afterEach(async () => {
  await t.dispose();
});

type Result = { success: boolean; data?: unknown; error?: { code: string; message: string } };
const call = async <T>(tool: string, input: unknown) =>
  (await t.mcp(tool, input, userWithRole(ROLES.editor))) as Result & { data: T };
const newPage = async () =>
  ((await t.savePage({ title: "Home", layout: s1Page() })) as { data: { item: { id: string } } })
    .data.item.id;
type Element = { type: string; name: string; props: { properties?: Record<string, unknown> } };
const catalogue = async () =>
  new Map(
    (await call<{ elements: Element[] }>("list_element_types", {})).data.elements.map((e) => [
      e.type,
      e,
    ]),
  );

describe("Star rating over MCP (W-1023)", () => {
  test("list_element_types describes it", async () => {
    const rating = (await catalogue()).get("rating");
    expect(rating?.name).toBe("Star rating");
    expect(Object.keys(rating?.props.properties ?? {}).toSorted()).toEqual([
      "label",
      "max",
      "size",
      "value",
    ]);
  });

  test("add_element adds one; an out-of-range value is refused with the reason", async () => {
    const pageId = await newPage();
    const added = await call<{ changed: string[] }>("add_element", {
      pageId,
      parentId: "root0001",
      element: { type: "rating", props: { value: 4.5 } },
    });
    expect(added.success).toBe(true);
    const refused = await call("add_element", {
      pageId,
      parentId: "root0001",
      element: { type: "rating", props: { value: 12 } },
    });
    expect(refused.success).toBe(false);
    expect(JSON.stringify(refused.error)).toContain("value");
  });
});

describe("Alert over MCP (W-1025)", () => {
  test("add_element adds a dismissible warning; an unknown kind is refused", async () => {
    const pageId = await newPage();
    expect((await catalogue()).get("alert")?.name).toBe("Alert");
    const added = await call<{ changed: string[] }>("add_element", {
      pageId,
      parentId: "root0001",
      element: {
        type: "alert",
        props: { variant: "warning", text: "Maintenance tonight.", dismissible: true },
      },
    });
    expect(added.success).toBe(true);
    const refused = await call("add_element", {
      pageId,
      parentId: "root0001",
      element: { type: "alert", props: { variant: "error", text: "x" } },
    });
    expect(refused.success).toBe(false);
  });
});
