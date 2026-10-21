import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { s1Page } from "../fixtures/layouts.ts";
import type { EmvbPorts } from "../../src/mcp/ports.ts";
import { listVersions } from "../../src/mcp/read.ts";
import { TOOLS } from "../../src/mcp/tools.ts";
import { createTestRuntime, ROLES, userWithRole } from "./runtime.ts";

let t: Awaited<ReturnType<typeof createTestRuntime>>;
beforeEach(async () => {
  t = await createTestRuntime();
  await t.agentSettings();
});
afterEach(async () => {
  await t.dispose();
});

const newPage = async (title = "Home") => {
  const created = (await t.savePage({ title, layout: s1Page() })) as {
    data: { item: { id: string } };
  };
  return created.data.item.id;
};

const data = <T = Record<string, unknown>>(result: { success: boolean; data?: unknown }) => {
  if (!result.success) throw new Error(JSON.stringify(result));
  return result.data as T;
};

describe("EmVB MCP tools on EmDash's plugin MCP (W-452, W-453, W-454)", () => {
  test("every tool is declared to EmDash with its route, schemas and the editor permission", async () => {
    const declared = await (
      t.runtime as unknown as {
        getPluginMcpTools(id: string): Promise<
          {
            name: string;
            route: string;
            permission: string;
            inputSchema: unknown;
            outputSchema?: unknown;
          }[]
        >;
      }
    ).getPluginMcpTools("emvb");
    expect(declared.map((d) => d.name)).toEqual(TOOLS.map((tool) => tool.name));
    for (const d of declared) {
      expect(d.route).toBe(`mcp/${d.name}`);
      expect(d.permission).toBe("content:edit_any");
      expect(d.inputSchema).toBeTruthy();
      expect(d.outputSchema).toBeTruthy();
    }
  });

  test("tool outputs match their declared output schemas", async () => {
    const id = await newPage();
    const inputs: Record<string, unknown> = {
      list_pages: {},
      get_layout: { pageId: id },
      list_element_types: { type: "heading" },
      get_site_styles: {},
      list_section_recipes: {},
      describe_page: { pageId: id },
      get_accessibility_findings: { pageId: id },
      list_versions: { pageId: id },
    };
    const results = await Promise.all(
      TOOLS.filter((tool) => tool.readOnly).map((tool) => t.mcp(tool.name, inputs[tool.name])),
    );
    results.forEach((result, i) => {
      expect(TOOLS[i]?.output.safeParse(data(result)).success).toBe(true);
    });
  });

  test("list_pages lists EmVB pages with ids and titles", async () => {
    const id = await newPage("About");
    const out = data<{ pages: { id: string; title: string }[] }>(await t.mcp("list_pages", {}));
    expect(out.pages).toEqual([expect.objectContaining({ id, title: "About" })]);
  });

  test("list_pages pages with a cursor", async () => {
    await newPage("A");
    await newPage("B");
    const first = data<{ pages: unknown[]; nextCursor?: string }>(
      await t.mcp("list_pages", { limit: 1 }),
    );
    expect(first.pages).toHaveLength(1);
    expect(first.nextCursor).toBeString();
    const second = data<{ pages: unknown[] }>(
      await t.mcp("list_pages", { limit: 1, cursor: first.nextCursor }),
    );
    expect(second.pages).toHaveLength(1);
  });

  test("get_layout returns the layout and rev; outline drops props", async () => {
    const id = await newPage();
    const full = data<{ rev: string; layout: { root: { id: string } } }>(
      await t.mcp("get_layout", { pageId: id }),
    );
    expect(full.rev).toBeString();
    expect(full.layout.root.id).toBe(s1Page().root.id);
    const outline = data<{ outline: Record<string, unknown> }>(
      await t.mcp("get_layout", { pageId: id, format: "outline" }),
    );
    expect(JSON.stringify(outline.outline)).not.toContain('"props"');
  });

  test("an outline label cut at 57 keeps a whole emoji (W-557)", async () => {
    const layout = s1Page();
    (layout.root.children[0] as { props: { text: string } }).props.text =
      `${"a".repeat(56)}😀 and the rest of a long heading`;
    const created = (await t.savePage({ title: "Emoji", layout })) as {
      data: { item: { id: string } };
    };
    const outline = data<{ outline: { children: { label: string }[] } }>(
      await t.mcp("get_layout", { pageId: created.data.item.id, format: "outline" }),
    );
    expect(outline.outline.children[0]?.label).toBe(`${"a".repeat(56)}…`);
  });

  test("an unknown page is a NOT_FOUND tool error, not a crash", async () => {
    const result = await t.mcp("get_layout", { pageId: "nope" });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("NOT_FOUND");
  });

  test("unknown input keys are refused", async () => {
    const result = await t.mcp("list_pages", { evil: true });
    expect(result.success).toBe(false);
  });

  test("list_element_types gives props schema and allowed parents", async () => {
    const out = data<{
      elements: {
        type: string;
        container: boolean;
        allowedParents: string[];
        props: { properties?: object };
      }[];
    }>(await t.mcp("list_element_types", {}));
    const byType = new Map(out.elements.map((e) => [e.type, e]));
    expect(byType.get("heading")?.props.properties).toHaveProperty("level");
    expect(byType.get("container")?.container).toBe(true);
    expect(byType.get("menu-item")?.allowedParents.toSorted()).toEqual(["menu", "menu-item"]);
    expect(byType.get("text-input")?.allowedParents).toEqual(["form"]);
    expect(byType.get("tab-panel")?.allowedParents).toEqual(["tabs"]);
  });

  test("describe_page summarises sections and headings", async () => {
    const id = await newPage("Welcome");
    const out = data<{ summary: string; headingOutline: string[] }>(
      await t.mcp("describe_page", { pageId: id }),
    );
    expect(out.summary).toContain('"Welcome"');
    expect(out.headingOutline.length).toBeGreaterThan(0);
  });

  test("get_accessibility_findings returns the editor's score", async () => {
    const id = await newPage();
    const out = data<{ score: number }>(await t.mcp("get_accessibility_findings", { pageId: id }));
    expect(out.score).toBeGreaterThanOrEqual(0);
    expect(out.score).toBeLessThanOrEqual(100);
  });

  test("list_versions lists saved revisions", async () => {
    const id = await newPage();
    const out = data<{ versions: unknown[] }>(await t.mcp("list_versions", { pageId: id }));
    expect(Array.isArray(out.versions)).toBe(true);
  });

  test("list_versions gives each time as ISO 8601 UTC (W-805)", async () => {
    const ports = {
      getPage: async () => ({ id: "p1" }),
      listRevisions: async () => [
        { id: "r1", createdAt: "2026-10-21 03:17:01", authorId: null },
        { id: "r2", createdAt: "2026-10-21T03:17:02.500Z", authorId: "u1" },
      ],
    } as unknown as EmvbPorts;
    const out = await listVersions(ports, { pageId: "p1" });
    expect(out.versions.map((v) => v.at)).toEqual([
      "2026-10-21T03:17:01Z",
      "2026-10-21T03:17:02.500Z",
    ]);
  });

  test("a contributor can't call the tools (editor or above, D-056)", async () => {
    const plugin = (
      t.runtime as unknown as {
        getPluginMcpTools(id: string): Promise<{ permission: string }[]>;
      }
    ).getPluginMcpTools("emvb");
    expect((await plugin).every((tool) => tool.permission === "content:edit_any")).toBe(true);
    expect(userWithRole(ROLES.contributor).role).toBeLessThan(ROLES.editor);
  });
});
