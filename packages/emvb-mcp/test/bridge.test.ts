import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { TOOLS } from "@perkyzz/emvb/mcp";
import { s1Page } from "../../emvb/test/fixtures/layouts.ts";
import { createTestRuntime } from "../../emvb/test/server/runtime.ts";
import { createBridgeServer } from "../src/bridge.ts";
import type { Remote, ToolResult } from "../src/remote.ts";

let t: Awaited<ReturnType<typeof createTestRuntime>>;
let client: Client;
const calls: string[] = [];

/**
 * The site side of the bridge: EmDash's /_emdash/api/mcp after its scope and role checks, which
 * runs the plugin route and wraps the answer exactly as EmDash 1.2 does (structuredContent, or
 * `[CODE] message` with isError).
 */
const siteRemote = (): Remote => ({
  async call(name, args) {
    calls.push(name);
    const result = await t.mcp(name.replace(/^emvb__/, ""), args);
    if (!result.success) {
      return {
        content: [{ type: "text", text: `[${result.error?.code}] ${result.error?.message}` }],
        isError: true,
        _meta: { code: result.error?.code },
      } satisfies ToolResult;
    }
    return {
      content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }],
      structuredContent: result.data as Record<string, unknown>,
    };
  },
  close: async () => undefined,
});

async function connect(allowPublish = false) {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const server = createBridgeServer({ remote: siteRemote(), allowPublish });
  await server.connect(serverSide);
  client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(clientSide);
}

beforeEach(async () => {
  calls.length = 0;
  t = await createTestRuntime();
  await t.agentSettings();
});
afterEach(async () => {
  await client?.close();
  await t.dispose();
});

const newPage = async () => {
  const created = (await t.savePage({ title: "Home", layout: s1Page() })) as {
    data: { item: { id: string } };
  };
  return created.data.item.id;
};

