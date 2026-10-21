import { McpServer, ResourceTemplate } from "@modelcontextprotocol/server";
import { z } from "zod";
import { DOCS, SKILL_FILES } from "./content.ts";
import {
  PROMPTS,
  designJsonSchema,
  layoutJsonSchema,
  visibleTools,
  type ToolDef,
} from "@perkyzz/emvb/mcp";
import type { Remote, ToolResult } from "./remote.ts";

export const BRIDGE_VERSION = "0.7.0";

const failure = (message: string): ToolResult => ({
  content: [{ type: "text", text: message }],
  isError: true,
});

/** Turns a transport or auth failure into a tool error the agent and the person can act on. */
function explain(error: unknown, tool: string): ToolResult {
  const message = error instanceof Error ? error.message : String(error);
  if (/401|unauthori[sz]ed|invalid[_ ](or expired )?token|expired token/i.test(message)) {
    return failure(
      "The site refused the token: it is wrong, revoked or expired. Create a new EmDash API token (scope mcp:tools:emvb, an editor) and update EMVB_TOKEN or the token file.",
    );
  }
  if (/403|scope|forbidden/i.test(message)) {
    return failure(
      "The token can't use EmVB tools. It needs the scope mcp:tools:emvb and a user who is an editor or above.",
    );
  }
  if (/not found|unknown tool/i.test(message)) {
    return failure(
      `The site doesn't offer emvb__${tool}. Check that EmDash's MCP is on (mcp: true, EmDash 1.2+) and that an admin approved the EmVB tools.`,
    );
  }
  return failure(`Couldn't reach the site: ${message}`);
}

/**
 * The local MCP server (R1): lists the shared tool definitions under their plain names and
 * forwards each call to the site as `emvb__<name>`. All checks and writes happen on the site.
 */
export function createBridgeServer(options: { remote: Remote; allowPublish: boolean }): McpServer {
  const server = new McpServer(
    { name: "emvb", title: "EmVB pages", version: BRIDGE_VERSION },
    { capabilities: { tools: {}, resources: {}, prompts: {} } },
  );
  const tools: ToolDef[] = visibleTools({
    publishPages: options.allowPublish,
    publishStyles: options.allowPublish,
  });
  for (const def of tools) {
    server.registerTool(
      def.name,
      {
        title: def.title,
        description: def.description,
        inputSchema: def.input,
        outputSchema: def.output,
        annotations: {
          title: def.title,
          readOnlyHint: def.readOnly,
          destructiveHint: def.destructive,
          openWorldHint: false,
        },
      },
      async (args: unknown) => {
        try {
          return await options.remote.call(`emvb__${def.name}`, args as Record<string, unknown>);
        } catch (error) {
          return explain(error, def.name);
        }
      },
    );
  }
  registerResources(server, options.remote);
  registerPrompts(server);
  return server;
}

const json = (uri: URL, value: unknown, mimeType = "application/json") => ({
  contents: [{ uri: uri.href, mimeType, text: JSON.stringify(value, null, 2) }],
});

/** Reads a resource through a site tool; a tool error becomes a resource error. */
async function viaTool(remote: Remote, uri: URL, tool: string, args: Record<string, unknown>) {
  const result = await remote.call(`emvb__${tool}`, args);
  if (result.isError) throw new Error(result.content[0]?.text ?? `${tool} failed`);
  return json(uri, result.structuredContent ?? {});
}

/** Resources (plan § 3, W-467): schemas, docs and the skill locally; live data via the tools. */
function registerResources(server: McpServer, remote: Remote) {
  server.registerResource(
    "layout-schema",
    "emvb://schema/layout",
    { title: "EmVB layout JSON Schema", mimeType: "application/schema+json" },
    (uri) => json(uri, layoutJsonSchema(), "application/schema+json"),
  );
  server.registerResource(
    "design-schema",
    "emvb://schema/design",
    { title: "EmVB site styles JSON Schema", mimeType: "application/schema+json" },
    (uri) => json(uri, designJsonSchema(), "application/schema+json"),
  );
  server.registerResource(
    "layout-format",
    "emvb://docs/layout-format",
    { title: "EmVB layout format", mimeType: "text/markdown" },
    (uri) => ({
      contents: [{ uri: uri.href, mimeType: "text/markdown", text: DOCS.layoutFormat }],
    }),
  );
  server.registerResource(
    "elements",
    "emvb://elements",
    { title: "EmVB element types", mimeType: "application/json" },
    (uri) => viaTool(remote, uri, "list_element_types", {}),
  );
  server.registerResource(
    "site-styles",
    "emvb://site/styles",
    { title: "Site styles (draft)", mimeType: "application/json" },
    (uri) => viaTool(remote, uri, "get_site_styles", {}),
  );
  const pages = new ResourceTemplate("emvb://pages/{pageId}/{view}", {
    list: undefined,
    complete: {
      view: () => ["layout", "a11y"],
      pageId: async (value) => {
        const result = await remote.call("emvb__list_pages", { limit: 50 });
        const found = (result.structuredContent?.["pages"] ?? []) as {
          id: string;
          title: string;
        }[];
        return found
          .filter(
            (p) => p.id.startsWith(value) || p.title.toLowerCase().includes(value.toLowerCase()),
          )
          .map((p) => p.id);
      },
    },
  });
  server.registerResource(
    "page",
    pages,
    {
      title: "An EmVB page's draft layout or accessibility findings",
      mimeType: "application/json",
    },
    (uri, vars) => {
      const pageId = String(vars["pageId"]);
      if (vars["view"] !== "layout" && vars["view"] !== "a11y") {
        throw new Error(
          `Unknown view ${String(vars["view"])}: use emvb://pages/{pageId}/layout or /a11y.`,
        );
      }
      if (vars["view"] === "a11y")
        return viaTool(remote, uri, "get_accessibility_findings", { pageId });
      return viaTool(remote, uri, "get_layout", { pageId });
    },
  );
  for (const [path, text] of Object.entries(SKILL_FILES)) {
    server.registerResource(
      `skill-${path}`,
      `skill://emvb-page-builder/${path}`,
      { title: `emvb-page-builder skill: ${path}`, mimeType: "text/markdown" },
      (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text }] }),
    );
  }
}

/** Prompts (plan § 3): workflows that drive the tools. */
function registerPrompts(server: McpServer) {
  for (const prompt of PROMPTS) {
    const shape = Object.fromEntries(
      Object.entries(prompt.args).map(([name, arg]) => [
        name,
        arg.required
          ? z.string().describe(arg.description)
          : z.string().optional().describe(arg.description),
      ]),
    );
    server.registerPrompt(
      prompt.name,
      { title: prompt.title, description: prompt.description, argsSchema: z.object(shape) },
      (args: Record<string, string | undefined>) => ({
        messages: [{ role: "user", content: { type: "text", text: prompt.text(args) } }],
      }),
    );
  }
}
