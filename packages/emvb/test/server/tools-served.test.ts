import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { TOOLS } from "../../src/mcp/tools.ts";
import { toolListFingerprint } from "../../src/server/tools-served.ts";
import { createTestRuntime, ROLES, userWithRole } from "./runtime.ts";

let t: Awaited<ReturnType<typeof createTestRuntime>>;
beforeEach(async () => {
  t = await createTestRuntime();
  await t.agentSettings();
});
afterEach(async () => {
  await t.dispose();
});

const served = async () =>
  (
    (await t.route("agents", { user: userWithRole(ROLES.admin) })).body["data"] as {
      toolsServed: boolean;
    }
  ).toolsServed;

describe("which tool list EmDash last served (W-932)", () => {
  test("a call through EmDash's MCP endpoint marks this version's tools as served", async () => {
    expect(await served()).toBe(false);
    // Calling the plugin route directly is not EmDash serving the tool.
    await t.route("mcp/list_pages", { user: userWithRole(ROLES.editor), body: {} });
    expect(await served()).toBe(false);
    await t.mcp("list_pages", {});
    expect(await served()).toBe(true);
  });

  test("any change to a tool's name, description or destructive flag changes the fingerprint", () => {
    const base = toolListFingerprint(TOOLS);
    const [first, ...rest] = TOOLS;
    if (!first) throw new Error("no tools");
    expect(
      toolListFingerprint([{ ...first, description: `${first.description}.` }, ...rest]),
    ).not.toBe(base);
    expect(toolListFingerprint([{ ...first, destructive: !first.destructive }, ...rest])).not.toBe(
      base,
    );
    expect(toolListFingerprint(rest)).not.toBe(base);
    expect(toolListFingerprint(TOOLS)).toBe(base);
  });
});
