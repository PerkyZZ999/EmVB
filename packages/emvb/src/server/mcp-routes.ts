import { PluginRouteError, type PluginRoute, type RouteContext } from "emdash";
import { portOf } from "./saved-sections.ts";
import { PAGES_COLLECTION, DESIGN_DRAFT_KEY, DESIGN_KEY } from "../constants.ts";
import { McpToolError } from "../mcp/errors.ts";
import type { RequiredFieldInfo } from "../core/index.ts";
import type { EmvbPorts, PageRecord, PageSummary } from "../mcp/ports.ts";
import { callerKey, hitRateLimit, type RateStore } from "../mcp/rate-limit.ts";
import { runTool, type ToolDef } from "../mcp/tools.ts";
import { publishDesignDraft, readDesign, writeDesignDraft } from "./design-routes.ts";
import { appendAgentLog, readAgentSettings } from "./agent-settings.ts";

type Item = {
  id: string;
  slug: string | null;
  status: string;
  data: Record<string, unknown>;
  updatedAt: string;
  publishedAt: string | null;
  draftRevisionId?: string | null;
  liveRevisionId?: string | null;
};

type Content = {
  list(
    c: string,
    o: { limit?: number; cursor?: string },
  ): Promise<{
    items: Item[];
    cursor?: string;
    hasMore: boolean;
  }>;
  getVersioned?(c: string, id: string): Promise<{ item: Item; _rev: string } | null>;
  listRevisions?(
    c: string,
    id: string,
    o: { limit?: number },
  ): Promise<{ id: string; createdAt: string; authorId?: string | null }[]>;
  getRevision?(
    c: string,
    id: string,
    revisionId: string,
  ): Promise<{ data: Record<string, unknown> } | null>;
  update(c: string, id: string, data: Record<string, unknown>): Promise<Item>;
  create(c: string, data: Record<string, unknown>): Promise<Item>;
  publish?(c: string, id: string, o: { _rev: string }): Promise<unknown>;
};

const parseJson = (raw: unknown) => {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
};

const summary = (item: Item): PageSummary => ({
  id: item.id,
  // W-679: a blank title read as "" here while the admin list said "Untitled page".
  title:
    typeof item.data["title"] === "string" && item.data["title"].trim()
      ? item.data["title"]
      : "Untitled page",
  slug: item.slug ?? "",
  status: item.status,
  hasDraft: Boolean(item.draftRevisionId && item.draftRevisionId !== item.liveRevisionId),
  updatedAt: item.updatedAt,
});

const FORMS_DEFINITION = "/_emdash/api/plugins/emdash-forms/definition";

/**
 * W-511: form fields for describe_page's required-field warnings, from the forms plugin's public
 * definition route on this site. A plugin route has no in-process handle on another plugin, so
 * this is a same-origin request with a short timeout; a form it can't read is left out.
 */
async function loadFormFieldsFromSite(
  origin: string,
  formIds: readonly string[],
): Promise<Map<string, RequiredFieldInfo[]>> {
  const found = new Map<string, RequiredFieldInfo[]>();
  await Promise.all(
    formIds.slice(0, 20).map(async (id) => {
      try {
        const response = await fetch(new URL(FORMS_DEFINITION, origin), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id }),
          signal: AbortSignal.timeout(3000),
        });
        if (!response.ok) return;
        const body = (await response.json()) as { data?: unknown };
        const data = (body?.data ?? body) as { pages?: unknown };
        if (!Array.isArray(data?.pages)) return;
        const fields: RequiredFieldInfo[] = [];
        for (const page of data.pages as { fields?: unknown }[]) {
          if (!Array.isArray(page?.fields)) continue;
          for (const raw of page.fields as Record<string, unknown>[]) {
            if (typeof raw?.name !== "string") continue;
            fields.push({
              name: raw.name,
              label: typeof raw.label === "string" ? raw.label : raw.name,
              required: raw.required === true,
              ...(typeof raw.type === "string" ? { type: raw.type } : {}),
            });
          }
        }
        found.set(id, fields);
      } catch {
        // The forms plugin is missing, the form is unknown, or the site can't reach itself.
      }
    }),
  );
  return found;
}