describe("stdio bridge (W-461, W-462)", () => {
  test("lists the shared tools by plain name with schemas and hints; publish tools only on request", async () => {
    await connect();
    const listed = await client.listTools();
    const names = listed.tools.map((tool) => tool.name);
    expect(names).toEqual(TOOLS.filter((def) => !def.publish).map((def) => def.name));
    const getLayout = listed.tools.find((tool) => tool.name === "get_layout");
    expect(getLayout?.annotations?.readOnlyHint).toBe(true);
    expect(getLayout?.outputSchema).toBeTruthy();
    const remove = listed.tools.find((tool) => tool.name === "remove_element");
    expect(remove?.annotations?.destructiveHint).toBe(true);
    await client.close();
    await connect(true);
    expect((await client.listTools()).tools.map((tool) => tool.name)).toContain("publish_page");
  });

  test("parity: every read tool gives the same structured result through the bridge and the site", async () => {
    const pageId = await newPage();
    await connect();
    const inputs: Record<string, Record<string, unknown>> = {
      list_pages: {},
      get_layout: { pageId },
      list_element_types: { type: "heading" },
      get_site_styles: {},
      list_section_recipes: {},
      describe_page: { pageId },
      get_accessibility_findings: { pageId },
      list_versions: { pageId },
    };
    for (const [name, args] of Object.entries(inputs)) {
      // oxlint-disable-next-line no-await-in-loop -- compare one tool at a time
      const direct = await t.mcp(name, args);
      // oxlint-disable-next-line no-await-in-loop
      const bridged = (await client.callTool({ name, arguments: args })) as ToolResult;
      expect(bridged.isError ?? false).toBe(false);
      expect(bridged.structuredContent).toEqual(direct.data as Record<string, unknown>);
    }
    expect(calls.every((name) => name.startsWith("emvb__"))).toBe(true);
  });

  test("parity: a write goes to the site and its refusals come back as tool errors", async () => {
    const pageId = await newPage();
    await connect();
    const layout = (await client.callTool({
      name: "get_layout",
      arguments: { pageId },
    })) as ToolResult;
    const root = (layout.structuredContent as { layout: { root: { id: string } } }).layout.root.id;
    const added = (await client.callTool({
      name: "add_element",
      arguments: {
        pageId,
        parentId: root,
        element: { type: "heading", props: { text: "Bridged" } },
      },
    })) as ToolResult;
    expect(added.isError ?? false).toBe(false);
    const direct = await t.mcp("get_layout", { pageId });
    expect(JSON.stringify(direct.data)).toContain("Bridged");

    const stale = (await client.callTool({
      name: "add_element",
      arguments: { pageId, parentId: root, element: { type: "heading" }, expectedRev: "stale" },
    })) as ToolResult;
    expect(stale.isError).toBe(true);
    expect(stale.content[0]?.text).toContain("[CONFLICT]");
  });

  test("input is validated locally before anything reaches the site", async () => {
    await connect();
    const result = (await client.callTool({
      name: "get_layout",
      arguments: { nope: 1 },
    })) as ToolResult;
    expect(result.isError).toBe(true);
    expect(calls).toEqual([]);
  });

  test("a site that can't be reached gives an actionable error", async () => {
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    const server = createBridgeServer({
      remote: {
        call: async () => {
          throw new Error("Streamable HTTP error: 401 Unauthorized");
        },
        close: async () => undefined,
      },
      allowPublish: false,
    });
    await server.connect(serverSide);
    client = new Client({ name: "test", version: "1.0.0" });
    await client.connect(clientSide);
    const result = (await client.callTool({ name: "list_pages", arguments: {} })) as ToolResult;
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("EMVB_TOKEN");
  });

  test("a site that doesn't answer in time says so (W-894)", async () => {
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    const server = createBridgeServer({
      remote: {
        call: async () => {
          throw new Error("MCP error -32001: Request timed out");
        },
        close: async () => undefined,
      },
      allowPublish: false,
    });
    await server.connect(serverSide);
    client = new Client({ name: "test", version: "1.0.0" });
    await client.connect(clientSide);
    const result = (await client.callTool({ name: "list_pages", arguments: {} })) as ToolResult;
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toBe(
      "The site didn't answer within 60 s. It may be down or slow; try again.",
    );
  });
});

describe("bridge resources, prompts and the skill (W-467, W-468)", () => {
  test("schemas, docs and the skill are served locally", async () => {
    await connect();
    const listed = (await client.listResources()).resources.map((r) => r.uri);
    expect(listed).toContain("emvb://schema/layout");
    expect(listed).toContain("skill://emvb-page-builder/SKILL.md");
    const schema = await client.readResource({ uri: "emvb://schema/layout" });
    expect(JSON.parse((schema.contents[0] as { text: string }).text)["$schema"]).toContain(
      "2020-12",
    );
    const skill = await client.readResource({ uri: "skill://emvb-page-builder/SKILL.md" });
    expect((skill.contents[0] as { text: string }).text).toContain("name: emvb-page-builder");
    expect(calls).toEqual([]);
  });

  test("page resources read the draft through the site", async () => {
    const pageId = await newPage();
    await connect();
    const page = await client.readResource({ uri: `emvb://pages/${pageId}/layout` });
    expect(JSON.parse((page.contents[0] as { text: string }).text)["rev"]).toBeTruthy();
    expect(calls).toEqual(["emvb__get_layout"]);
  });

  test("prompts render with their arguments", async () => {
    await connect();
    const names = (await client.listPrompts()).prompts.map((p) => p.name);
    expect(names).toEqual([
      "build_landing_page",
      "fix_accessibility",
      "restyle_site",
      "review_page",
    ]);
    const prompt = await client.getPrompt({
      name: "build_landing_page",
      arguments: { topic: "Bakery" },
    });
    expect(JSON.stringify(prompt.messages)).toContain("Bakery");
    expect(JSON.stringify(prompt.messages)).toContain("Do not publish");
  });
});