/** The tool core's ports on a plugin route (D-053, R1 save path). */
function pluginPorts(ctx: RouteContext<unknown>): EmvbPorts {
  const content = ctx.content as unknown as Content | undefined;
  if (!content) throw new McpToolError("FORBIDDEN", "EmVB has no content access on this site.");
  /**
   * W-497: before "Set up EmVB", EmDash reads a page of the missing collection as "not found", so
   * get_layout said "No EmVB page". A miss checks the collection once and says NOT_SET_UP instead.
   */
  const versioned = async (id: string) => {
    const found = content.getVersioned ? await content.getVersioned(PAGES_COLLECTION, id) : null;
    if (!found) {
      try {
        await content.list(PAGES_COLLECTION, { limit: 1 });
      } catch (error) {
        if (isNotSetUp(error)) throw new McpToolError("NOT_SET_UP", NOT_SET_UP_MESSAGE);
        throw error;
      }
    }
    return found;
  };
  return {
    caller: { userId: ctx.user?.id ?? null, role: Number(ctx.user?.role ?? 0) },
    savedSections: portOf(ctx),
    formFields: (formIds) => loadFormFieldsFromSite(ctx.request.url, formIds),
    async rateLimit(cls) {
      await hitRateLimit(
        ctx.kv as unknown as RateStore,
        await callerKey(ctx.request, ctx.user?.id ?? null),
        cls,
      );
    },
    async listPages({ cursor, limit }) {
      let result: Awaited<ReturnType<Content["list"]>>;
      try {
        result = await content.list(PAGES_COLLECTION, { limit, ...(cursor ? { cursor } : {}) });
      } catch (error) {
        // W-474: a cursor the agent made up or truncated was an INTERNAL_ERROR.
        if (cursor && /cursor/i.test(String((error as Error)?.message ?? error))) {
          throw new McpToolError(
            "INVALID_INPUT",
            "That cursor isn't valid. Pass nextCursor exactly as list_pages returned it, or leave it out to start again.",
          );
        }
        throw error;
      }
      return {
        pages: result.items.map(summary),
        ...(result.hasMore && result.cursor ? { nextCursor: result.cursor } : {}),
      };
    },
    async getPage(id): Promise<PageRecord | null> {
      const found = await versioned(id);
      if (!found) return null;
      return {
        ...summary(found.item),
        layout: parseJson(found.item.data["layout"]),
        rev: found["_rev"],
      };
    },
    async listRevisions(id, limit) {
      const list = content.listRevisions
        ? await content.listRevisions(PAGES_COLLECTION, id, { limit })
        : [];
      return list.map((r) => ({ id: r.id, createdAt: r.createdAt, authorId: r.authorId ?? null }));
    },
    async getRevisionData(id, revisionId) {
      const revision = content.getRevision
        ? await content.getRevision(PAGES_COLLECTION, id, revisionId)
        : null;
      return revision?.data ?? null;
    },
    async savePage(id, patch, expectedRev) {
      const current = await versioned(id);
      if (!current) throw new McpToolError("NOT_FOUND", `No EmVB page with id ${id}.`);
      if (current["_rev"] !== expectedRev) {
        throw new McpToolError("CONFLICT", "The page changed since it was read.", {
          rev: current["_rev"],
        });
      }
      await content.update(PAGES_COLLECTION, id, {
        ...(patch.layout ? { layout: patch.layout } : {}),
        ...(patch.title ? { title: patch.title } : {}),
      });
      const after = await versioned(id);
      return {
        rev: after?.["_rev"] ?? "",
        ...(after?.item.draftRevisionId ? { revisionId: after.item.draftRevisionId } : {}),
      };
    },
    async createPage({ title, layout }) {
      // Plugins can't choose a slug on create; EmDash derives it from the title.
      const item = await content.create(PAGES_COLLECTION, { title, layout });
      const after = await versioned(item.id);
      return { id: item.id, slug: String(item.slug ?? ""), rev: after?.["_rev"] ?? "" };
    },
    async saveDesign(design, expectedRevision) {
      const written = await writeDesignDraft(ctx, design, expectedRevision, "agent");
      if (!written) throw new McpToolError("CONFLICT", "Site styles changed since they were read.");
      return { revision: written };
    },
    async log(entry) {
      const store = ctx.storage["agentlog"] as unknown as Parameters<typeof appendAgentLog>[0];
      await appendAgentLog(store, {
        ...entry,
        userId: ctx.user?.id ?? null,
        client: (ctx.request.headers.get("user-agent") ?? "").slice(0, 120),
      });
    },
    settings: async () => (await readAgentSettings(ctx)).settings,
    async publishPage(id, expectedRev) {
      if (!content.publish)
        throw new McpToolError("FORBIDDEN", "This site can't publish from plugins.");
      try {
        await content.publish(PAGES_COLLECTION, id, { _rev: expectedRev });
      } catch (error) {
        const code = (error as { code?: string }).code ?? "";
        if (/CONFLICT|REV/i.test(code)) {
          throw new McpToolError(
            "CONFLICT",
            "The page changed since you read it. Call get_layout again.",
          );
        }
        if (/NOT_FOUND/i.test(code))
          throw new McpToolError("NOT_FOUND", `No EmVB page with id ${id}.`);
        throw error;
      }
      const after = await versioned(id);
      return { rev: after?.["_rev"] ?? "" };
    },
    async publishDesign(expectedPublishedRevision) {
      const result = await publishDesignDraft(ctx, expectedPublishedRevision, "agent");
      if (result === "no-draft")
        throw new McpToolError("REFUSED", "There are no style changes to publish.");
      if (result === "conflict") {
        throw new McpToolError(
          "CONFLICT",
          "Site styles were published somewhere else. Call get_site_styles again.",
        );
      }
      return { revision: result.revision };
    },
    async getDesign() {
      const published = await readDesign(ctx, DESIGN_KEY);
      const draft = await readDesign(ctx, DESIGN_DRAFT_KEY);
      if (draft.status !== "ok") {
        return {
          design: published.design,
          revision: draft.revision,
          publishedRevision: published.revision,
          unpublished: false,
        };
      }
      return {
        design: draft.design,
        revision: draft.revision,
        publishedRevision: published.revision,
        unpublished: JSON.stringify(draft.design) !== JSON.stringify(published.design),
      };
    },
  };
}

/** W-474: before "Set up EmVB" there is no `emvb_pages` table, and every page tool was an INTERNAL_ERROR. */
export const NOT_SET_UP_MESSAGE =
  'EmVB isn\'t set up on this site yet. Ask an admin to open Pages VisualBuilder in the EmDash admin and click "Set up EmVB", then try again.';

export const isNotSetUp = (error: unknown) =>
  /no such table:?\s*\W?ec_emvb_|relation "?ec_emvb_\w+"? does not exist|collection "?emvb_(pages|theme_parts)"? (not found|does not exist)/i.test(
    String((error as Error)?.message ?? error),
  );

/** Routes `mcp/<tool>`: editors and above (D-056), POST JSON, one per tool (R1 D-054). */
export function mcpRoutes(tools: readonly ToolDef[]): Record<string, PluginRoute> {
  return Object.fromEntries(
    tools.map((tool) => [
      `mcp/${tool.name}`,
      {
        permission: "content:edit_any",
        input: tool.input,
        handler: async (ctx: RouteContext<unknown>) => {
          try {
            return await runTool(tool, pluginPorts(ctx), ctx.input);
          } catch (error) {
            if (error instanceof McpToolError) {
              throw new PluginRouteError(error.code, error.message, error.status, error.details);
            }
            if (isNotSetUp(error)) {
              throw new PluginRouteError("NOT_SET_UP", NOT_SET_UP_MESSAGE, 409);
            }
            throw error;
          }
        },
      } satisfies PluginRoute,
    ]),
  );
}

/** `definePlugin({ mcp })`: EmDash lists these on /_emdash/api/mcp as `emvb__<name>`. */
export function mcpToolConfig(tools: readonly ToolDef[]) {
  return {
    tools: Object.fromEntries(
      tools.map((tool) => [
        tool.name,
        {
          description: tool.description,
          route: `mcp/${tool.name}`,
          input: tool.input,
          output: tool.output,
          destructive: tool.destructive,
        },
      ]),
    ),
  };
}
